// GitHub, through the class's GitHub App: installation tokens, reading a student's repo (files, commits,
// branches, pull requests), the W3C validator, and the webhook signature.
// Ported from GitHub Watcher. `app` is the class's GitHub App ({ appId, clientId, privateKey }: see ghAppOf in github.ts).
/* eslint-disable */
import { AI_SKIP_FILE, LOCKFILE, SRC_FILE, LIB_FILE, SKIP_DIR, readLimited, cutWords, cleanUrl, isPlanningText, planLinkIn, TRELLO_BOARD, trelloBacklog, siteChecks, gridPick } from './engine.ts';

export const GH_WEB = 'https://github.com';
export const GH_API = 'https://api.github.com';
// One GraphQL call returns the size of every commit in the push
export async function commitSizes(env, app, instId, fullName, shas) {
  const [owner, name] = fullName.split('/');
  const token = await installationToken(env, app, instId);
  const fields = shas
    .map((s, i) => `c${i}: object(oid: "${s}") { ... on Commit { additions deletions parents { totalCount } } }`)
    .join('\n');
  const res = await fetch(`${GH_API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'classbot' },
    body: JSON.stringify({
      query: `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
      variables: { owner, name },
    }),
  });
  const json = await res.json();
  const repo = json && json.data && json.data.repository;
  if (!res.ok || !repo) throw new Error(`GraphQL ${res.status} ${JSON.stringify(json.errors || json.message || '').slice(0, 200)}`);
  const out = {};
  shas.forEach((s, i) => {
    const c = repo[`c${i}`];
    if (c && typeof c.additions === 'number') {
      out[s] = { additions: c.additions, deletions: c.deletions, merge: c.parents.totalCount > 1 };
    }
  });
  return out;
}

