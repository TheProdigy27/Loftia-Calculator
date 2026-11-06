// Publie une version depuis ce PC : build signée, latest.json pour la mise à jour automatique, release GitHub.
//
//   npm run release:version -- 0.2.0     change la version (tauri.conf.json, package.json, Cargo.toml/lock)
//   npm run release                      build signée + release GitHub en brouillon
//   npm run release -- --publish         ... publiée tout de suite (les applis la voient aussitôt)
//   npm run release -- --notes "Texte"   notes de version (sinon texte par défaut)
//   npm run release -- --dry-run         build + latest.json, sans rien envoyer sur GitHub
//
// La clé de signature est lue dans ~/.tauri/loftia-planner.key (+ .password), ou dans les variables
// TAURI_SIGNING_PRIVATE_KEY et TAURI_SIGNING_PRIVATE_KEY_PASSWORD. Elle ne quitte jamais ce PC.
// Prérequis : gh connecté (gh auth login), Rust, et le commit à publier déjà poussé sur GitHub.
import { execSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const path = (p) => new URL(p, root);
const read = (p) => readFileSync(path(p), 'utf8');

const DEFAULT_NOTES = 'Installeur Windows : télécharge le fichier -setup.exe ci-dessous.';

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

/** Commande qui doit réussir ; renvoie sa sortie */
function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Commande longue affichée en direct */
function run(cmd, env = {}) {
  console.log(`\n› ${cmd}`);
  const r = spawnSync(cmd, {
    cwd: root,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) fail(`échec de « ${cmd} »`);
}

function versions() {
  return {
    'src-tauri/tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
    'package.json': JSON.parse(read('package.json')).version,
    'src-tauri/Cargo.toml': read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  };
}

// ---------- npm run release:version -- x.y.z ----------
function setVersion(v) {
  if (!/^\d+\.\d+\.\d+$/.test(v ?? ''))
    fail('Indique la version : npm run release:version -- 0.2.0');
  const sub = (file, re, to) => {
    const s = read(file);
    if (!re.test(s)) fail(`version introuvable dans ${file}`);
    writeFileSync(path(file), s.replace(re, to));
  };
  sub('src-tauri/tauri.conf.json', /("version":\s*)"[^"]+"/, `$1"${v}"`);
  sub('package.json', /("version":\s*)"[^"]+"/, `$1"${v}"`);
  sub('package-lock.json', /("name": "loftia-planner",\s*"version":\s*)"[^"]+"/g, `$1"${v}"`);
  sub('src-tauri/Cargo.toml', /^(version\s*=\s*)"[^"]+"/m, `$1"${v}"`);
  sub('src-tauri/Cargo.lock', /(name = "loftia-planner"\r?\nversion = )"[^"]+"/, `$1"${v}"`);
  console.log(`Version ${v} écrite. Commite et pousse, puis : npm run release`);
}

// ---------- npm run release ----------
function release(args) {
  const flag = (f) => args.includes(f);
  const dry = flag('--dry-run');
  const publish = flag('--publish');
  const notesAt = args.indexOf('--notes');
  const notes = notesAt >= 0 ? args[notesAt + 1] : DEFAULT_NOTES;
  if (notesAt >= 0 && !notes) fail('--notes attend un texte');

  // Versions cohérentes
  const vs = versions();
  const version = vs['src-tauri/tauri.conf.json'];
  if (Object.values(vs).some((x) => x !== version)) {
    fail(
      `versions différentes :\n${Object.entries(vs)
        .map(([f, x]) => `  ${f} : ${x}`)
        .join('\n')}\n  → npm run release:version -- <version>`,
    );
  }
  const tag = `v${version}`;
  console.log(`Version ${version}${dry ? ' (essai, rien ne sera envoyé)' : ''}`);

  // L'exe doit correspondre exactement à un commit présent sur GitHub
  const dirty = sh('git status --porcelain');
  if (dirty && !dry) fail(`des changements ne sont pas commités :\n${dirty}`);
  if (dirty) console.warn('⚠ changements non commités (accepté en --dry-run)');
  const head = sh('git rev-parse HEAD');
  if (!dry) {
    sh('git fetch --quiet origin');
    if (!sh(`git branch -r --contains ${head}`))
      fail('ce commit n’est pas sur GitHub : git push d’abord');
    const exists =
      spawnSync('gh', ['release', 'view', tag], { cwd: root, stdio: 'ignore' }).status === 0;
    if (exists)
      fail(`la release ${tag} existe déjà : change de version (npm run release:version -- …)`);
  }

  // Clé de signature
  const keyFile = join(homedir(), '.tauri', 'loftia-planner.key');
  const key =
    process.env.TAURI_SIGNING_PRIVATE_KEY ||
    (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '');
  if (!key) fail(`clé de signature introuvable (${keyFile})`);
  const pw =
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??
    (existsSync(`${keyFile}.password`) ? readFileSync(`${keyFile}.password`, 'utf8').trim() : '');

  // Tests puis build signée
  run('npm test');
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  const bundleDir = 'src-tauri/target/release/bundle/nsis/';
  const built = `${bundleDir}${conf.productName}_${version}_x64-setup.exe`;
  rmSync(path(built), { force: true });
  rmSync(path(`${built}.sig`), { force: true });
  run('npx tauri build', {
    TAURI_SIGNING_PRIVATE_KEY: key,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: pw,
  });
  if (!existsSync(path(built)) || !existsSync(path(`${built}.sig`)))
    fail(`installeur ou signature absent : ${built}(.sig)`);

  // Fichiers à envoyer, sans espace dans le nom (GitHub les remplacerait et l'URL de latest.json ne collerait plus)
  const repo = sh('gh repo view --json nameWithOwner -q .nameWithOwner');
  const asset = `${conf.productName.replace(/\s+/g, '-')}_${version}_x64-setup.exe`;
  const out = 'src-tauri/target/release/bundle/upload/';
  rmSync(path(out), { recursive: true, force: true });
  mkdirSync(path(out), { recursive: true });
  copyFileSync(path(built), path(out + asset));
  const platform = {
    signature: read(`${built}.sig`).trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${asset}`,
  };
  const latest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: { 'windows-x86_64': platform, 'windows-x86_64-nsis': platform },
  };
  writeFileSync(path(`${out}latest.json`), JSON.stringify(latest, null, 2) + '\n');
  console.log(`\nPrêt : ${out}${asset} et ${out}latest.json`);
  if (dry) return;

  // Release GitHub (crée le tag sur le commit poussé)
  run(
    [
      'gh release create',
      tag,
      `"${out}${asset}"`,
      `"${out}latest.json"`,
      `--target ${head}`,
      `--title "${conf.productName} ${tag}"`,
      `--notes "${notes.replace(/"/g, '\\"')}"`,
      publish ? '' : '--draft',
    ]
      .filter(Boolean)
      .join(' '),
  );
  spawnSync('git', ['fetch', '--quiet', '--tags'], { cwd: root });
  console.log(
    publish
      ? `\n✔ ${tag} publiée : les applis installées la proposeront à leur prochaine vérification.`
      : `\n✔ Brouillon ${tag} créé. Publie-le sur https://github.com/${repo}/releases pour que les applis le voient.`,
  );
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'version') setVersion(rest[0]);
else release(process.argv.slice(2));
