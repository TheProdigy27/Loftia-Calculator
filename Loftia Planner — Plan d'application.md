# Loftia Planner — Plan d'application

6 novembre 2026

## Vision

Loftia Planner devient une appli Windows installable qui reprend tout le prototype (recettes, cultures, plan × n) et ajoute ce qu'une page web ne peut pas faire : des données qui se mettent à jour seules depuis le Codex, des minuteurs de pousse avec notifications Windows, et une mini-fenêtre qui reste au-dessus du jeu.

- **Pour qui** : toi d'abord, puis les joueurs de Loftia sur PC à qui tu voudras la donner (installeur à partager, sans passer par le Microsoft Store).
- **Ce qu'elle garde du prototype** : le moteur de calcul déjà vérifié sur les 61 recettes du Codex, l'UI cozy et les icônes.
- **Ce qu'elle ajoute** : fonctionner hors ligne, rafraîchir les données en un clic, suivre ses plantations en temps réel pendant qu'on joue.

## Fonctionnalités

Le MVP reproduit le prototype en appli installable ; la V1 apporte ce qui justifie une appli Windows : données vivantes, minuteurs et mini-fenêtre. La colonne Version se change d'un clic si tu veux déplacer une fonctionnalité.

| Fonctionnalité | Version | Ce que ça fait |
| --- | --- | --- |
| Recettes et tris | MVP | Les 4 tris du prototype (rentables, rapides, Dew/h, Dew par énergie), filtres, recherche, vue cartes ou tableau |
| Plan de cuisine × n | MVP | Quantité par recette, liste de courses agrégée, coût, profit, temps, énergie, copie de la liste |
| Cultures | MVP | Tableau des graines avec Dew/h et recettes liées |
| Réglages joueur | MVP | Niveaux Cuisine et Farming, parcelles, mode de prix, sauvegarde locale |
| Données embarquées | MVP | Instantané du Codex livré avec l'appli : tout marche hors ligne |
| Installeur Windows | MVP | Un fichier setup.exe à partager, sans passer par le Microsoft Store |
| Mise à jour des données | V1 | Bouton « Rafraîchir depuis le Codex » : relit les pages, télécharge les icônes, montre ce qui a changé |
| Minuteurs de pousse | V1 | « J'ai planté » sur le plan lance un compte à rebours par parcelle et une notification Windows quand c'est prêt |
| Mini-fenêtre au-dessus du jeu | V1 | Plan en cours et minuteurs dans une petite fenêtre toujours visible, ouverte par un raccourci clavier global |
| Icône près de l'horloge et mise à jour auto | V1 | L'appli tourne en fond et se met à jour seule depuis GitHub Releases |
| Inventaire | Plus tard | Saisir ce que tu as déjà : le plan ne liste plus que ce qui manque |
| Optimiseur | Plus tard | « N parcelles, X heures » donne la combinaison de recettes la plus rentable |
| Suivi des gains | Plus tard | Historique des plats vendus et des Dew gagnés |
| Thème sombre | Plus tard | Variante nuit de l'UI cozy |

## Plateforme et stack

Recommandation : **Tauri 2 + Angular**. Tu réutilises le prototype web, ton Angular et ton Rust, et l'installeur reste léger parce qu'il s'appuie sur WebView2, déjà intégré à Windows 10 (depuis avril 2018) et Windows 11 ([Tauri](https://v2.tauri.app/distribute/windows-installer/)).

| Option | Langages | Ce que tu réutilises | Limite principale |
| --- | --- | --- | --- |
| **Tauri 2** (recommandé) | Rust + Angular/TypeScript | Le prototype (HTML, CSS, moteur JS) et tes deux langages | WebView2 à installer sur les vieux Windows (bootstrapper intégrable, environ 1,8 Mo) |
| Electron | Node + Angular/TypeScript | Le prototype côté web | Embarque Chromium : installeur et mémoire bien plus lourds, pas de Rust |
| .NET WinUI 3 / WPF | C# + XAML | Rien : moteur et UI à réécrire | Tout recommencer dans une stack que tu n'utilises pas |