export async function installationToken(env, app, instId) {
  const nowS = Math.floor(Date.now() / 1000);
  const cached = await env.DB.prepare('SELECT token FROM gh_tokens WHERE inst = ? AND exp > ?').bind(String(instId), nowS).first();
  if (cached && cached.token) return cached.token;
  const res = await fetch(`${GH_API}/app/installations/${instId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await appJwt(app)}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'classbot',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const json = await res.json();
  if (!json.token) throw new Error(`Installation token failed: ${res.status} ${json.message || ''}`);
  // GitHub tokens last 60 min: keep it 50
  await env.DB.prepare('INSERT INTO gh_tokens (inst, token, exp) VALUES (?, ?, ?) ON CONFLICT (inst) DO UPDATE SET token = excluded.token, exp = excluded.exp').bind(String(instId), json.token, nowS + 50 * 60).run();
  return json.token;
}

// one signing key per App (several classes can each have their own)
const signingKeys = new Map();
export async function appJwt(app) {
  const id = String(app.appId || app.clientId || '');
  let signingKey = signingKeys.get(id + '|' + String(app.privateKey || '').length);
  if (!signingKey) { signingKey = await importPrivateKey(app.privateKey); signingKeys.set(id + '|' + String(app.privateKey || '').length, signingKey); }
  const now = Math.floor(Date.now() / 1000);
  const part = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 540, iss: app.appId || app.clientId })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Accepts the .pem file GitHub gives (PKCS#1 "BEGIN RSA PRIVATE KEY"), pasted with or without line breaks
async function importPrivateKey(pem) {
  const text = String(pem || '');
  const pkcs1 = /BEGIN RSA PRIVATE KEY/.test(text);
  const b64 = text.replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\\n/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
  let der = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  if (pkcs1) der = pkcs1ToPkcs8(der);
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function derLength(n) {
  if (n < 0x80) return [n];
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return [0x80 | bytes.length, ...bytes];
}

function pkcs1ToPkcs8(pkcs1) {
  const version = [0x02, 0x01, 0x00];
  const rsaAlgorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...derLength(pkcs1.length)];
  const bodyLength = version.length + rsaAlgorithm.length + octet.length + pkcs1.length;
  return new Uint8Array([0x30, ...derLength(bodyLength), ...version, ...rsaAlgorithm, ...octet, ...pkcs1]);
}

const ghHeaders = (token, accept) => ({ Accept: accept, Authorization: `Bearer ${token}`, 'User-Agent': 'classbot', 'X-GitHub-Api-Version': '2022-11-28' });

// ---------- The whole repo in ONE request ----------
// Cloudflare lets one request of the free plan make 50 calls to other sites. Reading a repo file by file (its tree,
// 15 files, the W3C check, the commits, their code, then several AI calls) went over it on bigger projects:
// « Too many subrequests ». So the repo is downloaded once as an archive (.tar.gz), read as it streams, and every file
// read afterwards in the same analysis comes from it. Too big or unreachable: back to the file-by-file way.
const ARCHIVE_MAX = 60 * 1024 * 1024;   // bytes read from the archive at most (unpacked)
const ARCHIVE_KEEP = 8 * 1024 * 1024;   // text kept in memory at most
const ARCHIVE_FILE = 400000;            // a file bigger than this is listed, not kept
const ARCH = new Map();                 // repo -> { at, p: Promise<archive | null> }, for 90 s (one analysis)

/** The repo's files (path, size) and the text of its source files, from one archive download; null if it can't. */
export function repoArchive(token, repo) {
  const k = String(repo).toLowerCase(), t = Date.now();
  // nothing is written anywhere: the archive lives in memory during the analysis, then is dropped (expired ones
  // first, and never more than 3 at once)
  for (const [key, v] of ARCH) if (t - v.at >= 90000) ARCH.delete(key);
  const hit = ARCH.get(k);
  if (hit) return hit.p;
  const p = loadArchive(token, repo).catch((e) => { console.error('archive', repo, e && e.message); return null; });
  ARCH.set(k, { at: t, p });
  while (ARCH.size > 3) ARCH.delete(ARCH.keys().next().value);
  return p;
}

class ByteQueue {
  r: any; chunks: Uint8Array[]; len: number; done: boolean; total: number;
  constructor(reader) { this.r = reader; this.chunks = []; this.len = 0; this.done = false; this.total = 0; }
  async fill(n) {
    while (this.len < n && !this.done) {
      const { done, value } = await this.r.read();
      if (done) { this.done = true; break; }
      if (value && value.length) { this.chunks.push(value); this.len += value.length; this.total += value.length; }
    }
    return this.len >= n;
  }
  async take(n) {
    if (!(await this.fill(n))) return null;
    const out = new Uint8Array(n);
    let o = 0;
    while (o < n) {
      const c = this.chunks[0], k = Math.min(c.length, n - o);
      out.set(c.subarray(0, k), o); o += k;
      if (k === c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(k);
    }
    this.len -= n;
    return out;
  }
  async skip(n) {
    while (n > 0) {
      if (!this.len && !(await this.fill(1))) return false;
      const c = this.chunks[0], k = Math.min(c.length, n);
      if (k === c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(k);
      this.len -= k; n -= k;
    }
    return true;
  }
}

async function loadArchive(token, repo) {
  const res = await fetch(`${GH_API}/repos/${repo}/tarball`, { headers: ghHeaders(token, 'application/vnd.github+json'), redirect: 'follow' });
  if (!res.ok || !res.body) return null;
  const q = new ByteQueue(res.body.pipeThrough(new DecompressionStream('gzip')).getReader());
  const dec = new TextDecoder();
  const str = (b, a, z) => { let e = a; while (e < z && b[e]) e++; return dec.decode(b.subarray(a, e)); };
  const files = new Map(), list = [];
  let kept = 0, longName = null, paxPath = null;
  for (;;) {
    if (q.total > ARCHIVE_MAX) { try { await q.r.cancel(); } catch {} return null; }
    const h = await q.take(512);
    if (!h || h.every((x) => x === 0)) break;
    const size = parseInt(str(h, 124, 136).trim() || '0', 8) || 0;
    const type = String.fromCharCode(h[156] || 48);
    const pad = Math.ceil(size / 512) * 512;
    if (type === 'x' || type === 'g' || type === 'L') {
      const body = await q.take(pad);
      if (!body) break;
      const text = dec.decode(body.subarray(0, size));
      if (type === 'L') longName = text.replace(/\0+$/, '');
      if (type === 'x') { const m = text.match(/\d+ path=([^\n]*)\n/); if (m) paxPath = m[1]; }
      continue;
    }
    const ustar = str(h, 257, 263) === 'ustar';
    let name = paxPath || longName || ((ustar && h[345] ? str(h, 345, 500) + '/' : '') + str(h, 0, 100));
    paxPath = longName = null;
    name = name.split('/').slice(1).join('/');   // GitHub puts everything in "<owner>-<repo>-<sha>/"
    if ((type !== '0' && type !== '\0' && type !== '7') || !name) { if (!(await q.skip(pad))) break; continue; }
    list.push({ path: name, size });
    const want = size <= ARCHIVE_FILE && kept + size <= ARCHIVE_KEEP && !AI_SKIP_FILE.test(name) && !/(^|\/)(\.git|node_modules|vendor)\//.test(name);
    if (want) {
      const body = await q.take(pad);
      if (!body) break;
      files.set(name, dec.decode(body.subarray(0, size)));
      kept += size;
    } else if (!(await q.skip(pad))) break;
  }
  return { files, list };
}

/** A file of the repo's main branch as it is now, from the archive when it was downloaded. */
async function fromArchive(path) {
  const m = String(path).match(/^\/repos\/([^/]+\/[^/]+)\/contents\/([^?]+)$/);
  if (!m) return undefined;
  const hit = ARCH.get(m[1].toLowerCase());
  if (!hit || Date.now() - hit.at >= 90000) return undefined;
  const a = await hit.p;
  if (!a) return undefined;
  const f = m[2].split('/').map(decodeURIComponent).join('/');
  return a.files.get(f);
}

export async function githubText(path, token, accept, max = 150000) {
  const cached = await fromArchive(path);
  if (cached !== undefined) return cached.length > max ? cached.slice(0, max) : cached;
  const res = await fetch(GH_API + path, { headers: ghHeaders(token, accept) });
  if (!res.ok) throw new Error(`GitHub ${path} returned ${res.status}`);
  return (await readLimited(res, max)).text;
}
// JSON from GitHub, or null when the answer is bigger than `max` bytes
export async function githubJsonLimited(path, token, max) {
  const res = await fetch(GH_API + path, { headers: ghHeaders(token, 'application/vnd.github+json') });
  if (!res.ok) throw new Error(`GitHub ${path} returned ${res.status}`);
  const { text, cut } = await readLimited(res, max);
  return cut ? null : JSON.parse(text);
}

// Every file of the repo (path + size). A very big repo (node_modules pushed…) is read folder by folder.
export async function repoFiles(token, repo) {
  // the archive first (one request for the whole repo, its files read from it afterwards)
  const arch = await repoArchive(token, repo);
  const full = arch ? null : await githubJsonLimited(`/repos/${repo}/git/trees/HEAD?recursive=1`, token, 600000);
  let entries;
  if (arch) entries = arch.list.map((f) => ({ type: 'blob', path: f.path, size: f.size }));
  else if (full) entries = full.tree || [];
  else {
    const root = (await githubJsonLimited(`/repos/${repo}/git/trees/HEAD`, token, 300000)) || { tree: [] };
    entries = (root.tree || []).filter((t) => t.type === 'blob');
    const dirs = (root.tree || []).filter((t) => t.type === 'tree' && !SKIP_DIR.test(t.path)).slice(0, 4);
    const subs = await Promise.all(dirs.map((d) => githubJsonLimited(`/repos/${repo}/git/trees/${d.sha}?recursive=1`, token, 300000).catch(() => null)));
    subs.forEach((sub, i) => { if (sub) for (const t of sub.tree || []) entries.push({ ...t, path: `${dirs[i].path}/${t.path}` }); });
  }
  const out = entries.filter((t) => t.type === 'blob' && !AI_SKIP_FILE.test(t.path) && !LOCKFILE.test(t.path) && !/(^|\/)\.git\//.test(t.path))
    .map((t) => ({ path: t.path, size: t.size || 0 }));
  // Images and documents: never read, but their names prove a deliverable (UML diagram, mockup…)
  out.media = entries.filter((t) => t.type === 'blob' && AI_SKIP_FILE.test(t.path) && !/(^|\/)(node_modules|vendor|\.git)\//.test(t.path)).map((t) => t.path).slice(0, 400);
  return out;
}

// The project as it is now: every file name, the main files (HTML first) and the sure checks
export async function repoSnapshot(token, repo, budget, commits, brief = '', opts: any = {}) {
  const info = await githubGet(`/repos/${repo}`, token).catch(() => ({}));
  // Branches other than the main one show a branching strategy
  const branchesP = opts.git ? githubGet(`/repos/${repo}/branches?per_page=100`, token).catch(() => null) : null;
  const files = await repoFiles(token, repo);
  const paths = files.map((f) => f.path);
  const isJs = /javascript|\bjs\b|\bdom\b|fetch|\bapi\b|événement|evenement|localstorage|async/i.test(brief);
  const usable = files.filter((f) => SRC_FILE.test(f.path) && f.size <= 400000 && !LIB_FILE.test(f.path));
  const byType = (re) => usable.filter((f) => re.test(f.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path)).map((f) => f.path);
  const readme = paths.find((f) => /^readme(\.md)?$/i.test(f)) || paths.find((f) => /(^|\/)readme(\.md)?$/i.test(f));
  let pick = [...byType(/\.html?$/i).slice(0, isJs ? 5 : 8), ...byType(/\.(css|scss)$/i).slice(0, isJs ? 2 : 3), ...byType(/\.(js|jsx|ts|tsx|vue|php|py)$/i).slice(0, isJs ? 5 : 2)];
  if (opts.wanted) pick = gridPick(opts.wanted, usable, paths, byType);
  if (readme) pick.push(readme);
  const got = await Promise.all(pick.map((f) => githubText(`/repos/${repo}/contents/${f.split('/').map(encodeURIComponent).join('/')}`, token, 'application/vnd.github.raw', 150000)
    .catch((e) => { console.error('AI file failed:', f, e.message); return null; })));
  const texts = {};
  pick.forEach((f, i) => { if (got[i] != null) texts[f] = got[i]; });
  // W3C validator on the home page (if reachable)
  const htmlRead = Object.keys(texts).filter((f) => /\.html?$/i.test(f));
  const home = htmlRead.find((f) => /^index\.html?$/i.test(f)) || htmlRead.find((f) => /(^|\/)index\.html?$/i.test(f)) || htmlRead[0];
  let w3c = null;
  if (home && (!opts.wanted || opts.wanted.has('w3c'))) {
    let why = '';
    for (const host of ['https://validator.w3.org/nu/', 'https://validator.nu/']) {
      try {
        const res = await fetch(host + '?out=json', {
          method: 'POST',
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'User-Agent': 'Mozilla/5.0 (compatible; github-watcher teacher dashboard)' },
          body: texts[home],
        });
        if (!res.ok) { why = `réponse ${res.status}`; continue; }
        const msgs = (JSON.parse((await readLimited(res, 300000)).text).messages) || [];
        const errs = msgs.filter((m) => m.type === 'error');
        w3c = { page: home, errors: errs.length, warnings: msgs.filter((m) => m.type === 'info' && m.subType === 'warning').length, first: errs[0] ? cutWords(String(errs[0].message || '').replace(/\s*\(Suppressing[^)]*\)\.?/, '').trim(), 120) : '' };
        break;
      } catch (e) {
        why = String(e.message || e).slice(0, 80);
      }
    }
    if (!w3c) w3c = { page: home, error: why || 'service indisponible' };
  }
  const readmeText = readme && texts[readme] ? texts[readme] : '';
  const siteLink = cleanUrl((readmeText.match(/https?:\/\/[\w.-]+\.(github\.io|netlify\.app|vercel\.app|pages\.dev)[^\s)"'<>\]]*/i) || [])[0]);
  const figma = cleanUrl((readmeText.match(/https?:\/\/(www\.)?figma\.com\/[^\s)"'<>\]]+/i) || [])[0]);
  // Planning link: looked for when CT1 / CT2 is targeted or the brief names a planning tool
  const planWanted = !!opts.planning || !!(opts.wanted && opts.wanted.has('planning')) || String(brief).split(/\n|(?<=\.)\s+/).some((line) => isPlanningText(line, 'livrable'));
  // The planning link handed in wins over the README; a public Trello board is read (cards done / in progress / to do)
  const planning = opts.plan || (planWanted ? planLinkIn(readmeText) : undefined);
  let backlog = planning && TRELLO_BOARD.test(planning) ? await trelloBacklog(planning) : null;
  if (backlog && backlog.error && backlog.error !== 'private') backlog = null;
  let git;
  if (opts.git) {
    const own = commits.filter((c) => c.repo === repo);
    const br = await branchesP;
    const main = String(info.default_branch || 'main');
    git = { ...opts.git, n: own.length, days: new Set(own.map((c) => String(c.date || '').slice(0, 10)).filter(Boolean)).size,
      branches: Array.isArray(br) ? br.map((b) => String((b && b.name) || '')).filter((n) => n && n !== main && !/^(main|master|gh-pages)$/i.test(n)).slice(0, 30) : [] };
  }
  const checks = siteChecks(opts.wanted ? [...paths, ...(files.media || [])] : paths, texts, { has_pages: info.has_pages, homepage: info.homepage, w3c, siteLink, figma: readme ? figma : undefined, planning, planFrom: opts.plan ? 'handin' : 'readme', backlog, git },
    commits.filter((c) => c.repo === repo), brief, opts.wanted || null);
  let contents = '';
  // Transversal competencies are judged on the README (report, planning link): read it first and longer
  const order = opts.readme && readme ? [readme, ...pick.filter((f) => f !== readme)] : pick;
  for (const f of order) {
    if (texts[f] == null) continue;
    if (contents.length >= budget) break;
    const room = Math.min(f === readme && opts.readme ? 3500 : /\.html?$/i.test(f) ? 1600 : 1400, budget - contents.length);
    contents += `\n--- ${f}${texts[f].length > room ? ' (début)' : ''} ---\n${texts[f].slice(0, room)}\n`;
  }
  const list = paths.slice(0, 120).join('\n') + (paths.length > 120 ? `\n… et ${paths.length - 120} autres` : '');
  return { repo, checks, files: list, contents, backlog, paths, texts, outline: pageOutline(texts) };
}

const plainTxt = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const tagText = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
/** Every HTML page read in full (the AI only sees the start of each file): its headings, sections, forms, links. */
export function pageOutline(texts) {
  const out = [];
  for (const [f, t] of Object.entries(texts || {}) as [string, string][]) {
    if (!/\.(html?|php|vue|jsx|tsx)$/i.test(f) || !t) continue;
    const heads = [...t.matchAll(/<h([1-3])[^>]*>([\s\S]{1,200}?)<\/h\1>/gi)].map((m) => tagText(m[2])).filter(Boolean).slice(0, 12);
    const ids = [...t.matchAll(/\bid=["']([\w-]{2,40})["']/gi)].map((m) => m[1]).slice(0, 15);
    const links = [...new Set([...t.matchAll(/href=["']([^"'#?]{1,60}\.html?)["']/gi)].map((m) => m[1]))].slice(0, 12);
    const forms = (t.match(/<form\b/gi) || []).length, inputs = (t.match(/<(input|textarea|select)\b/gi) || []).length, imgs = (t.match(/<img\b/gi) || []).length;
    out.push(`${f} : ${heads.length ? `titres « ${heads.join(' » « ')} »` : 'pas de titre'}${ids.length ? ` ; sections/id ${ids.join(', ')}` : ''}${forms ? ` ; ${forms} formulaire(s), ${inputs} champ(s)` : ''}${imgs ? ` ; ${imgs} image(s)` : ''}${links.length ? ` ; liens vers ${links.join(', ')}` : ''}`);
  }
  return out.join('\n').slice(0, 6000);
}

// words of a requirement that don't name a page or a feature
const STOP = new Set(('visiteur visiteurs utilisateur utilisateurs client clients internaute administrateur afin pour avec dans sans page pages site section sections trouver lire avoir savoir voir consulter acceder '
  + 'pouvoir permettre etre faire toutes tous leurs leur plus liste informations information chaque cette celle elles peux veux vais dois souhaite simple facilement rapidement '
  + 'differentes differents principales principaux ensemble autres autre bien contenant contient presente presenter afficher affichee affiche doit doivent web veux possible acces '
  + 'qu elle elles nous vous ils mon mes ses son notre votre entre etc lien liens bouton boutons cliquer clic menu navigation responsive ecran ecrans mobile').split(' '));
// the same page or feature said in English or otherwise in a repo
const SYN = { accueil: ['index', 'home', 'accueil'], contact: ['contact'], connexion: ['login', 'signin', 'connexion'], inscription: ['register', 'signup', 'inscription'],
  panier: ['cart', 'panier', 'basket'], galerie: ['gallery', 'galerie'], equipe: ['team', 'equipe'], tarif: ['pricing', 'tarif', 'prix', 'price'], tarifs: ['pricing', 'tarif', 'prix', 'price'],
  propos: ['about', 'propos'], formulaire: ['form'], recherche: ['search', 'recherche'], filtre: ['filter', 'filtre'], filtrer: ['filter', 'filtre'], avis: ['avis', 'review', 'testimonial', 'temoignage'],
  temoignages: ['testimonial', 'temoignage', 'avis'], produits: ['product', 'produit'], produit: ['product', 'produit'], reservation: ['booking', 'reservation', 'reserv'], reserver: ['booking', 'reservation', 'reserv'],
  evenements: ['event', 'evenement'], blog: ['blog', 'article'], articles: ['article', 'blog'], services: ['service'], service: ['service'], projets: ['project', 'projet'], competences: ['skill', 'competence'],
  carte: ['map', 'carte'], plan: ['map', 'plan'], horaires: ['horaire', 'hours', 'schedule'], newsletter: ['newsletter'], faq: ['faq'], footer: ['footer'], header: ['header'], carrousel: ['carousel', 'carrousel', 'slider', 'swiper'], carousel: ['carousel', 'slider', 'swiper'] };
/**
 * Is a page or a feature of the brief in the repo? A file, a section (id), a heading or a link of the WHOLE files that
 * matches a distinctive word of the requirement. The AI only reads the beginning of each file: what it marks missing
 * is often there. Returns where it was found, or null.
 */
export function foundInRepo(texte, paths, texts) {
  const core = plainTxt(texte).replace(/^en tant qu[e'’][^,]*,\s*/, '').replace(/\b(afin|pour que|pour qu)\b.*$/, '');
  const words = [...new Set(core.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
  if (!words.length) return null;
  const keys = [...new Set(words.flatMap((w) => SYN[w] || SYN[w.replace(/s$/, '')] || [w.replace(/s$/, '')]))].filter((k) => k.length >= 4 || ['faq', 'map', 'cart', 'form', 'blog', 'team'].includes(k));
  const names = (paths || []).map((p) => [p, plainTxt(p.split('/').pop())]);
  for (const k of keys) {
    const f = names.find(([, n]) => n.replace(/\.[a-z0-9]+$/, '').split(/[^a-z0-9]+/).some((part) => part === k || (k.length >= 5 && part.startsWith(k))));
    if (f) return `fichier ${f[0]}`;
  }
  for (const [file, t] of Object.entries(texts || {})) {
    if (!/\.(html?|php|vue|jsx|tsx|js|ts)$/i.test(file) || !t) continue;
    const low = plainTxt(t);
    for (const k of keys) {
      const rx = new RegExp(`(id|class)=["'][^"']*\\b${k}|href=["'][^"']*${k}|<h[1-4][^>]*>[^<]{0,80}\\b${k}|<(section|form|nav|footer|header)[^>]*${k}`);
      if (rx.test(low)) return `« ${k} » dans ${file}`;
    }
  }
  return null;
}
/** The AI's « absent » or « partiel » on a page or a feature that is in the repo: done (the evidence says where). */
export function rescueFound(exigences, snap) {
  return (exigences || []).map((e) => {
    if (!e || (e.statut !== 'absent' && e.statut !== 'partiel') || e.bound || !['story', 'bonus', 'technique'].includes(e.type)) return e;
    const where = foundInRepo(e.texte, snap.paths, snap.texts);
    return where ? { ...e, statut: 'fait', preuve: `Trouvé dans le dépôt : ${where} (à confirmer)`.slice(0, 220), found: true } : e;
  });
}

