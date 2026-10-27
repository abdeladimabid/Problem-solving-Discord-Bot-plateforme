// 💼 The student's portfolio page (/u/<key>): what they show companies. Made from what they wrote (/portfolio) and
// what ClassBot can vouch for (training projects, validated competencies, GitHub and VS Code activity, practice).
// Server-rendered, no script but « Save as PDF »; light and dark; prints well.
import type { GuildRow } from "../shared/types.ts";
import type { portfolioData } from "../shared/portfolio.ts";

type Data = NonNullable<Awaited<ReturnType<typeof portfolioData>>>;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const LANG_COLORS: Record<string, string> = {
  javascript: "#f1e05a", typescript: "#3178c6", html: "#e34c26", css: "#663399", scss: "#c6538c", php: "#4f5d95", python: "#3572a5", java: "#b07219",
  sql: "#e38c00", vue: "#41b883", shell: "#89e051", bash: "#89e051", "c#": "#178600", c: "#555555", "c++": "#f34b7d", blade: "#f7523f", twig: "#c1d026",
  json: "#8f8f8f", markdown: "#083fa1", dart: "#00b4ab", kotlin: "#a97bff", go: "#00add8", ruby: "#701516", jsx: "#61dafb", tsx: "#3178c6", react: "#61dafb",
};
const colorOf = (l: string | null) => LANG_COLORS[String(l || "").toLowerCase()] || "#94a3b8";
const initials = (n: string) => n.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const T = {
  fr: {
    projects: "Projets", projectsSub: "Ce que j'ai construit", training: "Projets de formation", trainingSub: "Réalisés pendant ma formation et évalués par mon formateur",
    skills: "Compétences", stack: "Technologies", stackSub: "Mon temps de code par langage", validated: "Compétences validées", validatedSub: "Titre professionnel Développeur Web et Web Mobile",
    activity: "Activité", activitySub: "Je code régulièrement", practice: "Entraînement et distinctions", contact: "Me contacter", pdf: "Enregistrer en PDF",
    open: { stage: "Disponible pour un stage", alternance: "Disponible pour une alternance", emploi: "Disponible pour un emploi", freelance: "Disponible pour des missions" } as Record<string, string>,
    kProjects: "projets", kHours: "heures de code", kCommits: "commits", kSolved: "défis réussis", kComps: "compétences validées",
    code: "Code", demo: "Démo", featured: "Projet phare", validatedBy: "Évalué par le formateur", squad: "En équipe", updated: "mis à jour",
    commits6: "commits (6 mois)", activeDays: "jours actifs", streak: "jours d'affilée", last30: "h de code (30 j)", weekly: "Heures de code par semaine", less: "Moins", more: "Plus",
    solved: "défis réussis", accuracy: "de réussite", contests: "concours", rating: "classement duels", badges: "Badges", level: "Niveau", hr: "Profil HackerRank",
    footer: "Portfolio généré par ClassBot · les projets de formation, les compétences et l'activité viennent des données de la formation", years: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
    days: ["L", "", "M", "", "V", "", ""], noAbout: "Développeur·se web en formation", repo: "Dépôt", tryIt: "Voir le projet", stars: "étoiles",
  },
  en: {
    projects: "Projects", projectsSub: "What I built", training: "Training projects", trainingSub: "Built during my training and assessed by my teacher",
    skills: "Skills", stack: "Technologies", stackSub: "My coding time by language", validated: "Validated competencies", validatedSub: "Web and Mobile Web Developer professional title",
    activity: "Activity", activitySub: "I code regularly", practice: "Practice and achievements", contact: "Contact me", pdf: "Save as PDF",
    open: { stage: "Open to an internship", alternance: "Open to a work-study contract", emploi: "Open to work", freelance: "Open to freelance missions" } as Record<string, string>,
    kProjects: "projects", kHours: "coding hours", kCommits: "commits", kSolved: "challenges solved", kComps: "competencies validated",
    code: "Code", demo: "Live demo", featured: "Featured project", validatedBy: "Assessed by the teacher", squad: "Team project", updated: "updated",
    commits6: "commits (6 months)", activeDays: "active days", streak: "days in a row", last30: "coding hours (30 d)", weekly: "Coding hours per week", less: "Less", more: "More",
    solved: "challenges solved", accuracy: "success rate", contests: "contests", rating: "duel rating", badges: "Badges", level: "Level", hr: "HackerRank profile",
    footer: "Portfolio made by ClassBot · the training projects, competencies and activity come from the training's data", years: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    days: ["M", "", "W", "", "F", "", ""], noAbout: "Web developer in training", repo: "Repo", tryIt: "See the project", stars: "stars",
  },
};

