// Slash command definitions. The bot keeps Discord in sync by itself: when this
// list changes, the next cron run re-registers the commands on every server.
// `npm run register` does the same by hand.
const STRING = 3, INTEGER = 4, BOOLEAN = 5, USER = 6, CHANNEL = 7, SUB = 1;
const fr = (s: string) => ({ fr: s });
const diff = (required = true) => ({
  type: STRING, name: "difficulty", description: "How hard?", description_localizations: fr("Quelle difficulté ?"), required,
  choices: [
    { name: "Easy", name_localizations: fr("Facile"), value: "easy" },
    { name: "Medium", name_localizations: fr("Moyen"), value: "medium" },
    { name: "Hard", name_localizations: fr("Difficile"), value: "hard" },
  ],
});

export const COMMANDS: any[] = [
  {
    name: "link", description: "Link your HackerRank username", description_localizations: fr("Relier ton nom d'utilisateur HackerRank"),
    options: [{ type: STRING, name: "username", description: "Your HackerRank username", description_localizations: fr("Ton nom d'utilisateur HackerRank"), required: true, max_length: 40 }],
  },
  {
    name: "practice", description: "Get a challenge at your level", description_localizations: fr("Obtenir un défi à ton niveau"),
    options: [
      diff(true),
      {
        type: STRING, name: "type", description: "Kind of challenge", description_localizations: fr("Type de défi"),
        choices: [
          { name: "Write code (judged by tests)", name_localizations: fr("Écrire du code (jugé par des tests)"), value: "write" },
          { name: "Quick (any, in Discord)", name_localizations: fr("Rapide (au hasard, dans Discord)"), value: "quick" },
          { name: "Predict the output", name_localizations: fr("Deviner la sortie"), value: "output" },
          { name: "Find the bug", name_localizations: fr("Trouver le bug"), value: "bug" },
          { name: "Multiple choice", name_localizations: fr("QCM"), value: "mcq" },
          { name: "Complexity", name_localizations: fr("Complexité"), value: "complexity" },
          { name: "HackerRank problem (verified)", name_localizations: fr("Problème HackerRank (vérifié)"), value: "coding" },
        ],
      },
      { type: STRING, name: "topic", description: "Optional topic, e.g. recursion, strings", description_localizations: fr("Thème facultatif, ex. récursivité, chaînes"), max_length: 60 },
      {
        type: STRING, name: "language", description: "Programming language (remembered)", description_localizations: fr("Langage de programmation (mémorisé)"),
        choices: [
          { name: "JavaScript", value: "javascript" }, { name: "PHP", value: "php" }, { name: "Python", value: "python" },
          { name: "Java", value: "java" }, { name: "C", value: "c" }, { name: "C++", value: "cpp" },
        ],
      },
    ],
  },
  {
    name: "duel", description: "Challenge a classmate: first to solve wins", description_localizations: fr("Défier un·e camarade : le premier qui résout gagne"),
    options: [
      { type: USER, name: "opponent", description: "Who do you challenge?", description_localizations: fr("Qui défies-tu ?"), required: true },
      {
        type: STRING, name: "mode", description: "Quick question, write code, or a HackerRank problem", description_localizations: fr("Question rapide, écrire du code, ou problème HackerRank"),
        choices: [
          { name: "Quick question", name_localizations: fr("Question rapide"), value: "quick" },
          { name: "Write code", name_localizations: fr("Écrire du code"), value: "write" },
          { name: "HackerRank problem", name_localizations: fr("Problème HackerRank"), value: "coding" },
        ],
      },
      diff(false),
      { type: INTEGER, name: "stake", description: "Coins each player bets (optional)", description_localizations: fr("Pièces misées par chaque joueur (facultatif)"), min_value: 0, max_value: 1000 },
    ],
  },
  { name: "daily", description: "Today's daily challenge", description_localizations: fr("Le défi du jour") },
  { name: "assignments", description: "Challenges your teacher gave you", description_localizations: fr("Les défis donnés par ton enseignant") },
  {
    name: "profile", description: "Level, badges and stats", description_localizations: fr("Niveau, badges et statistiques"),
    options: [{ type: USER, name: "member", description: "Whose profile (default: yours)", description_localizations: fr("Le profil de qui (par défaut : le tien)") }],
  },
  {
    name: "leaderboard", description: "Rankings", description_localizations: fr("Classements"),
    options: [{
      type: STRING, name: "board", description: "Which ranking", description_localizations: fr("Quel classement"),
      choices: [
        { name: "Season", name_localizations: fr("Saison"), value: "season" },
        { name: "All-time / levels", name_localizations: fr("Général / niveaux"), value: "level" },
        { name: "Duel ratings", name_localizations: fr("Duels"), value: "duels" },
        { name: "Coins", name_localizations: fr("Pièces"), value: "coins" },
        { name: "Teams", name_localizations: fr("Équipes"), value: "teams" },
      ],
    }],
  },
  {
    name: "rival", description: "Rivals: get pinged when they pass you", description_localizations: fr("Rivaux : sois prévenu quand ils te dépassent"),
    options: [
      { type: SUB, name: "add", description: "Declare a rival", description_localizations: fr("Désigner un rival"), options: [{ type: USER, name: "member", description: "Your rival", description_localizations: fr("Ton rival"), required: true }] },
      { type: SUB, name: "remove", description: "Remove a rival", description_localizations: fr("Retirer un rival"), options: [{ type: USER, name: "member", description: "The rival", description_localizations: fr("Le rival"), required: true }] },
      { type: SUB, name: "list", description: "Rivals and head-to-head records", description_localizations: fr("Rivaux et face-à-face"), options: [{ type: USER, name: "member", description: "Whose rivals", description_localizations: fr("Les rivaux de qui") }] },
    ],
  },
  {
    name: "bet", description: "Predict contest winners with coins", description_localizations: fr("Parier des pièces sur les gagnants"),
    options: [
      {
        type: SUB, name: "place", description: "Bet on who wins the contest", description_localizations: fr("Parier sur le gagnant du concours"),
        options: [
          { type: STRING, name: "player", description: "HackerRank username", description_localizations: fr("Nom d'utilisateur HackerRank"), required: true, autocomplete: true },
          { type: INTEGER, name: "amount", description: "Coins to stake", description_localizations: fr("Pièces à miser"), required: true, min_value: 1, max_value: 100000 },
        ],
      },
      { type: SUB, name: "coins", description: "Coin leaderboard", description_localizations: fr("Classement des pièces") },
    ],
  },
  {
    name: "contest", description: "Contest info", description_localizations: fr("Infos sur les concours"),
    options: [
      { type: SUB, name: "standings", description: "Live standings", description_localizations: fr("Classement en direct"), options: [{ type: STRING, name: "contest", description: "Contest (if several)", description_localizations: fr("Concours (s'il y en a plusieurs)"), autocomplete: true }] },
      { type: SUB, name: "list", description: "Tracked contests", description_localizations: fr("Concours suivis") },
    ],
  },
  {
    name: "help", description: "Everything the bot can do", description_localizations: fr("Tout ce que le bot sait faire"),
    options: [{
      type: STRING, name: "topic", description: "Jump to a topic", description_localizations: fr("Aller à un sujet"),
      choices: [
        { name: "Getting started", name_localizations: fr("Pour commencer"), value: "start" },
        { name: "Challenges", name_localizations: fr("Défis"), value: "challenges" },
        { name: "Write code", name_localizations: fr("Écrire du code"), value: "write" },
        { name: "Points", name_localizations: fr("Points"), value: "points" },
        { name: "Duels", name_localizations: fr("Duels"), value: "duels" },
        { name: "Daily & assignments", name_localizations: fr("Défi du jour & devoirs"), value: "daily" },
        { name: "HackerRank contests", name_localizations: fr("Concours HackerRank"), value: "contests" },
        { name: "Profile, rivals, teams", name_localizations: fr("Profil, rivaux, équipes"), value: "social" },
        { name: "Teacher tools", name_localizations: fr("Outils enseignant"), value: "teacher" },
      ],
    }],
  },
  {
    name: "teacher", description: "Teacher tools", description_localizations: fr("Outils enseignant"),
    default_member_permissions: String(1 << 5), // Manage Server
    dm_permission: false,
    options: [
      {
        type: SUB, name: "setup", description: "Language, daily hour and the #arena channel for all bot posts", description_localizations: fr("Langue, heure du défi et salon #arena pour les annonces"),
        options: [
          { type: CHANNEL, name: "arena", description: "Channel for all public posts (default: #arena)", description_localizations: fr("Salon des annonces (par défaut : #arena)"), channel_types: [0, 5] },
          { type: STRING, name: "language", description: "Bot language", description_localizations: fr("Langue du bot"), choices: [{ name: "English", value: "en" }, { name: "Français", value: "fr" }] },
          { type: INTEGER, name: "daily_hour", description: "Hour (UTC) for the daily challenge", description_localizations: fr("Heure (UTC) du défi du jour"), min_value: 0, max_value: 23 },
          {
            type: STRING, name: "code_language", description: "Programming language(s) your class learns", description_localizations: fr("Langage(s) de programmation de la classe"),
            choices: [
              { name: "JavaScript + PHP", value: "javascript,php" },
              { name: "JavaScript", value: "javascript" },
              { name: "PHP", value: "php" },
              { name: "Python", value: "python" },
              { name: "Java", value: "java" },
              { name: "C", value: "c" },
              { name: "C++", value: "cpp" },
              { name: "Python + JavaScript", value: "python,javascript" },
            ],
          },
        ],
      },
      {
        type: SUB, name: "track", description: "Follow a HackerRank contest", description_localizations: fr("Suivre un concours HackerRank"),
        options: [
          { type: STRING, name: "link", description: "Contest URL", description_localizations: fr("Lien du concours"), required: true },
          { type: CHANNEL, name: "channel", description: "Where to post (default: #arena)", description_localizations: fr("Où publier (par défaut : #arena)"), channel_types: [0, 5] },
          { type: INTEGER, name: "every_minutes", description: "Check every N minutes (default 5)", description_localizations: fr("Vérifier toutes les N minutes (5 par défaut)"), min_value: 2, max_value: 120 },
          { type: INTEGER, name: "freeze_minutes", description: "Hide the last N minutes (default 15, 0 = off)", description_localizations: fr("Cacher les N dernières minutes (15 par défaut, 0 = non)"), min_value: 0, max_value: 180 },
        ],
      },
      {
        type: SUB, name: "stop", description: "Stop a contest", description_localizations: fr("Arrêter un concours"),
        options: [
          { type: STRING, name: "contest", description: "Contest (if several)", description_localizations: fr("Concours (s'il y en a plusieurs)"), autocomplete: true },
          { type: BOOLEAN, name: "announce", description: "Reveal results now (default yes)", description_localizations: fr("Révéler les résultats maintenant (oui par défaut)") },
        ],
      },
      {
        type: SUB, name: "season", description: "Start a new season", description_localizations: fr("Commencer une nouvelle saison"),
        options: [{ type: STRING, name: "name", description: "Season name", description_localizations: fr("Nom de la saison"), required: true, max_length: 60 }],
      },
      { type: SUB, name: "dashboard", description: "Link to the teacher dashboard", description_localizations: fr("Lien vers le tableau de bord") },
      {
        type: SUB, name: "verify", description: "Confirm a student's HackerRank link yourself", description_localizations: fr("Confirmer toi-même le lien HackerRank d'un élève"),
        options: [{ type: USER, name: "member", description: "The student", description_localizations: fr("L'élève"), required: true }],
      },
    ],
  },
];

/** A short fingerprint of the command list: when it changes, the bot re-registers. */
export function commandsVersion(): string {
  const s = JSON.stringify(COMMANDS);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36) + "-" + s.length;
}
