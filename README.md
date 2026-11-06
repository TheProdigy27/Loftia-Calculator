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
| Installeur Windows | fait : `npm run dist` produit un `-setup.exe` NSIS de 5,3 Mo (bootstrapper WebView2 inclus) |

Raccourcis : `Ctrl+F` ou `/` pour chercher, `Échap` pour effacer, `+` et `−` sur une carte sélectionnée (Tab).

## Démarrer

Prérequis : Node 24, et pour l'appli de bureau [Rust](https://rustup.rs) avec les outils de build C++ de Visual Studio (déjà présents si Visual Studio est installé).

```sh
npm install
npm start          # version web sur http://localhost:4200
npm run dev        # appli de bureau (Tauri)
npm run dist       # installeur : src-tauri/target/release/bundle/nsis/*-setup.exe
npm test           # moteur, plan et état
```

## Organisation

```
src/app/core/        moteur de calcul pur (port TypeScript de engine.js) + texte du plan
src/app/state/       état de l'appli en signals, sauvegarde locale
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

Changer `version` dans `src-tauri/tauri.conf.json`, puis pousser un tag `v0.1.0` : le workflow `release.yml` construit le `-setup.exe` et crée un brouillon de release GitHub. Sans certificat de signature, SmartScreen avertit au premier lancement (« Informations complémentaires » puis « Exécuter quand même »).
