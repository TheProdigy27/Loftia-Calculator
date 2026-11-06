// Copie les icônes du jeu (.webp) d'un dossier vers public/assets/.
// Les icônes ne sont pas versionnées (repo public, accord du Codex et des ayants droit en attente).
// Usage : npm run icons:import -- "C:\chemin\vers\Loftia — Cuisine & Cultures\assets"
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Indique le dossier des icônes : npm run icons:import -- <dossier>');
  process.exit(1);
}
const dest = new URL('../public/assets/', import.meta.url);
mkdirSync(dest, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.webp'));
for (const f of files) copyFileSync(join(src, f), new URL(f, dest));
console.log(`${files.length} icônes copiées dans public/assets/`);
