"""Git multiple-choice questions, English + French.

Each item: slug, difficulty, optional shell snippet (`code`), and en/fr dicts
with title, question, 4 choices, answer letter, explanation, hint.
Choices are in the same order in both languages, so the answer letter is shared.
Targets modern Git (2.40+); `git switch`/`git restore` and `git checkout` are both accepted.
"""

GIT = [
    # =================================================================== EASY
    dict(
        slug="git-clone-vs-init", difficulty="easy",
        code=None,
        en=dict(
            title="Getting an existing project",
            question="Your teacher shares `https://github.com/acme/shop.git`. You want a local copy with the full history and a remote already configured. Which command do you run?",
            choices=[
                "`git init https://github.com/acme/shop.git`",
                "`git clone https://github.com/acme/shop.git`",
                "`git pull https://github.com/acme/shop.git` in a new empty folder",
                "`git remote add origin https://github.com/acme/shop.git` in a new empty folder",
            ],
            answer="B",
            explanation="`git clone` downloads all commits, checks out the default branch and configures the remote as `origin`. `git init` creates a new empty repository, and `pull`/`remote add` need an existing repository (and `remote add` downloads nothing).",
            hint="One command creates the repository, downloads the history and sets up `origin`.",
        ),
        fr=dict(
            title="Récupérer un projet existant",
            question="Votre enseignant partage `https://github.com/acme/shop.git`. Vous voulez une copie locale avec tout l'historique et un dépôt distant déjà configuré. Quelle commande lancez-vous ?",
            choices=[
                "`git init https://github.com/acme/shop.git`",
                "`git clone https://github.com/acme/shop.git`",
                "`git pull https://github.com/acme/shop.git` dans un nouveau dossier vide",
                "`git remote add origin https://github.com/acme/shop.git` dans un nouveau dossier vide",
            ],
            answer="B",
            explanation="`git clone` télécharge tous les commits, extrait la branche par défaut et configure le dépôt distant sous le nom `origin`. `git init` crée un dépôt vide, et `pull`/`remote add` exigent un dépôt existant (et `remote add` ne télécharge rien).",
            hint="Une seule commande crée le dépôt, télécharge l'historique et configure `origin`.",
        ),
    ),
    dict(
        slug="git-commit-untracked", difficulty="easy",
        code="""$ git status
On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
        notes.txt

nothing added to commit but untracked files present (use "git add" to track)
$ git commit -m "Add notes\"""",
        en=dict(
            title="Committing an untracked file",
            question="What happens when you run the last command?",
            choices=[
                "A commit containing `notes.txt` is created: Git stages new files automatically.",
                "An empty commit is created with the message \"Add notes\".",
                "No commit is created: `notes.txt` must first be staged with `git add notes.txt`.",
                "Git opens a prompt asking which files to include in the commit.",
            ],
            answer="C",
            explanation="`git commit` only records what is in the staging area, which is empty here, so Git prints \"nothing added to commit\" and creates nothing. Even `git commit -a` ignores untracked files.",
            hint="Look at the last line of `git status`.",
        ),
        fr=dict(
            title="Commiter un fichier non suivi",
            question="Que se passe-t-il quand vous lancez la dernière commande ?",
            choices=[
                "Un commit contenant `notes.txt` est créé : Git indexe automatiquement les nouveaux fichiers.",
                "Un commit vide est créé avec le message « Add notes ».",
                "Aucun commit n'est créé : il faut d'abord indexer `notes.txt` avec `git add notes.txt`.",
                "Git ouvre une invite demandant quels fichiers inclure dans le commit.",
            ],
            answer="C",
            explanation="`git commit` n'enregistre que le contenu de la zone d'index (staging), vide ici : Git affiche « nothing added to commit » et ne crée rien. Même `git commit -a` ignore les fichiers non suivis.",
            hint="Regardez la dernière ligne de `git status`.",
        ),
    ),
    dict(
        slug="git-staging-snapshot", difficulty="easy",
        code="""$ echo "v1" > app.txt
$ git add app.txt
$ echo "v2" > app.txt
$ git commit -m "Update app\"""",
        en=dict(
            title="What does the commit contain?",
            question="What content of `app.txt` is saved in the new commit?",
            choices=[
                "`v1`",
                "`v2`",
                "Nothing: the commit fails because `app.txt` changed after `git add`.",
                "Both lines, `v1` and `v2`.",
            ],
            answer="A",
            explanation="`git add` copies the file's content into the staging area at that moment; the commit records the staged `v1`. The later `v2` stays only in the working tree and shows as modified in `git status`.",
            hint="`git add` takes a snapshot; it does not keep watching the file.",
        ),
        fr=dict(
            title="Que contient le commit ?",
            question="Quel contenu de `app.txt` est enregistré dans le nouveau commit ?",
            choices=[
                "`v1`",
                "`v2`",
                "Rien : le commit échoue car `app.txt` a changé après `git add`.",
                "Les deux lignes, `v1` et `v2`.",
            ],
            answer="A",
            explanation="`git add` copie le contenu du fichier dans l'index à cet instant ; le commit enregistre la version indexée `v1`. Le `v2` ultérieur reste dans le répertoire de travail et apparaît comme modifié dans `git status`.",
            hint="`git add` prend une photo du fichier ; il ne continue pas à le surveiller.",
        ),
    ),
    dict(
        slug="git-gitignore-tracked", difficulty="easy",
        code="""$ git ls-files
.env
index.php
$ echo ".env" >> .gitignore
$ echo "DB_PASS=new" >> .env
$ git status --short
 M .env
?? .gitignore""",
        en=dict(
            title=".gitignore does not work?",
            question="`.env` is in `.gitignore`, yet Git still reports it as modified. Why, and what fixes it?",
            choices=[
                "`.gitignore` only takes effect once it is committed: commit it and `.env` will disappear from the status.",
                "The pattern is wrong: it must be written `*.env` to match a file starting with a dot.",
                "`.gitignore` must be staged with `git add .gitignore`; after that `.env` is ignored.",
                "`.gitignore` only applies to untracked files; run `git rm --cached .env` and commit to stop tracking it.",
            ],
            answer="D",
            explanation="Ignore rules never apply to files that are already tracked. `git rm --cached .env` removes it from the index (keeping your local file), and from the next commit on Git ignores it.",
            hint="Look at `git ls-files`: is `.env` already tracked?",
        ),
        fr=dict(
            title=".gitignore ne marche pas ?",
            question="`.env` est dans `.gitignore`, pourtant Git le signale encore comme modifié. Pourquoi, et comment corriger ?",
            choices=[
                "`.gitignore` ne prend effet qu'une fois commité : commitez-le et `.env` disparaîtra du statut.",
                "Le motif est faux : il faut écrire `*.env` pour un fichier qui commence par un point.",
                "Il faut indexer `.gitignore` avec `git add .gitignore` ; ensuite `.env` est ignoré.",
                "`.gitignore` ne s'applique qu'aux fichiers non suivis ; lancez `git rm --cached .env` puis commitez pour arrêter de le suivre.",
            ],
            answer="D",
            explanation="Les règles d'ignore ne s'appliquent jamais aux fichiers déjà suivis. `git rm --cached .env` le retire de l'index (le fichier local est conservé) et, à partir du commit suivant, Git l'ignore.",
            hint="Regardez `git ls-files` : `.env` est-il déjà suivi ?",
        ),
    ),
    dict(
        slug="git-log-oneline", difficulty="easy",
        code="""$ git log --oneline
a3f9c21 (HEAD -> main) Fix login redirect
7b21e04 Add login form
c0d4e88 Initial commit""",
        en=dict(
            title="Reading git log",
            question="Which statement about this output is correct?",
            choices=[
                "`c0d4e88` is the most recent commit, because `git log` lists the oldest first.",
                "`a3f9c21` is the newest commit on `main`, and `HEAD` points to it.",
                "`7b21e04` is the parent of `c0d4e88`.",
                "`a3f9c21` is the complete identifier of the commit.",
            ],
            answer="B",
            explanation="`git log` lists newest first, and `(HEAD -> main)` marks where `main` and `HEAD` are. The 7-character codes are abbreviations of 40-character hashes, and `c0d4e88` is the parent of `7b21e04`, not the reverse.",
            hint="Where is `HEAD`?",
        ),
        fr=dict(
            title="Lire git log",
            question="Quelle affirmation sur cette sortie est correcte ?",
            choices=[
                "`c0d4e88` est le commit le plus récent, car `git log` affiche d'abord le plus ancien.",
                "`a3f9c21` est le commit le plus récent de `main`, et `HEAD` pointe dessus.",
                "`7b21e04` est le parent de `c0d4e88`.",
                "`a3f9c21` est l'identifiant complet du commit.",
            ],
            answer="B",
            explanation="`git log` affiche le plus récent en premier, et `(HEAD -> main)` indique où sont `main` et `HEAD`. Les codes de 7 caractères abrègent des hachages de 40 caractères, et `c0d4e88` est le parent de `7b21e04`, pas l'inverse.",
            hint="Où se trouve `HEAD` ?",
        ),
    ),
    dict(
        slug="git-switch-create", difficulty="easy",
        code=None,
        en=dict(
            title="New branch and move onto it",
            question="The branch `feature/cart` does not exist yet. Which single command creates it from your current commit and switches to it?",
            choices=[
                "`git branch feature/cart`",
                "`git switch feature/cart`",
                "`git branch -m feature/cart`",
                "`git switch -c feature/cart` (or `git checkout -b feature/cart`)",
            ],
            answer="D",
            explanation="`-c` (create) with `switch`, or `-b` with `checkout`, creates the branch and moves onto it. `git branch` only creates it without switching, `git switch` alone fails on a branch that doesn't exist, and `git branch -m` renames the current branch.",
            hint="You need an option meaning \"create\".",
        ),
        fr=dict(
            title="Créer une branche et y aller",
            question="La branche `feature/cart` n'existe pas encore. Quelle commande unique la crée à partir du commit actuel et bascule dessus ?",
            choices=[
                "`git branch feature/cart`",
                "`git switch feature/cart`",
                "`git branch -m feature/cart`",
                "`git switch -c feature/cart` (ou `git checkout -b feature/cart`)",
            ],
            answer="D",
            explanation="`-c` (create) avec `switch`, ou `-b` avec `checkout`, crée la branche et bascule dessus. `git branch` la crée sans changer de branche, `git switch` seul échoue sur une branche inexistante, et `git branch -m` renomme la branche courante.",
            hint="Il faut une option qui signifie « créer ».",
        ),
    ),
    dict(
        slug="git-remote-origin", difficulty="easy",
        code="""$ git remote -v
origin  https://github.com/sara/blog.git (fetch)
origin  https://github.com/sara/blog.git (push)""",
        en=dict(
            title="What is origin?",
            question="What is `origin` in this output?",
            choices=[
                "A short name for the remote repository (the one you cloned from by default); it is just a name and can be renamed.",
                "The name of the main branch on GitHub.",
                "The first commit of the repository.",
                "A protected copy of the project that Git keeps inside the `.git` folder.",
            ],
            answer="A",
            explanation="`origin` is the default alias `git clone` gives to the remote URL; commands like `git push origin main` use it. Branches are things like `main`, and `origin/main` is your local record of the remote's `main`.",
            hint="`git remote` lists remotes, not branches or commits.",
        ),
        fr=dict(
            title="C'est quoi origin ?",
            question="Que représente `origin` dans cette sortie ?",
            choices=[
                "Un nom court pour le dépôt distant (par défaut celui que vous avez cloné) ; ce n'est qu'un nom, renommable.",
                "Le nom de la branche principale sur GitHub.",
                "Le premier commit du dépôt.",
                "Une copie protégée du projet que Git garde dans le dossier `.git`.",
            ],
            answer="A",
            explanation="`origin` est l'alias que `git clone` donne par défaut à l'URL distante ; des commandes comme `git push origin main` l'utilisent. Les branches sont `main` etc., et `origin/main` est votre copie locale de l'état du `main` distant.",
            hint="`git remote` liste des dépôts distants, pas des branches ni des commits.",
        ),
    ),
    dict(
        slug="git-diff-staged", difficulty="easy",
        code="""$ git status --short
M  style.css
$ git diff
$""",
        en=dict(
            title="Empty git diff",
            question="You edited `style.css` and ran `git add style.css`. Now `git diff` prints nothing. Why?",
            choices=[
                "`git add` failed, so Git sees no change.",
                "`git diff` only shows committed changes; use `git log -p` instead.",
                "`git diff` compares the working tree with the staging area; staged changes are shown by `git diff --staged` (or `--cached`).",
                "`git diff` needs a file name: `git diff style.css` would show the change.",
            ],
            answer="C",
            explanation="Since the working tree and the index are identical, `git diff` is empty. `git diff --staged` compares the index with the last commit, which is what will go into the next commit.",
            hint="The `M` is in the first column of `git status --short`: staged.",
        ),
        fr=dict(
            title="git diff vide",
            question="Vous avez modifié `style.css` puis lancé `git add style.css`. Maintenant `git diff` n'affiche rien. Pourquoi ?",
            choices=[
                "`git add` a échoué, donc Git ne voit aucun changement.",
                "`git diff` ne montre que les changements commités ; utilisez plutôt `git log -p`.",
                "`git diff` compare le répertoire de travail à l'index ; les changements indexés s'affichent avec `git diff --staged` (ou `--cached`).",
                "`git diff` a besoin d'un nom de fichier : `git diff style.css` afficherait le changement.",
            ],
            answer="C",
            explanation="Le répertoire de travail et l'index étant identiques, `git diff` est vide. `git diff --staged` compare l'index au dernier commit, c'est-à-dire ce qui partira dans le prochain commit.",
            hint="Le `M` est dans la première colonne de `git status --short` : indexé.",
        ),
    ),
    # ================================================================= MEDIUM
    dict(
        slug="git-merge-fast-forward", difficulty="medium",
        code="""$ git log --oneline --graph --all
* 9e1d2f3 (feature) Add search
* 51ab7c0 Add search form
* 3c8e4a1 (HEAD -> main) Initial layout
$ git merge feature""",
        en=dict(
            title="Fast-forward merge",
            question="`main` has no commits of its own since `feature` was created. What does `git merge feature` do?",
            choices=[
                "A fast-forward: `main` simply moves to `9e1d2f3`; no merge commit is created.",
                "It creates a merge commit with two parents, `3c8e4a1` and `9e1d2f3`.",
                "It copies the two `feature` commits onto `main` as new commits with new hashes.",
                "It stops with a conflict, because both branches contain the file being changed.",
            ],
            answer="A",
            explanation="When the current branch is an ancestor of the other, Git just moves the branch pointer forward (\"Fast-forward\"). A merge commit is only needed when both branches have diverged (or with `--no-ff`).",
            hint="Is there anything on `main` that `feature` doesn't already contain?",
        ),
        fr=dict(
            title="Fusion en avance rapide",
            question="`main` n'a aucun commit propre depuis la création de `feature`. Que fait `git merge feature` ?",
            choices=[
                "Une avance rapide (fast-forward) : `main` avance simplement jusqu'à `9e1d2f3` ; aucun commit de fusion n'est créé.",
                "Il crée un commit de fusion à deux parents, `3c8e4a1` et `9e1d2f3`.",
                "Il copie les deux commits de `feature` sur `main` en nouveaux commits avec de nouveaux hachages.",
                "Il s'arrête sur un conflit, car les deux branches contiennent le fichier modifié.",
            ],
            answer="A",
            explanation="Quand la branche courante est un ancêtre de l'autre, Git avance simplement le pointeur de branche (« Fast-forward »). Un commit de fusion n'est nécessaire que si les branches ont divergé (ou avec `--no-ff`).",
            hint="Y a-t-il sur `main` quelque chose que `feature` ne contient pas déjà ?",
        ),
    ),
    dict(
        slug="git-merge-conflict", difficulty="medium",
        code="""$ git switch main
$ git merge feature
Auto-merging index.html
CONFLICT (content): Merge conflict in index.html
Automatic merge failed; fix conflicts and then commit the result.
$ cat index.html
<<<<<<< HEAD
<h1>Welcome</h1>
=======
<h1>Hello there</h1>
>>>>>>> feature""",
        en=dict(
            title="Reading conflict markers",
            question="Which statement is correct?",
            choices=[
                "The part above `=======` comes from `feature`, the part below from `main`.",
                "The part above `=======` is `main`'s version (HEAD), the part below is `feature`'s; edit the file to the final content, remove the markers, `git add index.html`, then `git commit` (or `git merge --continue`).",
                "Git already kept HEAD's version; the markers are comments the browser ignores, so you can commit as is.",
                "Remove the markers, then run `git merge feature` again to finish the merge.",
            ],
            answer="B",
            explanation="`<<<<<<< HEAD` opens your current branch's version, `=======` separates it from the incoming branch's version, closed by `>>>>>>> feature`. Marking the file resolved with `git add` and committing concludes the merge.",
            hint="HEAD is the branch you are on.",
        ),
        fr=dict(
            title="Lire les marqueurs de conflit",
            question="Quelle affirmation est correcte ?",
            choices=[
                "La partie au-dessus de `=======` vient de `feature`, celle du dessous de `main`.",
                "La partie au-dessus de `=======` est la version de `main` (HEAD), celle du dessous celle de `feature` ; éditez le fichier pour obtenir le contenu final, retirez les marqueurs, `git add index.html`, puis `git commit` (ou `git merge --continue`).",
                "Git a déjà gardé la version de HEAD ; les marqueurs sont des commentaires ignorés par le navigateur, on peut commiter tel quel.",
                "Retirez les marqueurs, puis relancez `git merge feature` pour terminer la fusion.",
            ],
            answer="B",
            explanation="`<<<<<<< HEAD` ouvre la version de la branche courante, `=======` la sépare de la version de la branche fusionnée, fermée par `>>>>>>> feature`. Marquer le fichier résolu avec `git add` puis commiter termine la fusion.",
            hint="HEAD, c'est la branche sur laquelle vous êtes.",
        ),
    ),
    dict(
        slug="git-pull-fetch-merge", difficulty="medium",
        code=None,
        en=dict(
            title="What git pull really does",
            question="On branch `main` (tracking `origin/main`), what does `git pull` do?",
            choices=[
                "It only downloads new commits into `origin/main`; your branch and files are not changed.",
                "It replaces your local `main` with the remote one, discarding your local commits.",
                "It downloads and merges every remote branch into your current branch.",
                "It runs `git fetch`, then integrates `origin/main` into your current branch (a fast-forward or merge, or a rebase with `--rebase`).",
            ],
            answer="D",
            explanation="`git pull` = `git fetch` + integration of the upstream branch. Fetch alone is the first choice; discarding local work would be `git reset --hard origin/main`.",
            hint="Two commands in one.",
        ),
        fr=dict(
            title="Ce que fait vraiment git pull",
            question="Sur la branche `main` (qui suit `origin/main`), que fait `git pull` ?",
            choices=[
                "Il télécharge seulement les nouveaux commits dans `origin/main` ; votre branche et vos fichiers ne changent pas.",
                "Il remplace votre `main` local par celui du distant, en jetant vos commits locaux.",
                "Il télécharge et fusionne toutes les branches distantes dans votre branche courante.",
                "Il lance `git fetch`, puis intègre `origin/main` dans votre branche courante (avance rapide ou fusion, ou un rebase avec `--rebase`).",
            ],
            answer="D",
            explanation="`git pull` = `git fetch` + intégration de la branche amont. Le fetch seul correspond au premier choix ; jeter le travail local serait `git reset --hard origin/main`.",
            hint="Deux commandes en une.",
        ),
    ),
    dict(
        slug="git-push-rejected", difficulty="medium",
        code="""$ git push origin main
To https://github.com/team/api.git
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to 'https://github.com/team/api.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. [...] use 'git pull' before pushing again.""",
        en=dict(
            title="Push rejected",
            question="A teammate pushed to `main` before you. What is the right next step?",
            choices=[
                "`git push --force origin main`, since your version is the most recent.",
                "Make another commit, then push again.",
                "`git pull` (fetch + merge or rebase), resolve any conflicts, then `git push` again.",
                "Delete your folder, clone the repository again and copy your files back.",
            ],
            answer="C",
            explanation="The push is not a fast-forward of the remote branch, so Git refuses it. Integrating the remote commits first makes your push a fast-forward; `--force` would erase your teammate's commits from the remote.",
            hint="The remote has commits you don't have locally.",
        ),
        fr=dict(
            title="Push refusé",
            question="Un coéquipier a poussé sur `main` avant vous. Quelle est la bonne étape suivante ?",
            choices=[
                "`git push --force origin main`, puisque votre version est la plus récente.",
                "Faire un autre commit, puis pousser à nouveau.",
                "`git pull` (fetch + fusion ou rebase), résoudre les éventuels conflits, puis `git push` à nouveau.",
                "Supprimer le dossier, recloner le dépôt et recopier vos fichiers.",
            ],
            answer="C",
            explanation="Le push n'est pas une avance rapide de la branche distante, donc Git le refuse. Intégrer d'abord les commits distants rend le push possible ; `--force` effacerait les commits du coéquipier sur le distant.",
            hint="Le distant contient des commits que vous n'avez pas en local.",
        ),
    ),
    dict(
        slug="git-commit-amend", difficulty="medium",
        code="""$ git commit -m "Add contcat page"
$ # oops: typo in the message, and config.php was forgotten (nothing pushed yet)""",
        en=dict(
            title="Fixing the last commit",
            question="Which sequence replaces the last commit with one that includes `config.php` and has the corrected message?",
            choices=[
                "`git add config.php` then `git commit --amend -m \"Add contact page\"`",
                "`git commit --amend -m \"Add contact page\"` then `git add config.php`",
                "`git revert HEAD` then `git commit -m \"Add contact page\"`",
                "`git add config.php` then `git commit -m \"Add contact page\"`",
            ],
            answer="A",
            explanation="`--amend` builds a new commit from the current index with the new message and replaces the previous one (new hash), so the file must be staged first. A plain commit or a revert adds commits instead of replacing it.",
            hint="Order matters: what is in the index when you amend?",
        ),
        fr=dict(
            title="Corriger le dernier commit",
            question="Quelle séquence remplace le dernier commit par un commit qui inclut `config.php` avec le message corrigé ?",
            choices=[
                "`git add config.php` puis `git commit --amend -m \"Add contact page\"`",
                "`git commit --amend -m \"Add contact page\"` puis `git add config.php`",
                "`git revert HEAD` puis `git commit -m \"Add contact page\"`",
                "`git add config.php` puis `git commit -m \"Add contact page\"`",
            ],
            answer="A",
            explanation="`--amend` construit un nouveau commit à partir de l'index actuel avec le nouveau message et remplace le précédent (nouveau hachage) : le fichier doit donc être indexé avant. Un commit simple ou un revert ajoutent des commits au lieu de le remplacer.",
            hint="L'ordre compte : que contient l'index au moment de l'amend ?",
        ),
    ),
    dict(
        slug="git-restore-file", difficulty="medium",
        code="""$ git status --short
 M routes/web.php""",
        en=dict(
            title="Discard changes to a file",
            question="Your edits to `routes/web.php` (not staged) broke everything. Which command puts the file back to its last committed version?",
            choices=[
                "`git reset routes/web.php`",
                "`git restore routes/web.php` (or `git checkout -- routes/web.php`)",
                "`git revert routes/web.php`",
                "`git rm routes/web.php`",
            ],
            answer="B",
            explanation="`git restore <file>` overwrites the working-tree file with the index version (here equal to the last commit); the changes are lost. `git reset <file>` only unstages, `git revert` takes commits not files, and `git rm` deletes the file.",
            hint="Which command was introduced specifically to restore files?",
        ),
        fr=dict(
            title="Annuler les modifications d'un fichier",
            question="Vos modifications de `routes/web.php` (non indexées) ont tout cassé. Quelle commande remet le fichier dans sa dernière version commitée ?",
            choices=[
                "`git reset routes/web.php`",
                "`git restore routes/web.php` (ou `git checkout -- routes/web.php`)",
                "`git revert routes/web.php`",
                "`git rm routes/web.php`",
            ],
            answer="B",
            explanation="`git restore <fichier>` écrase le fichier du répertoire de travail avec la version de l'index (ici identique au dernier commit) ; les modifications sont perdues. `git reset <fichier>` désindexe seulement, `git revert` prend des commits et non des fichiers, et `git rm` supprime le fichier.",
            hint="Quelle commande a été créée spécialement pour restaurer des fichiers ?",
        ),
    ),
    dict(
        slug="git-stash", difficulty="medium",
        code="""$ git switch main
error: Your local changes to the following files would be overwritten by checkout:
        app/Http/Controllers/CartController.php
Please commit your changes or stash them before you switch branches.
$ git stash
$ git switch main
$ # ... urgent fix, commit ...
$ git switch feature/cart
$ git stash pop""",
        en=dict(
            title="Putting work aside",
            question="Which statement about `git stash` / `git stash pop` is correct?",
            choices=[
                "`git stash` makes a normal commit on the current branch, visible in `git log`.",
                "`git stash` also saves untracked (new) files by default.",
                "`git stash pop` reapplies the changes but keeps the entry in the stash list.",
                "`git stash` saves your modifications to tracked files and cleans the working tree; `git stash pop` reapplies them and removes the entry from the stash list.",
            ],
            answer="D",
            explanation="Stash stores changes outside any branch. Untracked files need `-u`, and keeping the entry after reapplying is `git stash apply`; `pop` drops it (unless it conflicts).",
            hint="Compare `pop` and `apply`.",
        ),
        fr=dict(
            title="Mettre son travail de côté",
            question="Quelle affirmation sur `git stash` / `git stash pop` est correcte ?",
            choices=[
                "`git stash` fait un commit normal sur la branche courante, visible dans `git log`.",
                "`git stash` sauvegarde aussi par défaut les fichiers non suivis (nouveaux).",
                "`git stash pop` réapplique les modifications mais garde l'entrée dans la liste du stash.",
                "`git stash` sauvegarde vos modifications des fichiers suivis et nettoie le répertoire de travail ; `git stash pop` les réapplique et retire l'entrée de la liste.",
            ],
            answer="D",
            explanation="Le stash stocke les modifications hors de toute branche. Les fichiers non suivis demandent `-u`, et garder l'entrée après réapplication, c'est `git stash apply` ; `pop` la supprime (sauf en cas de conflit).",
            hint="Comparez `pop` et `apply`.",
        ),
    ),
    dict(
        slug="git-tag-push", difficulty="medium",
        code="""$ git tag -a v1.0 -m "First release"
$ git push
Everything up-to-date""",
        en=dict(
            title="Where is my tag?",
            question="Your teammate doesn't see `v1.0` on GitHub. Why?",
            choices=[
                "Annotated tags (`-a`) stay local; only lightweight tags are pushed.",
                "A tag only appears on GitHub after you create a Release in the web interface.",
                "`git push` does not send tags by default; run `git push origin v1.0` (or `git push --tags`).",
                "The tag must be created on a branch named `release` to be pushed.",
            ],
            answer="C",
            explanation="Tags are pushed explicitly, by name or with `--tags` (or `--follow-tags` for annotated tags). Annotated tags are actually the recommended kind for releases.",
            hint="\"Everything up-to-date\" talks about branches.",
        ),
        fr=dict(
            title="Où est mon tag ?",
            question="Votre coéquipier ne voit pas `v1.0` sur GitHub. Pourquoi ?",
            choices=[
                "Les tags annotés (`-a`) restent locaux ; seuls les tags légers sont poussés.",
                "Un tag n'apparaît sur GitHub qu'après avoir créé une Release dans l'interface web.",
                "`git push` n'envoie pas les tags par défaut ; lancez `git push origin v1.0` (ou `git push --tags`).",
                "Le tag doit être créé sur une branche nommée `release` pour être poussé.",
            ],
            answer="C",
            explanation="Les tags se poussent explicitement, par leur nom ou avec `--tags` (ou `--follow-tags` pour les tags annotés). Les tags annotés sont d'ailleurs ceux recommandés pour les versions.",
            hint="« Everything up-to-date » parle des branches.",
        ),
    ),
    dict(
        slug="git-branch-delete-unmerged", difficulty="medium",
        code="""$ git branch -d experiment
error: the branch 'experiment' is not fully merged.
If you are sure you want to delete it, run 'git branch -D experiment'""",
        en=dict(
            title="Branch not fully merged",
            question="What does this error mean?",
            choices=[
                "You cannot delete `experiment` because it is the branch currently checked out.",
                "`experiment` has commits that are not in your current branch (or its upstream); `-d` refuses so you don't lose them, `-D` forces the deletion.",
                "A branch can only be deleted after merging it into `main`; there is no other way.",
                "`git branch -D` would also delete those commits from `main` and every other branch.",
            ],
            answer="B",
            explanation="`-d` is the safe delete. After `-D`, the unmerged commits are no longer on any branch (still recoverable for a while via `git reflog`), but other branches are not touched.",
            hint="\"Not fully merged\" is about commits that would become unreachable.",
        ),
        fr=dict(
            title="Branche non fusionnée",
            question="Que signifie cette erreur ?",
            choices=[
                "On ne peut pas supprimer `experiment` car c'est la branche actuellement extraite.",
                "`experiment` contient des commits absents de votre branche courante (ou de son amont) ; `-d` refuse pour ne pas les perdre, `-D` force la suppression.",
                "Une branche ne peut être supprimée qu'après l'avoir fusionnée dans `main` ; il n'y a pas d'autre moyen.",
                "`git branch -D` supprimerait aussi ces commits de `main` et de toutes les autres branches.",
            ],
            answer="B",
            explanation="`-d` est la suppression prudente. Après `-D`, les commits non fusionnés ne sont plus sur aucune branche (récupérables un temps via `git reflog`), mais les autres branches ne sont pas touchées.",
            hint="« Not fully merged » concerne des commits qui deviendraient inaccessibles.",
        ),
    ),
    # =================================================================== HARD
    dict(
        slug="git-undo-reset-revert", difficulty="hard",
        code="""$ git log --oneline
e81b4c2 (HEAD -> main, origin/main) Break checkout total
5d0a9f7 Add discount codes""",
        en=dict(
            title="Undoing a pushed commit",
            question="`e81b4c2` is buggy and teammates have already pulled it. Which statement is correct?",
            choices=[
                "`git revert HEAD` adds a new commit that undoes `e81b4c2`, so it is the safe choice on this shared branch; both `reset` variants rewrite history.",
                "`git reset --soft HEAD~1` removes the commit and its changes from your files.",
                "`git reset --hard HEAD~1` moves `main` back but keeps the changes staged.",
                "`git revert HEAD` deletes `e81b4c2` from history, so you then need `git push --force`.",
            ],
            answer="A",
            explanation="`--soft` moves the branch back and keeps the changes staged, `--hard` also discards them; both rewrite history and would need a force push. `revert` only adds a commit, so a normal push works for everyone.",
            hint="On a shared branch, add commits rather than remove them.",
        ),
        fr=dict(
            title="Annuler un commit déjà poussé",
            question="`e81b4c2` est bogué et vos coéquipiers l'ont déjà récupéré. Quelle affirmation est correcte ?",
            choices=[
                "`git revert HEAD` ajoute un nouveau commit qui annule `e81b4c2` : c'est le choix sûr sur cette branche partagée ; les deux variantes de `reset` réécrivent l'historique.",
                "`git reset --soft HEAD~1` supprime le commit et ses modifications de vos fichiers.",
                "`git reset --hard HEAD~1` recule `main` mais garde les modifications indexées.",
                "`git revert HEAD` supprime `e81b4c2` de l'historique, il faut donc ensuite `git push --force`.",
            ],
            answer="A",
            explanation="`--soft` recule la branche en gardant les modifications indexées, `--hard` les jette aussi ; les deux réécrivent l'historique et exigeraient un push forcé. `revert` ajoute seulement un commit, donc un push normal fonctionne pour tous.",
            hint="Sur une branche partagée, on ajoute des commits plutôt que d'en retirer.",
        ),
    ),
    dict(
        slug="git-rebase-vs-merge", difficulty="hard",
        code="""$ git switch feature
$ git rebase main""",
        en=dict(
            title="Rebase vs merge",
            question="Compared with `git merge main`, which statement about `git rebase main` is correct?",
            choices=[
                "It adds `feature`'s commits to the end of `main`, so `main` moves forward.",
                "It keeps the same commit hashes, so `feature` can be pushed afterwards without `--force` even if it was already pushed.",
                "It replays `feature`'s commits on top of `main` as new commits (new hashes), giving a linear history; avoid it on commits others already use.",
                "Merge rewrites history while rebase preserves it, which is why rebase is safer on shared branches.",
            ],
            answer="C",
            explanation="Rebase rewrites `feature`'s commits onto the tip of `main`; only `feature` moves. Because the old commits are replaced, an already-pushed `feature` needs a force push, which is why it is risky on shared branches. Merge keeps history and adds a merge commit.",
            hint="Rebase = copy commits onto a new base.",
        ),
        fr=dict(
            title="Rebase ou merge",
            question="Par rapport à `git merge main`, quelle affirmation sur `git rebase main` est correcte ?",
            choices=[
                "Il ajoute les commits de `feature` à la fin de `main`, donc `main` avance.",
                "Il garde les mêmes hachages de commits, donc `feature` peut être poussée ensuite sans `--force` même si elle l'avait déjà été.",
                "Il rejoue les commits de `feature` par-dessus `main` en nouveaux commits (nouveaux hachages), pour un historique linéaire ; à éviter sur des commits déjà utilisés par d'autres.",
                "Merge réécrit l'historique alors que rebase le préserve, c'est pourquoi rebase est plus sûr sur les branches partagées.",
            ],
            answer="C",
            explanation="Le rebase réécrit les commits de `feature` au sommet de `main` ; seule `feature` bouge. Les anciens commits étant remplacés, une `feature` déjà poussée exige un push forcé, d'où le risque sur les branches partagées. Merge conserve l'historique et ajoute un commit de fusion.",
            hint="Rebase = copier des commits sur une nouvelle base.",
        ),
    ),
    dict(
        slug="git-detached-head", difficulty="hard",
        code="""$ git checkout 7b21e04
Note: switching to '7b21e04'.
You are in 'detached HEAD' state. [...]
$ git commit -am "Try fix"
$ git switch main
Warning: you are leaving 1 commit behind, not connected to
any of your branches:
  f5be068 Try fix""",
        en=dict(
            title="Commit in detached HEAD",
            question="What is the situation of the \"Try fix\" commit now?",
            choices=[
                "It was added to `main`, because `main` contains `7b21e04`.",
                "Nothing was saved: Git does not allow commits in detached HEAD state.",
                "It was deleted immediately and can never be recovered.",
                "It exists but is on no branch; it can be kept with `git branch tryfix f5be068` (also findable via `git reflog`), otherwise it will eventually be garbage-collected.",
            ],
            answer="D",
            explanation="In detached HEAD, commits are attached to no branch. Leaving them makes them unreachable except by hash or reflog; creating a branch on them keeps them.",
            hint="Read the warning Git printed.",
        ),
        fr=dict(
            title="Commit en HEAD détachée",
            question="Quelle est maintenant la situation du commit « Try fix » ?",
            choices=[
                "Il a été ajouté à `main`, puisque `main` contient `7b21e04`.",
                "Rien n'a été enregistré : Git interdit les commits en HEAD détachée.",
                "Il a été supprimé immédiatement et ne pourra jamais être récupéré.",
                "Il existe mais n'est sur aucune branche ; on peut le garder avec `git branch tryfix f5be068` (on le retrouve aussi via `git reflog`), sinon il finira supprimé par le ramasse-miettes.",
            ],
            answer="D",
            explanation="En HEAD détachée, les commits ne sont rattachés à aucune branche. En partant, ils deviennent inaccessibles sauf par leur hachage ou le reflog ; créer une branche dessus les conserve.",
            hint="Lisez l'avertissement affiché par Git.",
        ),
    ),
    dict(
        slug="git-cherry-pick", difficulty="hard",
        code="""$ git log --oneline develop
b77c013 (develop) Experimental dark mode
f4e2a10 Fix VAT rounding
2a9d6e5 New dashboard (unfinished)
$ git switch release""",
        en=dict(
            title="Taking just one commit",
            question="You need only the fix `f4e2a10` on `release`. Which statement is correct?",
            choices=[
                "`git merge f4e2a10` brings only that one commit into `release`.",
                "`git cherry-pick f4e2a10` creates a new commit on `release` applying the same change, with a different hash; `develop` is unchanged.",
                "`git cherry-pick f4e2a10` moves the commit: it disappears from `develop`.",
                "The commit created on `release` keeps the hash `f4e2a10`, since the change is identical.",
            ],
            answer="B",
            explanation="Cherry-pick copies the changes of one commit as a new commit (different parent, so different hash). Merging `f4e2a10` would also bring its ancestor `2a9d6e5`.",
            hint="A commit's hash depends on its parent too.",
        ),
        fr=dict(
            title="Prendre un seul commit",
            question="Il vous faut seulement le correctif `f4e2a10` sur `release`. Quelle affirmation est correcte ?",
            choices=[
                "`git merge f4e2a10` n'apporte que ce commit dans `release`.",
                "`git cherry-pick f4e2a10` crée sur `release` un nouveau commit appliquant la même modification, avec un hachage différent ; `develop` ne change pas.",
                "`git cherry-pick f4e2a10` déplace le commit : il disparaît de `develop`.",
                "Le commit créé sur `release` garde le hachage `f4e2a10`, puisque la modification est identique.",
            ],
            answer="B",
            explanation="Le cherry-pick copie les modifications d'un commit dans un nouveau commit (parent différent, donc hachage différent). Fusionner `f4e2a10` apporterait aussi son ancêtre `2a9d6e5`.",
            hint="Le hachage d'un commit dépend aussi de son parent.",
        ),
    ),
    dict(
        slug="git-head-tilde-caret", difficulty="hard",
        code="""$ git log --oneline --graph
*   9c4f1aa (HEAD -> main) Merge branch 'feature'
|\\
| * 6e3b2d0 (feature) Add search
* | 1f8a7c3 Update footer
|/
* 0d5e9b4 Initial commit""",
        en=dict(
            title="HEAD~ and HEAD^",
            question="HEAD is the merge commit `9c4f1aa`. Which statement is correct?",
            choices=[
                "`HEAD^` is `1f8a7c3` but `HEAD~1` is `6e3b2d0`.",
                "`HEAD^2` and `HEAD~2` are the same commit.",
                "On a merge commit, `HEAD^` refers to both parents at once.",
                "`HEAD~1` and `HEAD^` are both `1f8a7c3` (first parent), and `HEAD^2` is `6e3b2d0` (second parent).",
            ],
            answer="D",
            explanation="`^n` picks the n-th parent, `~n` follows the first parent n times. So `HEAD~1` = `HEAD^` = first parent `1f8a7c3`, `HEAD^2` = `6e3b2d0`, while `HEAD~2` = `0d5e9b4`.",
            hint="`~` goes up generations, `^` chooses among parents.",
        ),
        fr=dict(
            title="HEAD~ et HEAD^",
            question="HEAD est le commit de fusion `9c4f1aa`. Quelle affirmation est correcte ?",
            choices=[
                "`HEAD^` est `1f8a7c3` mais `HEAD~1` est `6e3b2d0`.",
                "`HEAD^2` et `HEAD~2` désignent le même commit.",
                "Sur un commit de fusion, `HEAD^` désigne les deux parents à la fois.",
                "`HEAD~1` et `HEAD^` sont tous deux `1f8a7c3` (premier parent), et `HEAD^2` est `6e3b2d0` (second parent).",
            ],
            answer="D",
            explanation="`^n` choisit le n-ième parent, `~n` suit le premier parent n fois. Donc `HEAD~1` = `HEAD^` = premier parent `1f8a7c3`, `HEAD^2` = `6e3b2d0`, et `HEAD~2` = `0d5e9b4`.",
            hint="`~` remonte les générations, `^` choisit parmi les parents.",
        ),
    ),
]
