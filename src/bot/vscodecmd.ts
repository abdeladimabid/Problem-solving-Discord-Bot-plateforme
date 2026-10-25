// 🧑‍💻 /vscode: a learner connects VS Code (the WakaTime extension) to ClassBot, after reading what is recorded.
//   setup   the consent text (the class's, or the default) → « J'accepte » → their personal key and the steps by DM
//   status  connected or not, the last heartbeat, today and this week · pause / resume · newkey · delete
import { type Ix, deferReply, deferUpdate, later, reply, say, update } from "./ix.ts";
import { t } from "../shared/i18n.ts";
import { COLORS, btn, dm, row, ts } from "../shared/discord.ts";
import { acceptConsent, deleteLearner, learnerStatus, renewKey, setPaused } from "../shared/vscodedb.ts";
import { type VscSettings, apiUrlOf, cfgBlock, durText, psLine, shLine, vscSettings } from "../shared/vscode.ts";

export const consentText = (L: string, st: VscSettings) => (st.consent || t(L, "vsc.consent_default")).replace(/\{retention\}/g, String(st.retention));

function consentPayload(ix: Ix, st: VscSettings) {
  const L = ix.L;
  return {
    content: "",
    embeds: [{ title: t(L, "vsc.consent_title"), description: `${consentText(L, st)}\n\n${t(L, "vsc.consent_foot")}`.slice(0, 4000), color: COLORS.blue }],
    components: [row(btn(t(L, "vsc.agree"), "vsc:ok", 3, "✅"), btn(t(L, "vsc.cancel"), "vsc:no", 2))],
  };
}

/** The setup message: the key, ~/.wakatime.cfg, the PowerShell and bash lines, the privacy options. */
export function setupEmbeds(L: string, publicUrl: string, key: string) {
  const api = apiUrlOf(publicUrl);
  return [
    { title: t(L, "vsc.setup_title"), description: t(L, "vsc.setup_steps", { key, cfg: cfgBlock(api, key) }), color: COLORS.green },
    { title: t(L, "vsc.cmd_title"), description: `${t(L, "vsc.cmd_win")}\n\`\`\`powershell\n${psLine(api, key)}\n\`\`\`\n${t(L, "vsc.cmd_mac")}\n\`\`\`bash\n${shLine(api, key)}\n\`\`\``, color: COLORS.green },
    { description: t(L, "vsc.setup_privacy"), color: COLORS.gray },
  ];
}

/** The key by DM; when DMs are closed, in the (private) answer itself. */
function deliver(ix: Ix, key: () => Promise<string | null>, sent: string, noDm: string) {
  later(ix, async () => {
    const k = await key();
    if (!k) return { content: t(ix.L, "vsc.not_setup"), embeds: [], components: [] };
    const url = ix.env.PUBLIC_URL;
    if (!url) return { content: t(ix.L, "vsc.no_url"), embeds: [], components: [] };
    const embeds = setupEmbeds(ix.L, url, k);
    if (await dm(ix.env, ix.userId, { embeds })) return { content: t(ix.L, sent), embeds: [], components: [] };
    return { content: t(ix.L, noDm), embeds, components: [] };
  });
}

export async function cmdVscode(ix: Ix, sub: string) {
  const L = ix.L, st = vscSettings(ix.guild.vscode), g = ix.guild.id;
  if (!st.enabled && !["status", "delete", "pause"].includes(sub)) return say(t(L, "vsc.off"));
  switch (sub) {
    case "setup": return reply(consentPayload(ix, st), true);
    case "pause": case "resume":
      return say(t(L, (await setPaused(ix.env, g, ix.userId, sub === "pause")) ? (sub === "pause" ? "vsc.paused" : "vsc.resumed") : "vsc.not_setup"));
    case "newkey":
      deliver(ix, () => renewKey(ix.env, g, ix.userId), "vsc.newkey_sent", "vsc.newkey_no_dm");
      return deferReply(true);
    case "delete":
      return reply({ content: t(L, "vsc.delete_ask"), components: [row(btn(t(L, "vsc.delete_yes"), "vsc:del", 4, "🗑️"), btn(t(L, "vsc.cancel"), "vsc:no", 2))] }, true);
    default: {
      const s = await learnerStatus(ix.env, g, ix.userId), l = s.learner;
      const lines: string[] = [];
      if (!st.enabled) lines.push(t(L, "vsc.off"));
      if (!l?.consent_at) lines.push(t(L, "vsc.st_none"));
      else {
        lines.push(l.paused ? t(L, "vsc.st_paused") : !l.first_seen ? t(L, "vsc.st_waiting") : t(L, "vsc.st_ok", { last: s.last ? ts(s.last) : "—" }));
        lines.push(t(L, "vsc.st_times", { ta: durText(s.today.active, L), tw: durText(s.today.write, L), wa: durText(s.week.active, L), ww: durText(s.week.write, L) }));
        if ((l.consent_v ?? 0) < st.consent_v) lines.push(t(L, "vsc.st_consent_old"));
        if (l.key_hint) lines.push(t(L, "vsc.st_key", { hint: l.key_hint }));
      }
      const again = st.enabled && (!l?.consent_at || (l.consent_v ?? 0) < st.consent_v);
      return reply({ embeds: [{ title: t(L, "vsc.status_title"), description: lines.join("\n\n"), color: l?.first_seen && !l.paused ? COLORS.green : COLORS.gray }], components: again ? [row(btn("/vscode setup", "vsc:setup", 1, "🧑‍💻"))] : [] }, true);
    }
  }
}

/** The buttons of /vscode: vsc:ok (I agree), vsc:no (cancel), vsc:del (delete everything), vsc:setup (read the text again). */
export async function vscButton(ix: Ix, x: string) {
  const L = ix.L, st = vscSettings(ix.guild.vscode), g = ix.guild.id;
  if (x === "no") return update({ content: t(L, "vsc.cancelled"), embeds: [], components: [] });
  if (x === "del") return update({ content: t(L, "vsc.deleted", { n: await deleteLearner(ix.env, g, ix.userId) }), embeds: [], components: [] });
  if (!st.enabled) return update({ content: t(L, "vsc.off"), embeds: [], components: [] });
  if (x === "setup") return update(consentPayload(ix, st));
  if (x === "ok") {
    deliver(ix, () => acceptConsent(ix.env, g, ix.userId, st.consent_v), "vsc.sent_dm", "vsc.no_dm");
    return deferUpdate();
  }
  return say(t(L, "err.unknown"));
}