const ICON = {
  github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 1 8 7 8-7"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5M9 13h6M9 17h6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/></svg>',
  star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 .8l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.2 3.5 14.6l.9-5L.8 6.1l5-.7L8 .8Z"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M5 11 11 5M6 5h5v5"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m3.5 8.5 3 3 6-7"/></svg>',
};

const CSS = `
:root{--bg:#f7f8fc;--card:#fff;--ink:#0b1324;--soft:#475069;--faint:#8a93ab;--line:#e6e9f2;--acc:#4f46e5;--acc2:#0ea5e9;--acc-bg:#eef0ff;--good:#059669;--good-bg:#e7f8f1;--shadow:0 1px 2px #0b13240a,0 8px 28px #0b132410;--r:18px}
@media (prefers-color-scheme:dark){:root{--bg:#0a0f1d;--card:#111829;--ink:#e8ecf8;--soft:#aab3cc;--faint:#717c99;--line:#1f2940;--acc:#818cf8;--acc2:#38bdf8;--acc-bg:#1b2140;--good:#34d399;--good-bg:#0f2a22;--shadow:0 1px 2px #0006,0 10px 30px #0005}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}svg{width:1em;height:1em;flex:none}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.nav{position:sticky;top:0;z-index:10;backdrop-filter:saturate(1.6) blur(12px);background:color-mix(in srgb,var(--bg) 80%,transparent);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;gap:18px;height:62px}
.brand{display:flex;align-items:center;gap:10px;font-weight:750;text-decoration:none;letter-spacing:-.01em}.brand i{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-style:normal;font-size:13px;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2))}
.nav nav{display:flex;gap:4px;margin-left:auto}.nav nav a{text-decoration:none;color:var(--soft);font-size:14.5px;font-weight:550;padding:7px 11px;border-radius:9px}.nav nav a:hover{background:var(--acc-bg);color:var(--ink)}
.btn{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font:inherit;font-size:14.5px;font-weight:650;padding:10px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;transition:transform .15s,box-shadow .15s,border-color .15s}
.btn:hover{transform:translateY(-1px);box-shadow:var(--shadow);border-color:color-mix(in srgb,var(--acc) 40%,var(--line))}.btn.pri{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.btn svg{width:17px;height:17px}
.hero{padding:64px 0 40px;position:relative;overflow:hidden}
.hero:before{content:"";position:absolute;inset:-40% -10% auto auto;width:640px;height:640px;background:radial-gradient(closest-side,color-mix(in srgb,var(--acc) 22%,transparent),transparent);filter:blur(10px);z-index:-1}
.hero:after{content:"";position:absolute;left:-12%;top:10%;width:420px;height:420px;background:radial-gradient(closest-side,color-mix(in srgb,var(--acc2) 16%,transparent),transparent);z-index:-1}
.hero .wrap{display:grid;grid-template-columns:1.35fr 1fr;gap:48px;align-items:center}
.otw{display:inline-flex;align-items:center;gap:9px;font-size:14px;font-weight:650;color:var(--good);background:var(--good-bg);padding:6px 14px 6px 12px;border-radius:99px;margin-bottom:18px}
.otw b{width:9px;height:9px;border-radius:50%;background:var(--good);box-shadow:0 0 0 0 var(--good);animation:pulse 2s infinite}@keyframes pulse{70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}
h1{font-size:clamp(38px,5.6vw,62px);line-height:1.04;letter-spacing:-.035em;margin:0 0 12px;font-weight:800}
.headline{font-size:clamp(19px,2.2vw,24px);font-weight:650;margin:0 0 14px;background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-.01em}
.meta{display:flex;gap:16px;flex-wrap:wrap;color:var(--soft);font-size:15px;margin-bottom:18px}.meta span{display:inline-flex;align-items:center;gap:6px}
.bio{font-size:17px;color:var(--soft);max-width:60ch;margin:0 0 26px;white-space:pre-line}
.links{display:flex;gap:10px;flex-wrap:wrap}
.me{position:relative;display:grid;gap:16px;justify-items:center}
.ava{width:min(260px,70vw);aspect-ratio:1;border-radius:32px;object-fit:cover;background:linear-gradient(135deg,var(--acc),var(--acc2));display:grid;place-items:center;color:#fff;font-size:76px;font-weight:800;box-shadow:0 24px 60px color-mix(in srgb,var(--acc) 35%,transparent);transform:rotate(-2deg);border:6px solid var(--card)}
.kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;width:100%;max-width:360px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow)}.kpi b{display:block;font-size:28px;letter-spacing:-.02em;line-height:1.1}.kpi span{font-size:13px;color:var(--faint);font-weight:550}
section.s{padding:44px 0}
.sh{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px;flex-wrap:wrap}
.sh h2{font-size:30px;letter-spacing:-.025em;margin:0;line-height:1.1}.sh p{margin:6px 0 0;color:var(--soft)}
.eyebrow{font-size:12.5px;font-weight:750;letter-spacing:.12em;text-transform:uppercase;color:var(--acc);margin-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column;transition:transform .2s,box-shadow .2s;break-inside:avoid}
.card:hover{transform:translateY(-3px);box-shadow:0 2px 4px #0b13240d,0 18px 40px #0b13241a}
.shot{aspect-ratio:2/1;background:linear-gradient(135deg,var(--acc),var(--acc2));display:grid;place-items:center;overflow:hidden;position:relative}
.shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}.shot .ph{font-size:42px;font-weight:800;color:#ffffffd9;letter-spacing:-.03em}
.shot .tag{position:absolute;left:12px;top:12px;background:#0b1324cc;color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px;backdrop-filter:blur(4px)}
.cb{padding:18px 20px 20px;display:flex;flex-direction:column;gap:10px;flex:1}
.cb h3{margin:0;font-size:19px;letter-spacing:-.015em}.cb p{margin:0;color:var(--soft);font-size:15px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:99px;background:var(--acc-bg);color:var(--ink);display:inline-flex;align-items:center;gap:6px}
.chip i{width:9px;height:9px;border-radius:50%;display:inline-block}
.cf{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin-top:auto;padding-top:8px;font-size:14px;color:var(--faint)}.cf .sp{flex:1}.cf span{display:inline-flex;align-items:center;gap:5px}
.cf a{white-space:nowrap;display:inline-flex;align-items:center;gap:5px;font-weight:650;color:var(--ink);text-decoration:none;padding:6px 11px;border-radius:10px;border:1px solid var(--line)}.cf a:hover{border-color:var(--acc);color:var(--acc)}
.cf a svg{width:15px;height:15px}
.big{display:grid;grid-template-columns:1.25fr 1fr;margin-bottom:20px}.big .shot{aspect-ratio:auto;min-height:280px}.big .cb{padding:28px 30px}.big h3{font-size:26px}
.ok{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:650;color:var(--good)}.ok svg{width:15px;height:15px}
.tl{display:grid;gap:14px}
.tr{display:grid;grid-template-columns:52px 1fr;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px;box-shadow:var(--shadow);break-inside:avoid}
.tr .n{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2))}
.tr h3{margin:0 0 4px;font-size:18px}.tr p{margin:0 0 10px;color:var(--soft);font-size:15px}.tr .top{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:24px;box-shadow:var(--shadow);break-inside:avoid}
.panel h3{margin:0 0 4px;font-size:18px}.panel .sub{color:var(--faint);font-size:14px;margin:0 0 16px}
.bar{display:grid;grid-template-columns:120px 1fr 44px;gap:12px;align-items:center;margin:9px 0;font-size:14.5px;font-weight:550}
.bar .t{height:10px;border-radius:99px;background:var(--acc-bg);overflow:hidden}.bar .t i{display:block;height:100%;border-radius:99px}.bar .v{color:var(--faint);text-align:right;font-variant-numeric:tabular-nums}
.comp{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}.comp:first-of-type{border-top:0}
.comp b{font-size:12.5px;font-weight:800;color:var(--acc);background:var(--acc-bg);border-radius:8px;padding:3px 8px;white-space:nowrap}.comp span{font-size:14.5px}
.comp em{font-style:normal;color:var(--faint);font-size:12.5px;margin-left:6px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow)}.stat b{font-size:28px;display:block;letter-spacing:-.02em}.stat span{color:var(--faint);font-size:13.5px}
.heat{overflow-x:auto}.heat svg{width:auto;height:auto;display:block}
.hl{display:flex;gap:6px;align-items:center;justify-content:flex-end;font-size:12.5px;color:var(--faint);margin-top:8px}.hl i{width:11px;height:11px;border-radius:3px;display:inline-block}
.wk svg{width:100%;height:auto}
.badges{display:flex;flex-wrap:wrap;gap:8px}.badge{padding:7px 13px;border-radius:12px;background:var(--acc-bg);font-size:14px;font-weight:600}.badge.star{background:linear-gradient(135deg,#fde68a,#fbbf24);color:#422006}
.mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.cta{margin:30px 0 0;border-radius:24px;padding:38px;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.cta h2{margin:0;font-size:28px;letter-spacing:-.02em}.cta p{margin:6px 0 0;opacity:.9}.cta .btn{background:#fff;color:#0b1324;border-color:#fff}
footer{padding:36px 0 50px;color:var(--faint);font-size:13.5px;text-align:center}
@media (max-width:900px){.hero .wrap,.big,.two{grid-template-columns:1fr}.hero{padding-top:36px}.me{order:-1}.ava{width:180px;font-size:56px}.stats{grid-template-columns:repeat(2,1fr)}.nav nav{display:none}.big .shot{min-height:200px}}
@media (max-width:520px){.wrap{padding:0 16px}.grid{grid-template-columns:1fr}.bar{grid-template-columns:90px 1fr 40px}.cta{padding:26px}}
@media print{.nav,.links .btn.pdf,.cta .btn{display:none}body{background:#fff}.hero:before,.hero:after{display:none}.card,.panel,.kpi,.stat,.tr{box-shadow:none}section.s{padding:20px 0}.ava{box-shadow:none}}
`;