// ---------- Squad review: each member's part in the squad repo ----------
// Commits per member (by GitHub account), pull requests, reviews, collaborators. About 2 + 6 GitHub calls.
export async function squadContribution(token, repo, squad, commits, startT) {
  const low = (s) => String(s || '').toLowerCase();
  const pulls = await githubGet(`/repos/${repo}/pulls?state=all&per_page=50`, token).catch(() => []);
  const prs = (Array.isArray(pulls) ? pulls : []).filter((p) => !startT || Date.parse(p.created_at) >= startT);
  const merged = prs.filter((p) => p.merged_at).sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));
  const sample = merged.slice(0, 6);
  const reviews = await Promise.all(sample.map((p) => githubGet(`/repos/${repo}/pulls/${p.number}/reviews?per_page=50`, token).catch(() => null)));
  const reviewsBy = {};
  let unapproved = 0, known = 0;
  sample.forEach((p, i) => {
    const r = reviews[i];
    if (!Array.isArray(r)) return;
    known++;
    const author = low(p.user && p.user.login);
    if (!r.some((x) => x.state === 'APPROVED' && low(x.user && x.user.login) !== author)) unapproved++;
    for (const x of r) {
      const who = low(x.user && x.user.login);
      if (who && who !== author) reviewsBy[who] = (reviewsBy[who] || 0) + 1;
    }
  });
  const collab = await githubGet(`/repos/${repo}/collaborators?per_page=100`, token)
    .then((l) => (Array.isArray(l) ? new Set(l.map((u) => low(u.login))) : null)).catch(() => null);
  const owner = low(repo.split('/')[0]);
  const members = squad.members.map((m) => {
    const lg = low(m.login);
    const mine = commits.filter((c) => low(c.author) === lg);
    return {
      gid: m.gid, login: m.login, name: m.name, sm: m.gid === squad.sm,
      collaborator: collab ? collab.has(lg) || lg === owner : null,
      commits: mine.length, days: new Set(mine.map((c) => String(c.date || '').slice(0, 10)).filter(Boolean)).size,
      prs: prs.filter((p) => low(p.user && p.user.login) === lg).length,
      merged: merged.filter((p) => low(p.user && p.user.login) === lg).length,
      reviews: reviewsBy[lg] || 0,
    };
  });
  const nameOf = (m) => m.name || m.login;
  const zero = members.filter((m) => !m.commits);
  const outside = members.filter((m) => m.collaborator === false);
  const checks = [
    { id: 'members_commit', ok: zero.length === 0, label: 'Chaque membre a committé dans le dépôt du squad',
      detail: members.map((m) => `${nameOf(m)} : ${m.commits} commit(s)`).join(', ') + (outside.length ? ` ; pas collaborateur(s) du dépôt : ${outside.map(nameOf).join(', ')}` : ''),
      zero: zero.map(nameOf) },
    merged.length
      ? { id: 'pr_review', ok: known ? unapproved === 0 : null, label: 'Pull requests approuvées avant la fusion',
        detail: `${merged.length} pull request(s) fusionnée(s)${known ? `, ${unapproved} sans approbation sur les ${known} dernières` : ''}`, unapproved }
      : { id: 'pr_review', ok: false, label: 'Pull requests approuvées avant la fusion', detail: 'aucune pull request fusionnée depuis le début du brief', unapproved: 0, none: true },
  ];
  return { members, checks };
}

export async function githubGet(path, token) {
  const res = await fetch(GH_API + path, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'classbot',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} returned ${res.status}`);
  return res.json();
}

export async function validSignature(secret, body, signature) {
  if (!secret || !signature || !signature.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = 'sha256=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
