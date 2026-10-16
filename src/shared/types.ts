// Minimal interfaces for the Cloudflare bindings we use (kept local so the
// code has no hard dependency on @cloudflare/workers-types).

export interface D1Result<T = unknown> {
  results: T[];
  meta: { last_row_id?: number; changes?: number };
}
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1 {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<D1Result[]>;
}
export interface AIBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
export interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

export interface Env {
  DB: D1;
  AI: AIBinding;
  ASSETS?: { fetch(req: Request): Promise<Response> };
  DISCORD_APP_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_TOKEN: string;
  PUBLIC_URL?: string;      // bot Worker URL (for the public race replay)
  DASHBOARD_URL?: string;   // admin Worker URL
  AI_MODEL?: string;
  AI_DAILY_LIMIT?: string;
  TEAM_DOMAIN?: string;     // https://<team>.cloudflareaccess.com
  POLICY_AUD?: string;      // Access application AUD tag
  ADMIN_PASSWORD?: string;  // dashboard password (secret), alternative to Access
  DEV_NO_AUTH?: string;     // "true" only for local development
  RUNNER_URL?: string;      // code runner (default https://godbolt.org)
  WANDBOX_URL?: string;     // multi-language runner (default https://wandbox.org)
  LLM_BASE_URL?: string;    // optional OpenAI-compatible AI (Ollama via a tunnel, Groq, OpenRouter…)
  LLM_MODEL?: string;
  LLM_API_KEY?: string;
  GROQ_API_KEY?: string;    // optional Groq key (secret): long documents (briefs, reviews, assessments) go there first
  GROQ_MODEL?: string;      // default openai/gpt-oss-120b
  // GitHub App of the class (students link their account with /github; the App sends their activity)
  GITHUB_APP_ID?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_PRIVATE_KEY?: string;
  WATCHER_KV?: any;         // optional: the old GitHub Watcher's KV namespace, for the one-time import
  INTRANET_URL?: string;     // optional: the YouCode intranet (signed server-to-server requests, see shared/intranet.ts)
  INTRANET_KEY_ID?: string;
  INTRANET_SECRET?: string;  // secret: never in the database or the browser
}

export type Lang = "en" | "fr";
export type Difficulty = "easy" | "medium" | "hard";
export type Kind = "code" | "write" | "mcq" | "output" | "bug" | "complexity" | "sql" | "regex";

export interface GuildRow {
  id: string;
  name: string | null;
  lang: Lang;
  season: string;
  code_lang: string;
  announce_channel: string | null;
  daily_channel: string | null;
  daily_hour: number;
  champion_role: string | null;
  auto_roles?: string | null;
  track?: string | null;
  notify?: string | null;    // JSON: which teacher DMs are on
  shop?: string | null;      // JSON: shop prices, items on/off, own rewards
  program?: string | null;   // programme the class follows ("builtin:dwwm-2026" or "db:<id>")
  github?: string | null;    // JSON: GitHub settings (activity channel/forum, reports, hidden repos…)
  streak_role: string | null;
  champion_holders: string;
  streak_holders: string;
  trust_claims: number;
  last_daily: string | null;
  last_digest: string | null;
  arena_channel: string | null;
  scoring: string | null;
  commands_version?: string | null;
  daily_cfg?: string | null;
  integrity?: string | null;
  path_cfg?: string | null;
  teacher_id?: string | null;
  last_teacher_digest?: string | null;
  last_plan_dm?: string | null;
  created_at: number;
}

export interface PlayerRow {
  guild_id: string;
  discord_id: string;
  name: string | null;
  hr_username: string | null;
  hr_display: string | null;
  coins: number;
  rating: number;
  daily_streak: number;
  last_daily_day: string | null;
  last_active: number | null;
  code_lang: string;
  hr_verified: number;
  hr_code: string | null;
  created_at: number;
  plan_streak?: number;
  plan_best?: number;
  last_plan_day?: string | null;
  plan_dm?: number;
  path_done?: string | null;
  hint_tokens?: number;
  streak_freezes?: number;
  title?: string | null;
  title_until?: number | null;
  color_role?: string | null;
  color_until?: number | null;
  cosmetics?: string | null;
  boosts?: string | null;
  github_id?: string | null;
  github_login?: string | null;
  gh_inst?: string | null;
  gh_linked_at?: number | null;
  gh_thread?: string | null;
}

export interface ChallengeRow {
  id: number;
  guild_id: string | null;
  source: string;
  kind: Kind;
  difficulty: Difficulty;
  lang: string;
  code_lang: string | null;
  title: string;
  question: string | null;
  code: string | null;
  choices: string | null;
  answer: string | null;
  alternatives: string | null;
  hint: string | null;
  explanation: string | null;
  topic: string | null;
  hr_slug: string | null;
  url: string | null;
  status: string;
  created_by: string | null;
  created_at: number;
  test_set: string | null;
  time_limit: number | null;
  solution: string | null;
  signature?: string | null;
  skills?: string | null;
  hints?: string | null;
  solutions?: string | null;
}

export interface AttemptRow {
  id: number;
  guild_id: string;
  discord_id: string;
  challenge_id: number;
  origin: "practice" | "daily" | "assignment" | "duel" | "session" | "plan" | "path" | "exam" | "bounty" | "boss" | "interview";
  ref: number | null;
  status: "pending" | "solved" | "claimed" | "failed" | "expired";
  tries: number;
  used_hint: number;
  answer_given: string | null;
  verified: number;
  points: number;
  started_at: number;
  finished_at: number | null;
  lang: string | null;
  result: string | null;
  feedback: string | null;
  integrity?: string | null;
  fp?: string | null;
  held?: number;
  explain?: string | null;
  runs?: number;
  reviewed?: number;
  free_hints?: number;
}

export interface DuelRow {
  id: number;
  guild_id: string;
  channel_id: string;
  challenger_id: string;
  opponent_id: string;
  mode: "quick" | "coding";
  difficulty: Difficulty;
  stake: number;
  challenge_id: number | null;
  status: "pending" | "active" | "finished" | "declined" | "expired";
  winner_id: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  partner_id?: string | null;
  opponent2_id?: string | null;
  accepted?: string | null;
}

export interface ContestRow {
  id: number;
  guild_id: string;
  slug: string;
  name: string;
  channel_id: string;
  start_at: number | null;
  end_at: number | null;
  interval_min: number;
  freeze_min: number;
  status: string;
  season: string;
  next_poll: number;
  bets_close: number | null;
  state: string;
  snaps: string;
  errors: number;
  created_at: number;
  finished_at: number | null;
}

export interface Entry {
  username: string;
  rank: number;
  score: number;
  time_taken: number | null;
}