**La stack retenue**

- **Interface** : Angular avec signals pour l'état, en reprenant les composants et le CSS cozy du prototype.
- **Moteur de calcul** : `engine.js` porté en TypeScript, une librairie pure sans dépendance, testée sur les 61 recettes.
- **Côté Rust (commandes Tauri)** : synchro avec le Codex (`reqwest` + `scraper`), cache des icônes, minuteurs.
- **Plugins Tauri 2** : notification, global-shortcut, store (sauvegarde), updater, window-state, single-instance, plus l'icône de zone de notification (`tray-icon`) incluse dans le cœur ([liste des plugins](https://v2.tauri.app/release/notification/v2.0.0/)).
- **Distribution** : installeur NSIS `-setup.exe` (ou `.msi` via WiX, construit uniquement sous Windows), compilé et signé en local (`npm run release`) et publié sur GitHub Releases avec `latest.json`, que l'updater interroge.
- **Signature** : sans certificat de signature de code, Windows SmartScreen avertit au premier lancement. Ça passe pour des amis ; un certificat devient utile pour une diffusion large.

## Données

L'appli lit le Codex elle-même via une synchro en Rust, et embarque un instantané pour fonctionner hors ligne. Une appli de bureau n'est pas bloquée par les règles du navigateur : elle peut télécharger les pages et les icônes directement, ce que le prototype ne pouvait pas faire.

**La synchro, étape par étape**

