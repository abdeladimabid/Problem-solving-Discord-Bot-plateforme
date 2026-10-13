// The debrief engine: everything that can be decided WITHOUT the AI, plus the cleaning of what the AI answers.
//   • commit checks (size, vague messages)
//   • sure checks on the project files (HTML/CSS, JavaScript, PHP/POO, SQL, Laravel, API, Git…)
//   • the evaluation grid of a brief (what it asks, and which check proves each line)
//   • reconciling the AI with the checks (the checks always win), Valid / Not valid states
//   • the comment for the learner (in the teacher's style), squad member comments, the live challenge pool
// Ported from GitHub Watcher (worker.js), where it was tested on real classes; storage and Discord live elsewhere.
/* eslint-disable */
// ---------------- Commit checks: size + message ----------------
// Sizes come from GitHub (needs secret GITHUB_PRIVATE_KEY). Without it, only messages are checked.

const LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/i;
const DOCFILE = /(^|\/)(readme|license|changelog|contributing|authors)(\.[a-z]+)?$|\.(md|txt|rst)$|(^|\/)\.gitignore$/i;
const VAGUE = new Set(
  ('update updates updated fix fixes fixed fixing bug bugs bugfix change changes changed edit edits edited ' +
    'modif modifs modification modifications correction corrections ajout ajouts maj wip test tests testing ' +
    'commit stuff done final finish finished fini ok okay save minor misc asdf temp tmp new work push code ' +
    'files file try essai again last version small little petit petite some a à an the de du des le la les of and et')
    .split(' ')
);

// true when a commit message doesn't say what changed
export function badMessage(msg) {
  const line = String(msg || '').split('\n')[0].trim();
  if (line.length < 6 || !/\p{L}/u.test(line)) return true;
  if (/^add files via upload$/i.test(line)) return true;
  if (/^(update|delete|create)\s+\S+$/i.test(line)) return true; // GitHub website default, e.g. "Update index.html"
  const words = line.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.every((w) => VAGUE.has(w) || /^\d+$/.test(w));
}

