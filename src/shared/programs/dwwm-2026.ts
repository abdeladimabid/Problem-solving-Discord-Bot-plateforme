// Built-in programme: YouCode DWWM first year 2026/2027 (from the teacher's planning spreadsheet).
// Generated once from "A1 Planning YouCode Parcours DWWM 2026_2027.xlsx"; edit it in the dashboard (Programmes), not here.
import type { Program } from "../program.ts";

export const DWWM_2026: Program = {
 "key": "dwwm-2026",
 "name": "DWWM · Développeur web et web mobile · A1 2026/2027",
 "stack": "dwwm",
 "lang": "fr",
 "levels": [
  "imiter",
  "adapter",
  "transposer"
 ],
 "referential": [
  {
   "code": "C1",
   "name": "Installer et configurer son environnement de travail en fonction du projet web ou web mobile",
   "kind": "tech"
  },
  {
   "code": "C2",
   "name": "Maquetter des interfaces utilisateur web ou web mobile",
   "kind": "tech"
  },
  {
   "code": "C3",
   "name": "Réaliser des interfaces utilisateur statiques web ou web mobile",
   "kind": "tech"
  },
  {
   "code": "C4",
   "name": "Développer la partie dynamique des interfaces utilisateur web ou web mobile",
   "kind": "tech"
  },
  {
   "code": "C5",
   "name": "Mettre en place une base de données relationnelle",
   "kind": "tech"
  },
  {
   "code": "C6",
   "name": "Développer des composants d’accès aux données SQL et NoSQL",
   "kind": "tech"
  },
  {
   "code": "C7",
   "name": "Développer des composants métier côté serveur",
   "kind": "tech"
  },
  {
   "code": "C8",
   "name": "Documenter le déploiement d’une application dynamique web ou web mobile",
   "kind": "tech"
  },
  {
   "code": "T1",
   "name": "Planifier le travail à effectuer individuellement",
   "kind": "soft"
  },
  {
   "code": "T2",
   "name": "Contribuer au pilotage de l’organisation du travail individuel et collectif",
   "kind": "soft"
  },
  {
   "code": "T3",
   "name": "Définir le périmètre d’un problème rencontré en adoptant une démarche inductive",
   "kind": "soft"
  },
  {
   "code": "T4",
   "name": "Rechercher de façon méthodique une ou des solutions au problème rencontré",
   "kind": "soft"
  },
  {
   "code": "T5",
   "name": "Partager la solution adoptée en utilisant les moyens de partage de connaissance ou de documentation disponibles",
   "kind": "soft"
  },
  {
   "code": "T6",
   "name": "Présenter un travail réalisé en synthétisant ses résultats, sa démarche et en répondant aux questions de son auditoire",
   "kind": "soft"
  },
  {
   "code": "T7",
   "name": "Se familiariser avec les codes et la culture propres à son environnement professionnel",
   "kind": "soft"
  },
  {
   "code": "T8",
   "name": "Interagir dans un contexte professionnel de façon respectueuse et constructive",
   "kind": "soft"
  },
  {
   "code": "T9",
   "name": "Faciliter un temps de travail collectif en assurant une communication constructive entre les participants",
   "kind": "soft"
  }
 ],
 "sprints": [
  {
   "n": 1,
   "weeks": 2,
   "title": "Conception d’interfaces Web modernes et responsives",
   "objectives": "",
   "situation": "• Concevoir une interface Web à partir d’une maquette en respectant la structure sémantique HTML5 web accessibilité.\n• Intégrer une interface moderne avec CSS3 et un framework CSS adapté.\n• Produire des interfaces responsives et accessibles sur différents formats d’écran.\n• Organiser et versionner le projet avec Git/GitHub et un outil de gestion des tâches.",
   "technologies": "Intégration d’une interface Web moderne et responsive à partir d’une maquette",
   "briefs": "GITFlow***( les normes et les standards de gitHub)\nJira***\nMaquettage & UI/UX : wireframes, zoning, lecture de maquettes Figma.\nHTML5 : structure sémantique, formulaires, SEO de base, accessibilité WAI-ARIA.\nCSS3 : cascade, sélecteurs, box model, unités et variables CSS.\nMise en page : Flexbox et CSS Grid.\nResponsive Design : mobile-first, media queries, adaptativité.\nFramework CSS : Tailwind CSS ,classes utilitaires et Design System.\nGit/GitHub : init, add, commit, push, dépôts et bonnes pratiques de commits.\nOrganisation projet : GitHub Projects / jira, DevTools et structuration de l’environnement.",
   "tech": [],
   "soft": [
    "T1N1",
    "T2N1",
    "T3N1",
    "T4N1",
    "T5N1"
   ]
  },
  {
   "n": 2,
   "weeks": 3,
   "title": "Développement d’interfaces dynamiques avec JavaScript moderne",
   "objectives": "",
   "situation": "• Développer une interface Web interactive en manipulant le DOM avec JavaScript moderne.\n• Gérer les événements, formulaires et validations côté client.\n• Structurer et modulariser le code JavaScript en appliquant les fonctionnalités ES6+.",
   "technologies": "Développer les interactions et fonctionnalités dynamiques d’une interface Web",
   "briefs": "Jira*** et automatisation avec Github\nDOM : sélection, traversée, modification et création dynamique d’éléments.\nÉvénements : listeners, propagation, délégation et interactions utilisateur.\nFormulaires : récupération des données, validation et expressions régulières.\nJavaScript ES6+ : destructuring, spread/rest, fonctions fléchées,\nModules ES : import/export et découpage du code par responsabilités.\nOutillage & collaboration : branches Git et Pull Requests simples.",
   "tech": [],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N1",
    "T7N1"
   ]
  },
  {
   "n": 3,
   "weeks": 2,
   "title": "Applications JavaScript asynchrones et intégration d’API",
   "objectives": "",
   "situation": "• Consommer des services Web depuis une application JavaScript avec Fetch API.\n• Maîtriser les traitements asynchrones avec Promises et async/await.\n• Gérer les données JSON, la persistance locale et les différents états d’une requête.\n• Structurer une application frontend pour séparer l’interface, les services et la gestion des données.",
   "technologies": "Connexion d’une application Web à des services et données externes",
   "briefs": "Extensions possibles : Web API ( Fetch API)\nWorkshop: Web API + Fetch API, Gestion des réponses JSON, Asynchronous Js (async/await)\nWeb APIs : interaction avec les fonctionnalités fournies par le navigateur.\nFetch API : appels HTTP GET/POST/PUT/DELETE depuis JavaScript.\nJSON : sérialisation, parsing et exploitation des réponses d’API.\nPromises : états, chaînage et gestion des traitements différés.\nasync/await : écriture et orchestration de traitements asynchrones.\nGestion des erreurs : try/catch, erreurs HTTP, loading, success et error states.\nStockage navigateur : LocalStorage / SessionStorage et persistance simple.\nArchitecture frontend : séparation UI / services / données et consommation structurée d’API.",
   "tech": [],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N1",
    "T9N1"
   ]
  },
  {
   "n": 4,
   "weeks": 2,
   "title": "Développement Backend modélisation &  données relationnelles",
   "objectives": "",
   "situation": "• Modéliser une base de données relationnelle à partir d’un besoin métier et produire un schéma ERD cohérent.\nUML \n• Créer, manipuler et interroger une base de données avec SQL.\n• Développer des traitements côté serveur avec PHP et gérer les formulaires et sessions.\n• Connecter PHP à la base de données avec PDO en sécurisant les requêtes et les entrées utilisateur.",
   "technologies": "Conception et développement de la gestion des données d’une application Web",
   "briefs": "ERD: Designer une base de donnée avec ERD \n- Entité et Attributs (tables, colonnes, types de données)\n- Relations: 1:1, 1:N, N:N avec clés primaires et étrangères\n- Contraintes SQL: PRIMARY KEY, FOREIGN KEY, NOT NULL, UNIQUE ...\n- Normalisation et organisation des données\nMySQL / PostgreSQL : Base de données relationnelle, mise en place des tables et relations (ERD).\n- Connexion à la base de données: mysqli_connect, PDO\n- Requêtes SQL dynamiques DML: CRUD\n- Gestion des formulaires HTML avec php (super globals vars)\n- Sécurité: Echapper les entrés et sql injection\n- Structuration et organisation du code.\nGit/GitHub : Suivi des versions et collaboration.\nEnvironnement : Docker",
   "tech": [],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N2",
    "T9N2"
   ]
  },
  {
   "n": 5,
   "weeks": 3,
   "title": "Programmation orientée objet et structuration d’applications PHP modernes",
   "objectives": "",
   "situation": "• Concevoir une application PHP en appliquant les principes fondamentaux de la programmation orientée objet.\n• Structurer les objets métier avec encapsulation, héritage, interfaces, traits et polymorphisme.\n• Organiser un projet PHP moderne avec typage, exceptions, namespaces, Composer et autoloading.\n• Mettre en œuvre un accès aux données orienté objet et standardiser l’environnement de développement.",
   "technologies": "Structuration d’une application PHP en programmation orientée objet",
   "briefs": "PHP 8.4 moderne : typage strict, propriétés typées, match, enums et readonly.\nClasses & objets : propriétés, méthodes, constructeurs et responsabilités.\nEncapsulation & héritage : visibilité, spécialisation et réutilisation.\n Abstraction : interfaces, classes abstraites, traits et polymorphisme.\nGestion des erreurs : exceptions, exceptions personnalisées et flux de traitement.\nOrganisation du code : namespaces, autoloading PSR-4 et Composer.\nAccès aux données en POO : PDO, repositories simples et requêtes préparées.",
   "tech": [],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N2",
    "T9N2"
   ]
  },
  {
   "n": 6,
   "weeks": 2,
   "title": "Architecture MVC,sécurité des applications PHP",
   "objectives": "",
   "situation": "• Structurer une application PHP autour de l’architecture MVC et séparer clairement les responsabilités.\n• Organiser la logique métier à travers routes, contrôleurs, modèles, vues et services.\n• Appliquer les principes SOLID et les bonnes pratiques de sécurité Web.\n• Mettre en place la gestion des erreurs, et les premiers tests automatisés.",
   "technologies": "Structuration et sécurisation d’une application Web avec une architecture MVC",
   "briefs": "Architecture MVC : séparation Model / View / Controller.\nRouting : définition des routes, paramètres et dispatch des requêtes.\nControllers : orchestration des actions et gestion des requêtes/réponses.\nModels & accès aux données : entités, repositories et persistance.\nViews : templates, données d’affichage et séparation présentation / métier.\nServices & principes SOLID : logique métier, dépendances et responsabilités.\nSécurité Web : validation, XSS, CSRF, sessions et contrôle des entrées.\n Qualité : gestion des erreurs, logs et initiation aux tests unitaires PHPUnit/Pest.\nEnvironnement : Docker en initiation pour standardiser le poste de développement.",
   "tech": [],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ]
  },
  {
   "n": 7,
   "weeks": 4,
   "title": "Développement d’applications Web professionnelles avec Laravel",
   "objectives": "",
   "situation": "• Développer une application métier structurée avec Laravel en exploitant son architecture et son écosystème.\n• Gérer les données, relations, validations, utilisateurs et droits d’accès avec les composants Laravel.",
   "technologies": "Développement d’une application métier professionnelle avec Laravel",
   "briefs": "Laravel Core : cycle requête/réponse, Routing, Controllers, configuration et Artisan.\nBlade : templates, layouts, sections, composants, formulaires et affichage conditionnel.\nBase de données : Migrations, Seeders, Factories et évolution du schéma.\nEloquent ORM : Models, relations, scopes, eager loading et optimisation des requêtes.\nValidation : Form Requests, règles métier et gestion des messages d’erreur.\nAuthentification & accès : Laravel Breeze, Middleware, Autorisation et Policies.\nAuthentification API : tokens, JWT selon le contexte et autorisations.\nArchitecture & qualité : Services, séparation des responsabilités, .env, logs, tests et debugging.\nCollaboration & optimisation : Composer, Git Flow, Pull Requests, cache et bonnes pratiques de performance.\nLravael IA:connexion à une API de modèle IA, configuration de la clé API dans .env, création d’un service IA Laravel, construction d’un prompt simple, envoi d’une requête au modèle, récupération et affichage de la réponse, gestion basique des erreurs",
   "tech": [],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ]
  },
  {
   "n": 8,
   "weeks": 3,
   "title": "Conception d’API REST et intégration Frontend / Backend",
   "objectives": "",
   "situation": "• Concevoir, sécuriser et documenter une API REST avec Laravel.\n• Développer, valider et sécuriser des endpoints API avec Laravel.\n• Consommer les données de l’API dans une interface JS (React.js) en gérant les appels asynchrones et les états d’affichage.\n• Intégrer un modèle de langage dans l’API Laravel et exploiter sa réponse dans l’interface React.js.\n• Exploiter les réponses IA dans des fonctionnalités métier en gérant validation, erreurs.",
   "technologies": "Développement d’une application Web avec API REST, interface React et intégration IA",
   "briefs": "Principes REST & HTTP : ressources, verbes, statuts et conventions d’URL.\n Laravel API : routes API, contrôleurs dédiés et organisation des endpoints.\n Réponses JSON : API Resources, transformations et formats cohérents.\nValidation & erreurs : Form Requests, exceptions et réponses d’erreur normalisées.\nExploitation des données : pagination, filtres, tri, recherche et paramètres de requête.\nQualité API : tests, collections Postman et documentation OpenAPI/Swagger.\nIntégration IA : API/SDK LLM, Service IA Laravel, clés API, .env, prompts système et contexte.\nRéponses IA exploitables : Structured Outputs JSON, validation, parsing et intégration métier.\nReact.js pour la consommation : composants fonctionnels, JSX, Props, State, Hooks et structuration simple.",
   "tech": [],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ]
  }
 ],
 "weeks": [
  {
   "n": 1,
   "start": "2026-10-05",
   "end": "2026-10-09",
   "kind": "brief",
   "sprint": 1,
   "brief": 1,
   "days": 5,
   "mode": "individuel",
   "title": "Conception et intégration d’une interface Web multi-pages à partir d’une maquette",
   "objective": "Concevoir une maquette UI sous Figma puis l’intégrer en HTML5/CSS3 natif sous forme de pages interconnectées, en respectant la structure sémantique, la hiérarchie visuelle et l'organisation rigoureuse du projet.",
   "concepts": "- Conception UI/UX : Zoning, wireframing et maquettage responsive sous Figma (composants de base, grille 12 colonnes, charte graphique).\n\n- HTML5 sémantique : Balisage structurant (<header>, <nav>, <main>, <section>, <article>, <aside>, <footer>), formulaires natifs avec attributs de validation (required, pattern, type).\n\n- CSS3 moderne : Box model, sélecteurs avancés, cascade/spécificité, variables CSS (:root), Flexbox (alignements, axes).\n\n- Accessibilité & SEO de base : Attributs alt, hiérarchie des titres (h1-h6), balises <meta> essentielles (viewport, description).\n\n- Outillage & Versioning : Configuration de l'environnement (VS Code, extensions), Git local et distant (init, add, commit avec messages conventionnels, push sur GitHub), LightHouse / Axe DevTool.",
   "competencies": [
    "C1N1",
    "C2N1",
    "C3N1"
   ],
   "soft": [
    "T1N1",
    "T2N1",
    "T3N1",
    "T4N1",
    "T5N1"
   ],
   "deliverables": "Lien du dépôt GitHub avec README documenté, lien de la maquette Figma, site déployé (GitHub Pages)."
  },
  {
   "n": 2,
   "start": "2026-10-12",
   "end": "2026-10-16",
   "kind": "brief",
   "sprint": 1,
   "brief": 2,
   "days": 5,
   "mode": "binôme/trinôme",
   "title": "Création d’une application/site Web moderne, responsive et accessible avec Tailwind CSS",
   "objective": "Réaliser en équipe un site Web complet et adaptatif à partir d'un cahier des charges et d'une maquette complexe, en appliquant une démarche Mobile-First, un framework CSS utilitaire et un workflow collaboratif standardisé.",
   "concepts": "- Mise en page avancée : CSS Grid (grilles bidimensionnelles, zones de template) combiné à Flexbox.\n\n- Approche Mobile-First & Responsive : Media queries ciblées, adaptation fluide aux breakpoints (mobile, tablette, desktop).\n\n- Framework CSS utilitaire (Tailwind CSS) : Installation via CLI/Vite, configuration tailwind.config.js, classes utilitaires, réutilisabilité des composants, mise en place d'un Design System cohérent (palette de couleurs, typographies, espacements).\n\n- Accessibilité numérique (A11y) : Contraste des couleurs (normes WCAG/RGAA), navigation au clavier, rôles et états WAI-ARIA (aria-label, aria-expanded).\n\n- Gestion de projet & Workflow Git Flow : Découpage du backlog et suivi des tâches sur GitHub Projects, branches de fonctionnalités (feature/*), Pull Requests relues et validées avec peer-review, gestion des conflits de merge.",
   "competencies": [
    "C1N2",
    "C2N2",
    "C3N2"
   ],
   "soft": [
    "T1N1",
    "T2N1",
    "T3N1",
    "T4N1",
    "T5N1"
   ],
   "deliverables": "Dépôt GitHub d'équipe avec historique Git Flow propre, tableau GitHub Projects clôturé, site responsive déployé en ligne."
  },
  {
   "n": 3,
   "start": "2026-10-19",
   "end": "2026-10-23",
   "kind": "brief",
   "sprint": 2,
   "brief": 3,
   "days": 5,
   "mode": "individuel",
   "title": "Développer une interface Web interactive et dynamique avec JavaScript natif",
   "objective": "Transformer une interface Web statique en une interface dynamique et réactive en manipulant le DOM, en capturant les interactions utilisateur et en implémentant des formulaires contrôlés avec validation stricte en temps réel.",
   "concepts": "- Manipulation du DOM : Sélecteurs modernes (querySelector, querySelectorAll), parcours de l'arbre DOM (parents, enfants, frères), création/modification/suppression dynamique d'éléments (createElement, append, classList, setAttribute).\n\n- Gestion des événements : addEventListener, objet Event (e.target, preventDefault, stopPropagation), propagation et délégation d'événements pour les éléments dynamiques.\n\n- Formulaires & Validations : Événements input, change, submit, expressions régulières (Regex) pour valider emails, mots de passe, téléphones, affichage des messages d'erreur/succès contextuels.\n\n- Bonnes pratiques JS : Séparation stricte du HTML, CSS et JavaScript, nommage sémantique, gestion du scope (const, let).",
   "competencies": [
    "C1N1",
    "C2N1",
    "C3N1",
    "C4N1"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N1",
    "T7N1"
   ],
   "deliverables": "Dépôt GitHub individuel avec README, application web interactive déployée (GitHub Pages)."
  },
  {
   "n": 4,
   "start": "2026-10-26",
   "end": "2026-10-30",
   "kind": "brief",
   "sprint": 2,
   "brief": 4,
   "days": 5,
   "mode": "individuel",
   "title": "Développer une application Web dynamique, modulaire et structurée avec JavaScript ES6+",
   "objective": "Développer en binôme une Single Page Application (SPA) légère orientée gestion (CRUD côté client sans backend : création, consultation, modification, suppression, recherche et tri), architecturée en modules ES6 et gérée avec un workflow collaboratif Git/Jira.",
   "concepts": "- JavaScript ES6+ moderne : Fonctions fléchées, déstructuration d'objets/tableaux, opérateur spread/rest, template literals, méthodes fonctionnelles sur les tableaux (map, filter, reduce, find, some).\n\n- Modularité & Architecture : Modules ES6 (import / export), séparation des responsabilités (UI / État applicatif / Utilitaires).\n\n- Persistance locale : Manipulation de l'API localStorage / sessionStorage (sérialisation/désérialisation avec JSON.stringify et JSON.parse).\n\n- Collaboration : Gestion des branches de fonctionnalités Git (feature/*), Pull Requests documentées, revue de code par les pairs, tableau Kanban (Jira ou GitHub Projects).",
   "competencies": [
    "C1N2",
    "C2N2",
    "C3N2",
    "C4N2"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N1",
    "T7N1"
   ],
   "deliverables": "Dépôt d'équipe GitHub avec historique de PR validées, board Kanban complété, application déployée."
  },
  {
   "n": 5,
   "start": "2026-11-02",
   "end": "2026-11-04",
   "kind": "brief",
   "sprint": 3,
   "brief": 5,
   "days": 3,
   "mode": "individuel",
   "title": "Consommer et afficher les données d’une API publique avec Fetch API",
   "objective": "Connecter une interface Web à une API REST tierce (ex: OpenWeather, Rick & Morty, FakeStore), récupérer des données distantes et les injecter dynamiquement dans le DOM sous forme de composants visuels.",
   "concepts": "- Protocole HTTP & Format JSON : Verbe HTTP GET, en-têtes de requête basiques, structure et parsing d'une réponse JSON (response.json()).\n\n- Fetch API & Promesses : Syntaxe Fetch, chaînage de promesses (.then(), .catch(), .finally()), vérification du code statut (response.ok).\n\n- Rendu dynamique : Génération de listes de cartes / fiches à partir du payload JSON reçu.",
   "competencies": [
    "C1N2",
    "C4N1"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N1",
    "T9N1"
   ],
   "deliverables": "Dépôt GitHub avec démo fonctionnelle."
  },
  {
   "n": 6,
   "start": "2026-11-05",
   "end": "2026-11-10",
   "kind": "brief",
   "sprint": 3,
   "brief": 6,
   "days": 4,
   "mode": "individuel",
   "title": "Maîtriser l’asynchronisme, la gestion des états et la persistance des données",
   "objective": "Refactoriser et enrichir la consommation d'API en exploitant la syntaxe async/await, en prenant en compte l'expérience utilisateur via les états d'interface (chargement, erreur, succès) et en combinant API et stockage local.",
   "concepts": "- Programmation asynchrone moderne : async / await, bloc d'interception d'erreurs try...catch, gestion des rejets de promesses et erreurs réseau.\n\n- UX & États applicatifs : Gestion des loaders/spinners pendant le fetch, affichage d'écrans d'erreur clairs (404, 500, hors-ligne), états vides (empty states).\n\n- Cache & Persistance : Mise en cache des données reçues dans le localStorage pour optimiser les requêtes et persister les préférences de l'utilisateur (ex: favoris, filtres).",
   "competencies": [
    "C3N2",
    "C4N2"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N1",
    "T9N1"
   ],
   "deliverables": "Dépôt GitHub avec gestion complète des états d'erreur et de chargement."
  },
  {
   "n": 7,
   "start": "2026-11-11",
   "end": "2026-11-20",
   "kind": "brief",
   "sprint": 3,
   "brief": 7,
   "days": 8,
   "mode": "trinôme",
   "title": "Développer une application Web complète connectée à une API REST avec opérations CRUD",
   "objective": "Concevoir et développer en équipe une application web complexe connectée à un mock backend ou une API RESTful complète (ex: MockAPI, json-server, Strapi), permettant d'exécuter l'ensemble des opérations CRUD tout en isolant la couche de services.",
   "concepts": "- Méthodes HTTP complètes : Requêtes GET (lecture), POST (création avec body JSON et Content-Type), PUT / PATCH (mise à jour), DELETE (suppression).\n\n- Architecture Frontend par couches : Séparation stricte entre les composants UI (DOM), le service API centralisé (fonctions réutilisables d'appel API) et la gestion de l'état (State).\n\n- Gestion avancée des données : Pagination côté client/serveur, recherche avec débounce, filtres multi-critères et tris asynchrones.\n\n- Qualité & Collaboration : Gestion agile sur Jira, standardisation Git (commits conventionnels, feature branches, revues de code sur PR).",
   "competencies": [
    "C3N2",
    "C4N2"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N1",
    "T9N1"
   ],
   "deliverables": "Application complète en ligne, dépôt GitHub avec documentation technique de l'API consommée, backlog Jira clôturé."
  },
  {
   "n": 8,
   "start": "2026-11-23",
   "end": "2026-11-27",
   "kind": "break",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Repos",
   "objective": "",
   "concepts": "Vacances",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 9,
   "start": "2026-11-30",
   "end": "2026-12-04",
   "kind": "crossdefense",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Projet brief SC 1",
   "objective": "",
   "concepts": "",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 10,
   "start": "2026-12-07",
   "end": "2026-12-11",
   "kind": "crossdefense",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Soutenances croisées inter-groupes avec code review",
   "objective": "",
   "concepts": "",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 11,
   "start": "2026-12-14",
   "end": "2026-12-18",
   "kind": "brief",
   "sprint": 4,
   "brief": 7,
   "days": 4,
   "mode": "individuel",
   "title": "Modélisation relationnelle (ERD) et implémentation d’une base de données SQL",
   "objective": "Analyser un cahier des charges métier, concevoir le schéma conceptuel et logique de données (ERD), puis implémenter, alimenter et interroger la base de données relationnelle MySQL/PostgreSQL via un script SQL et/ou une console.",
   "concepts": "- Modélisation relationnelle : Identification des entités, attributs, types de données, cardinalités (1:1, 1:N, N:N) et tables de jointure (pivot).\n\n- Langage SQL - DDL (Data Definition Language) : Création de bases et de tables (CREATE TABLE), contraintes d'intégrité (PRIMARY KEY, FOREIGN KEY, NOT NULL, UNIQUE, DEFAULT, CHECK), règles d'intégrité référentielle (ON DELETE CASCADE).\n\n- Langage SQL - DML (Data Manipulation Language) : Insertion de jeux de tests réalistes (INSERT INTO), requêtes d'interrogation simples et complexes (SELECT, WHERE, ORDER BY, LIMIT), jointures internes et externes (INNER JOIN, LEFT JOIN), fonctions d'agrégation et regroupements (COUNT, SUM, AVG, GROUP BY, HAVING).",
   "competencies": [
    "C5N1",
    "C6N1"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N2",
    "T9N2"
   ],
   "deliverables": "Schéma ERD exporté (PDF/PNG), script schema.sql (création) et script queries.sql répondant aux besoins du use-case."
  },
  {
   "n": 12,
   "start": "2026-12-21",
   "end": "2026-12-25",
   "kind": "brief",
   "sprint": 4,
   "brief": 8,
   "days": 6,
   "mode": "individuel",
   "title": "Développer une application Web PHP connectée à une base de données MySQL/PDO",
   "objective": "Développer les fonctionnalités côté serveur d'une application Web en PHP procédural/modulaire, traiter les soumissions de formulaires, gérer les sessions utilisateurs et persister les données via PDO de façon totalement sécurisée.",
   "concepts": "- Fondamentaux PHP & Cycle Web : Superglobales ($_GET, $_POST, $_SERVER), configuration du serveur local, gestion des sessions et cookies ($_SESSION, authentification simple).\n\n- Accès aux données avec PDO : Instance PDO, gestion des options d'erreur (PDO::ERRMODE_EXCEPTION), requêtes préparées avec paramètres nommés/positionnels (prepare, execute, fetch, fetchAll).\n\n- Sécurité applicative de base : Prévention absolue des injections SQL (requêtes préparées obligatoires), neutralisation des failles XSS (htmlspecialchars), validation et nettoyage des données d'entrée (filter_var).\n\n- Opérations CRUD métier : Implémentation complète de la création, lecture, modification et suppression d'enregistrements liés en base.",
   "competencies": [
    "C5N2",
    "C6N1",
    "C7N1"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N2",
    "T9N2"
   ],
   "deliverables": "Code source PHP documenté sur GitHub, script d'export de la base de données .sql,  démo du CRUD fonctionnel."
  },
  {
   "n": 13,
   "start": "2026-12-28",
   "end": "2027-01-01",
   "kind": "brief",
   "sprint": 5,
   "brief": 9,
   "days": 5,
   "mode": "individuel",
   "title": "Refactorisation d’une application PHP procédurale vers la Programmation Orientée Objet (POO)",
   "objective": "Transformer une application existante en adoptant le paradigme orienté objet, en encapsulant l'état et les comportements dans des classes distinctes et en exploitant la syntaxe moderne de PHP 8.",
   "concepts": "- Syntaxe PHP 8.x moderne : Typage strict (declare(strict_types=1);), typage des arguments et des retours, types d'union, constructeurs promus, propriétés readonly, expression match.\n\n- Paradigme Objet fondamental : Définition de classes, instanciation d'objets, visibilité et encapsulation (private, protected, public), accesseurs (getters/setters), méthodes magiques (__construct, __toString).",
   "competencies": [
    "C5N2",
    "C6N2",
    "C7N2"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N2",
    "T9N2"
   ],
   "deliverables": "Dépôt GitHub comparatif avant/après refactorisation, code respectant les standards PSR-12."
  },
  {
   "n": 14,
   "start": "2027-01-04",
   "end": "2027-01-08",
   "kind": "brief",
   "sprint": 5,
   "brief": 10,
   "days": 5,
   "mode": "individuel",
   "title": "Conception du domaine métier avec héritage, interfaces et polymorphisme",
   "objective": "Modéliser et implémenter la logique métier complexe d'une application en appliquant les concepts avancés de la POO pour rendre le code extensible, réutilisable et résilient aux erreurs.",
   "concepts": "- Abstraction & Héritage : Spécialisation de classes via extends, surcharge de méthodes (parent::), classes et méthodes abstraites (abstract).\n\n- Contrats d'interface & Traits : Conception d'interfaces (implements) pour garantir les contrats d'échange, utilisation des traits pour le partage horizontal de code.\n\n- Polymorphisme : Manipulation d'objets à travers leurs types parents ou interfaces communes.\n\n- Gestion des exceptions : Création d'exceptions personnalisées (DomainException, NotFoundException), levée (throw) et capture ciblée (try...catch).",
   "competencies": [
    "C5N2",
    "C6N2",
    "C7N2"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N2",
    "T9N2"
   ],
   "deliverables": "Diagramme de classes UML du domaine métier, code PHP modulaire avec gestion fine des exceptions."
  },
  {
   "n": 15,
   "start": "2027-01-11",
   "end": "2027-01-15",
   "kind": "break",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Repos",
   "objective": "",
   "concepts": "Vacances",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 16,
   "start": "2027-01-18",
   "end": "2027-01-22",
   "kind": "brief",
   "sprint": 5,
   "brief": 11,
   "days": 5,
   "mode": "binôme",
   "title": "Structuration professionnelle avec Composer, Namespaces et couche Repository",
   "objective": "Structurer une application PHP orientée objet aux standards industriels en organisant le projet avec Composer (PSR-4), et en séparant la logique métier de la persistance des données via le pattern Repository.",
   "concepts": "- Gestionnaire de dépendances : Fichier composer.json, chargement automatique des classes (PSR-4 Autoloading), intégration de packages tiers (ex: vlucas/phpdotenv, fakerphp/faker).\n\n- Namespaces : Organisation logique des répertoires et espaces de noms (App\\Entity, App\\Repository, App\\Service).\n\n- Pattern Repository & PDO : Isolation des requêtes SQL au sein de classes de repositories dédiées, injection de l'instance PDO, mapping des lignes SQL en instances d'objets (Entity mapping).",
   "competencies": [
    "C5N2",
    "C6N2",
    "C7N2"
   ],
   "soft": [
    "T1N2",
    "T2N2",
    "T3N2",
    "T4N2",
    "T5N2",
    "T6N2",
    "T7N2",
    "T8N2",
    "T9N2"
   ],
   "deliverables": "Dépôt GitHub propre avec fichier .env.example, architecture Composer opérationnelle sans aucun require_once manuel."
  },
  {
   "n": 17,
   "start": "2027-01-25",
   "end": "2027-01-29",
   "kind": "brief",
   "sprint": 6,
   "brief": 12,
   "days": 5,
   "mode": "individuel",
   "title": "Implémentation d’une architecture MVC maison et d’un routeur HTTP",
   "objective": "Construire le squelette d'un framework PHP personnalisé basé sur le patron d'architecture MVC (Modèle - Vue - Contrôleur) avec un point d'entrée unique et un système de routage dynamique.",
   "concepts": "- Architecture MVC : Séparation étanche : le Modèle encapsule les données et règles métier, la Vue gère l'affichage, le Contrôleur orchestre la logique applicative.\n\n- Front Controller & Routing : Point d'entrée unique (index.php), configuration d'URL rewriting (.htaccess), conception d'une classe Router analysant l'URI et la méthode HTTP pour instancier le contrôleur et la méthode appropriés.\n\n- Rendu de vues : Système d'injection de données dans les templates et gestion d'un layout global partagé.",
   "competencies": [
    "C6N2",
    "C7N2"
   ],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "Dépôt GitHub contenant le core MVC fonctionnel avec plusieurs routes configurées."
  },
  {
   "n": 18,
   "start": "2027-02-01",
   "end": "2027-02-05",
   "kind": "brief",
   "sprint": 6,
   "brief": 13,
   "days": 5,
   "mode": "collectif",
   "title": "Développer et sécuriser une application MVC complète sous environnement Dockerisé",
   "objective": "Finaliser une application web métier MVC complète en intégrant la gestion des sessions, une politique de sécurité web stricte, le tout orchestré dans un environnement standardisé avec Docker.",
   "concepts": "- Sécurité Web avancée : Protection CSRF systématique via tokens uniques dans les formulaires, échappement contextuel contre les failles XSS, gestion de session sécurisée (régénération d'ID, httponly, samesite), hashage fort des mots de passe (Argon2id / Bcrypt).\n\n- Conteneurisation (Initiation Docker) : Écriture d'un Dockerfile et d'un docker-compose.yml orchestrant au minimum deux conteneurs (Serveur Web PHP/Nginx/Apache + Base de données MySQL/PostgreSQL).\n\n- Qualité du code : Gestion centralisée des erreurs et mise en place de logs d'activité, initiation de la logique métier.",
   "competencies": [
    "C6N2",
    "C7N2",
    "C8N1"
   ],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "Projet conteneurisé fonctionnel via docker compose up, dépôt GitHub collaboratif."
  },
  {
   "n": 19,
   "start": "2027-02-08",
   "end": "2027-02-12",
   "kind": "brief",
   "sprint": 7,
   "brief": 14,
   "days": 4,
   "mode": "individuel",
   "title": "Prise en main de Laravel : cycle de vie et refonte d’un module MVC",
   "objective": "Découvrir l'écosystème Laravel en transposant un module réalisé dans le sprint précédent afin de comprendre le cycle de traitement d'une requête HTTP, les commandes Artisan et le moteur de templates Blade.",
   "concepts": "- Écosystème & Cycle de vie : Utilisation de l'outil CLI php artisan, structure des répertoires Laravel, cycle requête-réponse (Request -> Route -> Controller -> View/Response).\n\n- Routing & Contrôleurs : Déclaration de routes nommées, contrôleurs simples et contrôleurs de ressources (--resource).\n\n- Moteur Blade : Création de layouts maîtres (@extends), sections (@section, @yield), directives conditionnelles (@if, @auth, @forelse) et composants réutilisables (<x-layout>, <x-button>).",
   "competencies": [
    "C1N2",
    "C6N2",
    "C7N2"
   ],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "Projet Laravel initialisé avec module Blade opérationnel, dépôt GitHub."
  },
  {
   "n": 20,
   "start": "2027-02-15",
   "end": "2027-02-19",
   "kind": "brief",
   "sprint": 7,
   "brief": 15,
   "days": 5,
   "mode": "individuel",
   "title": "Gestion avancée des données avec Migrations, Seeders et Eloquent ORM / Application web dockerized",
   "objective": "Concevoir une base de données relationnelle complexe et implémenter toute la logique métier d'accès aux données grâce à l'Active Record d'Eloquent et aux Form Requests.",
   "concepts": "- Base de données & Schémas : Écriture et exécution de Migrations ordonnées, génération de données de test massives avec Seeders et Model Factories (Faker).\n\n- Eloquent ORM & Relations : Modélisation des relations (hasOne, belongsTo, hasMany, belongsToMany), chargement lié pour éviter le problème N+1 (with(), Eager Loading), requêtes d'agrégation, Query Scopes locaux.\n\n- Validation & Form Requests : Création de classes dédiées FormRequest pour externaliser les règles de validation métier et personnaliser les messages d'erreur.",
   "competencies": [
    "C6N2",
    "C7N2",
    "C8N1"
   ],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "Migrations et seeders prêts à l'emploi (php artisan migrate --seed), CRUD complet et optimisé sur les modèles relationnels."
  },
  {
   "n": 21,
   "start": "2027-02-22",
   "end": "2027-02-26",
   "kind": "brief",
   "sprint": 7,
   "brief": 16,
   "days": 5,
   "mode": "binôme",
   "title": "Sécurisation, contrôle d’accès et intégration d’un service d’IA générative",
   "objective": "Implémenter une gestion robuste des profils et autorisations, puis enrichir l'application métier par l'intégration d'un modèle d'intelligence artificielle via un service dédié.",
   "concepts": "- Authentification & Rôles : Intégration de Laravel Breeze, personnalisation du flux d'authentification, middlewares de vérification (auth, verified).\n\n- Autorisations : Mise en œuvre de Gates et de Policies Laravel pour restreindre les actions (ex: modifier uniquement ses propres publications, panneau réservé aux admins).\n\n- Intégration d'un Service IA : Configuration sécurisée de clés d'API tierces (OpenAI / Gemini) dans .env et config/services.php, création d'une classe Service (App\\Services\\AiService) avec le client HTTP de Laravel (Http::withToken), rédaction de prompts système structurés, traitement et affichage de la réponse IA dans l'interface métier.",
   "competencies": [
    "C6N2",
    "C7N2",
    "C8N2"
   ],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "Application sécurisée avec rôles opérationnels et fonctionnalité alimentée par l'IA intégrée de bout en bout."
  },
  {
   "n": 22,
   "start": "2027-03-01",
   "end": "2027-03-05",
   "kind": "brief",
   "sprint": 7,
   "brief": 17,
   "days": 5,
   "mode": "individuel",
   "title": "Conception et développement d’une API REST stateless sécurisée avec Laravel Sanctum",
   "objective": "Exposer les données et actions métier de l'application sous forme d'une API RESTful normalisée, sans gestion de session (stateless), avec authentification basée sur les jetons (Tokens).",
   "concepts": "- Routes API & Contrôleurs : Fichier routes/api.php, contrôleurs API dédiés (--api), respect strict des conventions d'URL et des codes HTTP (200, 201, 204, 400, 401, 403, 404, 422).\n\n- Transformation des données : Utilisation systématique des API Resources (JsonResource, ResourceCollection) pour formater, filtrer et masquer les attributs sensibles.\n\n- Authentification Stateless : Configuration de Laravel Sanctum, émission de Personal Access Tokens à la connexion (createToken), révocation des tokens à la déconnexion, protection des routes via le middleware auth:sanctum.",
   "competencies": [
    "C6N2",
    "C7N2",
    "C8N2"
   ],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "API opérationnelle, collection Postman ou documentation Swagger/OpenAPI associée, dépôt GitHub."
  },
  {
   "n": 23,
   "start": "2027-03-08",
   "end": "2027-03-12",
   "kind": "break",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Repos",
   "objective": "",
   "concepts": "Vacances",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 24,
   "start": "2027-03-15",
   "end": "2027-03-19",
   "kind": "crossdefense",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Projet brief SC 2",
   "objective": "",
   "concepts": "",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 25,
   "start": "2027-03-22",
   "end": "2027-03-26",
   "kind": "crossdefense",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Soutenances croisées inter-groupes avec code review",
   "objective": "",
   "concepts": "",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 26,
   "start": "2027-03-29",
   "end": "2027-04-02",
   "kind": "brief",
   "sprint": 8,
   "brief": 18,
   "days": 5,
   "mode": "individuel",
   "title": "API REST métier avancée : filtres, pagination, documentation OpenAPI et IA",
   "objective": "Faire évoluer l'API Laravel vers un niveau d'exigence d'entreprise en intégrant la recherche multicritères, la pagination standardisée, les réponses JSON d'IA structurées, ainsi qu'une documentation interactive complète.",
   "concepts": "- Exploitation avancée des données : Filtrage dynamique par paramètres d'URL, tri ascendant/descendant, pagination des ressources Eloquent (paginate()).\n\n- IA & Structured Outputs : Consommation de l'API LLM en forçant une sortie en format JSON structuré (Schema JSON), validation du format retourné et parsing direct pour les besoins de l'API.\n\n- Normalisation des erreurs : Gestionnaire d'exceptions global pour renvoyer des réponses JSON d'erreur uniformes (format RFC 7807 ou standard API).\n\n- Documentation & Tests : Documentation complète avec OpenAPI / Swagger (via annotations ou packages dédiés type Scramble / L5-Swagger), collection de tests automatisés Postman ou tests d'API Laravel ($this->getJson()).",
   "competencies": [
    "C5N2",
    "C6N2",
    "C7N2",
    "C8N2"
   ],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "Documentation Swagger accessible en ligne, collection Postman partagée avec assertions de tests réussies."
  },
  {
   "n": 27,
   "start": "2027-04-05",
   "end": "2027-04-09",
   "kind": "brief",
   "sprint": 8,
   "brief": 19,
   "days": 5,
   "mode": "binôme",
   "title": "Développer une Single Page Application (SPA) React.js connectée à l’API Laravel",
   "objective": "Développer une interface utilisateur riche, moderne et réactive en React.js, consommant de bout en bout l'API REST développée en amont, avec gestion de l'authentification par token, navigation côté client et affichage temps réel.",
   "concepts": "- Fondamentaux React modernes : Composants fonctionnels, syntaxe JSX, gestion des propriétés (Props), typage et décomposition.\n\n- Gestion de l'État & Cycle de vie : Utilisation des Hooks fondamentaux (useState, useEffect), création de Hooks personnalisés (Custom Hooks pour les appels API).\n\nRoutage & Navigation : React Router DOM (routes protégées, redirection conditionnelle si non connecté).\n\nCommunication Backend & Auth : Client HTTP (Axios ou Fetch natif) configuré avec intercepteurs pour injecter automatiquement le token Bearer Sanctum, persistance du token dans le stockage local ou mémoire, gestion des statuts 401 (redirection vers login).\n\nUX / UI Réactive : Affichage asynchrone des flux (loaders, alertes toast, modales de confirmation), gestion des listes avec pagination et barre de recherche connectées aux endpoints Laravel.\n\nDéploiement & Collaboration : Gestion collaborative sur GitHub avec branches et Kanban, déploiement séparé (Backend sur VPS/PaaS et Frontend sur Vercel/Netlify) avec configuration adéquate des headers CORS côté Laravel.",
   "competencies": [
    "C3N2",
    "C4N2",
    "C5N2",
    "C6N2"
   ],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "Application Fullstack découplée en ligne (React + API Laravel), dépôts GitHub documentés (Front et Back), vidéo de démonstration du parcours utilisateur complet."
  },
  {
   "n": 28,
   "start": "2027-04-12",
   "end": "2027-04-16",
   "kind": "brief",
   "sprint": 8,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "IA Engineering, appel API LLM avec réponses JSON",
   "objective": "Projet Fullstack IA",
   "concepts": "Sprint",
   "competencies": [],
   "soft": [
    "T1N3",
    "T2N3",
    "T3N3",
    "T4N3",
    "T5N3",
    "T6N3",
    "T7N3",
    "T8N3",
    "T9N3"
   ],
   "deliverables": "C3, C4, C5, C6, C7, C8"
  },
  {
   "n": 29,
   "start": "2027-04-19",
   "end": "2027-04-23",
   "kind": "certification",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Passage et soutenance jury",
   "objective": "",
   "concepts": "",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 30,
   "start": "2027-04-26",
   "end": "2027-04-30",
   "kind": "certification",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Passage et soutenance jury",
   "objective": "",
   "concepts": "",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 31,
   "start": "2027-05-03",
   "end": "2027-05-07",
   "kind": "other",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Finalisation et clôture (30/04)",
   "objective": "",
   "concepts": "",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  },
  {
   "n": 31,
   "start": "2027-05-03",
   "end": "2027-05-07",
   "kind": "other",
   "sprint": null,
   "brief": null,
   "days": null,
   "mode": "individuel",
   "title": "Démarrage stage en entreprise",
   "objective": "",
   "concepts": "",
   "competencies": [],
   "soft": [],
   "deliverables": ""
  }
 ]
};