/** The heatmap of the last 26 weeks: commits and coding minutes, one square a day. */
function heatmap(d: Data, L: "fr" | "en") {
  const days = d.act.days, today = new Date(d.act.today + "T00:00:00Z");
  const dow = (today.getUTCDay() + 6) % 7;   // 0 = Monday
  const start = new Date(today.getTime() - (25 * 7 + dow) * 86400000);
  const lvl = (x?: { c: number; m: number }) => { const v = x ? x.c * 2 + x.m / 30 : 0; return v <= 0 ? 0 : v < 2 ? 1 : v < 5 ? 2 : v < 9 ? 3 : 4; };
  const COL = ["var(--acc-bg)", "color-mix(in srgb,var(--acc) 30%,var(--acc-bg))", "color-mix(in srgb,var(--acc) 55%,var(--acc-bg))", "color-mix(in srgb,var(--acc) 80%,var(--acc-bg))", "var(--acc)"];
  const S = 13, G = 3, X0 = 22, Y0 = 18;
  let cells = "", months = "", lastM = -1;
  for (let w = 0; w < 26; w++) {
    for (let k = 0; k < 7; k++) {
      const dt = new Date(start.getTime() + (w * 7 + k) * 86400000);
      if (dt > today) continue;
      const key = dt.toISOString().slice(0, 10), x = days[key];
      cells += `<rect x="${X0 + w * (S + G)}" y="${Y0 + k * (S + G)}" width="${S}" height="${S}" rx="3" fill="${COL[lvl(x)]}"><title>${key}${x ? ` · ${x.c} commit(s) · ${x.m} min` : ""}</title></rect>`;
      if (k === 0 && dt.getUTCMonth() !== lastM && dt.getUTCDate() <= 7) { lastM = dt.getUTCMonth(); months += `<text x="${X0 + w * (S + G)}" y="11" font-size="10" fill="currentColor" opacity=".6">${T[L].years[lastM]}</text>`; }
    }
  }
  const dl = T[L].days.map((t, k) => (t ? `<text x="0" y="${Y0 + k * (S + G) + 10}" font-size="10" fill="currentColor" opacity=".6">${t}</text>` : "")).join("");
  const W = X0 + 26 * (S + G), H = Y0 + 7 * (S + G);
  return `<div class="heat"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(T[L].activity)}">${months}${dl}${cells}</svg></div>
    <div class="hl">${esc(T[L].less)} ${COL.map((c) => `<i style="background:${c}"></i>`).join("")} ${esc(T[L].more)}</div>`;
}
/** Coding hours per week, the last 12 weeks. */
function weekly(d: Data) {
  const w = d.act.weeks, max = Math.max(1, ...w), W = 560, H = 150, bw = W / w.length;
  return `<svg viewBox="0 0 ${W} ${H + 22}" role="img">${w.map((h, i) => {
    const bh = Math.max(2, (h / max) * H);
    return `<rect x="${i * bw + 6}" y="${H - bh}" width="${bw - 12}" height="${bh}" rx="6" fill="url(#g)"><title>${h} h</title></rect>${h ? `<text x="${i * bw + bw / 2}" y="${H - bh - 6}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".7">${h}</text>` : ""}`;
  }).join("")}<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acc)"/><stop offset="1" stop-color="var(--acc2)"/></linearGradient></defs></svg>`;
}

