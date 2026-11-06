# Loftia Planner

Appli Windows (Tauri 2 + Angular) qui reprend le prototype « Loftia — Cuisine & Cultures » : recettes et tris, plan de cuisine × n, cultures, réglages joueur, données du [Loftia Codex](https://loftiacodex.com/economy/cooking/) embarquées pour marcher hors ligne.

Le cadrage complet est dans [Loftia Planner — Plan d'application.md](Loftia%20Planner%20—%20Plan%20d'application.md).

## Où en est le MVP

| Fonctionnalité | État |
| --- | --- |
| Recettes et tris (rentables, rapides, Dew/h, Dew par énergie), filtres, recherche, cartes ou tableau | fait |
| Plan de cuisine × n : quantités, liste de courses groupée, coût, profit, temps, énergie, copie de la liste | fait, panneau fixe à droite sur grand écran |
| Cultures : graines, Dew/h, recettes liées | fait |
| Réglages joueur : niveaux, parcelles, prix, station, sauvegarde locale | fait (`localStorage` de la WebView) |
| Données embarquées | fait : `src/data/loftia-data.json` (instantané du 6 novembre 2026) |
| Installeur Windows | fait : `npm run dist` produit un `-setup.exe` NSIS de 6,4 Mo (bootstrapper WebView2 inclus) |
| Mise à jour automatique | fait : vérifie les releases GitHub au démarrage puis toutes les 6 h, bouton ↻ dans la barre du haut, installation et redémarrage en un clic |

Raccourcis : `Ctrl+F` ou `/` pour chercher, `Échap` pour effacer, `+` et `−` sur une carte sélectionnée (Tab).

## Démarrer

Prérequis : Node 24, et pour l'appli de bureau [Rust](https://rustup.rs) avec les outils de build C++ de Visual Studio (déjà présents si Visual Studio est installé).

```sh
npm install
npm start          # version web sur http://localhost:4200
npm run dev        # appli de bureau (Tauri)
npm run dist       # installeur signé : src-tauri/target/release/bundle/nsis/*-setup.exe (voir « Publier une version »)
npm test           # moteur, plan et état
```

## Organisation

```
src/app/core/        moteur de calcul pur (port TypeScript de engine.js) + texte du plan
src/app/state/       état de l'appli en signals, sauvegarde locale, mises à jour
src/app/features/    écrans : réglages, recettes, cultures, plan
src/app/ui/          pipes, icônes, contrôles partagés
src/data/            data.json embarqué (schemaVersion 1)
src-tauri/           côté Rust : fenêtre, liens externes ; V1 : synchro Codex, minuteurs, notifications
reference/prototype/ prototype d'origine, sert de référence aux tests
scripts/             conversion des données, génération des résultats de référence, import des icônes
```

## Tests

`engine.spec.ts` compare le moteur TypeScript au moteur du prototype sur les 61 recettes : niveaux 1 à 20, deux modes de prix, parcelles illimitées ou limitées, arbres prêts ou non, totaux × n, plus 40 plans aléatoires et le front de Pareto. Les résultats de référence viennent de `reference/prototype/engine.js` :

```sh
npm run test:fixture   # régénère src/app/core/engine.fixture.json depuis le prototype
```

Si les données du Codex changent : mettre à jour `reference/prototype/data.js`, puis `npm run data:convert` et `npm run test:fixture`.

## Données et droits

Les données sont compilées par le [Loftia Codex](https://loftiacodex.com), un wiki fan-made dont l'auteur encourage le partage ; les icônes sont des assets du jeu Loftia, embarquées dans `public/assets/` et créditées dans le pied de page de l'appli. Synchro (V1) : User-Agent qui nomme l'appli, une requête par seconde au plus, au clic ou une fois par jour maximum.

## Publier une version

Tout se fait depuis ce PC (la clé de signature n'en sort jamais) :

```sh
npm run release:version -- 0.2.0   # change la version partout, puis commit + push
npm run release                    # tests, build signée, release GitHub en brouillon
npm run release -- --publish       # ... ou publiée directement
npm run release -- --notes "Nouveautés : ..."
npm run release -- --dry-run       # build + latest.json sans rien envoyer
```

Le script refuse de publier s'il reste des changements non commités ou si le commit n'est pas sur GitHub, pour que l'installeur corresponde au code du dépôt. Il envoie le `-setup.exe` et `latest.json` ; les applis installées lisent `releases/latest/download/latest.json`, donc elles ne voient une version qu'une fois la release publiée (pas en brouillon). Sans certificat de signature Windows, SmartScreen avertit au premier lancement (« Informations complémentaires » puis « Exécuter quand même »).

Signature des mises à jour : clé publique dans `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`), clé privée dans `~/.tauri/loftia-planner.key` et son mot de passe dans `~/.tauri/loftia-planner.key.password`, hors du dépôt. Pour un simple `npm run dist`, exporter `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` avant (sinon la build échoue à l'étape de signature). **Sauvegarder la clé privée** : si elle est perdue, les applis déjà installées ne pourront plus se mettre à jour toutes seules (il faudra réinstaller à la main une version signée avec une nouvelle clé).
