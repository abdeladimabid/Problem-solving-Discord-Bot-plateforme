// 🕵️ SQL Detective: the mysteries. Each case is a small SQLite database (sent to the students' browsers, where
// sql.js runs it) and steps. A step is solved when the result of the student's query holds the expected values:
//   all: every listed column must be in the result (in any order, with any other columns), same number of rows
//   any: at least one listed column must be in the result, same number of rows
// The expected values stay on the server (only the database goes to the browser). `ref` is the teacher's solution
// (checked by the tests against `expect`, and shown to the teacher after the game).

export interface SqlStep { title: string; clue: string; hint: string; ref: string; expect: { rows: number; all?: (string | number)[][]; any?: (string | number)[][] }; found: string }
export interface SqlCase { id: string; title: string; level: "easy" | "medium"; notions: string[]; story: string; schema: string; steps: SqlStep[]; question: string; culprit: string[]; ending: string }

export const SQL_CASES: SqlCase[] = [
  {
    id: "cafe",
    title: "Le vol de la caisse du YouCode Café",
    level: "easy",
    notions: ["SELECT", "WHERE", "BETWEEN", "JOIN", "SUM"],
    story: "Samedi, entre 15h00 et 15h30, la caisse du YouCode Café (3 200 DH) a disparu du bureau. Personne n’a rien vu… mais chaque porte a un badge, chaque employé a un horaire, et les messages du Wi-Fi du café sont enregistrés. À vous de mener l’enquête, requête après requête.",
    schema: `CREATE TABLE employes (id INTEGER PRIMARY KEY, nom TEXT, poste TEXT, debut TEXT, fin TEXT);
INSERT INTO employes VALUES
 (1,'Yassine Amrani','barista','08:00','16:00'),
 (2,'Salma Idrissi','serveuse','08:00','14:00'),
 (3,'Omar Tazi','plongeur','18:00','23:00'),
 (4,'Nadia Berrada','gérante','09:00','17:00'),
 (5,'Hamza Lahlou','serveur','14:00','22:00'),
 (6,'Imane Chraibi','cuisinière','10:00','18:00');
CREATE TABLE badges (id INTEGER PRIMARY KEY, personne TEXT, porte TEXT, heure TEXT);
INSERT INTO badges VALUES
 (1,'Yassine Amrani','entree','07:55'),(2,'Salma Idrissi','entree','07:58'),(3,'Nadia Berrada','entree','08:50'),
 (4,'Nadia Berrada','bureau','09:10'),(5,'Imane Chraibi','entree','09:57'),(6,'Imane Chraibi','cuisine','10:02'),
 (7,'Yassine Amrani','bureau','11:20'),(8,'Yassine Amrani','reserve','12:30'),(9,'Salma Idrissi','entree','13:58'),
 (10,'Hamza Lahlou','entree','13:55'),(11,'Nadia Berrada','bureau','14:40'),(12,'Yassine Amrani','bureau','15:05'),
 (13,'Salma Idrissi','bureau','15:12'),(14,'Imane Chraibi','cuisine','15:15'),(15,'Omar Tazi','entree','15:20'),
 (16,'Omar Tazi','bureau','15:24'),(17,'Hamza Lahlou','reserve','15:28'),(18,'Omar Tazi','entree','15:31'),
 (19,'Hamza Lahlou','bureau','15:45'),(20,'Nadia Berrada','bureau','16:10'),(21,'Omar Tazi','entree','17:55'),
 (22,'Imane Chraibi','entree','18:02');
CREATE TABLE messages (id INTEGER PRIMARY KEY, expediteur TEXT, destinataire TEXT, heure TEXT, contenu TEXT);
INSERT INTO messages VALUES
 (1,'Nadia Berrada','Hamza Lahlou','13:30','Tu peux venir à 14h pile ?'),
 (2,'Yassine Amrani','Imane Chraibi','14:50','Il reste des croissants ?'),
 (3,'Hamza Lahlou','Nadia Berrada','15:10','La livraison est arrivée'),
 (4,'Omar Tazi','0661234578','15:35','C’est fait. On se retrouve au parking à 16h.'),
 (5,'Salma Idrissi','Maman','15:40','Je rentre tard ce soir, bisous'),
 (6,'Imane Chraibi','Yassine Amrani','15:50','Oui, deux'),
 (7,'Nadia Berrada','Omar Tazi','16:20','Tu étais où cet après-midi ?'),
 (8,'Salma Idrissi','0661234578','16:45','Tu passes au café demain ?'),
 (9,'Omar Tazi','Nadia Berrada','16:55','Chez moi, je dormais.');
CREATE TABLE clients (id INTEGER PRIMARY KEY, nom TEXT, telephone TEXT);
INSERT INTO clients VALUES
 (1,'Karim Benali','0661234578'),(2,'Karim Ouazzani','0677889900'),(3,'Sara Alaoui','0612121212'),
 (4,'Mehdi Kettani','0655443322'),(5,'Lina Fassi','0699001122');
CREATE TABLE commandes (id INTEGER PRIMARY KEY, client_id INTEGER, heure TEXT, total REAL);
INSERT INTO commandes VALUES
 (1,1,'09:15',120),(2,2,'09:40',45),(3,3,'10:05',60),(4,1,'12:30',340),(5,4,'13:10',80),
 (6,2,'14:00',95),(7,1,'16:05',400),(8,5,'16:30',55),(9,3,'17:00',30),(10,4,'17:45',110);`,
    steps: [
      { title: "Le bureau", clue: "Le vol a eu lieu dans le bureau entre 15:00 et 15:30. Qui a badgé à la porte du bureau pendant ce créneau ?", hint: "Table badges : filtre la porte (porte = 'bureau') ET l’heure (BETWEEN '15:00' AND '15:30').",
        ref: "SELECT personne, heure FROM badges WHERE porte = 'bureau' AND heure BETWEEN '15:00' AND '15:30'", expect: { rows: 3, any: [["Yassine Amrani", "Salma Idrissi", "Omar Tazi"]] },
        found: "Trois personnes sont entrées dans le bureau : Yassine, Salma et Omar." },
      { title: "Les horaires", clue: "Un employé en service avait une bonne raison d’entrer dans le bureau. Parmi les trois, qui n’était PAS en service à ce moment-là ?", hint: "Relie badges et employes (JOIN … ON employes.nom = badges.personne), puis garde ceux dont l’heure du badge est hors de leur horaire (heure < debut OR heure > fin).",
        ref: "SELECT b.personne FROM badges b JOIN employes e ON e.nom = b.personne WHERE b.porte = 'bureau' AND b.heure BETWEEN '15:00' AND '15:30' AND (b.heure < e.debut OR b.heure > e.fin)", expect: { rows: 2, any: [["Salma Idrissi", "Omar Tazi"]] },
        found: "Salma avait fini à 14:00 et Omar ne commençait qu’à 18:00. Deux suspects !" },
      { title: "Les messages", clue: "Juste après le vol, les deux suspects ont envoyé des messages. Affiche les messages envoyés par Salma Idrissi ou Omar Tazi entre 15:30 et 16:30.", hint: "Table messages : expediteur IN ('Salma Idrissi', 'Omar Tazi') AND heure BETWEEN '15:30' AND '16:30'.",
        ref: "SELECT expediteur, destinataire, heure, contenu FROM messages WHERE expediteur IN ('Salma Idrissi', 'Omar Tazi') AND heure BETWEEN '15:30' AND '16:30'", expect: { rows: 2, any: [["Omar Tazi", "Salma Idrissi"], ["0661234578", "Maman"], ["C’est fait. On se retrouve au parking à 16h.", "Je rentre tard ce soir, bisous"]] },
        found: "« C’est fait. On se retrouve au parking à 16h. » Omar a écrit au 0661234578…" },
      { title: "Le complice", clue: "Le numéro 0661234578 appartient à un client du café. Trouve son nom et le total de toutes ses commandes de la journée (une seule ligne : le nom et le total).", hint: "Relie clients et commandes (JOIN … ON commandes.client_id = clients.id), filtre le téléphone, puis SUM(total) avec GROUP BY le nom.",
        ref: "SELECT c.nom, SUM(co.total) AS total FROM clients c JOIN commandes co ON co.client_id = c.id WHERE c.telephone = '0661234578' GROUP BY c.nom", expect: { rows: 1, all: [["Karim Benali"], [860]] },
        found: "Karim Benali a dépensé 860 DH… dont 400 DH à 16:05, juste après le rendez-vous au parking !" },
    ],
    question: "Qui a volé la caisse ? (prénom et nom)",
    culprit: ["omar tazi", "tazi omar"],
    ending: "Omar Tazi est entré dans le bureau à 15:24 alors qu’il ne travaillait qu’à 18:00, puis a écrit à son complice Karim Benali, qui a dépensé une partie de l’argent au café à 16:05. Affaire résolue !",
  },
  {
    id: "exam",
    title: "La fuite du sujet d’examen",
    level: "medium",
    notions: ["JOIN", "WHERE", "GROUP BY", "HAVING", "COUNT(DISTINCT)"],
    story: "Hier soir à 19:00, le sujet de l’examen final (examen_final.pdf, 12 pages) a été publié sur un groupe WhatsApp. Le serveur de l’école garde la trace de tout : qui ouvre quel fichier, qui imprime quoi, et depuis quelle adresse IP chacun se connecte. Retrouvez qui a fait fuiter le sujet.",
    schema: `CREATE TABLE apprenants (id INTEGER PRIMARY KEY, nom TEXT, classe TEXT);
INSERT INTO apprenants VALUES
 (1,'Ilyas Bennani','DWWM-1'),(2,'Meryem El Fassi','DWWM-1'),(3,'Anas Rami','DWWM-2'),(4,'Hiba Mansouri','DWWM-2'),
 (5,'Reda Ziani','DWWM-1'),(6,'Kenza Alami','DWWM-2'),(7,'Yahya Saidi','DWWM-1');
CREATE TABLE acces_fichiers (id INTEGER PRIMARY KEY, apprenant_id INTEGER, fichier TEXT, heure TEXT);
INSERT INTO acces_fichiers VALUES
 (1,1,'cours_sql.pdf','14:05'),(2,3,'examen_final.pdf','15:20'),(3,2,'examen_final.pdf','17:40'),(4,4,'planning.xlsx','16:00'),
 (5,5,'examen_final.pdf','18:05'),(6,6,'cours_css.pdf','17:10'),(7,2,'cours_sql.pdf','17:50'),(8,7,'examen_blanc.pdf','18:20'),
 (9,1,'examen_blanc.pdf','18:25');
CREATE TABLE impressions (id INTEGER PRIMARY KEY, apprenant_id INTEGER, heure TEXT, pages INTEGER, imprimante TEXT);
INSERT INTO impressions VALUES
 (1,4,'16:05',3,'salle-2'),(2,3,'16:30',12,'salle-1'),(3,2,'18:10',12,'salle-1'),(4,6,'17:20',12,'salle-2'),
 (5,5,'18:15',4,'salle-1'),(6,1,'18:30',2,'salle-2'),(7,7,'18:40',12,'salle-1');
CREATE TABLE connexions (id INTEGER PRIMARY KEY, apprenant_id INTEGER, ip TEXT, heure TEXT);
INSERT INTO connexions VALUES
 (1,1,'10.0.0.11','08:30'),(2,2,'10.0.0.42','08:45'),(3,3,'10.0.0.13','09:00'),(4,4,'10.0.0.14','09:05'),
 (5,5,'10.0.0.15','09:10'),(6,6,'10.0.0.16','09:12'),(7,7,'10.0.0.17','09:20'),(8,2,'10.0.0.42','17:35'),
 (9,7,'10.0.0.42','18:35'),(10,3,'10.0.0.13','15:15'),(11,5,'10.0.0.15','18:00');`,
    steps: [
      { title: "Le fichier", clue: "Qui a ouvert le fichier examen_final.pdf ? Affiche le NOM des apprenants (pas leur id).", hint: "Relie acces_fichiers et apprenants (JOIN … ON apprenants.id = acces_fichiers.apprenant_id) et filtre le fichier.",
        ref: "SELECT a.nom FROM acces_fichiers f JOIN apprenants a ON a.id = f.apprenant_id WHERE f.fichier = 'examen_final.pdf'", expect: { rows: 3, any: [["Anas Rami", "Meryem El Fassi", "Reda Ziani"]] },
        found: "Trois apprenants ont ouvert le sujet : Anas, Meryem et Reda." },
      { title: "L’imprimante", clue: "Le sujet fait 12 pages. Qui a imprimé exactement 12 pages entre 17:00 et 19:00 ? (le nom)", hint: "Relie impressions et apprenants, puis WHERE pages = 12 AND heure BETWEEN '17:00' AND '19:00'.",
        ref: "SELECT a.nom FROM impressions i JOIN apprenants a ON a.id = i.apprenant_id WHERE i.pages = 12 AND i.heure BETWEEN '17:00' AND '19:00'", expect: { rows: 3, any: [["Meryem El Fassi", "Kenza Alami", "Yahya Saidi"]] },
        found: "Meryem, Kenza et Yahya ont imprimé 12 pages en fin de journée." },
      { title: "L’adresse IP", clue: "La photo du sujet a été envoyée depuis un poste partagé. Quelles adresses IP ont été utilisées par plus d’un apprenant ? Affiche l’IP et le nombre d’apprenants différents.", hint: "GROUP BY ip, puis HAVING COUNT(DISTINCT apprenant_id) > 1.",
        ref: "SELECT ip, COUNT(DISTINCT apprenant_id) AS n FROM connexions GROUP BY ip HAVING COUNT(DISTINCT apprenant_id) > 1", expect: { rows: 1, all: [["10.0.0.42"], [2]] },
        found: "Une seule adresse est partagée : 10.0.0.42, par deux apprenants." },
      { title: "Le poste partagé", clue: "Qui s’est connecté depuis 10.0.0.42 ? Affiche chaque nom une seule fois.", hint: "JOIN connexions et apprenants, WHERE ip = '10.0.0.42', et DISTINCT pour ne pas répéter les noms.",
        ref: "SELECT DISTINCT a.nom FROM connexions c JOIN apprenants a ON a.id = c.apprenant_id WHERE c.ip = '10.0.0.42'", expect: { rows: 2, any: [["Meryem El Fassi", "Yahya Saidi"]] },
        found: "Meryem et Yahya ont utilisé le poste 10.0.0.42. Une seule personne est dans TOUTES vos listes…" },
    ],
    question: "Qui a fait fuiter le sujet ? (prénom et nom)",
    culprit: ["meryem el fassi", "meryem elfassi", "el fassi meryem"],
    ending: "Meryem El Fassi a ouvert examen_final.pdf à 17:40, l’a imprimé (12 pages) à 18:10, et s’est connectée depuis le poste partagé 10.0.0.42. Elle est la seule dans toutes les listes : affaire résolue !",
  },
];