1. Télécharger [Crops](https://loftiacodex.com/economy/crops/), [Cooking](https://loftiacodex.com/economy/cooking/) et les fiches `/items/<plat>/` (station et énergie), une requête à la fois, seulement quand tu le demandes.
2. Lire les données structurées que le site expose déjà : l'attribut `data-in` de chaque ligne (prix de vente, coût réel, valeur, quantités) et le bloc JSON `econ-perks` (bonus de niveau).
3. Télécharger les icônes `/icons/<slug>.webp` manquantes dans `%APPDATA%\LoftiaPlanner\icons`.
4. Valider : schéma attendu, et coût recalculé par le moteur égal au coût affiché par le Codex pour chaque recette.
5. Comparer avec la version actuelle et afficher un rapport : recettes ajoutées ou retirées, prix modifiés.
6. Écrire `data.json` avec `schemaVersion`, date et source. Si une étape échoue, l'appli garde la version précédente.

**Format** : le même découpage que `data.js` du prototype (cultures, ingrédients hors culture, recettes, bonus), en JSON pour qu'il soit lu côté Rust comme côté Angular.

**Droits et respect du site**

- Les données sont compilées par le Codex et les icônes sont des assets du jeu. Pour ton usage, pas de souci ; pour partager l'appli, il faut l'accord de l'auteur du Codex, et idéalement des développeurs de Loftia pour les icônes.
- Variante qui ne redistribue rien : l'installeur ne contient aucune icône, chaque utilisateur les télécharge depuis le Codex à la première synchro. À valider aussi avec le Codex, puisque ça sollicite son serveur.
- Synchro polie : un User-Agent qui nomme l'appli, une requête par seconde au plus, jamais en boucle (au clic, ou une fois par jour maximum), cache local.

## Architecture

Le moteur de calcul reste une librairie TypeScript pure, et tout ce qui touche le disque, le réseau ou Windows passe par des commandes Rust.

&#91;embedded content: architecture · interface, cœur TypeScript, Rust, services externes\]

L'interface ne parle jamais directement au réseau : elle appelle la synchro Rust, qui écrit `data.json`, puis recharge l'état. **Tests** : le moteur reprend les vérifications du prototype (61 recettes, niveaux 1 à 20) ; le parseur Rust est testé sur des pages du Codex sauvegardées.

## Écrans et parcours

Sur PC, le plan n'est plus un panneau qui glisse : il reste ouvert à droite des recettes, et la mini-fenêtre prend le relais pendant que tu joues.

&#91;embedded content: maquette · fenêtre principale, mini-fenêtre, notification\]

- **Recettes** : les cartes du prototype en grille plus large, avec le sélecteur de quantité sur chaque carte.
- **Mon plan** : la liste de courses du prototype, plus un bouton « J'ai planté » qui lance les minuteurs.
- **Cultures** : le tableau des graines, un clic sur une culture filtre les recettes.
- **Minuteurs** : parcelles en cours, temps restant, récoltes du jour.
- **Réglages** : niveaux, parcelles, mode de prix, synchro Codex, raccourci global, démarrage avec Windows.

Raccourcis clavier : Ctrl+F pour chercher, + et − sur la carte sélectionnée, un raccourci global au choix pour afficher la mini-fenêtre.

## Roadmap

Une appli utilisable à la place du prototype arrive en 3 à 4 semaines ; synchro et confort Windows suivent en 3 à 5 semaines.

&#91;embedded content: roadmap · 4 phases et 2 points de passage\]

Le premier point de passage valide que l'appli fait tout ce que fait le prototype ; le second conditionne le partage public à l'accord du Codex, sans bloquer ton usage perso.

## Risques et questions ouvertes

Le seul risque bloquant est l'accord du Codex pour une diffusion publique ; les autres se règlent dans le code.

| Risque | Conséquence | Parade |
| --- | --- | --- |
| Pas d'accord du Codex ou des ayants droit du jeu | Pas de diffusion publique | Rester en usage perso ou entre amis, variante sans icônes embarquées, demander dès le début |
| Le Codex change ses pages (plus d'attribut `data-in`) | La synchro casse | Tests sur des pages HTML sauvegardées, ancienne version conservée, message d'erreur clair |
| Mécaniques supposées : Ingredient Saver sur le premier ingrédient, coût du miel inconnu, rendement des arbres, temps de cuisson absent | Chiffres légèrement faux | Les afficher comme hypothèses dans l'appli, les vérifier en jeu, les rendre réglables |
| Jeu en plein écran exclusif | La mini-fenêtre « toujours au-dessus » ne s'affiche pas par-dessus | Tester avec le jeu en fenêtré sans bordure ; sinon notifications seules |
| Installeur non signé | SmartScreen fait hésiter tes amis | Expliquer « Informations complémentaires » puis « Exécuter quand même » ; certificat si diffusion large |
| WebView2 absent sur un vieux Windows 10 | L'appli ne démarre pas | Installeur en mode `embedBootstrapper` |

**Questions à trancher**

- [ ] Appli pour toi seul, entre amis, ou publique ? Ça décide de l'accord à demander et de la signature.
- [ ] Loftia tourne-t-il chez toi en plein écran ou en fenêtré ?
- [ ] Faut-il couvrir d'autres métiers du Codex plus tard, ou rester sur cuisine et cultures ?

## Prochaines étapes

La première semaine sert à poser le socle et à lancer la demande d'accord en parallèle.

- [ ] Décider si l'appli est perso, entre amis ou publique
- [ ] Écrire à l'auteur du Codex pour présenter l'appli et demander l'accord (données et icônes)
- [ ] Créer le repo et le squelette Tauri 2 + Angular (`npm create tauri-app@latest`, modèle Angular)
- [ ] Porter `engine.js` en TypeScript et transformer `verify.js` en tests sur les 61 recettes
- [ ] Reprendre l'UI du prototype en composants Angular : Recettes, Plan, Cultures
- [ ] Configurer GitHub Actions pour produire le `-setup.exe` à chaque version

## Sources

- [Loftia Codex — Crops](https://loftiacodex.com/economy/crops/) et [Cooking](https://loftiacodex.com/economy/cooking/), relevés le 6 novembre 2026
- [Tauri 2 — Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri 2 — plugins (page de version notification 2.0.0)](https://v2.tauri.app/release/notification/v2.0.0/)
