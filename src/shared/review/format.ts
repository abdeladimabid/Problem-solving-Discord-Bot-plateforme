// How GitHub activity looks in Discord: one embed per event, the daily / weekly tables, what counts in the score.
// Ported from GitHub Watcher.
/* eslint-disable */
import { GH_WEB } from './gh.ts';

export function countAction(event: string, p: any, analysis: any) {
  if (event === 'push') {
    const list = Object.values(analysis || {}).filter((a) => a.kind !== 'merge');
    const flagged = list.filter((a) => a.flags.length > 0); // huge / node_modules: suspicious, not scored
    const real = list.filter((a) => a.kind === 'real' && a.flags.length === 0);
    return {
      commits: list.length,
      real: real.length,
      flagged: flagged.length,
      tiny: list.filter((a) => a.kind !== 'real' && a.flags.length === 0).length, // tiny + docs-only
      bad: list.filter((a) => a.bad).length,
      lines: real.reduce((s, a) => s + (a.lines || 0), 0),
      prs: 0,
      other: 0,
    };
  }
  if (event === 'pull_request') return { commits: 0, prs: 1, other: 0 }; // opened / merged / closed...
  return { commits: 0, prs: 0, other: 1 }; // branches, repos, issues, reviews, comments...
}

export async function postStatsTable(post: (p: any) => Promise<unknown>, title: string, rows: any[], activeLabel: string, color = 0x2f81f7, withTrend = false) {
  // Narrow aligned table in a code block (Discord has no real tables; its embed box is ~50 characters wide)
  const fmt = (n) => (n >= 100000 ? `${Math.round(n / 1000)}k` : String(n));
  const ascii = (s) => String(s).normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
  // Real name when it can be written in plain letters ("Zakaria E."), otherwise the GitHub username
  const label = (r, w) => {
    const n = ascii(r.display || '').replace(/[<>`*_~|]/g, '').replace(/\s+/g, ' ').trim();
    if ((n.match(/[A-Za-z]/g) || []).length < 2) return ascii(r.login);
    if (n.length <= w) return n;
    const parts = n.split(' ');
    const short = parts.length > 1 ? parts[0] + ' ' + parts[parts.length - 1][0] + '.' : n;
    return short.length <= w ? short : n;
  };
  const trendText = (d) => (d === null || d === undefined ? '-' : d > 0 ? `+${d}` : d < 0 ? String(d) : '=');
  const cols = withTrend
    ? [
        { title: '#', w: 2, align: 'right', get: (r, i) => (r.total === 0 ? '-' : String(i + 1)) },
        { title: 'Student', w: 13, align: 'left', get: (r) => label(r, 13) },
        { title: 'Score', w: 5, align: 'right', get: (r) => String(r.total) },
        { title: 'Trend', w: 5, align: 'right', get: (r) => trendText(r.trend) },
        { title: 'Cmts', w: 4, align: 'right', get: (r) => String(r.real) },
        { title: 'Lines', w: 5, align: 'right', get: (r) => fmt(r.lines) },
        { title: 'PRs', w: 3, align: 'right', get: (r) => String(r.prs) },
        { title: 'Other', w: 5, align: 'right', get: (r) => String(r.other) },
      ]
    : [
        { title: '#', w: 2, align: 'right', get: (r, i) => (r.total === 0 ? '-' : String(i + 1)) },
        { title: 'Student', w: 14, align: 'left', get: (r) => label(r, 14) },
        { title: 'Score', w: 5, align: 'right', get: (r) => String(r.total) },
        { title: 'Commits', w: 7, align: 'right', get: (r) => String(r.real) },
        { title: 'Lines', w: 5, align: 'right', get: (r) => fmt(r.lines) },
        { title: 'PRs', w: 3, align: 'right', get: (r) => String(r.prs) },
        { title: 'Other', w: 5, align: 'right', get: (r) => String(r.other) },
      ];
  const cell = (text, c) => {
    const t = text.length > c.w ? text.slice(0, c.w - 1) + '~' : text;
    return c.align === 'left' ? t.padEnd(c.w) : t.padStart(c.w);
  };
  const header = cols.map((c) => cell(c.title, c)).join(' ');
  const rule = cols.map((c) => '-'.repeat(c.w)).join(' ');
  const lines = rows.map((r, i) => cols.map((c) => cell(c.get(r, i), c)).join(' '));
  const active = rows.filter((r) => r.total > 0 || r.tiny > 0 || r.flagged > 0).length;
  const podium = rows
    .filter((r) => r.total > 0)
    .slice(0, 3)
    .map((r, i) => `${['🥇', '🥈', '🥉'][i]} <@${r.discordId}>`)
    .join('   ');
  let trendLines = '';
  if (withTrend) {
    const withT = rows.filter((r) => r.trend !== null && r.trend !== undefined);
    const up = withT.filter((r) => r.trend > 0).sort((a, b) => b.trend - a.trend).slice(0, 3);
    const down = withT.filter((r) => r.trend < 0).sort((a, b) => a.trend - b.trend).slice(0, 3);
    if (up.length) trendLines += `\n📈 **Most improved:** ${up.map((r) => `<@${r.discordId}> (+${r.trend})`).join(' · ')}`;
    if (down.length) trendLines += `\n📉 **Slowing down:** ${down.map((r) => `<@${r.discordId}> (${r.trend})`).join(' · ')}`;
    if (!withT.length) trendLines = '\n*Trend vs last week starts next week (not enough history yet).*';
  }

  // Split the table if the class is very big
  const chunks = [];
  let chunk = [];
  for (const line of lines) {
    if (chunk.length && (header.length + 2) * (chunk.length + 3) > 3500) { chunks.push(chunk); chunk = []; }
    chunk.push(line);
  }
  if (chunk.length) chunks.push(chunk);

  const embeds = chunks.map((c, i) => ({
    color,
    ...(i === 0 ? { title } : {}),
    description: (i === 0 && (podium || trendLines) ? (podium + trendLines).trim() + '\n' : '') + '```\n' + [header, rule, ...c].join('\n') + '\n```',
    ...(i === chunks.length - 1
      ? { footer: { text: `${active}/${rows.length} students active ${activeLabel} · Score = Commits + PRs + Other${withTrend ? ' · Trend = score vs last week' : ''}` } }
      : {}),
  }));

  // Warnings under the table: only students who have some
  const warned = rows
    .filter((r) => r.tiny || r.flagged || r.bad)
    .sort((a, b) => b.tiny + b.flagged + b.bad - (a.tiny + a.flagged + a.bad));
  if (warned.length) {
    const wl = warned.map((r) => {
      const w = [];
      if (r.tiny) w.push(`🤏 ${r.tiny} tiny`);
      if (r.flagged) w.push(`🚨 ${r.flagged} huge`);
      if (r.bad) w.push(`⚠️ ${r.bad} vague`);
      return `<@${r.discordId}> — ${w.join(' · ')}`;
    });
    let part = [];
    const flush = (last) => {
      embeds.push({
        color: 0xd29922,
        ...(embeds.at(-1).color !== 0xd29922 ? { title: '💡 To improve' } : {}),
        description: part.join('\n'),
        ...(last ? { footer: { text: "🤏 tiny = 1–2 lines or docs only · 🚨 huge = 2000+ lines or node_modules · ⚠️ vague = unclear commit message · these don't count in the score" } } : {}),
      });
      part = [];
    };
    for (const l of wl) {
      if ((part.join('\n') + l).length > 3500) flush(false);
      part.push(l);
    }
    flush(true);
  }

  // Discord allows max 10 embeds and 6000 characters per message
  let batch = [];
  const total = (b) => b.reduce((n, e) => n + (e.title || '').length + e.description.length + ((e.footer && e.footer.text) || '').length, 0);
  for (const e of embeds) {
    if (batch.length && (batch.length === 10 || total([...batch, e]) > 5800)) {
      await post({ embeds: batch });
      batch = [];
    }
    batch.push(e);
  }
  if (batch.length) await post({ embeds: batch });
}

// ---------------- How activity looks in Discord ----------------

const COLORS = {
  push: 0x2f81f7, create: 0x3fb950, delete: 0xf85149, prOpen: 0x3fb950, prMerged: 0x8957e5,
  prClosed: 0xf85149, issue: 0xd29922, comment: 0x8b949e, review: 0x58a6ff, release: 0xdb61a2,
  ci: 0xf85149, other: 0x6e7681,
};
const trim = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const firstLine = (s) => trim(String(s || '').split('\n')[0], 100);
const branchOf = (ref) => String(ref || '').replace(/^refs\/(heads|tags)\//, '');

function commitLine(c, a) {
  let s = `[\`${c.id.slice(0, 7)}\`](${c.url}) ${firstLine(c.message)}`;
  if (!a) return s;
  if (a.lines !== null && a.lines !== undefined) s += ` \`+${a.add} −${a.del}\``;
  const tags = [];
  if (a.kind === 'merge') tags.push('🔀 merge');
  if (a.kind === 'tiny') tags.push('🤏 tiny');
  if (a.kind === 'docs') tags.push('📝 docs only');
  if (a.flags.includes('node_modules')) tags.push('🚨 node_modules committed');
  if (a.flags.includes('huge')) tags.push('🚨 huge (copy-paste?)');
  if (a.bad) tags.push('⚠️ vague message');
  return tags.length ? `${s} · ${tags.join(' · ')}` : s;
}

export function formatWebhook(event, p, discordId = null, analysis = null, senderName = null) {
  const repo = p.repository || {};
  const repoName = repo.full_name || 'unknown/repo';
  const repoUrl = repo.html_url || `${GH_WEB}/${repoName}`;
  const who = discordId ? `<@${discordId}>` : '';
  const lines = (...parts) => parts.filter(Boolean).join('\n') || null;
  const base = {
    author: p.sender
      ? { name: senderName && senderName !== p.sender.login ? `${senderName} (${p.sender.login})` : p.sender.login, url: p.sender.html_url, icon_url: p.sender.avatar_url }
      : undefined,
    footer: { text: (repo.private ? '🔒 ' : '') + repoName },
    timestamp: new Date().toISOString(),
  };

  switch (event) {
    case 'push': {
      if (p.deleted) return null;
      const commits = p.commits || [];
      if (p.created && commits.length === 0) return null;
      const branch = branchOf(p.ref);
      const n = commits.length;
      const a = analysis || {};
      const list = commits.slice(-5).map((c) => commitLine(c, a[c.id]));
      if (n > 5) list.unshift(`…and ${n - 5} earlier commit(s)`);
      const tip = Object.values(a).some((x) => x.bad)
        ? '💡 *Say what changed, e.g.* `fix login form not submitting`'
        : '';
      return { ...base, color: COLORS.push, title: `🔨 ${p.forced ? 'Force-pushed' : 'Pushed'} ${n} commit${n === 1 ? '' : 's'} to ${branch}`, url: p.compare || repoUrl, description: lines(who, list.join('\n'), tip) };
    }
    case 'create':
      return { ...base, color: COLORS.create, title: `${p.ref_type === 'tag' ? '🏷️' : '🌿'} Created ${p.ref_type} ${p.ref}`, url: `${repoUrl}/tree/${encodeURIComponent(p.ref)}`, description: lines(who) };
    case 'delete':
      return { ...base, color: COLORS.delete, title: `🗑️ Deleted ${p.ref_type} ${p.ref}`, url: repoUrl, description: lines(who) };
    case 'pull_request': {
      const pr = p.pull_request || {};
      let action = p.action, icon = '🔀', color = COLORS.prOpen;
      if (p.action === 'closed' && pr.merged) { action = 'merged'; icon = '✅'; color = COLORS.prMerged; }
      else if (p.action === 'closed') { icon = '❌'; color = COLORS.prClosed; }
      else if (p.action === 'reopened') { icon = '🔁'; }
      else if (p.action === 'ready_for_review') { action = 'ready for review'; icon = '👀'; }
      else if (p.action !== 'opened') return null;
      return { ...base, color, title: `${icon} Pull request #${pr.number} ${action}`, url: pr.html_url, description: lines(who, `**${trim(pr.title, 200)}**`, pr.head && pr.base ? `\`${pr.head.ref}\` → \`${pr.base.ref}\`` : '') };
    }
    case 'pull_request_review': {
      if (p.action !== 'submitted') return null;
      const state = String((p.review && p.review.state) || '').toLowerCase().replace('_', ' ');
      return { ...base, color: COLORS.review, title: `👀 Reviewed pull request #${p.pull_request && p.pull_request.number}${state ? ` (${state})` : ''}`, url: p.review && p.review.html_url, description: lines(who, trim((p.review && p.review.body) || '', 300)) };
    }
    case 'pull_request_review_comment':
    case 'issue_comment':
    case 'commit_comment': {
      if (p.action && p.action !== 'created') return null;
      const target = event === 'issue_comment'
        ? `${p.issue && p.issue.pull_request ? 'PR' : 'issue'} #${p.issue && p.issue.number}`
        : event === 'commit_comment' ? `commit ${String((p.comment && p.comment.commit_id) || '').slice(0, 7)}`
        : `PR #${p.pull_request && p.pull_request.number}`;
      return { ...base, color: COLORS.comment, title: `💬 Commented on ${target}`, url: p.comment && p.comment.html_url, description: lines(who, trim((p.comment && p.comment.body) || '', 300)) };
    }
    case 'issues': {
      if (!['opened', 'closed', 'reopened'].includes(p.action)) return null;
      const i = p.issue || {};
      return { ...base, color: COLORS.issue, title: `${p.action === 'closed' ? '✔️' : p.action === 'opened' ? '🐛' : '🔁'} Issue #${i.number} ${p.action}`, url: i.html_url, description: lines(who, `**${trim(i.title, 200)}**`) };
    }
    case 'release': {
      if (p.action !== 'published') return null;
      const r = p.release || {};
      return { ...base, color: COLORS.release, title: `🚀 Published release ${r.name || r.tag_name || ''}`.trim(), url: r.html_url, description: lines(who) };
    }
    case 'repository': {
      const labels = { created: '📦 Created repository', deleted: '🗑️ Deleted repository', publicized: '🌍 Made repository public', privatized: '🔒 Made repository private', renamed: '✏️ Renamed repository' };
      if (!labels[p.action]) return null;
      return { ...base, color: p.action === 'deleted' ? COLORS.delete : COLORS.create, title: `${labels[p.action]} ${repo.name || repoName.split('/').pop()}`, url: repoUrl, description: lines(who, repo.description) };
    }
    case 'fork':
      return { ...base, color: COLORS.other, title: `🍴 Forked ${repoName}`, url: p.forkee && p.forkee.html_url, description: lines(who) };
    case 'workflow_run': {
      const w = p.workflow_run || {};
      if (p.action !== 'completed' || !['failure', 'timed_out'].includes(w.conclusion)) return null;
      return { ...base, color: COLORS.ci, title: `🔴 Workflow "${w.name}" failed on ${w.head_branch}`, url: w.html_url, description: lines(who, firstLine(w.head_commit && w.head_commit.message)) };
    }
    default:
      return null;
  }
}