// ------------------------------------------------------------------ checking a result
/** A value as it's compared: text without case or extra spaces, numbers rounded (860 = 860.0 = "860"). */
export function normValue(v: unknown): string {
  if (v == null) return "null";
  const t = String(v).trim();
  if (t !== "" && !Number.isNaN(Number(t)) && /^-?\d+(\.\d+)?$/.test(t)) return String(Math.round(Number(t) * 100) / 100);
  return t.toLowerCase().normalize("NFC").replace(/[’']/g, "'").replace(/\s+/g, " ");
}
const bag = (vals: unknown[]) => vals.map(normValue).sort().join("\u001f");
/** Does the student's result (rows of values) hold what the step expects? */
export function checkResult(step: SqlStep, rows: unknown[][]): { ok: boolean; rows: number; need: number; cols?: number } {
  const need = step.expect.rows;
  if (!Array.isArray(rows) || rows.length !== need) return { ok: false, rows: Array.isArray(rows) ? rows.length : 0, need };
  const width = Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  const colsOf = Array.from({ length: width }, (_, c) => bag(rows.map((r) => (Array.isArray(r) ? r[c] : null))));
  const has = (exp: (string | number)[]) => { const b = bag(exp); return colsOf.includes(b); };
  if (step.expect.all) {
    if (!step.expect.all.every(has)) return { ok: false, rows: rows.length, need, cols: step.expect.all.length };
    // the columns must also be on the same rows (a name next to its own total)
    const idx = step.expect.all.map((exp) => colsOf.indexOf(bag(exp)));
    const mine = rows.map((r) => idx.map((c) => normValue(r[c])).join("\u001e")).sort().join("\u001d");
    const want = Array.from({ length: need }, (_, i) => step.expect.all!.map((col) => normValue(col[i])).join("\u001e")).sort().join("\u001d");
    return { ok: mine === want, rows: rows.length, need, cols: step.expect.all.length };
  }
  return { ok: (step.expect.any ?? []).some(has), rows: rows.length, need };
}
export const culpritOk = (c: SqlCase, name: string) => c.culprit.includes(normValue(name).replace(/[^a-z' -]/g, "").trim());
/** What a student's browser gets: the story, the database and the clues (never the expected values or the solutions). */
export function caseForPlayers(c: SqlCase) {
  return { id: c.id, title: c.title, story: c.story, schema: c.schema, question: c.question, steps: c.steps.map((s) => ({ title: s.title, clue: s.clue })) };
}
