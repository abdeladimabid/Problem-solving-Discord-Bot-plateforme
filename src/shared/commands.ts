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
      { ...diff(false), description: "How hard? (empty = the bot picks a level that suits you)", description_localizations: fr("Quelle difficulté ? (vide = le bot choisit un niveau adapté)") },
      {
        type: STRING, name: "type", description: "Kind of challenge", description_localizations: fr("Type de défi"),
        choices: [
          { name: "🎯 Picked for me (what I need next)", name_localizations: fr("🎯 Choisi pour moi (ce dont j'ai besoin)"), value: "forme" },
          { name: "Write code (judged by tests)", name_localizations: fr("Écrire du code (jugé par des tests)"), value: "write" },
          { name: "Quick (any, in Discord)", name_localizations: fr("Rapide (au hasard, dans Discord)"), value: "quick" },
          { name: "Predict the output", name_localizations: fr("Deviner la sortie"), value: "output" },
          { name: "Find the bug", name_localizations: fr("Trouver le bug"), value: "bug" },
          { name: "Multiple choice", name_localizations: fr("QCM"), value: "mcq" },
          { name: "Complexity", name_localizations: fr("Complexité"), value: "complexity" },
          { name: "SQL query", name_localizations: fr("Requête SQL"), value: "sql" },
          { name: "Regular expression", name_localizations: fr("Expression régulière"), value: "regex" },
          { name: "Git question", name_localizations: fr("Question Git"), value: "git" },
          { name: "HackerRank problem (verified)", name_localizations: fr("Problème HackerRank (vérifié)"), value: "coding" },
          { name: "📋 My challenges to verify (lost message)", name_localizations: fr("📋 Mes défis à vérifier (message perdu)"), value: "pending" },
        ],
      },
      { type: STRING, name: "topic", description: "Optional topic, e.g. recursion, strings", description_localizations: fr("Thème facultatif, ex. récursivité, chaînes"), max_length: 60 },
      {
        type: STRING, name: "language", description: "Programming language (remembered)", description_localizations: fr("Langage de programmation (mémorisé)"),
        choices: [
          { name: "JavaScript", value: "javascript" }, { name: "PHP", value: "php" }, { name: "Python", value: "python" },
          { name: "Java", value: "java" }, { name: "C", value: "c" }, { name: "C++", value: "cpp" },
          { name: "SQL (database queries)", name_localizations: fr("SQL (requêtes base de données)"), value: "sql" },
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
      { type: USER, name: "partner", description: "2 vs 2: your teammate", description_localizations: fr("2 contre 2 : ton coéquipier") },
      { type: USER, name: "opponent2", description: "2 vs 2: the second opponent", description_localizations: fr("2 contre 2 : le second adversaire") },
    ],
  },
  {
    name: "skills", description: "Your skill map and what trips you up", description_localizations: fr("Ta carte de compétences et tes erreurs fréquentes"),
    options: [{ type: USER, name: "member", description: "Teachers: see a student's map", description_localizations: fr("Enseignants : voir la carte d'un élève") }],
  },
  {
    name: "today", description: "Your plan for today: 3 challenges picked for you", description_localizations: fr("Ton plan du jour : 3 défis choisis pour toi"),
    options: [{ type: BOOLEAN, name: "remind", description: "Send me my plan every morning", description_localizations: fr("M'envoyer mon plan chaque matin") }],
  },
  {
    name: "create", description: "Write your own challenge for the class (your teacher approves it)", description_localizations: fr("Écris ton propre défi pour la classe (ton enseignant le valide)"),
    options: [
      {
        type: STRING, name: "type", description: "What kind of challenge", description_localizations: fr("Quel type de défi"), required: true,
        choices: [
          { name: "Write code (with tests)", name_localizations: fr("Écrire du code (avec des tests)"), value: "write" },
          { name: "Multiple choice", name_localizations: fr("QCM"), value: "mcq" },
        ],
      },
      diff(true),
    ],
  },
  { name: "shop", description: "Spend your coins: streak freeze, hint tokens, a title, a color", description_localizations: fr("Dépense tes pièces : gel de série, jetons d'indice, un titre, une couleur") },
  { name: "path", description: "Your step-by-step path, with lessons", description_localizations: fr("Ton parcours étape par étape, avec des leçons") },
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
    name: "help-me", description: "Raise your hand: ask your teacher for help (live queue)", description_localizations: fr("Lever la main : demander de l'aide à ton enseignant (file d'attente)"),
  },
  {
    name: "ask", description: "Ask a question: the class FAQ first, else your teacher answers", description_localizations: fr("Poser une question : la FAQ d'abord, sinon ton enseignant répond"),
    options: [{ type: STRING, name: "question", description: "Your question", description_localizations: fr("Ta question"), required: true, min_length: 8, max_length: 600 }],
  },
  {
    name: "faq", description: "Questions your teacher already answered", description_localizations: fr("Les questions auxquelles ton enseignant a déjà répondu"),
    options: [{ type: STRING, name: "search", description: "Words to look for", description_localizations: fr("Mots à chercher"), max_length: 100 }],
  },
  {
    name: "interview", description: "Mock coding interview: solve a problem and explain it to an interviewer", description_localizations: fr("Entretien technique blanc : résous un problème et explique-le"),
    options: [diff(false)],
  },
  { name: "github", description: "Connect your GitHub: your briefs and your work count in your record", description_localizations: fr("Connecter ton GitHub : tes briefs et ton travail comptent dans ton suivi") },
  {
    name: "vscode", description: "Your coding time in VS Code, with your consent (WakaTime extension)", description_localizations: fr("Ton temps de code dans VS Code, avec ton accord (extension WakaTime)"),
    options: [
      { type: SUB, name: "setup", description: "What is recorded, then your personal key and the setup", description_localizations: fr("Ce qui est enregistré, puis ta clé personnelle et la configuration") },
      { type: SUB, name: "status", description: "Connected? Your time today and this week", description_localizations: fr("Connecté ? Ton temps aujourd'hui et cette semaine") },
      { type: SUB, name: "newkey", description: "A new key (the old one stops working)", description_localizations: fr("Une nouvelle clé (l'ancienne ne marche plus)") },
    ],
  },
  {
    name: "brief", description: "Your project briefs: dates, hand-in, your debrief", description_localizations: fr("Tes briefs : dates, rendu, ton débriefing"),
    options: [
      { type: SUB, name: "list", description: "Your briefs and your results", description_localizations: fr("Tes briefs et tes résultats") },
      {
        type: SUB, name: "submit", description: "Hand in your GitHub repo for a brief", description_localizations: fr("Rendre ton dépôt GitHub pour un brief"),
        options: [
          { type: STRING, name: "repo", description: "github.com/you/your-repo", description_localizations: fr("github.com/toi/ton-depot"), required: true, max_length: 200 },
          { type: STRING, name: "plan", description: "Your planning board (Trello, Jira, GitHub Project)", description_localizations: fr("Ton tableau de planification (Trello, Jira, GitHub Project)"), max_length: 300 },
          { type: STRING, name: "brief", description: "Which brief (if several)", description_localizations: fr("Quel brief (s'il y en a plusieurs)"), autocomplete: true },
        ],
      },
    ],
  },
  {
    name: "activity", description: "Veilles and live codings: pick one to present", description_localizations: fr("Veilles et live codings : choisis-en une à présenter"),
    options: [
      { type: SUB, name: "list", description: "The activities still free", description_localizations: fr("Les activités encore libres") },
      {
        type: SUB, name: "choose", description: "Ask for an activity (your teacher approves it)", description_localizations: fr("Demander une activité (ton formateur l'approuve)"),
        options: [
          { type: STRING, name: "activity", description: "Which activity", description_localizations: fr("Quelle activité"), required: true, autocomplete: true },
          { type: USER, name: "partner", description: "Your binôme (required for a veille)", description_localizations: fr("Ton binôme (obligatoire pour une veille)") },
          { type: USER, name: "partner2", description: "A third person, if your teacher allows it", description_localizations: fr("Une troisième personne, si ton formateur l'accepte") },
        ],
      },
      { type: SUB, name: "mine", description: "Your activities and their subject", description_localizations: fr("Tes activités et leur sujet") },
    ],
  },
  { name: "play", description: "Join the class game on the TV (your own link)", description_localizations: fr("Rejoindre le jeu de classe sur la TV (ton lien personnel)") },
  { name: "league", description: "Class vs class: this week's league table", description_localizations: fr("Classe contre classe : le classement de la semaine") },
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
        { name: "Coach: plan, skills, path, shop", name_localizations: fr("Coach : plan, compétences, parcours, boutique"), value: "coach" },
        { name: "Quiz, boss battles, bounties", name_localizations: fr("Quiz, boss, primes"), value: "events" },
        { name: "Help, briefs, assessments, league", name_localizations: fr("Aide, briefs, évaluations, ligue"), value: "more" },
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
            type: STRING, name: "code_language", description: "What your class learns: one language or stack", description_localizations: fr("Ce que la classe apprend : un langage ou une pile"),
            choices: [
              { name: "JavaScript", value: "javascript" },
              { name: "PHP", value: "php" },
              { name: "Python", value: "python" },
              { name: "Java", value: "java" },
              { name: "C", value: "c" },
              { name: "C++", value: "cpp" },
              { name: "SQL (databases)", name_localizations: fr("SQL (bases de données)"), value: "sql" },
              { name: "MERN (MongoDB, Express, React, Node)", value: "mern" },
              { name: "Python for AI & LLMs", name_localizations: fr("Python pour l'IA et les LLM"), value: "ai" },
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
        options: [
          { type: STRING, name: "name", description: "Season name", description_localizations: fr("Nom de la saison"), required: true, max_length: 60 },
          { type: BOOLEAN, name: "certificates", description: "DM every student their certificate (default yes)", description_localizations: fr("Envoyer à chaque élève son certificat (oui par défaut)") },
        ],
      },
      { type: SUB, name: "dashboard", description: "Link to the teacher dashboard", description_localizations: fr("Lien vers le tableau de bord") },
      {
        type: SUB, name: "notify", description: "Get a DM when a student uses /help-me or /ask (sends a test DM)", description_localizations: fr("Recevoir un MP quand un élève utilise /help-me ou /ask (envoie un MP de test)"),
        options: [
          { type: BOOLEAN, name: "help_me", description: "DM me for /help-me (default: on)", description_localizations: fr("MP pour /help-me (activé par défaut)") },
          { type: BOOLEAN, name: "ask", description: "DM me for new /ask questions (default: on)", description_localizations: fr("MP pour les nouvelles questions /ask (activé par défaut)") },
        ],
      },
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