export function classifyCommit(c, info, env = {}) {
  const tinyMax = Number(env.TINY_LINES || 2);
  const hugeMin = Number(env.HUGE_LINES || 2000);
  const bad = badMessage(c.message);
  if (info && info.merge) return { kind: 'merge', bad: false, lines: null, flags: [] };
  const files = [...(c.added || []), ...(c.modified || []), ...(c.removed || [])];
  const lines = info ? info.additions + info.deletions : null;
  const flags = [];
  if (files.some((f) => /(^|\/)node_modules\//.test(f))) flags.push('node_modules');
  else if (lines !== null && lines >= hugeMin && !files.some((f) => LOCKFILE.test(f))) flags.push('huge');
  let kind = 'real';
  if (files.length > 0 && files.every((f) => DOCFILE.test(f))) kind = 'docs';
  else if (lines !== null && lines <= tinyMax) kind = 'tiny';
  return { kind, bad, lines, add: info ? info.additions : null, del: info ? info.deletions : null, flags };
}

const AI_SKIP_FILE = /(^|\/)(node_modules|vendor|dist|build|\.next|coverage)\/|\.min\.(js|css)$|\.(png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|eot|pdf|zip|mp4|webm|mp3|lock)$/i;
const AI_DIFF_BUDGET = 12000; // characters of code sent to the AI without a brief (keeps inside the free limits)
const AI_DIFF_BUDGET_WITH_BRIEF = 5000; // with a brief, most of the budget goes to the project files
const AI_FILES_BUDGET = 9000;
const SRC_FILE = /\.(html?|css|scss|js|jsx|ts|tsx|vue|php|py)$/i;

// DWWM 2023 framework: technical competencies C1–C8 and transversal competencies CT1–CT9 (keys T1–T9)
export const REF_NAMES = {
  C1: 'Installer et configurer son environnement de travail en fonction du projet web ou web mobile',
  C2: 'Maquetter des interfaces utilisateur web ou web mobile',
  C3: 'Réaliser des interfaces utilisateur statiques web ou web mobile',
  C4: 'Développer la partie dynamique des interfaces utilisateur web ou web mobile',
  C5: 'Mettre en place une base de données relationnelle',
  C6: 'Développer des composants d’accès aux données SQL et NoSQL',
  C7: 'Développer des composants métier côté serveur',
  C8: 'Documenter le déploiement d’une application dynamique web ou web mobile',
  T1: 'Planifier le travail à effectuer individuellement',
  T2: 'Contribuer au pilotage de l’organisation du travail individuel et collectif',
  T3: 'Définir le périmètre d’un problème rencontré en adoptant une démarche inductive',
  T4: 'Rechercher de façon méthodique une ou des solutions au problème rencontré',
  T5: 'Partager la solution adoptée en utilisant les moyens de partage de connaissance ou de documentation disponibles',
  T6: 'Présenter un travail réalisé en synthétisant ses résultats, sa démarche',
  T7: 'Se familiariser avec les codes et la culture propres à son environnement professionnel',
  T8: 'Interagir dans un contexte professionnel de façon respectueuse et constructive',
  T9: 'Faciliter un temps de travail collectif en assurant une communication constructive entre les participants',
};
// Evaluation criteria per level (1 imiter, 2 adapter, 3 transposer)
// REF-START
// Add your own evaluation criteria per competency and level here, e.g. C3: { 1: '...', 2: '...', 3: '...' } (transversal CT1–CT9 use the keys T1–T9)
export const REF_CRITERIA = {};
// REF-END

// Simplonline numbers technical and transversal competencies both C1, C2…
// Here transversal ones are written CT1…CT9 (stored as T1…T9). "C5N1 transv" and "T5N1" are also accepted.
// "C1N1, C3 N2, CT5N1, C2N1 transv, T2N1" -> ['C1N1', 'C3N2', 'T5N1', 'T2N1']
export function parseSkills(text) {
  const out = [];
  const re = /\b(CT|C|T)\s*(\d{1,2})\s*[-.]?\s*N\s*([123])\b(\s*[(\[]?\s*transv[a-zé]*\.?\s*[)\]]?)?/gi;
  let m;
  while ((m = re.exec(String(text || ''))) && out.length < 15) {
    const kind = m[1].toUpperCase() === 'C' && !m[4] ? 'C' : 'T';
    const code = `${kind}${m[2]}N${m[3]}`;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}
// 'T5N1' -> 'CT5N1'
export function skillDisplay(code) {
  return /^T\d/.test(code) ? `C${code}` : code;
}
export function skillText(code, names = REF_NAMES) {
  const [, id, lvl] = String(code).match(/^([CT]\d{1,2})N(\d)$/) || [null, String(code), '1'];
  const crit = REF_CRITERIA[id] && REF_CRITERIA[id][lvl];
  const label = id.startsWith('T') ? `compétence transversale C${id}` : `compétence technique ${id}`;
  return `- code "${skillDisplay(code)}" = ${label}, niveau ${lvl} – ${names[id] || REF_NAMES[id] || id}${crit ? `\n  Critères : ${crit}` : ''}`;
}

// Keeps only useful files of a diff, and cuts it to `max` characters
export function trimDiff(diff, max) {
  const parts = String(diff || '').split(/^(?=diff --git )/m);
  let out = '';
  let skipped = 0;
  for (const part of parts) {
    const m = part.match(/^diff --git a\/(\S+)/);
    if (!m) continue;
    if (AI_SKIP_FILE.test(m[1]) || LOCKFILE.test(m[1])) { skipped++; continue; }
    const body = part.length > 1800 ? part.slice(0, 1800) + '\n[... fichier coupé ...]\n' : part;
    if (out.length + body.length > max) {
      // Always keep the start of the first useful file, so the AI sees some code
      const room = max - out.length;
      out += room > 200 ? body.slice(0, room) + '\n[... coupé ...]\n' : '\n[... autres fichiers coupés ...]\n';
      break;
    }
    out += body;
  }
  if (skipped) out += `\n[${skipped} fichier(s) ignoré(s) : dépendances, images ou fichiers générés]\n`;
  return out;
}

// Reads at most `max` bytes of a response: a huge diff, file or tree is cut instead of using all the CPU time
export async function readLimited(res, max) {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const t = await res.text();
    return { text: t.slice(0, max), cut: t.length > max };
  }
  const reader = body.getReader();
  const dec = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { text: text + dec.decode(), cut: false };
    size += value.byteLength;
    text += dec.decode(value, { stream: true });
    if (size > max) {
      reader.cancel().catch(() => {});
      return { text: text.slice(0, max), cut: true };
    }
  }
}

// "karimaBouy" -> "Karima", "AMSA_JAWAD" -> "Amsa", "Zakaria elkarouss" -> "Zakaria"
export function firstNameOf(display, login) {
  const s = String(display || login || '').trim().replace(/[_.\-]+/g, ' ').replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2');
  const w = (s.split(/\s+/)[0] || '').replace(/\d+$/, '') || String(login || '');
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

// A requirement counts as valid when done, or when the code cannot show it (oral, meeting…): the teacher switches it if needed
export const itemValid = (e) => (typeof e.ok === 'boolean' ? e.ok : e.statut === 'fait' || e.statut === 'non_verifiable');
// A requirement whose status comes from a sure check shares that check's switch
const isBound = (e) => !!e.check && (!!e.bound || /^Vérification automatique/.test(e.preuve || ''));

// Comment in the teacher's style, built only from the checklist (checks + brief requirements + competencies).
// Each item may carry ok: true/false (the teacher's final choice); otherwise its first status is used.
export function buildFeedback(firstName, checks, exigences = [], competences = [], challenge = null, suivi = null, oral = null, assess = null) {
  const c = Object.fromEntries(checks.filter((x) => !x.info && x.ok !== null && x.ok !== undefined).map((x) => [x.id, x]));
  const ok = (id) => !!c[id] && c[id].ok === true;
  const ko = (id) => !!c[id] && c[id].ok === false;
  const d = (id) => String((c[id] && c[id].detail) || '');
  const listFr = (s) => String(s).replace(/, ([^,]+)$/, ' et $1');
  const part = (t) => { const m = String(t).match(/je (vais|veux|dois|souhaite|peux)\s+(.+?)(,?\s+(afin|pour que|pour qu’|pour qu')\b|$)/i); return (m ? m[2] : String(t)).replace(/\.$/, ''); };
  const tw = /Tailwind/.test(d('responsive'));
  const sec = { 'Fonctionnalités': [], 'Intégration': [], 'Responsive': [], 'JavaScript': [], 'POO / Architecture': [], 'Base de données': [], 'Sécurité': [], 'API': [], 'Tests': [],
    'Bonnes pratiques': [], 'Git / GitHub': [], 'Suivi du projet': [], 'Hébergement': [], 'Bonus': [], 'Mise en situation': [] };
  const pages = (d('pages').match(/page\(s\) : ([^;]+)/) || [])[1];
  if (ok('pages') && pages) sec['Intégration'].push(`Ton site contient bien plusieurs pages (${pages.trim()}).`);
  if (ok('nav')) sec['Intégration'].push(`Le menu permet d’accéder à toutes les pages${ok('active') ? ' et indique la page en cours' : ''}.`);
  if (ok('semantic')) sec['Intégration'].push('Tu as utilisé les balises sémantiques (header, nav, main, footer).');
  if (ok('form')) sec['Intégration'].push(`Le formulaire est présent${/, 0 avec/.test(d('form')) ? '' : ', avec des champs obligatoires'}.`);
  if (ok('map')) sec['Intégration'].push('Le plan d’accès est intégré à la page.');
  if (ok('layout')) sec['Intégration'].push(`Tu as organisé la mise en page avec ${listFr(d('layout').replace(/variables CSS/, 'des variables CSS'))}.`);
  if (ok('anim')) sec['Intégration'].push(/keyframes|animate-/.test(d('anim')) ? 'Tu as ajouté une animation CSS.' : 'Tu as ajouté des transitions CSS.');
  if (ok('responsive')) {
    const how = tw ? 'grâce aux classes responsive de Tailwind' : /Bootstrap/.test(d('responsive')) ? 'grâce à la grille de Bootstrap' : 'grâce aux media queries';
    sec['Responsive'].push(ok('breakpoints') || !c.breakpoints ? `Le site s’adapte aux différentes tailles d’écran ${how}.` : `Le site commence à s’adapter aux écrans (${(d('responsive').match(/points de rupture : (.+)$/) || [])[1] || how}).`);
  }
  if (ok('alt')) sec['Bonnes pratiques'].push('Toutes tes images ont un texte alternatif (alt).');
  if (ok('seo')) sec['Bonnes pratiques'].push('Les balises meta (viewport, description) et les titres des pages sont en place.');
  if (ok('w3c')) sec['Bonnes pratiques'].push('Ta page d’accueil passe le validateur W3C sans erreur.');
  if (ok('docs')) sec['Bonnes pratiques'].push('Le projet est documenté avec un README.');
  if (ok('planning')) {
    const tool = (d('planning').match(/^lien (.+?) (trouvé|donné au rendu)/) || [])[1];
    sec['Bonnes pratiques'].push(`Ta planification est partagée${tool && tool !== 'de planification' ? ` sur ${tool}` : ''}, avec le lien dans le README.`);
  }
  if (ok('pages_site')) sec['Hébergement'].push(`Le projet est correctement hébergé${/GitHub Pages/.test(d('pages_site')) ? ' sur GitHub Pages' : ' en ligne'}.`);
  // A check that only proves a bonus is judged with the bonus (praised there, never asked for)
  const lineChecks = (x) => [x.check, ...String(x.verif || '').split(/[\s,]+/)].filter(Boolean);
  const forMain = new Set(exigences.filter((x) => x.type !== 'bonus').flatMap(lineChecks));
  const bonusOnly = new Set(exigences.filter((x) => x.type === 'bonus').flatMap(lineChecks).filter((id) => !forMain.has(id)));
  // JavaScript, PHP, SQL, Laravel… checks of the brief grid: praised in their own part
  for (const id of Object.keys(DETECTORS)) if (ok(id) && !bonusOnly.has(id)) sec[DETECTORS[id][1]].push(DETECTORS[id][2]);
  const stories = exigences.filter((x) => x.type === 'story');
  const front = ['pages', 'nav', 'semantic', 'h1', 'alt', 'seo', 'responsive', 'layout', 'anim', 'map'].some((id) => c[id]);
  if (stories.length && stories.every(itemValid)) sec[front ? 'Intégration' : 'Fonctionnalités'].push('Toutes les fonctionnalités demandées dans le brief sont réalisées.');
  // Bonus = performance: praised when done, never asked for
  const bonus = exigences.filter((x) => x.type === 'bonus' && itemValid(x));
  if (bonus.length === 1) sec['Bonus'].push(`Tu as aussi réalisé le bonus (${part(bonus[0].texte)}) : tu as fait plus que demandé, bravo pour ce travail.`);
  else if (bonus.length > 1) sec['Bonus'].push(`Tu as aussi réalisé ${bonus.length} bonus : tu as fait plus que demandé, bravo pour ce travail.`);
  // Live challenge done in front of the teacher
  const ch = challenge && challenge.result ? challenge : null;
  if (ch) {
    const t = ch.titre ? ` (« ${ch.titre} »)` : '';
    sec['Mise en situation'].push(ch.result === 'valide' ? `Tu as réussi la mise en situation${t}.` : ch.result === 'partiel' ? `La mise en situation${t} est partiellement réussie.` : `La mise en situation${t} n’est pas validée.`);
    if (ch.note) sec['Mise en situation'].push(String(ch.note).trim());
  }
  // Oral questions asked: the notions still Not valid are notions to review
  const asked = Array.isArray(oral) ? oral : [];
  const toReview = asked.filter((x) => !x.ok).map((x) => String(x.notion).trim()).filter(Boolean);
  if (asked.length) sec['Questions orales'] = [toReview.length ? `Tu as bien répondu à ${asked.length - toReview.length} question${asked.length - toReview.length > 1 ? 's' : ''} orale${asked.length - toReview.length > 1 ? 's' : ''} sur ${asked.length}.` : 'Tu as bien répondu à toutes les questions orales.'];

  // Git / GitHub, always judged: number and regularity of commits, messages and their style, branches when used
  const gitAdvice = [];
  const G = sec['Git / GitHub'];
  if (c.commits) {
    const k = c.commits;
    const n = Number(k.n != null ? k.n : (d('commits').match(/(\d+) commit/) || [])[1] || 0);
    const days = Number(k.days != null ? k.days : (d('commits').match(/sur (\d+) jour/) || [])[1] || 0);
    const nTxt = k.capped ? `plus de ${n}` : String(n);
    const onDays = days === 1 ? 'un seul jour' : `${days} jours`;
    if (ok('commits')) G.push(`Tu as fait ${nTxt} commits sur ${onDays} : tu commites régulièrement, c’est une bonne habitude.`);
    else if (n === 0) gitAdvice.push('de commiter ton travail dès le début du projet, à chaque étape (aucun commit depuis le début du brief)');
    else if (n < 5) gitAdvice.push(`de commiter plus souvent, à chaque étape (une page, une section, une correction) : ${nTxt} commit${n > 1 ? 's' : ''} seulement pendant le projet`);
    else gitAdvice.push(`de commiter régulièrement, chaque jour de travail, et pas tout à la fin (${nTxt} commits sur ${onDays})`);
  }
  if (c.git) {
    const k = c.git;
    const m = d('git').match(/^(\d+) commit\(s\) lus, (\d+) au format conventionnel.*?(\d+) message/) || [];
    const total = Number(k.total != null ? k.total : m[1] || 0), conv = Number(k.conv != null ? k.conv : m[2] || 0), vague = Number(k.vague != null ? k.vague : m[3] || 0);
    if (ok('git')) {
      if (total && conv === total) G.push('Tes messages de commit sont clairs et suivent la convention (feat:, fix:…), bravo.');
      else {
        G.push(`Tes messages de commit sont clairs${conv ? ` ; ${conv} sur ${total} suivent la convention (feat:, fix:…)` : ''}. Pour aller plus loin, utilise la convention de nommage pour ${conv ? 'tous tes' : 'tes'} commits (feat:, fix:, docs:, style:…).`);
      }
    } else {
      gitAdvice.push(`d’écrire des messages de commit clairs et précis, par exemple « feat: ajout de la page contact »${vague ? ` (${vague} message${vague > 1 ? 's' : ''} trop vague${vague > 1 ? 's' : ''}${k.vagueEx ? ` comme « ${k.vagueEx} »` : ''})` : ''}`);
    }
  }
  if (c.branches) {
    const k = c.branches;
    const names = Array.isArray(k.names) ? k.names : [];
    if (ok('branches')) {
      const fus = k.merges ? `${names.length ? ' et tu les fusionnes' : 'Tu fusionnes tes branches'} (${k.merges} fusion${k.merges > 1 ? 's' : ''}${k.prs ? `, dont ${k.prs} pull request${k.prs > 1 ? 's' : ''}` : ''})` : '';
      G.push(`${names.length ? `Tu travailles avec des branches (${names.join(', ')})` : ''}${fus} : très bonne pratique de travail en équipe.`);
    } else gitAdvice.push('d’organiser ton travail avec des branches (une branche par fonctionnalité, fusionnée dans main)');
  }

  // Squad briefs: every member commits, pull requests are approved before the merge
  if (c.members_commit) {
    if (ok('members_commit')) G.push('Chaque membre du squad a committé son travail dans le dépôt commun.');
    else gitAdvice.push(`que chaque membre committe et pousse son propre travail dans le dépôt du squad${(c.members_commit.zero || []).length ? ` (aucun commit de ${listFr(c.members_commit.zero.join(', '))})` : ''}`);
  }
  if (ok('pr_review')) G.push('Les pull requests sont relues et approuvées avant d’être fusionnées : très bonne pratique de travail en équipe.');
  else if (ko('pr_review')) gitAdvice.push(c.pr_review.none ? 'de passer par des pull requests relues et approuvées avant chaque fusion dans main'
    : `de faire approuver chaque pull request avant de la fusionner (${c.pr_review.unapproved} fusionnée${c.pr_review.unapproved > 1 ? 's' : ''} sans approbation), par exemple en protégeant la branche main`);

  // Not valid requirement: advice, unless a not valid check already gives it
  const own = (e) => !itemValid(e) && !isBound(e) && !(e.check && ko(e.check));
  const advice = [];
  for (const e of stories.filter(own)) advice.push(`de ${e.statut === 'absent' ? 'réaliser' : 'terminer'} cette partie du brief : ${part(e.texte)}`);
  for (const e of exigences.filter((x) => x.type === 'technique' && own(x))) advice.push(`de respecter cette demande technique du brief : ${String(e.texte).replace(/\.$/, '')}`);
  const TWN = { 640: 'sm', 768: 'md', 1024: 'lg', 1280: 'xl', 1536: '2xl' };
  const bp = ((d('breakpoints').match(/manquants : (.+)$/) || [])[1] || '').trim();
  const bpText = bp && tw ? bp.split(/,\s*/).map((x) => (TWN[parseInt(x, 10)] ? `${TWN[parseInt(x, 10)]}: ${x}` : x)).join(', ') : bp;
  const w3c = d('w3c').match(/^(\d+) erreur/);
  const ex = ((d('w3c').match(/ex\. : (.+)$/) || [])[1] || '').replace(/\s*\(Suppressing[^)]*\)?\.?/, '').trim().replace(/\.+$/, '');
  const h1 = c.h1 || {};
  const ADV = [
    ['pages', 'de créer toutes les pages demandées et de les relier entre elles'],
    ['layout', 'd’organiser la mise en page avec Flexbox ou Grid'],
    ['pages_site', 'de publier ton site sur GitHub Pages et de mettre le lien dans le README'],
    ['breakpoints', `d’ajouter les points de rupture demandés dans le brief${bpText ? ` (${bpText})` : ''}`],
    ['responsive', tw ? 'de rendre ton site responsive avec les préfixes de Tailwind (sm:, md:, lg:)' : 'de rendre ton site responsive avec des media queries'],
    ['nav', 'de relier toutes les pages dans le menu'],
    ['map', 'd’intégrer le plan d’accès (Google Maps ou OpenStreetMap)'],
    ['form', 'd’ajouter le formulaire demandé dans le brief'],
    ['w3c', `de corriger ${w3c && w3c[1] === '1' ? 'l’erreur' : w3c ? `les ${w3c[1]} erreurs` : 'les erreurs'} du validateur W3C${ex ? ` (ex. : ${ex})` : ''}`],
    ['semantic', 'd’utiliser les balises sémantiques sur toutes les pages, notamment <main>'],
    ['h1', h1.zero && h1.many ? 'd’avoir exactement un <h1> par page' : h1.zero ? 'de mettre un titre <h1> sur chaque page' : 'de n’utiliser qu’un seul <h1> par page'],
    ['docs', 'd’ajouter un README qui présente le projet et tes acquis'],
    ['active', 'd’indiquer la page en cours dans le menu (classe active)'],
    ['alt', 'd’ajouter un texte alternatif (alt) à toutes les images'],
    ['seo', 'd’ajouter une meta description et un title sur chaque page'],
    ['anim', 'd’ajouter une animation ou une transition CSS'],
    ['figma', 'd’ajouter le lien de ta maquette Figma dans le README'],
    ['planning', 'd’ajouter le lien de ta planification (GitHub Projects, Trello…) dans le README'],
  ];
  for (const [id, text] of ADV) if (ko(id) && !bonusOnly.has(id) && !(id === 'responsive' && ko('breakpoints'))) advice.push(text);
  for (const id of Object.keys(DETECTORS)) if (ko(id) && !bonusOnly.has(id)) advice.push(DETECTORS[id][3]);
  advice.push(...gitAdvice);
  // Steps of the brief: the teacher's result for each step, and when the work was done (see steps.ts)
  const stepsDone = suivi && Array.isArray(suivi.steps) ? suivi.steps.filter((x) => STEP_RESULTS.includes(x.final)) : [];
  const SP = sec['Suivi du projet'];
  if (stepsDone.length) {
    if (stepsDone.length === suivi.steps.length && stepsDone.every((x) => x.final === 'a_temps')) {
      SP.push('Tu as validé chaque partie du projet à temps : très bonne organisation.');
      for (const x of stepsDone) if (x.note) SP.push(`${x.name} : ${x.note}`);
    } else for (const x of stepsDone) SP.push(`${x.name} : ${STEP_FR[x.final]}.${x.note ? ' ' + x.note : ''}`);
    if (stepsDone.some((x) => x.final !== 'a_temps')) advice.push('de terminer chaque partie à la date prévue : découpe le travail et avance à chaque étape');
  }
  const rh = suivi && suivi.rhythm, nSteps = suivi && suivi.steps ? suivi.steps.length : 0;
  const total = rh ? rh.reduce((a, b) => a + b, 0) : 0;
  if (rh && nSteps >= 2 && total >= 5) {
    const last = (rh[nSteps - 1] || 0) + (rh[nSteps] || 0);
    if (last / total >= 0.6) SP.push(`La majorité de ton travail (${Math.round((100 * last) / total)} % des commits) a été faite pendant la dernière étape : avance régulièrement à chaque étape.`);
  }
  for (const e of exigences.filter((x) => (x.type === 'livrable' || x.type === 'critere') && own(x))) advice.push(`de compléter ce point du brief : ${String(e.texte).replace(/\s*:$/, '').replace(/\.$/, '')}`);
  const parts = [`Bonjour${firstName ? ` ${firstName}` : ''},`];
  for (const [title, lines] of Object.entries(sec)) if (lines.length) parts.push(`-${title} :\n${lines.join('\n')}`);
  if (advice.length === 1) parts.push(`Je te conseille ${advice[0]}.`);
  else if (advice.length) parts.push(`Je te conseille de :\n${advice.map((a) => `- ${a.replace(/^(de |d’)/, '')}`).join('\n')}`);
  // Bonus not done: not a fault, only a way to go further
  const more = exigences.filter((x) => x.type === 'bonus' && !itemValid(x)).slice(0, 4).map((x) => part(x.texte).replace(/[\s:;,.]+$/, '')).filter(Boolean);
  if (more.length === 1) parts.push(`Pour progresser, tu peux aussi essayer ce bonus : ${more[0]}.`);
  else if (more.length) parts.push(`Pour progresser, tu peux aussi essayer ces bonus :\n${more.map((t) => `- ${t}`).join('\n')}`);
  if (toReview.length) parts.push(`Notions à revoir : ${toReview.join(', ')}.`);
  // the assessments linked to the brief
  const graded = (assess || []).filter((a) => a.score != null);
  if (graded.length) {
    const lines = graded.map((a) => {
      const ok = Object.entries(a.comps || {}).filter(([, v]) => v.ok).map(([k]) => skillDisplay(k));
      const ko = Object.entries(a.comps || {}).filter(([, v]) => !v.ok).map(([k]) => skillDisplay(k));
      return `« ${a.title} » : ${a.score} %, niveau ${LEVEL_FR[scoreLevel(a.score)]}${ok.length ? ` (validé : ${ok.join(', ')}` : ''}${ko.length ? `${ok.length ? ' ; ' : ' ('}à retravailler : ${ko.join(', ')}` : ''}${ok.length || ko.length ? ')' : ''}.`;
    });
    parts.push(`-Évaluation :\n${lines.join('\n')}`);
  }
  const compOk = competences.filter((x) => x.ok === true).map((x) => skillDisplay(x.code));
  const compKo = competences.filter((x) => x.ok === false).map((x) => skillDisplay(x.code));
  if (compOk.length || compKo.length) parts.push([compOk.length ? `Compétences validées : ${compOk.join(', ')}.` : '', compKo.length ? `Compétences non validées : ${compKo.join(', ')}.` : ''].filter(Boolean).join('\n'));
  const unfinished = exigences.some((x) => x.type !== 'bonus' && !itemValid(x)) || compKo.length > 0 || !!(ch && ch.result !== 'valide') || stepsDone.some((x) => x.final === 'non_fait') || toReview.length > 0;
  parts.push(advice.length || unfinished ? 'Bonne continuation !' : 'Très bon travail, bonne continuation !');
  return parts.join('\n\n');
}

// Valid / Not valid of every criterion: the teacher's choice if saved, otherwise the first decision (checks and AI)
export function reviewStates(rec) {
  const r = (rec && rec.result) || {};
  const saved = (rec && rec.final) || {};
  const ck = {};
  for (const x of (rec && rec.checks) || []) if (!x.info && (x.ok === true || x.ok === false)) ck[x.id] = typeof (saved.ck || {})[x.id] === 'boolean' ? saved.ck[x.id] : x.ok;
  const ex = (r.exigences || []).map((e, i) => (isBound(e) && e.check in ck ? ck[e.check] : typeof (saved.ex || [])[i] === 'boolean' ? saved.ex[i] : itemValid(e)));
  const co = {};
  // the assessment linked to the brief comes first: a competency it tested starts as the assessment says (validated
  // only if every assessment validated it), whatever the project shows; the others start as the project shows
  const fromAssess = assessVerdicts(rec);
  for (const x of r.competences || []) {
    const a = fromAssess[assessBase(x.code)];
    co[x.code] = typeof (saved.co || {})[x.code] === 'boolean' ? saved.co[x.code] : typeof a === 'boolean' ? a : x.avis === 'validable';
  }
  const ch = (rec && rec.challenge) || null;
  const mes = { r: (saved.mes && CH_RESULTS.includes(saved.mes.r) ? saved.mes.r : ch && ch.result) || '', note: String((saved.mes && typeof saved.mes.note === 'string' ? saved.mes.note : ch && ch.note) || '') };
  // oral questions: each one starts Not valid, the teacher switches it after the answer
  const oral = ((rec && rec.oral) || []).map((q, i) => typeof (saved.oral || [])[i] === 'boolean' ? saved.oral[i] : false);
  return { ck, ex, co, mes, oral };
}
export const CH_RESULTS = ['valide', 'partiel', 'non_valide'];
// C3N2 / CT5 / T5 → C3 / T5: how the assessments' competency results are keyed
export const assessBase = (c) => String(c).toUpperCase().replace(/N\d$/, '').replace(/^CT/, 'T');
/** What the graded assessments of the brief say of each competency: true (all validated it), false, absent = not tested. */
export function assessVerdicts(rec) {
  const out = {};
  for (const a of (rec && rec.assess) || []) for (const [k, v] of Object.entries(a.comps || {})) {
    if (!v || typeof v.ok !== 'boolean') continue;
    const b = assessBase(k);
    out[b] = b in out ? out[b] && v.ok : v.ok;
  }
  return out;
}
// The level of a score (an assessment's %), with the same steps as the debrief level
export const scoreLevel = (pct) => (pct >= 90 ? 'excellent' : pct >= 75 ? 'bon' : pct >= 55 ? 'moyen' : pct >= 35 ? 'faible' : 'critique');
export const LEVEL_FR = { excellent: 'Excellent', bon: 'Bon', moyen: 'Moyen', faible: 'Faible', critique: 'Critique' };
export const DEBRIEF_LEVELS = ['excellent', 'bon', 'moyen', 'faible', 'critique'];
// The level proposed after the debrief, from the switches: brief (40 %), competencies (30 %), the assessment linked to
// the brief (30 %), oral questions and mise en situation (15 % each), only the parts that were evaluated. The teacher
// chooses the level, and can change it.
export function debriefLevel(rec, st) {
  const ex = ((rec && rec.result) || {}).exigences || [];
  const main = ex.map((e, i) => i).filter((i) => ex[i].type !== 'bonus' && ex[i].type !== 'oral');
  const parts = [];
  if (main.length) parts.push([0.4, main.filter((i) => st.ex[i]).length / main.length]);
  const co = Object.values(st.co || {});
  if (co.length) parts.push([0.3, co.filter(Boolean).length / co.length]);
  const or = st.oral || [];
  if (or.length) parts.push([0.15, or.filter(Boolean).length / or.length]);
  const m = { valide: 1, partiel: 0.5, non_valide: 0 }[(st.mes || {}).r];
  if (m !== undefined) parts.push([0.15, m]);
  const as = ((rec && rec.assess) || []).filter((a) => a.score != null);
  if (as.length) parts.push([0.3, as.reduce((t, a) => t + a.score, 0) / as.length / 100]);
  if (!parts.length) return '';
  const sc = parts.reduce((a, p) => a + p[0] * p[1], 0) / parts.reduce((a, p) => a + p[0], 0);
  return sc >= 0.9 ? 'excellent' : sc >= 0.75 ? 'bon' : sc >= 0.55 ? 'moyen' : sc >= 0.35 ? 'faible' : 'critique';
}
// The teacher's result for a step of the brief (see steps.ts)
export const STEP_RESULTS = ['a_temps', 'en_retard', 'non_fait'];
export const STEP_FR = { a_temps: 'validée à temps', en_retard: 'validée en retard', non_fait: 'non validée' };

// The comment from the final checklist states
export function buildComment(firstName, rec, states) {
  const st = reviewStates({ ...rec, final: states });
  const r = rec.result || {};
  const checks = (rec.checks || []).filter((x) => x.id in st.ck).map((x) => ({ ...x, ok: st.ck[x.id] }));
  const items = (r.exigences || []).map((e, i) => ({ ...e, ok: st.ex[i] }));
  const comps = (r.competences || []).map((x) => ({ code: x.code, ok: st.co[x.code] }));
  const ch = rec.challenge ? { ...rec.challenge, result: st.mes.r, note: st.mes.note } : null;
  const oral = (rec.oral || []).map((q, i) => ({ notion: q.notion || q.q, ok: !!st.oral[i] }));
  return buildFeedback(firstName, checks, items, comps, ch, rec.suivi || null, oral, rec.assess || null);
}

// The sure checks win over the AI: a requirement that a check proves (or disproves) gets the check's answer
export function reconcile(exigences, checks) {
  const c = Object.fromEntries((checks || []).filter((x) => !x.info).map((x) => [x.id, x]));
  const is = (id, v) => !!c[id] && c[id].ok === v;
  const SCREEN = /(écrans?|tablettes?|smartphones?|téléphones?|ordinateurs?|desktop)[^.;]*\d{3,4}\s*px|\d{3,4}\s*px[^.;]*(écrans?|tablettes?|smartphones?|téléphones?|ordinateurs?|desktop)/;
  return (exigences || []).map((e) => {
    const t = String(e.texte || '').toLowerCase();
    let statut = e.statut;
    let why = null;
    let rule = null;
    let bound = false;
    const set = (s, id) => { rule = id; bound = true; if (statut !== s) { statut = s; why = c[id]; } };
    const look = (id) => { rule = rule || id; };
    if (e.type === 'oral') return e;
    // A grid line is proved by its own checks: all valid -> done, none -> missing, some -> partly done
    const vs = checkList(e.verif).filter((id) => !['responsive', 'breakpoints'].includes(id) && c[id] && c[id].ok !== null);
    const bad = vs.filter((id) => c[id].ok === false);
    const resp = checkList(e.verif).some((id) => id === 'responsive' || id === 'breakpoints');
    if (vs.length && !(resp && !bad.length)) set(!bad.length ? 'fait' : bad.length === vs.length ? 'absent' : 'partiel', bad[0] || vs[0]);
    else if (/w3c|validator\.w3/.test(t) && c.w3c && c.w3c.ok !== null) set(c.w3c.ok ? 'fait' : 'absent', 'w3c');
    else if (/github pages|héberg|heberg|déploy|déploie|deploy|mettre en ligne|mise en ligne|mis en ligne|site en ligne/.test(t) && c.pages_site && c.pages_site.ok !== null) set(c.pages_site.ok ? 'fait' : 'absent', 'pages_site');
    else if ((e.type === 'livrable' || e.type === 'critere') && c.planning && isPlanningText(e.texte, e.type)) {
      set(c.planning.ok ? 'fait' : 'absent', 'planning');
    } else if (/readme|fichier de documentation|documentation des acquis/.test(t) && c.docs) set(c.docs.ok ? 'fait' : 'absent', 'docs');
    else if ((/tout type d[’']écrans|adaptables? (aux|à|sur)|responsive/.test(t) || SCREEN.test(t) || /\b(responsive|breakpoints)\b/.test(e.verif || '')) && (c.breakpoints || c.responsive) && !(c.responsive && c.responsive.ok === null)) {
      if (is('responsive', false)) set('absent', 'responsive');
      else if (is('breakpoints', false)) set('partiel', 'breakpoints');
      else if (is('breakpoints', true) || (!c.breakpoints && is('responsive', true))) set('fait', c.breakpoints ? 'breakpoints' : 'responsive');
    } else if (/dans le menu|menu de navigation|barre de navigation|navigation entre|naviguer entre|accès à toutes les pages/.test(t) && e.type !== 'critere' && c.nav) {
      if (is('nav', false) || (/page en cours/.test(t) && is('active', false))) { look('nav'); if (statut === 'fait') set('partiel', is('nav', false) ? 'nav' : 'active'); }
      else if (is('nav', true) && (!/page en cours/.test(t) || is('active', true)) && statut === 'absent') set('fait', 'nav');
    } else if (/animation|transition css|transitions css/.test(t) && c.anim) set(c.anim.ok ? 'fait' : 'absent', 'anim');
    else if (/plan d[’']acc[eè]s/.test(t) && is('map', false)) { look('map'); if (statut === 'fait') set('partiel', 'map'); }
    if (!rule) return e;
    const tag = bound ? { check: rule, bound: true } : { check: rule };
    return why ? { ...e, statut, ...tag, preuve: `Vérification automatique : ${why.label} – ${why.detail}`.slice(0, 220) } : { ...e, ...tag };
  });
}

// Splits a Simplonline brief into a numbered checklist: user stories, bonus, deliverables, performance criteria
export function briefItems(brief) {
  const text = String(brief || '').replace(/\r/g, '');
  const head = (re) => { const m = text.match(re); return m ? m.index : -1; };
  const at = {
    ctx: head(/^[ \t]*Contexte du projet[ \t]*:?[ \t]*$/im),
    peda: head(/^[ \t]*Modalités pédagogiques[ \t]*:?[ \t]*$/im),
    eval: head(/^[ \t]*Modalités d[’']évaluation[ \t]*:?[ \t]*$/im),
    liv: head(/^[ \t]*Livrables[ \t]*:?[ \t]*$/im),
    crit: head(/^[ \t]*Critères de performance[ \t]*:?[ \t]*$/im),
    sit: head(/^[ \t]*Situation professionnelle[ \t]*:?[ \t]*$/im),
  };
  const cut = (from, ...ends) => {
    if (from < 0) return '';
    const after = ends.filter((e) => e > from);
    return text.slice(from, after.length ? Math.min(...after) : text.length).replace(/^.*\n/, '');
  };
  const clean = (t) => t.replace(/^[\s|_\-–●•○◦▪*·]+/, '').replace(/^\d+[.)]\s+/, '').replace(/[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+$/u, '').replace(/\s+/g, ' ').trim();
  const items = [];
  const push = (type, t) => {
    t = clean(t);
    if (t.length < 4 || items.some((x) => x.texte.toLowerCase() === t.toLowerCase())) return;
    items.push({ n: items.length + 1, type, texte: t.slice(0, 260) });
  };
  // Context: "En tant que …" sentences, before and after the BONUS heading
  const ctx = cut(at.ctx, at.peda, at.eval, at.liv, at.crit, at.sit) || text;
  const b = [ctx.search(/^[^\w\n]{0,4}\s*bonus\b/im), ctx.search(/\bBONUS\b/)].filter((x) => x >= 0).sort((x, y) => x - y)[0] ?? -1;
  const main = b >= 0 ? ctx.slice(0, b) : ctx;
  const extra = b >= 0 ? ctx.slice(b) : '';
  const stories = (part) => part.split(/(?=En tant qu[e’'])/i).filter((x) => /^En tant qu/i.test(x) && /je (vais|veux|dois|souhaite|peux)|afin/i.test(x));
  let found = stories(main).length + stories(extra).length;
  stories(main).forEach((x) => push('story', x));
  stories(extra).forEach((x) => push('bonus', x));
  if (!found) {
    // No "En tant que…": take the bullet points of the context instead
    const bullets = (part) => part.split('\n').filter((l) => /^\s*([-–•●▪◦*]|\d+[.)])\s+\S/.test(l) && clean(l).length >= 15);
    bullets(main).forEach((x) => push('story', x));
    bullets(extra).forEach((x) => push('bonus', x));
  }
  // Deliverables and criteria: one per line ("__" lines belong to the line above)
  const lines = (part, type) => {
    let last = null;
    // Pasted briefs can lose their line breaks: cut before "|__" / "__" and between long sentences
    let rows = part.replace(/\s+(?=\|?__)/g, '\n').split('\n');
    rows = rows.flatMap((r) => (r.length > 220 ? r.split(/(?<=\.)\s+(?=[A-ZÀÂÉÈÊÎÔÛÇ])/) : [r]));
    for (const raw of rows) {
      if (!raw.trim()) continue;
      if (/^\s*(__|○|◦)/.test(raw) && last) { last.texte = (last.texte + ' ; ' + clean(raw)).slice(0, 260); continue; }
      if (/^\s*\|__/.test(raw) || type === 'livrable') last = null;
      const before = items.length;
      push(type, raw);
      if (items.length > before) last = items[items.length - 1];
    }
  };
  lines(cut(at.liv, at.crit, at.sit, at.peda, at.eval), 'livrable');
  lines(cut(at.crit, at.sit, at.peda, at.eval, at.liv), 'critere');
  return items.slice(0, 40);
}

// Screen widths named in the brief, e.g. "Tablette : de 768px à 1023px" -> [768, 1024, 1280]
export function briefBreakpoints(brief) {
  // Only sentences about screens; mockup sizes and minimum phone widths (320px…) are not breakpoints
  const parts = String(brief || '').split(/\n|(?<=\.)\s+/)
    .filter((p) => /écran|ecran|mobile|tablette|desktop|ordinateur|breakpoint|point de rupture|largeur|smartphone|responsive/i.test(p) && !/maquette|figma|wireframe|mockup/i.test(p));
  const nums = [...new Set(parts.flatMap((p) => (p.match(/\b\d{3,4}\s*px/gi) || []).map((x) => parseInt(x, 10))))].filter((n) => n >= 480 && n <= 2000).sort((a, b) => a - b);
  const out = [];
  for (const n of nums) {
    if (out.length && n - out[out.length - 1] <= 1) out[out.length - 1] = n;
    else out.push(n);
  }
  return out.length >= 2 ? out : [];
}

const base = (p) => String(p).split('/').pop().toLowerCase();
const cutWords = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t);
const count = (re, s) => (String(s).match(re) || []).length;

// Link to a planning board (Trello, Jira, GitHub Projects…), evidence for CT1 / CT2.
// Only real boards: a tool's home page, a wiki or a Notion page that is not a board view (?v=) is not a planning.
export const PLAN_LINK = /https?:\/\/(?:www\.)?trello\.com\/(?:b|c|invite|w)\/[^\s)"'<>\]]+|https?:\/\/[\w-]+\.atlassian\.net\/(?:jira|browse|secure)\/[^\s)"'<>\]]+|https?:\/\/github\.com\/(?:(?:users|orgs)\/[\w.-]+\/projects\/\d+|[\w.-]+\/[\w.-]+\/projects(?:\/\d+)?)(?![\w.-])[^\s)"'<>\]]*|https?:\/\/(?:[\w-]+\.)?notion\.(?:so|site)\/[^\s)"'<>\]]*[0-9a-f]{32}[^\s)"'<>\]]*[?&]v=[^\s)"'<>\]]*|https?:\/\/(?:app|sharing)\.clickup\.com\/[^\s)"'<>\]]+|https?:\/\/linear\.app\/[\w-]+\/(?:projects?|teams?|issues?|views?)\/[^\s)"'<>\]]*|https?:\/\/app\.asana\.com\/\d+\/[^\s)"'<>\]]+|https?:\/\/[\w-]+\.monday\.com\/boards\/[^\s)"'<>\]]+/i;
// In the AI prompt, a URL written by the student is shown by its site name only (a link can carry any text)
export const noUrl = (t) => String(t).replace(/https?:\/\/[^\s)"'<>\]“”‘’«»]+/g, (u) => { try { return new URL(u).hostname; } catch (e) { return 'lien'; } });
// A link copied from a README: no closing quote or punctuation stuck at the end
export const cleanUrl = (u) => String(u || '').replace(/[“”‘’«»].*$/, '').replace(/,https?:.*$/i, '').replace(/[.,;:!?*_`~'"]+$/, '').slice(0, 200);
export const planLinkIn = (text) => cleanUrl((String(text || '').match(PLAN_LINK) || [])[0]);
const PLAN_TOOLS = [[/trello\.com/i, 'Trello'], [/atlassian\.net/i, 'Jira'], [/github\.com/i, 'GitHub Projects'], [/notion\.(so|site)/i, 'Notion'], [/clickup\.com/i, 'ClickUp'], [/linear\.app/i, 'Linear'], [/asana\.com/i, 'Asana'], [/monday\.com/i, 'monday.com']];
const planTool = (url) => (PLAN_TOOLS.find(([re]) => re.test(url)) || [null, 'de planification'])[1];
// A brief requirement about planning the work ("Lien du Trello", "Tableau Jira", "Planification des tâches sur Jira"…),
// not about the project itself (a "Trello clone", an app that plans tasks, a "Planning des cours" page…).
// A deliverable may name the tool alone ("Tableau Trello"); a criterion naming Trello or Notion also needs a word about
// planning / following the work (Trello clones are common projects, "notion" is also a French word).
export function isPlanningText(text, type) {
  const t = String(text || '');
  const strong = /\b(jira|github projects?|clickup|monday\.com)\b/i.test(t);
  const tool = strong || /\btrello\b/i.test(t) || /\bNotion\b/.test(t);
  const like = /\b(clone|similaire|ressembl\w*|inspir\w*|reprodui\w*|imit\w*)\b|à la manière|\b(comme|type|style|façon|genre)\s+(sur\s+|dans\s+|avec\s+|de\s+|d[’']\s*|le\s+|la\s+|un\s+|une\s+)?(trello|jira|github|clickup|notion|asana|linear|monday)/i;
  if (tool && !like.test(t)
    && (type === 'livrable' || strong || /\b(liens?|url|planification|planning|planifi\w*|gestion de projet|gestion des tâches|tableau|board|backlog|suivi\w*|organis\w*|répart\w*)/i.test(t))) return true;
  if (/\b(application|appli|site|pages?|utilisateurs?|visiteurs?|permet\w*|fonctionnalit\w*|clone|cours|séances?|horaires?|réservations?)\b/i.test(t)) return false;
  return /planification des tâches|planifier (les|ses|vos|tes) tâches|outils? de (planification|gestion de projet)/i.test(t)
    || (/\b(liens?|url)\b/i.test(t) && /\b(planning|planification)\b/i.test(t));
}

// ---------------- Brief grid: what the brief asks, and how each point is checked ----------------
// Sure checks that need no HTML (JavaScript, PHP, SQL, Laravel, API, documents). A brief grid line may name one of them
// (or one of the HTML checks of siteChecks); only the checks named in the grid are run and shown.
// Each: [label, comment section, praise when done, advice when missing (after "Je te conseille"), files to read, test]
// test(x) -> [ok, detail]; ok null = cannot tell from the files read.
const NOT_LIB = (f) => !/(^|\/)(node_modules|vendor|dist|build|public\/build|storage|bootstrap\/cache)\//i.test(f);

const depOn = (x, re) => re.test(x.composer) || re.test(x.pkg);
const foundAs = (k, what) => [k > 0, `${k} ${what}`];
export const DETECTORS = {
  js_dom: ['Manipulation du DOM', 'JavaScript', 'Tu manipules le DOM en JavaScript (sélection et modification des éléments).', 'de manipuler le DOM en JavaScript (querySelector, createElement, textContent)', 'js',
    (x) => { const s = count(/querySelector(All)?\(|getElementById\(|getElementsBy\w+\(/g, x.js), m = count(/createElement\(|\.innerHTML\b|\.textContent\b|appendChild\(|\.append\(|classList\./g, x.js); return [s > 0 && m > 0, `${s} sélection(s), ${m} modification(s) du DOM`]; }],
  js_events: ['Événements JavaScript', 'JavaScript', 'Tu gères les actions de l’utilisateur avec des événements (addEventListener).', 'de gérer les actions de l’utilisateur avec addEventListener', 'js',
    (x) => foundAs(count(/addEventListener\(/g, x.js), 'addEventListener')],
  js_fetch: ['Appel d’API (fetch)', 'API', 'Tu récupères les données de l’API avec fetch.', 'de récupérer les données de l’API avec fetch (async / await)', 'js',
    (x) => { const f = count(/\bfetch\s*\(|axios(\.\w+)?\s*\(/g, x.js); return [f > 0, f ? `${f} appel(s) fetch / axios${/\bawait\b/.test(x.js) ? ', avec async / await' : ''}` : 'aucun appel fetch']; }],
  js_errors: ['Gestion des erreurs', 'JavaScript', 'Tu gères les erreurs (try / catch) avec un message clair pour l’utilisateur.', 'de gérer les erreurs (try / catch ou .catch) et d’afficher un message clair à l’utilisateur', 'js',
    (x) => foundAs(count(/\bcatch\s*[({]|\.catch\s*\(/g, x.js), 'gestion(s) d’erreur (catch)')],
  js_regex: ['Validation avec REGEX', 'JavaScript', 'Tu valides les champs du formulaire avec des expressions régulières (REGEX).', 'de valider les champs du formulaire avec des REGEX', 'js',
    (x) => foundAs(count(/\/(?:\\.|[^\/\n*])(?:\\.|[^\/\n])*\/[gimsuy]*\s*\.test\s*\(|new RegExp\s*\(|\.match\s*\(\s*\/(?:\\.|[^\/\n])+\//g, x.js), 'REGEX')],
  js_storage: ['Sauvegarde dans le localStorage', 'JavaScript', 'Les données sont sauvegardées dans le localStorage.', 'de sauvegarder les données dans le localStorage', 'js',
    (x) => foundAs(count(/localStorage\.setItem\(|localStorage\[/g, x.js), 'écriture(s) dans le localStorage')],
  js_modules: ['JavaScript organisé en fichiers', 'JavaScript', 'Ton JavaScript est bien organisé en plusieurs fichiers.', 'd’organiser ton JavaScript en plusieurs fichiers (un par fonctionnalité)', 'js',
    (x) => { const k = x.paths.filter((f) => /\.(m?js|ts)$/i.test(f) && NOT_LIB(f) && !/\.min\.js$|config\.[cm]?[jt]s$/i.test(f)).length; return [k >= 2, `${k} fichier(s) JavaScript`]; }],

  php_classes: ['Classes PHP', 'POO / Architecture', 'Ton code PHP est organisé en classes.', 'd’organiser ton code PHP en classes (une classe par entité)', 'php',
    (x) => { const k = count(/(?:^|<\?php|[;{}])\s*(abstract\s+|final\s+|readonly\s+)?class\s+[A-Z]\w*/gm, x.php); return [k >= 2, `${k} classe(s)`]; }],
  php_encaps: ['Encapsulation (private / protected)', 'POO / Architecture', 'Tu protèges les propriétés de tes classes (private / protected) : bonne encapsulation.', 'de déclarer les propriétés de tes classes en private ou protected (encapsulation)', 'php',
    (x) => { const p = count(/\b(private|protected)\s+(static\s+|readonly\s+)*(\??[\w\\|]+\s+)?\$\w+/g, x.php), pub = count(/\bpublic\s+(static\s+|readonly\s+)*(\??[\w\\|]+\s+)?\$\w+\s*[;=]/g, x.php); return [p > 0 && p >= pub, `${p} propriété(s) private / protected, ${pub} public`]; }],
  php_construct: ['Constructeurs', 'POO / Architecture', 'Tes classes ont des constructeurs pour initialiser les objets.', 'd’ajouter un constructeur (__construct) à tes classes', 'php',
    (x) => foundAs(count(/function\s+__construct\s*\(/g, x.php), 'constructeur(s)')],
  php_getset: ['Getters et setters', 'POO / Architecture', 'Tu utilises des getters et des setters pour accéder aux propriétés.', 'd’ajouter des getters et des setters pour accéder aux propriétés privées', 'php',
    (x) => { const g = count(/function\s+get[A-Z]\w*\s*\(/g, x.php), s = count(/function\s+set[A-Z]\w*\s*\(/g, x.php); return [g > 0 && s > 0, `${g} getter(s), ${s} setter(s)`]; }],
  php_inherit: ['Héritage', 'POO / Architecture', 'Tu utilises l’héritage (une classe de base étendue par d’autres classes).', 'd’utiliser l’héritage : une classe de base (ex. Utilisateur) étendue par des classes spécifiques', 'php',
    (x) => { const m = [...x.php.matchAll(/\bclass\s+(\w+)\s+extends\s+([\w\\]+)/g)].filter((k) => !/^(Controller|Model|Authenticatable|FormRequest|Seeder|Migration|TestCase|Factory|Exception|Command|Mailable|Notification|ServiceProvider|JsonResource|Middleware)$/.test(k[2].split('\\').pop())); return [m.length > 0, m.length ? m.slice(0, 3).map((k) => `${k[1]} extends ${k[2].split('\\').pop()}`).join(', ') : 'aucun extends']; }],
  php_interface: ['Interfaces ou traits', 'POO / Architecture', 'Tu utilises des interfaces ou des traits.', 'd’utiliser une interface ou un trait pour partager un comportement', 'php',
    (x) => foundAs(count(/(?:^|<\?php|[;{}])\s*(interface|trait)\s+\w+|\bimplements\s+\w+/gm, x.php), 'interface(s) / trait(s)')],
  php_namespace: ['Namespaces', 'POO / Architecture', 'Tes classes sont rangées dans des namespaces.', 'de ranger tes classes dans des namespaces', 'php',
    (x) => foundAs(count(/(?:^|<\?php)\s*namespace\s+[\w\\]+\s*;/gm, x.php), 'namespace(s)')],
  php_mvc: ['Architecture MVC', 'POO / Architecture', 'Le projet suit l’architecture MVC (modèles, vues et contrôleurs séparés).', 'd’organiser le projet en MVC : dossiers models, views et controllers', 'paths',
    (x) => { const d = ['models?', 'views?', 'controllers?'].map((k) => x.paths.some((f) => new RegExp(`(^|/)${k}/`, 'i').test(f) && NOT_LIB(f))); return [d.every(Boolean), `models ${d[0] ? '✓' : '✗'}, views ${d[1] ? '✓' : '✗'}, controllers ${d[2] ? '✓' : '✗'}`]; }],
  php_router: ['Routeur', 'POO / Architecture', 'Les URL passent par un routeur vers les bons contrôleurs.', 'd’ajouter un routeur qui envoie chaque URL vers son contrôleur', 'php',
    (x) => { const f = x.paths.find((p) => /(^|\/)(router|routes?|web|api)\.php$/i.test(p) && NOT_LIB(p)); const c = /\bclass\s+\w*Router\b/.test(x.php); return [!!(f || c), f || (c ? 'classe Router' : 'aucun routeur')]; }],
  php_htaccess: ['Point d’entrée unique (.htaccess)', 'POO / Architecture', 'Le fichier .htaccess redirige toutes les requêtes vers index.php.', 'd’ajouter un .htaccess qui redirige toutes les requêtes vers index.php', 'config',
    (x) => { const f = x.paths.find((p) => /(^|\/)\.htaccess$/.test(p) && NOT_LIB(p)); return [!!f && (!(f in x.texts) || /RewriteRule/i.test(x.texts[f])), f ? `${f}${f in x.texts && !/RewriteRule/i.test(x.texts[f]) ? ' sans RewriteRule' : ''}` : 'aucun .htaccess']; }],
  php_composer: ['Autoload avec Composer', 'POO / Architecture', 'Les classes sont chargées automatiquement avec Composer (autoload PSR-4).', 'd’utiliser l’autoload de Composer (PSR-4) pour charger tes classes', 'config',
    (x) => { const ok = /"psr-4"\s*:/.test(x.composer); return [ok, x.composer ? (ok ? 'composer.json avec autoload PSR-4' : 'composer.json sans autoload PSR-4') : 'aucun composer.json']; }],
  php_twig: ['Moteur de templates (Twig)', 'POO / Architecture', 'Tu utilises un moteur de templates (Twig).', 'd’utiliser un moteur de templates (Twig) pour séparer l’affichage de la logique', 'config',
    (x) => { const t = x.paths.filter((p) => /\.twig$/i.test(p)).length; return [t > 0 || /twig\/twig/.test(x.composer), t ? `${t} template(s) .twig` : /twig\/twig/.test(x.composer) ? 'twig/twig dans composer.json' : 'aucun template Twig']; }],
  php_session: ['Sessions PHP', 'Sécurité', 'Tu gères les utilisateurs connectés avec les sessions PHP.', 'de gérer les utilisateurs connectés avec les sessions (session_start, $_SESSION)', 'php',
    (x) => foundAs(count(/session_start\s*\(|\$_SESSION\b|session\(\)|Auth::/g, x.php), 'utilisation(s) de la session')],
  php_password: ['Mots de passe hachés', 'Sécurité', 'Les mots de passe sont hachés (password_hash).', 'de hacher les mots de passe avec password_hash et de les vérifier avec password_verify', 'php',
    (x) => foundAs(count(/password_hash\s*\(|Hash::make\s*\(|bcrypt\s*\(|'hashed'/g, x.php), 'hachage(s) de mot de passe')],
  php_validation: ['Validation côté serveur', 'Sécurité', 'Les données des formulaires sont validées côté serveur.', 'de valider les données des formulaires côté serveur (filter_var, preg_match…)', 'php',
    (x) => foundAs(count(/filter_var\s*\(|filter_input\s*\(|preg_match\s*\(|->validate\s*\(|Validator::make|extends\s+FormRequest|function\s+rules\s*\(/g, x.php), 'validation(s) côté serveur')],
  php_xss: ['Protection XSS', 'Sécurité', 'Tu protèges l’affichage contre les failles XSS (htmlspecialchars).', 'd’échapper les données affichées avec htmlspecialchars (protection XSS)', 'php',
    (x) => foundAs(count(/htmlspecialchars\s*\(|htmlentities\s*\(|strip_tags\s*\(|\{\{\s*[^!{\s]/g, x.php), 'échappement(s)')],
  php_csrf: ['Protection CSRF', 'Sécurité', 'Tes formulaires sont protégés contre les attaques CSRF (jeton).', 'de protéger tes formulaires avec un jeton CSRF', 'php',
    (x) => foundAs(count(/csrf/gi, x.php + x.js), 'mention(s) de jeton CSRF')],
  php_pdo: ['Accès aux données avec PDO', 'Base de données', 'Tu accèdes à la base de données avec PDO.', 'd’utiliser PDO pour l’accès à la base de données', 'php',
    (x) => foundAs(count(/new\s+\\?PDO\s*\(|\bPDO::/g, x.php), 'utilisation(s) de PDO')],
  php_prepared: ['Requêtes préparées', 'Sécurité', 'Tes requêtes SQL sont préparées : ton code est protégé contre les injections SQL.', 'd’utiliser des requêtes préparées (prepare puis execute) contre les injections SQL', 'php',
    (x) => { const p = count(/->prepare\s*\(/g, x.php), bad = count(/->(query|exec)\s*\(\s*(["'][^"']*["']\s*\.\s*\$|"[^"]*\$\w)/g, x.php); return [p > 0 && bad === 0, `${p} requête(s) préparée(s)${bad ? `, ${bad} requête(s) avec une variable collée dans le SQL` : ''}`]; }],
  sql_file: ['Script SQL (création de la base)', 'Base de données', 'Le fichier SQL crée la base et ses tables.', 'd’ajouter le fichier SQL qui crée la base, les tables et les données de test', 'sql',
    (x) => { const f = x.paths.filter((p) => /\.sql$/i.test(p) && NOT_LIB(p)); const t = count(/CREATE\s+TABLE/gi, x.sql); return [f.length > 0 && (t > 0 || !x.sql), f.length ? `${f.slice(0, 2).join(', ')}${x.sql ? ` : ${t} CREATE TABLE` : ''}` : 'aucun fichier .sql']; }],
  sql_fk: ['Relations (clés étrangères)', 'Base de données', 'Les tables sont reliées par des clés étrangères.', 'de relier les tables avec des clés étrangères (FOREIGN KEY)', 'sql',
    (x) => foundAs(count(/FOREIGN\s+KEY|\bREFERENCES\s+\w+|->foreign(Id)?\s*\(|->constrained\s*\(/gi, x.sql + x.php), 'clé(s) étrangère(s)')],
  sql_data: ['Données de test', 'Base de données', 'La base contient des données de test.', 'd’ajouter des données de test (INSERT INTO ou seeders)', 'sql',
    (x) => { const i = count(/INSERT\s+INTO/gi, x.sql); const s = x.paths.filter((p) => /database\/(seeders|factories)\/\w+\.php$/i.test(p) && !/DatabaseSeeder|UserFactory/.test(p)).length; return [i + s > 0, `${i} INSERT INTO, ${s} seeder(s) / factory(ies)`]; }],
  db_pgsql: ['PostgreSQL', 'Base de données', 'Le projet utilise PostgreSQL.', 'd’utiliser PostgreSQL comme base de données, comme demandé dans le brief', 'config',
    (x) => { const ok = /pgsql|postgres/i.test(x.env + x.php + x.composer + x.sql); return [ok, ok ? 'PostgreSQL configuré' : 'aucune configuration PostgreSQL trouvée']; }],
  db_mysql: ['MySQL', 'Base de données', 'Le projet utilise MySQL.', 'd’utiliser MySQL comme base de données, comme demandé dans le brief', 'config',
    (x) => { const ok = /mysql|mariadb/i.test(x.env + x.php + x.composer + x.sql) || /ENGINE\s*=\s*InnoDB|AUTO_INCREMENT/i.test(x.sql); return [ok, ok ? 'MySQL configuré' : 'aucune configuration MySQL trouvée']; }],
  lv_migrations: ['Migrations Laravel', 'Base de données', 'La base est créée avec les migrations Laravel.', 'de créer les tables avec les migrations Laravel', 'paths',
    (x) => { const m = x.paths.filter((p) => /database\/migrations\/.+\.php$/i.test(p) && !/_create_(users|cache|jobs|password_reset_tokens|failed_jobs|personal_access_tokens)_table\.php$/i.test(p)); return [m.length > 0, `${m.length} migration(s) du projet`]; }],
  lv_requests: ['Form Requests', 'Sécurité', 'Les données sont validées avec des Form Requests.', 'de valider les données avec des Form Requests (php artisan make:request)', 'paths',
    (x) => foundAs(x.paths.filter((p) => /app\/Http\/Requests\/.+\.php$/i.test(p)).length, 'Form Request(s)')],
  lv_repository: ['Repository Pattern', 'POO / Architecture', 'Tu utilises le Repository Pattern pour l’accès aux données.', 'd’utiliser le Repository Pattern (dossier Repositories)', 'paths',
    (x) => foundAs(x.paths.filter((p) => /Repositor(y|ies)\/.+\.php$|\w+Repository(Interface)?\.php$/i.test(p) && NOT_LIB(p)).length, 'repository(s)')],
  lv_service: ['Couche Service', 'POO / Architecture', 'La logique métier est rangée dans une couche Service.', 'de mettre la logique métier dans une couche Service (dossier Services)', 'paths',
    (x) => foundAs(x.paths.filter((p) => /(^|\/)Services?\/.+\.php$|\w+Service\.php$/i.test(p) && NOT_LIB(p)).length, 'service(s)')],
  lv_api: ['Routes d’API', 'API', 'Les routes de l’API sont déclarées.', 'de déclarer les routes de l’API (routes/api.php)', 'paths',
    (x) => { const f = x.paths.find((p) => /(^|\/)routes\/api\.php$/i.test(p)); return [!!f, f || 'aucun routes/api.php']; }],
  lv_jwt: ['Authentification JWT', 'Sécurité', 'L’authentification utilise JWT.', 'd’ajouter l’authentification avec JWT', 'config',
    (x) => { const ok = depOn(x, /jwt-auth|firebase\/php-jwt|lcobucci\/jwt|jsonwebtoken/); return [ok, ok ? 'paquet JWT installé' : 'aucun paquet JWT']; }],
  lv_sanctum: ['Laravel Sanctum', 'Sécurité', 'L’API est protégée avec Laravel Sanctum.', 'de protéger l’API avec Laravel Sanctum', 'config',
    (x) => { const ok = depOn(x, /laravel\/sanctum/); return [ok, ok ? 'laravel/sanctum installé' : 'Sanctum non installé']; }],
  lv_socialite: ['Connexion Google / Facebook (Socialite)', 'Sécurité', 'La connexion avec Google ou Facebook passe par Laravel Socialite.', 'd’ajouter la connexion avec Google ou Facebook (Laravel Socialite)', 'config',
    (x) => { const ok = depOn(x, /laravel\/socialite/); return [ok, ok ? 'laravel/socialite installé' : 'Socialite non installé']; }],
  pay_stripe: ['Paiement Stripe', 'API', 'Le paiement en ligne passe par Stripe.', 'd’intégrer le paiement en ligne avec Stripe', 'config',
    (x) => { const ok = depOn(x, /stripe\/stripe-php|laravel\/cashier|@stripe\//) || /js\.stripe\.com|Stripe\(/.test(x.js + x.php); return [ok, ok ? 'Stripe intégré' : 'aucune trace de Stripe']; }],
  rt_websocket: ['Temps réel (WebSockets)', 'API', 'Le temps réel fonctionne avec des WebSockets.', 'd’ajouter le temps réel avec des WebSockets (Laravel Reverb, Pusher…)', 'config',
    (x) => { const ok = depOn(x, /laravel\/reverb|pusher|laravel-websockets|laravel-echo|socket\.io|ratchet/) || /new\s+WebSocket\s*\(|ShouldBroadcast/.test(x.js + x.php); return [ok, ok ? 'WebSockets en place' : 'aucune trace de WebSockets']; }],
  mail: ['Envoi d’e-mails', 'API', 'Les e-mails sont envoyés automatiquement.', 'd’envoyer les e-mails demandés (Mail, Mailable)', 'php',
    (x) => foundAs(count(/Mail::|extends\s+Mailable|\bmail\s*\(|PHPMailer|->notify\s*\(/g, x.php) + x.paths.filter((p) => /app\/Mail\//i.test(p)).length, 'envoi(s) d’e-mail')],
  cache: ['Mise en cache', 'Bonnes pratiques', 'Tu mets en cache les données fréquentes.', 'de mettre en cache les requêtes fréquentes (Cache::remember)', 'php',
    (x) => foundAs(count(/Cache::(remember|rememberForever|put|get|tags)\b|cache\(\)->/g, x.php), 'mise(s) en cache')],
  slug: ['Slugs', 'Bonnes pratiques', 'Les URL utilisent des slugs lisibles.', 'de générer des slugs pour des URL lisibles (Str::slug)', 'php',
    (x) => foundAs(count(/Str::slug|str_slug|\bslug\b|sluggable/gi, x.php), 'slug(s)')],
  tests: ['Tests unitaires', 'Tests', 'Le projet a des tests automatisés (PHPUnit / Pest).', 'd’écrire des tests unitaires (PHPUnit ou Pest) pour chaque fonctionnalité', 'paths',
    (x) => foundAs(x.paths.filter((p) => /(^|\/)tests?\/.+(Test\.php|\.test\.[jt]s|\.spec\.[jt]s)$/i.test(p) && !/ExampleTest\.php$/.test(p)).length, 'fichier(s) de test')],
  api_docs: ['Documentation de l’API (Swagger…)', 'API', 'L’API est documentée (Swagger / OpenAPI).', 'de documenter l’API avec Swagger (ou une alternative)', 'config',
    (x) => { const f = x.paths.find((p) => /(swagger|openapi|api-docs)[\w.-]*\.(ya?ml|json)$/i.test(p)); const ok = !!f || depOn(x, /l5-swagger|scribe|scramble|swagger-php/) || /@OA\\/.test(x.php); return [ok, f || (ok ? 'outil de documentation installé' : 'aucune documentation Swagger / OpenAPI')]; }],
  postman: ['Collection Postman', 'API', 'La collection Postman est dans le dépôt.', 'd’ajouter la collection Postman dans le dépôt', 'paths',
    (x) => { const f = x.paths.find((p) => /postman/i.test(p) && /\.json$/i.test(p)); return [!!f, f || 'aucune collection Postman (.json)']; }],
  uml: ['Diagrammes UML', 'Bonnes pratiques', 'Les diagrammes UML sont partagés avec le projet.', 'd’ajouter tes diagrammes UML (classes, cas d’utilisation) dans le dépôt ou dans le README', 'paths',
    (x) => { const f = x.paths.filter((p) => /(uml|diagram|class|use[-_ ]?case|cas[-_ ]d|mcd|mld|erd|conception)[^/]*\.(png|jpe?g|svg|pdf|drawio|puml|plantuml|mdj|vpp|webp)$|(^|\/)(uml|diagrams?|diagrammes?|conception)\//i.test(p)); const link = /lucid\.app|lucidchart|draw\.io|diagrams\.net|plantuml|dbdiagram|```mermaid/i.test(x.readme); return [f.length > 0 || link, f.length ? f.slice(0, 3).join(', ') : link ? 'lien de diagramme dans le README' : 'aucun diagramme trouvé']; }],
  page404: ['Page 404 personnalisée', 'Intégration', 'Tu as créé une page 404 personnalisée.', 'de créer une page 404 personnalisée avec des liens vers l’accueil', 'paths',
    (x) => { const f = x.paths.find((p) => /(^|\/)(404|errors?\/404|not[-_]?found)\.(php|html?|blade\.php|twig)$/i.test(p)); return [!!f, f || 'aucune page 404']; }],
};
// The HTML / CSS checks of siteChecks, with what they look at (for the grid legend)
export const HTML_CHECKS = {
  pages: 'Site multipage', nav: 'Menu vers toutes les pages', active: 'Page en cours dans le menu', semantic: 'Balises sémantiques', h1: 'Un seul <h1> par page',
  alt: 'Images avec texte alternatif (alt)', seo: 'SEO de base (meta, title)', form: 'Formulaire', map: 'Plan d’accès (carte)', responsive: 'Responsive',
  anim: 'Animation ou transition CSS', layout: 'Mise en page CSS (Flexbox / Grid)', w3c: 'Validateur W3C', pages_site: 'Site en ligne (GitHub Pages…)',
  figma: 'Lien de la maquette Figma', docs: 'README / documentation', planning: 'Lien de planification dans le README',
};
export const CHECK_IDS = [...Object.keys(HTML_CHECKS), ...Object.keys(DETECTORS)];
const checkLabel = (id) => HTML_CHECKS[id] || (DETECTORS[id] && DETECTORS[id][0]) || id;

// Runs the detectors named in `wanted` on the files read
export function codeChecks(paths, texts, wanted) {
  const of = (re) => Object.keys(texts).filter((f) => re.test(f) && NOT_LIB(f)).map((f) => texts[f]).join('\n');
  const file = (re) => { const f = Object.keys(texts).find((k) => re.test(k)); return f ? texts[f] : ''; };
  const readme = Object.keys(texts).find((f) => /(^|\/)readme(\.md)?$/i.test(f));
  const x = { paths, texts, js: of(/\.(m?js|jsx|ts|tsx|vue)$/i), php: of(/\.(php|twig)$/i), sql: of(/\.sql$/i),
    composer: file(/(^|\/)composer\.json$/i), pkg: file(/(^|\/)package\.json$/i), env: file(/(^|\/)\.env\.example$|(^|\/)docker-compose\.ya?ml$/i), readme: readme ? texts[readme] : '' };
  const out = [];
  for (const id of Object.keys(DETECTORS)) {
    if (!wanted.has(id)) continue;
    const [label, , , , needs, test] = DETECTORS[id];
    // Nothing of that kind was read: cannot tell (e.g. a JavaScript check on a repo without any .js file read)
    const empty = (needs === 'js' && !x.js) || (needs === 'php' && !x.php) || (needs === 'sql' && !x.sql && !x.php);
    let r;
    try { r = test(x); } catch (e) { r = [null, 'non vérifié']; }
    if (empty && !r[0]) r = [false, needs === 'js' ? 'aucun fichier JavaScript lu' : needs === 'php' ? 'aucun fichier PHP lu' : 'aucun fichier SQL lu'];
    out.push({ id, ok: r[0], label, detail: r[1] });
  }
  return out;
}

// Which files a grid needs read (besides the README)
function wantedNeeds(wanted) {
  const need = new Set();
  for (const id of wanted) {
    if (DETECTORS[id]) need.add(DETECTORS[id][4]);
    else if (id in HTML_CHECKS && !['docs', 'planning', 'pages_site', 'figma'].includes(id)) need.add('html');
  }
  return need;
}

// Grid lines: type of requirement, as the teacher reads and types it
export const GRID_TYPES = { story: 'fonctionnalité', technique: 'technique', livrable: 'livrable', critere: 'critère', bonus: 'bonus', oral: 'oral' };
const gridType = (t) => {
  const k = String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return /^(fonction|story|user|us\b)/.test(k) ? 'story' : /^(techn|contrainte)/.test(k) ? 'technique' : /^livr/.test(k) ? 'livrable'
    : /^crit/.test(k) ? 'critere' : /^bonus|^option/.test(k) ? 'bonus' : /^oral|^pres|^demo/.test(k) ? 'oral' : 'story';
};
// Which check proves a requirement, from its words (used without AI, and when the AI gave none)
const VERIF_HINTS = [
  [/w3c|validator/, 'w3c'], [/postman/, 'postman'], [/swagger|openapi|documentation (technique )?de l[’']api/, 'api_docs'], [/\buml\b|diagramme/, 'uml'],
  [/tests? unitaires|phpunit|\bpest\b/, 'tests'], [/\bjwt\b/, 'lv_jwt'], [/sanctum/, 'lv_sanctum'], [/socialite|google ou facebook/, 'lv_socialite'],
  [/stripe|paiement en ligne/, 'pay_stripe'], [/websocket|temps réel|reverb|pusher/, 'rt_websocket'], [/form requests?/, 'lv_requests'],
  [/repository pattern|\brepositories\b/, 'lv_repository'], [/service layer|couche service/, 'lv_service'], [/migration/, 'lv_migrations'], [/mise en cache|\bcache\b/, 'cache'], [/\bslugs?\b/, 'slug'],
  [/postgre/, 'db_pgsql'], [/mysql/, 'db_mysql'], [/clés? étrangères?|foreign key|one-to-many|relations? entre (les )?(tables|entités)/, 'sql_fk'], [/données de test|seeders?/, 'sql_data'],
  [/(fichier|script|commandes) (des commandes )?sql|création de (la )?bd/, 'sql_file'], [/requêtes préparées|injections? sql/, 'php_prepared'], [/\bpdo\b/, 'php_pdo'],
  [/\bxss\b/, 'php_xss'], [/csrf/, 'php_csrf'], [/sessions? (php|utilisateurs?)|\$_session|session_start/, 'php_session'], [/(hach|chiffr)\w* (des |les )?mots? de passe|password_hash/, 'php_password'],
  [/getters?|setters?/, 'php_getset'], [/encapsulation|propriétés privées/, 'php_encaps'], [/constructeurs?/, 'php_construct'], [/héritage/, 'php_inherit'],
  [/interfaces? et traits?|\btraits?\b/, 'php_interface'], [/namespaces?/, 'php_namespace'], [/\bmvc\b|modèle\s*[–-]\s*vue/, 'php_mvc'], [/\.htaccess/, 'php_htaccess'],
  [/rout(eur|ing)/, 'php_router'], [/composer|autoload/, 'php_composer'], [/twig/, 'php_twig'], [/orienté objet|\bpoo\b|classes obligatoires/, 'php_classes'],
  [/page 404/, 'page404'], [/e-?mails? (d[’']alerte|de notification|envoy)|notification par e-?mail/, 'mail'],
  [/regex/, 'js_regex'], [/localstorage/, 'js_storage'], [/\bfetch\b|appel(s)? (à l[’'])?api|(récupér|consomm)\w* .*\bapi\b|api (météo|externe)|\bapi\b[^.]*récupér/, 'js_fetch'],
  [/addeventlistener/, 'js_events'], [/github pages|vercel|netlify|héberg|mise en ligne|mettre en ligne|site (web )?(doit être )?(correctement )?déployé/, 'pages_site'], [/readme|documentations? des acquis|fichier de documentation/, 'docs'],
  [/trello|jira|github projects?|planification/, 'planning'], [/figma/, 'figma'],
  [/responsive|media quer|tailles? d[’']écran|tout type d[’']écrans?|adapt\w* (à|aux|sur) (tous |les |différent\w* )*(écrans|ordinateurs|tablettes|téléphones|appareils)|\d{3,4}\s*px/, 'responsive'],
  [/menu|barre de navigation/, 'nav'], [/page en cours|page active/, 'active'], [/accessib|wcag/, 'alt'], [/\bh1\b/, 'h1'],
  [/sémantique/, 'semantic'], [/\bseo\b|meta description/, 'seo'], [/plan d[’']accès|google ?maps?|openstreetmap/, 'map'], [/animations? css|transitions? css/, 'anim'],
  [/flexbox|css grid/, 'layout'], [/multi-?pages?|plusieurs pages/, 'pages'], [/formulaire/, 'form'],
];
// Every check whose words are in the text (max 3), e.g. "page Contact avec un formulaire et le plan d'accès" -> "form, map"
export const verifHint = (text) => {
  const t = String(text || '').toLowerCase();
  return [...new Set(VERIF_HINTS.filter(([re]) => re.test(t)).map((h) => h[1]))].slice(0, 3).join(', ');
};
// A deliverable or criterion seen outside the code (presentation, quiz, e-mail…)
const ORAL = /^(présentation|démonstration|démo)\b|\bquizz?\b|questions?\s*\/\s*réponses|mise en situation|e-?mail professionnel|code review|livrable présentable|présentation (finale|du projet|orale)/i;

// Grid without AI: the checklist of briefItems, with the checks guessed from the words
export function gridFallback(brief) {
  return {
    contexte: '', tech: '', by: 'auto',
    items: briefItems(brief).map((i) => {
      const type = i.type !== 'story' && i.type !== 'bonus' && ORAL.test(i.texte) ? 'oral' : i.type;
      return { type, texte: i.texte, check: type === 'oral' ? '' : verifHint(i.texte) };
    }),
  };
}

// The grid as text, for the teacher to read and change: "[type] requirement (vérif : id)"
export function gridToText(grid) {
  if (!grid) return '';
  const head = [grid.contexte ? `# Contexte : ${grid.contexte}` : '', grid.tech ? `# Technologies : ${grid.tech}` : ''].filter(Boolean);
  return [...head, ...(grid.items || []).map((i) => `[${GRID_TYPES[i.type] || 'fonctionnalité'}] ${i.texte}${i.check ? ` (vérif : ${i.check})` : ''}`)].join('\n');
}
export function parseGrid(text) {
  const g = { contexte: '', tech: '', items: [] };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim().replace(/^[-•*]\s+/, '');
    if (!line) continue;
    const head = line.match(/^#\s*(contexte|technologies?)\s*:\s*(.*)$/i);
    if (head) { g[/^contexte/i.test(head[1]) ? 'contexte' : 'tech'] = head[2].trim().slice(0, 400); continue; }
    if (line.startsWith('#')) continue;
    const m = line.match(/^(?:\[([^\]]{1,30})\]\s*)?(.+?)\s*(?:\((?:vérif|verif|check)\s*:\s*([\w\s,-]*)\))?$/i);
    if (!m || m[2].length < 3 || g.items.length >= 45) continue;
    const type = gridType(m[1] || 'fonctionnalité');
    const check = type === 'oral' ? '' : checkList(m[3]).join(', ');
    g.items.push({ type, texte: m[2].slice(0, 260), check });
  }
  return g;
}

// "semantic, seo" -> ['semantic', 'seo'] (known checks only)
const checkList = (v) => [...new Set(String(v || '').split(/[\s,;]+/).filter((c) => CHECK_IDS.includes(c)))].slice(0, 4);
// The checks a grid asks for
export function gridWanted(grid) {
  return new Set(((grid && grid.items) || []).flatMap((i) => checkList(i.check)));
}


// Sure checks on the project files (no AI). Returns [{ id, ok: true|false|null, info?, label, detail }]
// A check about something the brief does not ask for is left out (or shown as information only).
// With a brief grid, `wanted` holds the checks the grid names: only those are kept (plus Git, always judged).
export function siteChecks(paths, texts, info = {}, commits = [], brief = '', wanted = null) {
  const B = String(brief || '');
  const asks = (re) => !!wanted || !B || re.test(B);
  const names = Object.keys(texts);
  const html = names.filter((f) => /\.html?$/i.test(f));
  const css = names.filter((f) => /\.(css|scss)$/i.test(f));
  const allHtml = paths.filter((f) => /\.html?$/i.test(f));
  const styles = css.map((f) => texts[f]).join('\n') + '\n' + html.map((f) => (texts[f].match(/<style[\s\S]*?<\/style>/gi) || []).join('\n')).join('\n');
  const markup = names.filter((f) => /\.(html?|jsx|tsx|vue|php)$/i.test(f)).map((f) => texts[f]).join('\n');
  const classList = [];
  for (const m of markup.matchAll(/\bclass(?:Name)?\s*=\s*\{?\s*["'`]([^"'`]*)["'`]/g)) classList.push(m[1]);
  const classes = ' ' + classList.join(' ') + ' ';
  const tailwind = paths.some((p) => /(^|\/)tailwind\.config\.[cm]?[jt]s$/i.test(p)) || /@tailwind\b|@import\s+["']tailwindcss/i.test(styles) || /cdn\.tailwindcss\.com|@tailwindcss\/browser/i.test(markup);
  const bootstrap = /bootstrap(\.min)?\.css|\/bootstrap@|bootstrap\.bundle|bootstrapcdn/i.test(markup) || /\s(col|offset|order|d|row-cols|navbar-expand)-(sm|md|lg|xl|xxl)(-[\w-]+)?(?=\s)/.test(classes);
  const externalCss = /<link[^>]+href\s*=\s*["'][^"']*(bulma|foundation|materialize|uikit|purecss|pure-min|skeleton|milligram|semantic-ui|fomantic|picocss|@picocss|w3\.css|w3schools\.com\/w3css)[^"']*["']/i.test(markup);
  // An HTML file that only loads a JS app (React, Vue…) is not checked for structure
  const shell = (t) => /<div[^>]*\bid\s*=\s*["'](root|app)["']/i.test(t) && t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length < 60;
  const out = [];
  const add = (id, ok, label, detail, extra) => out.push({ id, ok, label, detail, ...(extra || {}) });

  // Pages of the site = pages linked from a menu (+ index). Other HTML files (tests, drafts) are listed apart.
  const zoneOf = (t) => (t.match(/<nav[\s\S]*?<\/nav>/gi) || t.match(/<header[\s\S]*?<\/header>/gi) || []).join('\n');
  const linksOf = (t) => new Set((t.match(/href\s*=\s*["']([^"'#?]+\.html?)/gi) || []).map((h) => base(h.replace(/^href\s*=\s*["']/i, ''))));
  const linked = new Set(['index.html', 'index.htm']);
  for (const f of html) for (const l of linksOf(texts[f])) linked.add(l);
  let sitePages = allHtml.filter((f) => linked.has(base(f)));
  if (sitePages.length < 2) sitePages = allHtml;
  const orphans = allHtml.filter((f) => !sitePages.includes(f));
  const shortName = (f) => base(f).replace(/\.html?$/i, '');
  const pagesDetail = `${sitePages.length} page(s) : ${sitePages.slice(0, 12).map(shortName).join(', ') || 'aucune'}${orphans.length ? ` ; fichier(s) HTML reliés à aucune page : ${orphans.slice(0, 6).map(base).join(', ')}` : ''}`;
  if (allHtml.length) {
    if (asks(/multi-?pages?|plusieurs pages|pages? (à réaliser|reliées|interconnectées)|pages à créer/i)) add('pages', sitePages.length >= 2, 'Site multipage', pagesDetail);
    else add('pages', null, 'Pages du site', pagesDetail, { info: true });
  }
  const siteRead = html.filter((f) => sitePages.includes(f) && !shell(texts[f]));
  const n = siteRead.length;
  const inAll = (re) => siteRead.filter((f) => re.test(texts[f])).length;
  if (n) {
    if (sitePages.length >= 2) {
      // Menu: links (in <nav>, or <header> when there is no nav) to every other page of the site
      const want = sitePages.map(base);
      let full = 0, active = 0;
      for (const f of siteRead) {
        const zone = zoneOf(texts[f]);
        const links = linksOf(zone);
        if (want.every((p) => p === base(f) || links.has(p))) full++;
        if (/class\s*=\s*["'][^"']*\b(active|current|actif|selected)\b|aria-current/i.test(zone)) active++;
      }
      add('nav', full === n, 'Menu vers toutes les pages', `${full}/${n} page(s) ont un menu vers toutes les pages du site`);
      add('active', active === n, 'Page en cours indiquée dans le menu', `${active}/${n} page(s) avec une classe active / aria-current`);
    }
    const tags = ['header', 'nav', 'main', 'section', 'footer'].map((t) => [t, inAll(new RegExp(`<${t}[\\s>]`, 'i'))]);
    add('semantic', ['header', 'main', 'footer'].every((t) => tags.find((x) => x[0] === t)[1] === n), 'Balises sémantiques', tags.map(([t, c]) => `<${t}> ${c}/${n}`).join(', '));
    const h1s = siteRead.map((f) => count(/<h1[\s>]/gi, texts[f]));
    const zero = h1s.filter((x) => x === 0).length, many = h1s.filter((x) => x > 1).length;
    add('h1', zero + many === 0, 'Un seul <h1> par page', `${n - zero - many}/${n} page(s) avec un seul <h1>${zero ? ` ; ${zero} sans <h1>` : ''}${many ? ` ; ${many} avec plusieurs <h1>` : ''}`, { zero, many });
    const imgs = siteRead.reduce((s, f) => s + count(/<img[\s>]/gi, texts[f]), 0);
    if (imgs) {
      const noAlt = siteRead.reduce((s, f) => s + count(/<img(?![^>]*\balt\s*=)[^>]*>/gi, texts[f]), 0);
      add('alt', noAlt === 0, 'Images avec texte alternatif (alt)', `${imgs - noAlt}/${imgs} image(s) avec alt`);
    }
    const vp = inAll(/<meta[^>]+name\s*=\s*["']viewport/i), desc = inAll(/<meta[^>]+name\s*=\s*["']description/i);
    const title = inAll(/<title[^>]*>\s*[^<\s][^<]*<\/title>/i), lang = inAll(/<html[^>]+lang\s*=/i);
    add('seo', vp === n && desc === n && title === n && lang === n, 'SEO de base (viewport, description, title, lang)', `viewport ${vp}/${n}, meta description ${desc}/${n}, title ${title}/${n}, lang ${lang}/${n}`);
    if (asks(/formulaire/i)) {
      const forms = inAll(/<form[\s>]/i);
      const req = inAll(/<(input|textarea|select)[^>]*\brequired\b/i);
      add('form', forms > 0, 'Formulaire', forms ? `${forms} page(s) avec <form>, ${req} avec des champs required` : 'aucun <form> trouvé');
    }
    if (asks(/plan d[’']acc[eè]s|google ?maps|openstreetmap|carte (interactive|de localisation|d[’']acc[eè]s|google)|itinéraire/i)) {
      add('map', inAll(/<iframe[^>]+(google\.[a-z.]+\/maps|maps\.google|openstreetmap)/i) > 0, 'Plan d’accès (carte intégrée)', inAll(/<iframe/i) ? 'iframe trouvée' : 'aucune carte intégrée (iframe)');
    }
  }
  if (html.length || css.length || classList.length) {
    // Responsive: @media rules (px, em, rem), Tailwind prefixes (sm: md: lg:…), Bootstrap classes (col-md-6, d-lg-flex…)
    const TW = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };
    const BS = { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 };
    const twUsed = tailwind ? Object.keys(TW).filter((k) => new RegExp(`[\\s"'\`](max-)?${k}:`).test(classes)) : [];
    const twArb = tailwind ? [...classes.matchAll(/(min|max)-\[(\d{3,4})px\]:/g)].map((m) => Number(m[2])) : [];
    const bsUsed = bootstrap ? Object.keys(BS).filter((k) => new RegExp(`\\s(col|offset|order|d|flex|justify-content|align-items|align-self|text|float|row-cols|g|gx|gy|p|px|py|pt|pb|ps|pe|m|mx|my|mt|mb|ms|me|navbar-expand|sticky)-${k}(-[\\w-]+)?(?=\\s)`).test(classes)) : [];
    const media = count(/@media\b/g, styles);
    const cssBps = (styles.match(/@media[^{]*/g) || []).flatMap((m) => [...m.matchAll(/(\d+(?:\.\d+)?)\s*(px|r?em)\b/gi)].map((x) => Math.round(/em/i.test(x[2]) ? parseFloat(x[1]) * 16 : parseFloat(x[1])))).filter((v) => v >= 200);
    const fwBps = [...twUsed.map((k) => TW[k]), ...twArb, ...bsUsed.map((k) => BS[k])];
    const bps = [...new Set([...cssBps, ...fwBps])].sort((a, b) => a - b);
    const how = [media ? `${media} règle(s) @media` : '', twUsed.length ? `Tailwind : ${twUsed.map((k) => k + ':').join(' ')}` : '', bsUsed.length ? `Bootstrap : ${bsUsed.join(', ')}` : ''].filter(Boolean).join(', ');
    if (asks(/responsive|adaptables?|s[’']adapter (à|aux|parfaitement)|écrans?|mobile[- ]first|tablettes?|smartphones?|media ?quer/i)) {
      let state;
      if (bps.length || media) {
        state = true;
        add('responsive', true, 'Responsive', `${how}${bps.length ? `, points de rupture : ${bps.join('px, ')}px` : ''}`);
      } else if (tailwind || bootstrap || externalCss) {
        state = null; // a CSS framework may do it: cannot be sure from the files read
        add('responsive', null, 'Responsive', `framework CSS ${tailwind ? 'Tailwind' : bootstrap ? 'Bootstrap' : 'externe'} : aucune classe responsive trouvée dans les fichiers lus, à vérifier`);
      } else {
        state = false;
        add('responsive', false, 'Responsive', 'aucune règle @media');
      }
      const want = briefBreakpoints(B);
      if (want.length && state !== null) {
        // own CSS must match the brief (±2px); framework steps are close enough (Bootstrap lg 992 ≈ 1024)
        const near = (w) => cssBps.some((x) => Math.abs(x - w) <= 2) || fwBps.some((x) => Math.abs(x - w) <= 80);
        const missing = want.filter((w) => !near(w));
        add('breakpoints', missing.length === 0, 'Points de rupture demandés par le brief', `attendus : ${want.join('px, ')}px ; trouvés : ${bps.length ? bps.join('px, ') + 'px' : 'aucun'}${missing.length ? ` ; manquants : ${missing.join('px, ')}px` : ''}`);
      }
    }
    const kf = /@keyframes/i.test(styles) || /\sanimate-[a-z]/.test(classes);
    const tr = /transition\s*:|animation\s*:/i.test(styles) || /[\s:]transition(-[a-z]+)?\s/.test(classes);
    if (asks(/animation|transition|survol|hover/i)) add('anim', kf || tr, 'Animation ou transition CSS', kf ? (/@keyframes/i.test(styles) ? '@keyframes trouvé' : 'classes animate- (Tailwind)') : tr ? 'transition trouvée' : 'aucune');
    const flex = /display\s*:\s*(inline-)?flex/i.test(styles) || /[\s:](inline-)?flex\s|\sd-(\w+-)?flex\s/.test(classes);
    const grid = /display\s*:\s*(inline-)?grid/i.test(styles) || /[\s:](inline-)?grid\s/.test(classes) || (bootstrap && /\s(row|col)(-[\w-]+)?\s/.test(classes));
    const layout = [flex && 'Flexbox', grid && 'Grid', /:root\s*{[^}]*--/i.test(styles) && 'variables CSS', tailwind && 'Tailwind CSS', bootstrap && 'Bootstrap'].filter(Boolean);
    if (layout.length) add('layout', true, 'Mise en page CSS', layout.join(', '));
    else if (asks(/flex|grid|mise en page/i)) add('layout', false, 'Mise en page CSS', 'ni Flexbox ni Grid');
  }
  const docs = paths.filter((f) => /\.md$/i.test(f) && !/(^|\/)(node_modules|vendor)\//.test(f));
  add('docs', docs.length > 0, 'Documentation (README / .md)', docs.slice(0, 5).join(', ') || 'aucun fichier .md');
  const site = info.siteLink || info.homepage || '';
  if (asks(/github pages|héberg|heberg|déploy|déploie|déploiement|mettre en ligne|mise en ligne|mis en ligne|netlify|vercel/i)) {
    add('pages_site', info.has_pages || site ? true : info.has_pages === false ? false : null, 'Site en ligne (GitHub Pages ou autre)',
      info.has_pages ? `GitHub Pages activé${site ? ' : ' + site : ''}` : site ? `lien trouvé : ${site}` : info.has_pages === false ? 'GitHub Pages non activé et aucun lien de site dans le README' : 'inconnu');
  }
  if (info.figma !== undefined && asks(/figma/i)) add('figma', !!info.figma, 'Lien de la maquette Figma', info.figma || 'aucun lien figma.com dans le README');
  // The planning board (GitHub Projects, Trello…) is linked in the README
  if (info.planning !== undefined) {
    const given = info.planFrom === 'handin';
    add('planning', !!info.planning, given ? 'Lien de planification (donné au rendu)' : 'Lien de planification dans le README (GitHub Projects, Trello…)',
      info.planning ? `lien ${planTool(info.planning)} ${given ? 'donné au rendu' : 'trouvé'} : ${info.planning}${backlogText(info.backlog) ? ' ; ' + backlogText(info.backlog) : ''}` : 'aucun lien de planification dans le README');
  }
  if (info.w3c && info.w3c.errors != null) add('w3c', info.w3c.errors === 0, 'Validateur W3C (page d’accueil)', `${info.w3c.errors} erreur(s), ${info.w3c.warnings} avertissement(s) sur ${info.w3c.page}${info.w3c.first ? ' ; ex. : ' + info.w3c.first : ''}`);
  else if (info.w3c) add('w3c', null, 'Validateur W3C (page d’accueil)', 'non vérifié : ' + info.w3c.error);
  // Git and GitHub: always judged with a brief (number and regularity of commits, messages, branches)
  const g = info.git;
  if (g) {
    const need = Math.min(2, Math.max(1, Number(g.briefDays) || 2));
    const nTxt = g.capped ? `plus de ${g.n}` : String(g.n);
    add('commits', g.n >= 5 && g.days >= need, 'Commits réguliers', `${nTxt} commit(s) depuis le début du brief, sur ${g.days} jour(s) différent(s)`, { n: g.n, capped: !!g.capped, days: g.days });
  }
  if (commits.length) {
    const conv = commits.filter((c) => /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:/i.test(c.msg)).length;
    const bad = commits.filter((c) => badMessage(c.msg));
    add('git', bad.length === 0, 'Messages de commit', `${commits.length} commit(s) lus, ${conv} au format conventionnel (feat:, fix:…), ${bad.length} message(s) vague(s)`,
      { total: commits.length, conv, vague: bad.length, vagueEx: bad.length ? String(bad[0].msg).split('\n')[0].trim().slice(0, 40) : '' });
  }
  if (g && ((g.branches && g.branches.length) || g.merges)) {
    const names = (g.branches || []).slice(0, 5);
    add('branches', true, 'Branches et fusions', [names.length ? `branches : ${names.join(', ')}${g.branches.length > 5 ? '…' : ''}` : '', g.merges ? `${g.merges} fusion(s)${g.prs ? `, dont ${g.prs} pull request(s)` : ''}` : ''].filter(Boolean).join(' ; '),
      { names, merges: g.merges || 0, prs: g.prs || 0 });
  }
  if (!wanted) return out;
  const keep = out.filter((c) => ['commits', 'git', 'branches'].includes(c.id) || wanted.has(c.id) || (c.id === 'breakpoints' && wanted.has('responsive'))
    || (c.id === 'planning' && info.planning !== undefined))
    // What the project uses (Flexbox, Grid…): shown as information only when the grid does not ask for it
    .concat(out.filter((c) => c.id === 'layout' && c.ok && !wanted.has('layout')).map((c) => ({ ...c, info: true })));
  // A form in PHP / Blade views (no .html page in the project)
  if (wanted.has('form') && !keep.some((c) => c.id === 'form')) {
    const views = names.filter((f) => /\.(php|twig)$/i.test(f) && /<form[\s>]/i.test(texts[f]));
    keep.push({ id: 'form', ok: views.length > 0, label: 'Formulaire', detail: views.length ? `<form> dans ${views.slice(0, 3).join(', ')}` : 'aucun <form> trouvé' });
  }
  return [...keep, ...codeChecks(paths, texts, wanted)];
}

// Every file of the repo (path + size). A very big repo (node_modules pushed…) is read folder by folder.
const SKIP_DIR = /^(node_modules|vendor|dist|build|\.next|\.nuxt|coverage|\.git|\.cache|out)$/i;

const LIB_FILE = /(^|\/)(bootstrap|normalize|reset|font-?awesome|swiper|aos|animate|jquery|bundle|output|tailwind)[\w.-]*\.(css|js)$|(^|\/)[\w-]+\.config\.[cm]?[jt]s$/i;

// Files to read for a brief grid (max 15 + README): what its checks need, then what the project is made of
export function gridPick(wanted, usable, paths, byType) {
  const need = wantedNeeds(wanted);
  const has = (re) => usable.some((f) => re.test(f.path));
  const php = has(/\.php$/i), js = has(/\.(m?js|jsx|ts|tsx|vue)$/i);
  const depth = (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b);
  const phpFiles = byType(/\.php$/i).filter((f) => !/(^|\/)(config|database\/migrations|tests?|storage|bootstrap|public\/vendor)\//i.test(f));
  const isView = (f) => /\.blade\.php$|(^|\/)views?\//i.test(f);
  const core = (f) => /(models?|entit(y|ies)|controllers?|classes?|services?|repositor(y|ies)|src|core|app)\//i.test(f);
  const out = [];
  const take = (list, k) => { for (const f of list) { if (k <= 0 || out.length >= 15) break; if (!out.includes(f)) { out.push(f); k--; } } };
  const front = need.has('html') || (!php && !need.has('php'));
  take(byType(/\.html?$/i), front ? (need.has('js') || need.has('php') || php ? 5 : 8) : 0);
  take(byType(/\.(css|scss)$/i), front ? 2 : 0);
  take(byType(/\.(m?js|jsx|ts|tsx|vue)$/i), need.has('js') ? 5 : js && !php ? 3 : 0);
  if (php) {
    const k = need.has('php') || need.has('sql') ? 8 : 4;
    take([...phpFiles.filter((f) => core(f) && !isView(f)), ...phpFiles.filter((f) => !core(f) && !isView(f))], k - 2);
    take(phpFiles.filter(isView), 2);
  }
  if (need.has('sql')) {
    take(paths.filter((f) => /\.sql$/i.test(f) && !/(^|\/)(node_modules|vendor)\//.test(f)).sort(depth), 2);
    take(paths.filter((f) => /database\/migrations\/.+\.php$/i.test(f) && !/_create_(users|cache|jobs)_table/.test(f)).sort(depth), 2);
  }
  if (need.has('config') || php) take(paths.filter((f) => /(^|\/)(composer\.json|package\.json|\.env\.example|\.htaccess|docker-compose\.ya?ml)$/i.test(f) && !/(^|\/)(node_modules|vendor)\//.test(f)).sort(depth), 4);
  return out;
}

// Keeps only the expected fields, short, as plain text
export function cleanAi(r, commits, skills = [], items = []) {
  r = r && typeof r === 'object' ? r : {};
  commits = Array.isArray(commits) ? commits : [];
  skills = Array.isArray(skills) ? skills : [];
  items = Array.isArray(items) ? items : [];
  const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const list = (v, n) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, n) : []);
  const key = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_').trim();
  const STATUT = { fait: 'fait', realise: 'fait', ok: 'fait', oui: 'fait', done: 'fait', valide: 'fait', partiel: 'partiel', partiellement: 'partiel', partial: 'partiel', en_cours: 'partiel',
    absent: 'absent', non: 'absent', manquant: 'absent', missing: 'absent', non_fait: 'absent', non_realise: 'absent', non_verifiable: 'non_verifiable', inconnu: 'non_verifiable' };
  const AVIS = { validable: 'validable', valide: 'validable', validee: 'validable', a_verifier: 'a_verifier', partiel: 'a_verifier', verifier: 'a_verifier', non_visible: 'non_visible', non_valide: 'non_visible', absent: 'non_visible' };
  const okOf = (v) => (v === true || /^(true|oui|yes|ok)$/i.test(String(v)) ? true : v === false || /^(false|non|no)$/i.test(String(v)) ? false : null);
  const bySha = new Map(commits.map((c) => [c.sha.slice(0, 7), c]));
  const out = {
    resume: str(r.resume, 800),
    commits: [],
    brief: null,
    forts: list(r.points_forts, 5),
    ameliorer: list(r.a_ameliorer, 5),
    exigences: [],
    competences: [],
    feedback: '',
  };
  for (const c of Array.isArray(r.commits) ? r.commits : []) {
    const sha = str(c && c.sha, 40).slice(0, 7);
    const real = bySha.get(sha);
    if (!real || out.commits.some((x) => x.sha === sha)) continue;
    out.commits.push({ sha, repo: real.repo, msg: str(real.msg.split('\n')[0], 120), ok: okOf(c.ok), note: str(c.note, 160) });
  }
  for (const c of commits) {
    const sha = c.sha.slice(0, 7);
    if (!out.commits.some((x) => x.sha === sha)) out.commits.push({ sha, repo: c.repo, msg: str(c.msg.split('\n')[0], 120), ok: null, note: 'non analysé' });
  }
  const given = Array.isArray(r.exigences) ? r.exigences.filter((e) => e && typeof e === 'object') : [];
  if (items.length) {
    // Our own checklist decides the lines; the AI only gives status + proof (by number, or in order if numbers are missing)
    const byN = new Map(given.filter((e) => Number(e.n)).map((e) => [Number(e.n), e]));
    const inOrder = !byN.size && given.length === items.length;
    items.forEach((it, i) => {
      const e = inOrder ? given[i] : byN.get(it.n);
      const line = it.type === 'oral' ? { type: it.type, texte: it.texte, statut: 'non_verifiable', preuve: 'à voir à l’oral' }
        : { type: it.type, texte: it.texte, statut: e ? STATUT[key(e.statut)] || 'non_verifiable' : 'non_verifiable', preuve: e ? str(e.preuve, 200) : 'non analysé' };
      if (it.verif) line.verif = it.verif;
      out.exigences.push(line);
    });
  } else {
    for (const e of given.slice(0, 45)) {
      if (!str(e.texte, 1)) continue;
      out.exigences.push({
        type: ['story', 'bonus', 'livrable', 'critere'].includes(key(e.type)) ? key(e.type) : 'story',
        texte: str(e.texte, 160),
        statut: STATUT[key(e.statut)] || 'non_verifiable',
        preuve: str(e.preuve, 200),
      });
    }
  }
  for (const c of Array.isArray(r.competences) ? r.competences : []) {
    // "CT5N1", "ct5n1", "CT5-N1", "CT5N2 (niveau 2)", "Compétence CT5N2", old "C5N1 transv"…
    const raw = str(c && c.code, 80);
    let code = parseSkills(raw)[0] || '';
    if (/^C\d/.test(code) && (/transv/i.test(raw) || (!skills.includes(code) && skills.includes('T' + code.slice(1))))) code = 'T' + code.slice(1);
    if (!skills.includes(code) || out.competences.some((x) => x.code === code)) continue;
    let avis = AVIS[key(c.avis)] || 'a_verifier';
    // A transversal competency is mostly seen outside the repo (oral, meetings, tools): never "not visible"
    if (code.startsWith('T') && avis === 'non_visible') avis = 'a_verifier';
    out.competences.push({ code, avis, raison: str(c.raison, 260) });
  }
  // Every competency of the brief is listed, even if the AI forgot it
  for (const code of skills) if (!out.competences.some((x) => x.code === code)) out.competences.push({ code, avis: 'a_verifier', raison: 'non analysé' });
  return out;
}

// ---------- Planning board handed in (optional) ----------
// Trello: a public board is read with no key (lists, cards, members). GitHub Projects: only "public or not" (GitHub does
// not let an app read the tasks of a personal project). Jira: the link only (Jira boards are private).
const TRELLO_BOARD = /^https?:\/\/(?:www\.)?trello\.com\/b\/([A-Za-z0-9]{6,12})/i;
const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// A public Trello board: cards to do / in progress / done, and per board member
export async function trelloBacklog(url) {
  const t = String(url || '').match(TRELLO_BOARD);
  if (!t) return null;
  const q = 'fields=name&actions=none&checklists=none&labels=none&cards=visible&card_fields=idList,idMembers,closed,dueComplete&lists=open&list_fields=name&members=all&member_fields=fullName,username';
  const res = await fetch(`https://trello.com/b/${t[1]}.json?${q}`).catch(() => null);
  if (!res || !res.ok) return { error: res && [401, 403, 404].includes(res.status) ? 'private' : 'unreachable' };
  let b;
  try {
    const r = await readLimited(res, 700000);
    if (r.cut) return { error: 'too big' };
    b = JSON.parse(r.text);
  } catch (e) { return { error: 'unreadable' }; }
  const DONE = /done|termin|fini|fait|complet|livr|valid|closed|ferm/i, DOING = /doing|en cours|progress|review|revue|test|wip|qa|bloqu/i;
  const kindOf = {};
  for (const l of Array.isArray(b.lists) ? b.lists : []) kindOf[l.id] = DONE.test(l.name || '') ? 'done' : DOING.test(l.name || '') ? 'doing' : 'todo';
  const cards = (Array.isArray(b.cards) ? b.cards : []).filter((c) => !c.closed && c.idList in kindOf);
  const isDone = (c) => kindOf[c.idList] === 'done' || c.dueComplete === true;
  const count = { todo: 0, doing: 0, done: 0 };
  for (const c of cards) count[isDone(c) ? 'done' : kindOf[c.idList]]++;
  const members = (Array.isArray(b.members) ? b.members : []).slice(0, 30).map((m) => {
    const mine = cards.filter((c) => (c.idMembers || []).includes(m.id));
    return { name: oneLine(m.fullName || m.username, 60), username: oneLine(m.username, 40), cards: mine.length, done: mine.filter(isDone).length };
  });
  return { name: oneLine(b.name, 80), total: cards.length, ...count, members, unassigned: cards.filter((c) => !(c.idMembers || []).length).length };
}
export function backlogText(b) {
  if (!b) return '';
  if (b.error) return b.error === 'private' ? 'tableau Trello privé : la plateforme ne peut pas le lire' : '';
  return `Trello « ${b.name} » : ${b.total} carte(s) — ${b.done} terminée(s), ${b.doing} en cours, ${b.todo} à faire`
    + (b.members.length ? ` ; par membre : ${b.members.map((m) => `${m.name} ${m.cards}${m.cards ? ` (${m.done} terminée${m.done > 1 ? 's' : ''})` : ''}`).join(', ')}` : '')
    + (b.unassigned ? ` ; ${b.unassigned} carte(s) sans membre` : '');
}
// The board member who is this student (same GitHub / Trello username, or the same name)
function backlogMember(b, login, name) {
  if (!b || b.error) return null;
  const lg = normName(login).replace(/ /g, ''), nm = normName(name);
  const toks = nm.split(' ').filter((x) => x.length >= 3);
  return b.members.find((m) => normName(m.username).replace(/ /g, '') === lg || normName(m.name) === nm
    || (toks.length >= 2 && toks.every((x) => normName(m.name).split(' ').includes(x)))) || null;
}

// ---------- One comment per squad member ----------
// m: the member's contribution, rec: the squad review (final squad states), ms: the member's own states
export function memberComment(m, rec, ms) {
  const first = firstNameOf(m.name, m.login);
  const st = reviewStates(rec);
  const ck = (id) => st.ck[id];
  const lines = [];
  // Role and part in the squad repo
  if (!m.commits) {
    lines.push(`Je ne vois aucun commit de ta part dans le dépôt du squad${m.collaborator === false ? ' (tu n’es pas collaborateur du dépôt)' : ''} : chaque membre doit committer et pousser son propre travail.`);
  } else {
    const work = `${m.commits} commit${m.commits > 1 ? 's' : ''} sur ${m.days} jour${m.days > 1 ? 's' : ''}${m.prs ? ` et ${m.prs} pull request${m.prs > 1 ? 's' : ''}` : ''}`;
    lines.push(m.sm
      ? `En tant que Scrum Master, tu as organisé le travail du squad${ck('planning') ? ' avec une planification partagée' : ''}${m.reviews ? ` et tu as relu ${m.reviews} pull request${m.reviews > 1 ? 's' : ''}` : ''}. Tu as aussi contribué au projet avec ${work}.`
      : `Ton travail au sein du squad est bien visible : ${work}${m.reviews ? `, et ${m.reviews} relecture${m.reviews > 1 ? 's' : ''} de pull request` : ''}.`);
    if (m.cards != null) lines.push(m.cards ? `Sur le tableau de planification, ${m.cards} carte${m.cards > 1 ? 's' : ''} t’${m.cards > 1 ? 'étaient attribuées' : 'était attribuée'}, dont ${m.cardsDone} terminée${m.cardsDone > 1 ? 's' : ''}.`
      : 'Aucune carte ne t’était attribuée sur le tableau de planification : pense à t’assigner tes tâches.');
    if (Array.isArray(m.perStep) && Array.isArray(rec.stepNames) && rec.stepNames.length) {
      lines.push(`Tes commits par étape : ${rec.stepNames.map((nm, i) => `${nm} : ${m.perStep[i] || 0}`).join(', ')}${m.perStep[rec.stepNames.length] ? `, après la dernière étape : ${m.perStep[rec.stepNames.length]}` : ''}.`);
    }
    if (m.sm && ck('pr_review') === false) lines.push('Pense à faire approuver chaque pull request avant de la fusionner : c’est ton rôle de garantir la qualité du code fusionné.');
  }
  // Quiz
  if (ms.quiz != null) {
    lines.push(ms.quiz >= 70 ? `Tu as obtenu un bon score au quiz avec une précision de ${ms.quiz} %.`
      : ms.quiz >= 50 ? `Tu as obtenu une précision de ${ms.quiz} % au quiz, c’est un bon début.`
      : `Avec une précision de ${ms.quiz} % au quiz, il est important de revoir les notions du brief pour renforcer tes compétences.`);
  }
  // Mise en situation: their own challenge, or the squad's
  const ch = ms.ch || rec.challenge || null;
  if (ms.mes && ms.mes.r) {
    const t = ch && ch.titre ? ` (« ${ch.titre} »)` : '';
    lines.push(ms.mes.r === 'valide' ? `Tu as réussi la mise en situation${t}.` : ms.mes.r === 'partiel' ? `Ta mise en situation${t} est partiellement réussie.` : `Ta mise en situation${t} n’est pas validée.`);
    if (ms.mes.note) lines.push(ms.mes.note);
  }
  if (ms.note) lines.push(ms.note);
  const parts = [`Bonjour ${first},`];
  if (lines.length) parts.push(lines.join('\n'));
  const codes = Object.keys(ms.co || {});
  const okC = codes.filter((c) => ms.co[c] === true).map(skillDisplay), koC = codes.filter((c) => ms.co[c] === false).map(skillDisplay);
  if (okC.length || koC.length) parts.push([okC.length ? `Compétences validées : ${okC.join(', ')}.` : '', koC.length ? `Compétences non validées : ${koC.join(', ')}.` : ''].filter(Boolean).join('\n'));
  const weak = !m.commits || (ms.quiz != null && ms.quiz < 50);
  const allOk = !koC.length && !weak && (!ms.mes || !ms.mes.r || ms.mes.r === 'valide');
  parts.push(allOk ? 'Très bon travail, bonne continuation !' : weak ? 'Bon courage, je suis sûr que tu peux y arriver !' : 'Bonne continuation !');
  return parts.join('\n\n');
}

// "Mise en situation": one small task on a user story of the brief drawn at random (done or not done in the project),
// carried out in front of the teacher. It follows the brief (technologies, level) and is a small slice: never a whole page.
export const CH_LEVEL = {
  1: ['imiter', '10 min', 'une seule petite chose, en s’inspirant de son propre code ou d’un exemple du cours (ex. dupliquer une carte et changer son contenu, ajouter un lien dans le menu, changer la couleur ou la taille d’un élément, ajouter une courte section : un titre, un texte, une image).'],
  2: ['adapter', '15 min', 'adapter un élément existant à une nouvelle contrainte simple (ex. une autre disposition pour la tablette, une courte section qui reprend un style existant).'],
  3: ['transposer', '20 min', 'refaire un petit élément semblable à un autre endroit du projet, sans modèle à copier.'],
};
export const JS_BRIEF = /javascript|\bjs\b|\bdom\b|fetch|\bapi\b|localstorage|événement|evenement/i;
// Asks for JavaScript or for a new interactive feature (not allowed in an HTML/CSS brief)
export const CH_NEEDS_JS = /javascript|\bjs\b|<script|\bscript\b|addeventlistener|\bdom\b|onclick|au clic|en cliquant|filtrer|trier|rechercher|que le visiteur puisse (choisir|filtrer|trier|rechercher)|interacti|dynamique/i;
// Too big for a few minutes: a whole page, a whole site, "everything"
export const CH_TOO_BIG = /page (entière|complète)|toute la page|tout le site|\b(crée|construis|réalise|refais|développe|fais|code|intègre) (une|la|ta|toute la) (nouvelle )?page\b/i;
// Techniques a task may name only when the brief names them (otherwise it says the result and the learner chooses how)
const CH_TECH = /(?<![\w@-])(flexbox|flex|grid|@media|media[- ]?quer(?:y|ies)|bootstrap|tailwind|sass|scss|z-index|keyframes|transform|transition|animation)(?![\w-])/gi;
export function chOutsideBrief(text: string, brief: string): string[] {
  const b = String(brief || "").toLowerCase();
  const found = [...new Set((String(text || "").match(CH_TECH) || []).map((w) => w.toLowerCase()))];
  return found.filter((w) => !(b.includes(w) || (/media/.test(w) && /@media|media[- ]?quer/.test(b))));
}

// User stories seen in the code (not an analysis, a logo or a meeting), done or not; otherwise any story
export function challengePool(ex) {
  let pool = ex.map((e, i) => i).filter((i) => (ex[i].type === 'story' || ex[i].type === 'technique') && ex[i].statut !== 'non_verifiable');
  if (!pool.length) pool = ex.map((e, i) => i).filter((i) => ex[i].type === 'story' || ex[i].type === 'technique');
  if (!pool.length) pool = ex.map((e, i) => i).filter((i) => ex[i].type === 'critere');
  return pool;
}

export const oneLine = (v: any, n: number) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
export const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
export { LOCKFILE, AI_SKIP_FILE, SRC_FILE, LIB_FILE, SKIP_DIR, ORAL, checkList, checkLabel, wantedNeeds, isBound, base, count, cutWords, planTool, gridType, TRELLO_BOARD, backlogMember, normName };
