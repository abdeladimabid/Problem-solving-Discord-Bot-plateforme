// Registers the bot's slash commands with Discord. Run once after setup,
// and again whenever you change commands:
//
//   DISCORD_APP_ID=... DISCORD_TOKEN=... [GUILD_ID=...] node scripts/register-commands.mjs
//
// With GUILD_ID the commands appear instantly on that server only.
// Without it they are global (can take a few minutes to show up).

const { DISCORD_APP_ID, DISCORD_TOKEN, GUILD_ID } = process.env;
if (!DISCORD_APP_ID || !DISCORD_TOKEN) {
  console.error("Set DISCORD_APP_ID and DISCORD_TOKEN (see README, step 4).");
  process.exit(1);
}

const { COMMANDS: commands } = await import("../src/shared/commands.ts");

const API = process.env.CLASSBOT_DISCORD_API || "https://discord.com/api/v10";
const url = GUILD_ID
  ? `${API}/applications/${DISCORD_APP_ID}/guilds/${GUILD_ID}/commands`
  : `${API}/applications/${DISCORD_APP_ID}/commands`;
const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${DISCORD_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
if (!res.ok) {
  console.error("❌ Discord refused the commands:", res.status, await res.text());
  process.exit(1);
}
console.log(`✅ Registered ${commands.length} commands ${GUILD_ID ? `on server ${GUILD_ID}` : "globally"}.`);