export function portfolioHtml(d: Data, g: GuildRow, url: string) {
  const L = (d.L === "en" ? "en" : "fr") as "fr" | "en", X = T[L], pf = d.pf;
  const show = (k: string) => !pf.hide.includes(k as never);
  const gh = d.github;
  // the GitHub photo; their initials when it doesn't load
  const avatar = gh ? `<img class="ava" src="https://avatars.githubusercontent.com/${encodeURIComponent(gh)}?s=520" alt="${esc(d.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ava',textContent:'${esc(initials(d.name))}'}))">` : `<div class="ava" aria-hidden="true">${esc(initials(d.name))}</div>`;
  const projects = show("projects") ? pf.projects : [];
  const training = show("training") ? d.training : [];
  const hours = show("hours") ? d.act.hours : 0;
  const kpis = [
    projects.length + training.length ? [projects.length + training.length, X.kProjects] : null,
    hours ? [Math.round(hours), X.kHours] : null,
    show("activity") && d.act.commits ? [d.act.commits, X.kCommits] : null,
    show("skills") && d.comps.length ? [d.comps.length, X.kComps] : null,
    show("practice") && d.solved.total ? [d.solved.total, X.kSolved] : null,
  ].filter(Boolean).slice(0, 4) as [number, string][];
  const contactHref = pf.email ? `mailto:${pf.email}` : pf.linkedin || (gh ? `https://github.com/${gh}` : "");
  const shot = (p: { repo: string | null; title: string; lang: string | null }, tag = "") => `<div class="shot" style="background:linear-gradient(135deg,${colorOf(p.lang)},var(--acc))"><span class="ph">${esc(initials(p.title))}</span>${p.repo
    ? `<img src="https://opengraph.githubassets.com/1/${esc(p.repo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>`;
  const projCard = (p: (typeof pf.projects)[number], big = false) => `<article class="card${big ? " big" : ""}">${shot(p, big ? `★ ${X.featured}` : "")}<div class="cb">
      <h3>${esc(p.title)}</h3>${p.desc ? `<p>${esc(p.desc)}</p>` : ""}
      ${p.tags.length ? `<div class="chips">${p.tags.map((t) => `<span class="chip"><i style="background:${colorOf(t)}"></i>${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="cf">${p.stars ? `<span title="${esc(X.stars)}">${ICON.star} ${p.stars}</span>` : ""}${p.pushed && big ? `<span>${esc(X.updated)} ${esc(p.pushed)}</span>` : ""}<span class="sp"></span>
        ${p.repo ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${ICON.github} ${X.code}</a>` : `<a href="${esc(p.url)}" target="_blank" rel="noopener">${ICON.arrow} ${X.tryIt}</a>`}
        ${p.demo ? `<a href="${esc(p.demo)}" target="_blank" rel="noopener">${ICON.arrow} ${X.demo}</a>` : ""}</div></div></article>`;
  const featured = projects.find((p) => p.featured), rest = projects.filter((p) => p !== featured);
  const nav = [projects.length || training.length ? ["projects", X.projects] : null, show("skills") || d.act.langs.length ? ["skills", X.skills] : null, show("activity") || hours ? ["activity", X.activity] : null, show("practice") ? ["practice", X.practice] : null].filter(Boolean) as [string, string][];
  const og = `${pf.headline || X.noAbout}${projects.length + training.length ? ` · ${projects.length + training.length} ${X.kProjects}` : ""}${hours ? ` · ${Math.round(hours)} ${X.kHours}` : ""}`;

  return `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(d.name)} · ${esc(pf.headline || X.noAbout)}</title><meta name="description" content="${esc(og)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${esc(d.name)} · ${esc(pf.headline || X.noAbout)}"><meta property="og:description" content="${esc(pf.bio || og).slice(0, 200)}"><meta property="og:url" content="${esc(url)}">
${gh ? `<meta property="og:image" content="https://avatars.githubusercontent.com/${encodeURIComponent(gh)}?s=400">` : ""}<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;550;650;750;800&display=swap" rel="stylesheet">
<style>${CSS}${d.look.theme ? `:root{--acc:${esc(d.look.theme.color)};--acc2:${esc(d.look.theme.to)}}` : ""}${d.look.frame ? `.ava{border-color:${esc(d.look.frame.css)};box-shadow:0 0 0 4px ${esc(d.look.frame.css)},0 24px 60px color-mix(in srgb,${esc(d.look.frame.css)} 45%,transparent)}` : ""}</style></head><body>
<header class="nav"><div class="wrap"><a class="brand" href="#top"><i>${esc(initials(d.name))}</i>${esc(d.name)}</a>
  <nav>${nav.map(([id, l]) => `<a href="#${id}">${esc(l)}</a>`).join("")}</nav>
  ${contactHref ? `<a class="btn pri" href="${esc(contactHref)}"${contactHref.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${ICON.mail} ${X.contact}</a>` : ""}</div></header>
<main id="top">
<section class="hero"><div class="wrap"><div>
  ${pf.open && X.open[pf.open] ? `<div class="otw"><b></b>${esc(X.open[pf.open])}</div>` : ""}
  <h1>${esc(d.name)}${d.look.emoji ? ` <span aria-hidden="true">${esc(d.look.emoji)}</span>` : ""}</h1>
  <p class="headline">${esc(pf.headline || X.noAbout)}</p>
  <div class="meta">${pf.city ? `<span>${ICON.pin} ${esc(pf.city)}</span>` : ""}${d.className ? `<span>🎓 ${esc(d.className)}</span>` : ""}${gh ? `<span>${ICON.github} ${esc(gh)}</span>` : ""}</div>
  ${pf.bio ? `<p class="bio">${esc(pf.bio)}</p>` : ""}${d.look.motto ? `<p class="bio" style="font-style:italic">“${esc(d.look.motto)}”</p>` : ""}
  <div class="links">
    ${gh ? `<a class="btn" href="https://github.com/${esc(gh)}" target="_blank" rel="noopener">${ICON.github} GitHub</a>` : ""}
    ${pf.linkedin ? `<a class="btn" href="${esc(pf.linkedin)}" target="_blank" rel="noopener">${ICON.linkedin} LinkedIn</a>` : ""}
    ${pf.email ? `<a class="btn" href="mailto:${esc(pf.email)}">${ICON.mail} ${esc(pf.email)}</a>` : ""}
    ${pf.website ? `<a class="btn" href="${esc(pf.website)}" target="_blank" rel="noopener">${ICON.globe} ${esc(new URL(pf.website).hostname.replace(/^www\./, ""))}</a>` : ""}
    ${pf.cv ? `<a class="btn" href="${esc(pf.cv)}" target="_blank" rel="noopener">${ICON.file} CV</a>` : ""}
    <button class="btn pdf" onclick="window.print()">${ICON.file} ${X.pdf}</button>
  </div></div>
  <div class="me">${avatar}${kpis.length ? `<div class="kpis">${kpis.map(([n, l]) => `<div class="kpi"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join("")}</div>` : ""}</div>
</div></section>

${projects.length || training.length ? `<section class="s" id="projects"><div class="wrap">
  ${projects.length ? `<div class="sh"><div><div class="eyebrow">${X.projects}</div><h2>${X.projectsSub}</h2></div></div>
    ${featured ? projCard(featured, true) : ""}${rest.length ? `<div class="grid">${rest.map((p) => projCard(p)).join("")}</div>` : ""}` : ""}
  ${training.length ? `<div class="sh" style="${projects.length ? "margin-top:48px" : ""}"><div><div class="eyebrow">${X.training}</div><h2>${X.trainingSub}</h2></div></div>
    <div class="tl">${training.map((b, i) => `<article class="tr"><div class="n">${training.length - i}</div><div>
      <div class="top"><h3>${esc(b.title)}</h3><span class="ok">${ICON.check} ${X.validatedBy}</span></div>
      ${b.summary ? `<p>${esc(b.summary)}</p>` : ""}
      <div class="chips">${b.tags.map((t) => `<span class="chip"><i style="background:${colorOf(t)}"></i>${esc(t)}</span>`).join("")}${b.comps.map((c) => `<span class="chip" title="${esc((d.comps.find((x) => x.code === c) || {}).name || "")}">✓ ${esc(c)}</span>`).join("")}${b.squad ? `<span class="chip">👥 ${esc(X.squad)}</span>` : ""}</div>
      ${b.repo ? `<div class="cf"><span class="sp"></span><a href="https://github.com/${esc(b.repo)}" target="_blank" rel="noopener">${ICON.github} ${X.code}</a></div>` : ""}</div></article>`).join("")}</div>` : ""}
</div></section>` : ""}

${(show("skills") && d.comps.length) || (hours && d.act.langs.length) ? `<section class="s" id="skills"><div class="wrap">
  <div class="sh"><div><div class="eyebrow">${X.skills}</div><h2>${L === "fr" ? "Ce que je sais faire" : "What I can do"}</h2></div></div>
  <div class="two">
    ${hours && d.act.langs.length ? `<div class="panel"><h3>${X.stack}</h3><p class="sub">${X.stackSub}</p>${d.act.langs.map((l) => `<div class="bar"><span>${esc(l.name)}</span><span class="t"><i style="width:${l.pct}%;background:${colorOf(l.name)}"></i></span><span class="v">${l.pct}%</span></div>`).join("")}</div>` : ""}
    ${show("skills") && d.comps.length ? `<div class="panel"><h3>${X.validated}</h3><p class="sub">${X.validatedSub}</p>${d.comps.map((c) => `<div class="comp"><b>${esc(c.code)}</b><span>${esc(c.name)}${c.level > 1 ? `<em>${L === "fr" ? "niveau" : "level"} ${c.level}</em>` : ""}</span></div>`).join("")}</div>` : ""}
  </div></div></section>` : ""}

${(show("activity") && (d.act.commits || d.act.activeDays)) || hours ? `<section class="s" id="activity"><div class="wrap">
  <div class="sh"><div><div class="eyebrow">${X.activity}</div><h2>${X.activitySub}</h2></div></div>
  <div class="stats">
    ${show("activity") ? `<div class="stat"><b>${d.act.commits182}</b><span>${X.commits6}</span></div><div class="stat"><b>${d.act.activeDays}</b><span>${X.activeDays}</span></div><div class="stat"><b>🔥 ${d.act.streak}</b><span>${X.streak}</span></div>` : ""}
    ${hours ? `<div class="stat"><b>${d.act.last30}</b><span>${X.last30}</span></div>` : ""}
  </div>
  <div class="two">
    <div class="panel"><h3>${L === "fr" ? "Les 6 derniers mois" : "The last 6 months"}</h3><p class="sub">${L === "fr" ? "Commits GitHub et temps de code, jour par jour" : "GitHub commits and coding time, day by day"}</p>${heatmap(d, L)}</div>
    ${hours ? `<div class="panel wk"><h3>${X.weekly}</h3><p class="sub">${L === "fr" ? "Les 12 dernières semaines (VS Code)" : "The last 12 weeks (VS Code)"}</p>${weekly(d)}</div>` : ""}
  </div></div></section>` : ""}

${show("practice") && (d.solved.total || (show("badges") && d.badges.length)) ? `<section class="s" id="practice"><div class="wrap">
  <div class="sh"><div><div class="eyebrow">${X.practice}</div><h2>${L === "fr" ? "Toujours en train d'apprendre" : "Always learning"}</h2></div></div>
  <div class="mini">
    <div class="stat"><b>${d.solved.total}</b><span>${X.solved}${[["🟢", d.solved.easy], ["🟡", d.solved.medium], ["🔴", d.solved.hard]].filter(([, n]) => n).map(([e, n]) => ` · ${e} ${n}`).join("")}</span></div>
    ${d.accuracy != null && d.accuracy >= 60 ? `<div class="stat"><b>${d.accuracy}%</b><span>${X.accuracy}</span></div>` : ""}
    <div class="stat"><b>${d.level}</b><span>${X.level} · ${esc(d.levelTitle)}</span></div>
    ${d.contests.played ? `<div class="stat"><b>${d.contests.played}</b><span>${X.contests}${d.contests.podiums ? ` · 🏅 ${d.contests.podiums}` : ""}</span></div>` : ""}
    ${d.duels.w ? `<div class="stat"><b>${d.rating}</b><span>${X.rating}</span></div>` : ""}
  </div>
  ${show("badges") && d.badges.length ? `<div class="panel"><h3>${X.badges}</h3><p class="sub"></p><div class="badges">${d.badges.map((b, i) => `<span class="badge${i < d.showcased ? " star" : ""}">${esc(b)}</span>`).join("")}</div></div>` : ""}
  ${d.hr ? `<p style="margin-top:16px"><a class="btn" href="https://www.hackerrank.com/profile/${encodeURIComponent(d.hr)}" target="_blank" rel="noopener">${ICON.arrow} ${X.hr}</a></p>` : ""}
</div></section>` : ""}

${contactHref ? `<section class="s"><div class="wrap"><div class="cta"><div><h2>${L === "fr" ? "Travaillons ensemble" : "Let's work together"}</h2><p>${esc(pf.open && X.open[pf.open] ? X.open[pf.open] : L === "fr" ? "Une question, un projet ? Écrivez-moi." : "A question, a project? Write to me.")}</p></div>
  <a class="btn" href="${esc(contactHref)}"${contactHref.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${ICON.mail} ${X.contact}</a></div></div></section>` : ""}
</main>
<footer><div class="wrap">${esc(X.footer)}${g.name ? ` · ${esc(g.name)}` : ""}</div></footer>
</body></html>`;
}
