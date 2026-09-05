#!/usr/bin/env node
// Le relevé des branches VIVANTES qui écrivent les chemins qu'on s'apprête à écrire [#5242]
//
//   node scripts/releve-branches-vivantes.mjs --chemins tasks/lessons.md
//   node scripts/releve-branches-vivantes.mjs --chemins apps/web-v3 packages/shared --fetch
//   node scripts/releve-branches-vivantes.mjs                 # les fichiers les plus disputés
//   node scripts/releve-branches-vivantes.mjs --json          # la même chose, à donner à une machine
//   node scripts/releve-branches-vivantes.mjs --self-test     # les mutations que le relevé doit voir
//
// POURQUOI IL EXISTE
//
// Le dépôt est écrit par plusieurs sessions en parallèle — 1126 branches `claude/*`,
// une vingtaine vivantes, 310 commits sur `dev` en 48 h. La leçon 322 a énoncé la
// règle qui évite qu'elles se percutent, et a nommé ses trois défauts. Le troisième
// est celui que ce script ferme :
//
//   « Rien ne consultait git. Le tableau et les commentaires disent ce que les autres
//     ont ANNONCÉ ; git dit ce qu'ils ont FAIT, et il est déjà synchronisé entre
//     toutes les sessions. »
//
// Les outils existants (PR ouvertes, issues assignées, noms de branches) relèvent
// l'ANNONCE. Ce script lit le CONTENU : pour chaque branche dont le dernier commit
// a moins de N heures, les fichiers qu'elle ajoute à la base — et leur intersection
// avec les chemins qu'on s'apprête à écrire.
//
// POURQUOI CE N'EST PAS UN GATE DE CI
//
// Les gates voisins (`check-lockfile-alignment`, `check-makefile-workspaces`)
// mesurent un INVARIANT du dépôt : leur rouge est un défaut. Ici le rouge dit
// « quelqu'un d'autre écrit ce fichier en ce moment », ce qui est l'état NORMAL d'un
// dépôt à vingt sessions. Le brancher sur la CI la rendrait rouge en permanence et
// apprendrait à tout le monde à l'ignorer. Seul `--self-test` a sa place en CI :
// il porte sur l'instrument, pas sur le dépôt.
//
// POURQUOI IL RÉCLAME UN DISTANT FRAIS
//
// Un relevé qui mesure un `origin/*` périmé rend « rien trouvé » — le pire verdict
// possible, parce qu'il a la forme d'une autorisation. Sans `--fetch`, le script
// DIT l'âge de sa dernière synchronisation, et `--exige-frais` en fait un refus.
// C'est la leçon 423 portée d'un fichier à un dépôt : on mesure sur l'état réel,
// au dernier moment, jamais sur le sien au moment où ça arrangeait.
//
// LE PIÈGE DU SQUASH — POURQUOI IL FAUT DEUX DIFFS ET PAS UN
//
// La première écriture de ce script ne lisait que `base...branche` — « ce que la
// branche a ajouté depuis leur point de divergence ». C'est la formule juste pour
// une fusion par commit de merge : la base absorbe l'historique de la branche, le
// point de divergence avance, le diff se vide.
//
// Ce dépôt fusionne ses PR en SQUASH (`… (#5094)`). Les commits d'origine
// n'entrent jamais dans `dev` ; le point de divergence reste où il était ; et
// `base...branche` continue d'annoncer TOUS les fichiers de la branche —
// éternellement, pour les 1126 branches du dépôt, dont la quasi-totalité est
// fusionnée depuis longtemps. Mesuré : `feat/web-v3-espace-membre` était rapportée
// comme écrivant `.github/workflows/ci.yml` alors que son contenu y est identique
// OCTET POUR OCTET depuis la veille.
//
// Un relevé qui crie au loup sur des branches mortes est pire qu'absent : il
// s'ignore. La question n'est donc pas « qu'a-t-elle écrit ? » mais « qu'a-t-elle
// écrit QUI DIFFÈRE ENCORE ? », et il faut les deux mesures :
//
//   base...branche  (trois points) — ce qu'elle a écrit depuis la divergence
//   base branche    (deux points)  — ce dont le contenu diffère encore
//
// Seule leur INTERSECTION est en attente. Les trois points seuls comptent le
// squash déjà fusionné ; les deux points seuls compteraient ce que la BASE a bougé
// et que la branche n'a jamais touché.
//
// LA LIMITE QUI RESTE, ET POURQUOI ELLE N'EST PAS COMBLÉE ICI
//
// L'intersection ci-dessus retire les branches squashées dont la base n'a PAS
// bougé. Elle ne retire pas celles que la base a DÉPASSÉE depuis : leur contenu
// diffère à nouveau, non parce qu'elles ont quelque chose en attente, mais parce
// que la base a avancé sans elles. Mesuré sur `feat/web-v3-espace-membre` (PR
// #5094, squashée le 2026-09-04) : `git merge-tree` annonce NEUF conflits — le
// signe d'un doublon squashé, pas d'un travail vivant.
//
// Aucune mesure git ne les sépare. La branche squashée et la branche réellement
// divergente ont, dans le graphe, exactement la même forme ; ce qui les distingue
// — l'état de la PR — vit sur GitHub, pas dans le dépôt. Y mettre une heuristique
// (l'âge, un patch-id agrégé, le nom du fichier créé des deux côtés) rendrait un
// verdict plausible et faux, ce qui est pire qu'un candidat de trop : le relevé
// sert à DÉCIDER de céder, et céder à tort coûte un travail.
//
// Le relevé rend donc des CANDIDATS, et le dit. Devant une branche qui surprend,
// deux commandes tranchent en quelques secondes :
//
//   git log origin/dev --oneline --grep='<nom-de-branche>\|(#<PR>)'
//   git merge-tree --write-tree origin/dev <branche>   # que des conflits ⇒ doublon squashé
//
// CE QU'IL NE FAIT PAS
//
// Il ne RÉSERVE rien. Un relevé est un instantané, jamais un bail — mesuré : le
// témoin du composer a été corrigé deux fois à deux heures d'écart, jusqu'au même
// nom d'attribut, alors que le premier relevé était juste. La conséquence à en tirer
// est une doctrine, pas un outil (#5243) : pousser tôt pour que sa branche devienne
// le bail, et — corollaire de la leçon 322 — quand deux lots se disputent un fichier,
// celui qui n'a rien écrit cède.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FENETRE_H = 48;
const FRAICHEUR_MIN = 15;
const PREFIXES = /^(claude|fix|feat|feature|refactor|resolution|chore|docs|test)\//;
const PLAFOND_FICHIERS = 40;

// ---------------------------------------------------------------------------
// LE CŒUR — pur : il ne connaît que le monde qu'on lui remet.
// ---------------------------------------------------------------------------

// Un chemin DEMANDÉ couvre un fichier s'il le désigne, ou s'il est le répertoire
// qui le contient. La barre est obligatoire : sans elle, `apps/web` couvrirait
// `apps/web-v3/...`, et le relevé rendrait une contention qui n'existe pas.
export const couvre = (fichier, chemin) => {
  const c = String(chemin).replace(/\/\*\*$/, '').replace(/\/+$/, '');
  if (c === '' || c === '.') return true;
  return fichier === c || fichier.startsWith(`${c}/`);
};

export const ageHeures = (branche, maintenant) =>
  Math.max(0, Math.floor((maintenant - branche.epoch) / 3600));

export const estVivante = (branche, maintenant, fenetre) =>
  ageHeures(branche, maintenant) < fenetre;

// Ce qu'une branche a VRAIMENT en attente sur la base — voir § LE PIÈGE DU SQUASH.
// `ajoutes` seul rapporte éternellement les branches squashées ; `divergents` seul
// rapporterait ce que la base a bougé sans que la branche y touche.
export const enAttente = (branche) => {
  const divergents = new Set(branche.divergents || []);
  return (branche.ajoutes || []).filter((f) => divergents.has(f));
};

// Le relevé : quelles branches vivantes, autres que la mienne, écrivent MES chemins.
export const releve = (monde, { chemins = [], fenetre = FENETRE_H } = {}) =>
  monde.branches
    .filter((b) => b.nom !== monde.courante)
    .filter((b) => estVivante(b, monde.maintenant, fenetre))
    .map((b) => ({
      branche: b.nom,
      age: ageHeures(b, monde.maintenant),
      fichiers: enAttente(b).filter((f) => chemins.some((c) => couvre(f, c))),
    }))
    .filter((e) => e.fichiers.length > 0)
    .sort((a, b) => a.age - b.age);

// Sans chemins demandés : les fichiers que PLUSIEURS branches vivantes écrivent.
// C'est la carte des zones chaudes — utile pour choisir un travail, pas pour trancher.
export const disputes = (monde, { fenetre = FENETRE_H, minimum = 2 } = {}) => {
  const parFichier = new Map();
  monde.branches
    .filter((b) => b.nom !== monde.courante)
    .filter((b) => estVivante(b, monde.maintenant, fenetre))
    .forEach((b) => enAttente(b).forEach((f) => {
      if (!parFichier.has(f)) parFichier.set(f, []);
      parFichier.get(f).push(b.nom);
    }));
  return [...parFichier.entries()]
    .filter(([, branches]) => branches.length >= minimum)
    .map(([fichier, branches]) => ({ fichier, branches: [...branches].sort() }))
    .sort((a, b) => b.branches.length - a.branches.length || a.fichier.localeCompare(b.fichier));
};

export const verdict = (contentions, { fraisDepuisMin, exigeFrais }) => {
  if (exigeFrais && (fraisDepuisMin === null || fraisDepuisMin > FRAICHEUR_MIN)) return 2;
  return contentions.length > 0 ? 1 : 0;
};

// ---------------------------------------------------------------------------
// LE BORD — git.
// ---------------------------------------------------------------------------

const git = async (args) => {
  const { stdout } = await run('git', args, { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
};

const fraicheurMinutes = async () => {
  try {
    const { mtimeMs } = await stat(join(REPO_ROOT, '.git', 'FETCH_HEAD'));
    return Math.floor((Date.now() - mtimeMs) / 60000);
  } catch {
    return null;
  }
};

const lisLeMonde = async ({ base, fenetre, prefixes }) => {
  await git(['rev-parse', '--verify', `${base}^{commit}`]);
  const maintenant = Math.floor(Date.now() / 1000);
  const courante = (await git(['branch', '--show-current'])).trim();

  // `--sort=-committerdate` rend les branches de la plus récente à la plus vieille :
  // on s'arrête au premier dépassement de fenêtre au lieu de diffusionner 1126 branches.
  const lignes = (await git([
    'for-each-ref', '--sort=-committerdate',
    '--format=%(refname:short)%09%(committerdate:unix)', 'refs/remotes/origin/',
  ])).split('\n').filter(Boolean);

  const candidates = [];
  for (const ligne of lignes) {
    const [ref, unix] = ligne.split('\t');
    const epoch = Number(unix);
    if (!Number.isFinite(epoch)) continue;
    if ((maintenant - epoch) / 3600 >= fenetre) break;
    const nom = ref.replace(/^origin\//, '');
    if (nom === 'HEAD' || `origin/${nom}` === base || !prefixes.test(nom)) continue;
    candidates.push({ nom, ref, epoch });
  }

  const branches = await Promise.all(candidates.map(async ({ nom, ref, epoch }) => {
    // Les DEUX mesures — leur intersection seule est en attente (§ LE PIÈGE DU SQUASH).
    const [ajoutes, divergents] = await Promise.all([
      git(['diff', '--name-only', `${base}...${ref}`]),
      git(['diff', '--name-only', base, ref]),
    ]);
    return {
      nom,
      epoch,
      ajoutes: ajoutes.split('\n').filter(Boolean),
      divergents: divergents.split('\n').filter(Boolean),
    };
  }));

  return { base, maintenant, courante, branches, fraisDepuisMin: await fraicheurMinutes() };
};

// ---------------------------------------------------------------------------
// LE SELF-TEST — les mutations que le relevé doit voir, et celles qu'il doit ignorer.
// ---------------------------------------------------------------------------

// `fusionnes` : des fichiers que la branche a écrits et que la base porte DÉJÀ à
// l'identique — le cas du squash. Ils restent dans `ajoutes` (l'historique de la
// branche n'a pas bougé) et sortent de `divergents` (le contenu, lui, est le même).
const uneBranche = (nom, epoch, fichiers, { fusionnes = [] } = {}) => ({
  nom,
  epoch,
  ajoutes: [...fichiers],
  divergents: fichiers.filter((f) => !fusionnes.includes(f)),
});

const MONDE_TEMOIN = () => ({
  base: 'origin/dev',
  maintenant: 1_000_000,
  courante: 'claude/la-mienne',
  fraisDepuisMin: 1,
  branches: [
    uneBranche('claude/la-mienne', 1_000_000 - 3600, ['tasks/lessons.md']),
    uneBranche('claude/ailleurs', 1_000_000 - 7200, ['services/gateway/src/x.ts']),
  ],
});

const mute = (monde, applique) => {
  const copie = JSON.parse(JSON.stringify(monde));
  applique(copie);
  return copie;
};

const ajoute = (nom, heures, fichiers, options) => (monde) => {
  monde.branches.push(uneBranche(nom, monde.maintenant - heures * 3600, fichiers, options));
};

const MUTATIONS = [
  ['une branche vivante écrit EXACTEMENT le chemin demandé',
    ajoute('claude/voisine', 2, ['tasks/lessons.md']), 'voit', 'claude/voisine'],
  ['une branche vivante écrit SOUS un répertoire demandé',
    ajoute('claude/sous-repertoire', 3, ['apps/web/hooks/use-audio-translation.ts']), 'voit', 'claude/sous-repertoire'],
  ['une branche vivante écrit le chemin PARMI vingt autres fichiers',
    ajoute('claude/noyee', 5, [...Array.from({ length: 20 }, (_, i) => `autre/${i}.ts`), 'tasks/lessons.md']),
    'voit', 'claude/noyee'],
  ['une branche au bord de la fenêtre (47 h) écrit le chemin',
    ajoute('claude/au-bord', 47, ['tasks/lessons.md']), 'voit', 'claude/au-bord'],
  ['une branche HORS fenêtre (49 h) — un travail abandonné ne tient rien',
    ajoute('claude/perimee', 49, ['tasks/lessons.md']), 'ignore', 'claude/perimee'],
  ['MA PROPRE branche écrit le chemin — je ne me dispute pas avec moi-même',
    (monde) => { monde.branches[0].ajoutes.push('apps/web/hooks/mien.ts'); monde.branches[0].divergents.push('apps/web/hooks/mien.ts'); }, 'ignore', 'claude/la-mienne'],
  ['un préfixe TROMPEUR : `apps/web-v3/…` ne répond pas au chemin `apps/web`',
    ajoute('claude/faux-prefixe', 1, ['apps/web-v3/lib/z.ts']), 'ignore', 'claude/faux-prefixe'],
  ['une branche déjà fusionnée n\'ajoute aucun fichier',
    ajoute('claude/fusionnee', 1, []), 'ignore', 'claude/fusionnee'],
  ['une branche SQUASHÉE — son diff trois-points l\'annonce encore, son contenu est dans la base',
    ajoute('claude/squashee', 1, ['tasks/lessons.md'], { fusionnes: ['tasks/lessons.md'] }),
    'ignore', 'claude/squashee'],
  ['un squash PARTIEL — un fichier atterri, un autre encore en attente',
    ajoute('claude/moitie', 1, ['tasks/lessons.md', 'apps/web/hooks/reste.ts'], { fusionnes: ['apps/web/hooks/reste.ts'] }),
    'voit', 'claude/moitie'],
];

const selfTest = () => {
  const chemins = ['tasks/lessons.md', 'apps/web'];
  const echecs = [];

  MUTATIONS.forEach(([titre, applique, sens, branche]) => {
    const vu = releve(mute(MONDE_TEMOIN(), applique), { chemins })
      .some((e) => e.branche === branche);
    if (sens === 'voit' && !vu) echecs.push(`AVEUGLE : « ${titre} » — ${branche} absente du relevé`);
    if (sens === 'ignore' && vu) echecs.push(`BRUIT : « ${titre} » — ${branche} rapportée à tort`);
  });

  const chaud = disputes(mute(MONDE_TEMOIN(), (m) => {
    ajoute('claude/a', 1, ['tasks/lessons.md'])(m);
    ajoute('claude/b', 2, ['tasks/lessons.md'])(m);
    ajoute('claude/c', 3, ['tasks/lessons.md'], { fusionnes: ['tasks/lessons.md'] })(m);
  }));
  const zone = chaud.find((d) => d.fichier === 'tasks/lessons.md');
  if (!zone || zone.branches.length !== 2) {
    echecs.push('AVEUGLE : la zone disputée compte mal — deux branches en attente, la squashée exclue');
  }

  if (verdict([], { fraisDepuisMin: 999, exigeFrais: true }) !== 2) {
    echecs.push('AVEUGLE : un distant périmé passe pour un relevé vide sous --exige-frais');
  }
  if (verdict([{ branche: 'x' }], { fraisDepuisMin: 1, exigeFrais: false }) !== 1) {
    echecs.push('AVEUGLE : une contention ne rend pas un code de sortie non nul');
  }

  echecs.forEach((e) => console.error(e));
  if (echecs.length > 0) {
    console.error(`\n${echecs.length} défaut(s) : le relevé ne voit pas ce qu'il prétend voir.`);
    return 1;
  }
  console.log(`self-test : ${MUTATIONS.length}/${MUTATIONS.length} mutations détectées, 4 invariants de verdict tenus.`);
  return 0;
};

// ---------------------------------------------------------------------------

const lisLesOptions = (argv) => {
  const valeur = (nom, defaut) => {
    const i = argv.indexOf(nom);
    return i === -1 ? defaut : argv[i + 1];
  };
  const apres = (nom) => {
    const i = argv.indexOf(nom);
    if (i === -1) return [];
    const pris = [];
    for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j += 1) pris.push(argv[j]);
    return pris;
  };
  return {
    chemins: apres('--chemins'),
    base: valeur('--base', 'origin/dev'),
    fenetre: Number(valeur('--fenetre', String(FENETRE_H))),
    json: argv.includes('--json'),
    fetch: argv.includes('--fetch'),
    exigeFrais: argv.includes('--exige-frais'),
  };
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();
  const o = lisLesOptions(argv);
  if (!Number.isFinite(o.fenetre) || o.fenetre <= 0) {
    console.error('--fenetre attend un nombre d\'heures positif.');
    return 2;
  }

  if (o.fetch) {
    try {
      await git(['fetch', 'origin', '--prune']);
    } catch (error) {
      console.error(`le rafraîchissement du distant a échoué : ${error.message.split('\n')[0]}`);
      console.error('Le relevé qui suit porte sur un distant PÉRIMÉ — ne pas le lire comme une autorisation.');
    }
  }

  let monde;
  try {
    monde = await lisLeMonde({ base: o.base, fenetre: o.fenetre, prefixes: PREFIXES });
  } catch (error) {
    console.error(`impossible de lire le distant (${o.base}) : ${error.message.split('\n')[0]}`);
    console.error(`Rejouer : git fetch origin --prune && git rev-parse --verify ${o.base}`);
    return 2;
  }

  const frais = monde.fraisDepuisMin;
  const vieux = frais === null || frais > FRAICHEUR_MIN;
  const contentions = o.chemins.length > 0 ? releve(monde, { chemins: o.chemins, fenetre: o.fenetre }) : [];
  const chaudes = o.chemins.length > 0 ? [] : disputes(monde, { fenetre: o.fenetre });

  if (o.json) {
    console.log(JSON.stringify({
      base: o.base,
      fenetre_h: o.fenetre,
      branche_courante: monde.courante,
      branches_vivantes: monde.branches.length,
      distant_frais_depuis_min: frais,
      distant_perime: vieux,
      chemins: o.chemins,
      contentions,
      zones_disputees: chaudes,
    }, null, 2));
    return verdict(contentions, { fraisDepuisMin: frais, exigeFrais: o.exigeFrais });
  }

  if (vieux) {
    console.error(frais === null
      ? 'ATTENTION : aucune trace de synchronisation (.git/FETCH_HEAD absent) — relancer avec --fetch.'
      : `ATTENTION : dernier fetch il y a ${frais} min — au-delà de ${FRAICHEUR_MIN} min, relancer avec --fetch.`);
  }

  console.log(`${monde.branches.length} branche(s) vivante(s) sur ${o.base} (< ${o.fenetre} h), branche courante : ${monde.courante || '(détachée)'}`);

  if (o.chemins.length === 0) {
    if (chaudes.length === 0) {
      console.log('Aucun fichier n\'est écrit par deux branches vivantes à la fois.');
    } else {
      console.log(`\n${chaudes.length} fichier(s) écrit(s) par plusieurs branches vivantes :\n`);
      chaudes.slice(0, PLAFOND_FICHIERS).forEach(({ fichier, branches }) =>
        console.log(`  ${String(branches.length).padStart(2)} × ${fichier}\n       ${branches.join('\n       ')}`));
      if (chaudes.length > PLAFOND_FICHIERS) console.log(`\n  … et ${chaudes.length - PLAFOND_FICHIERS} autre(s).`);
    }
    console.log('\nPasser --chemins <p1> <p2>… pour interroger les chemins qu\'on s\'apprête à écrire.');
    return verdict([], { fraisDepuisMin: frais, exigeFrais: o.exigeFrais });
  }

  if (contentions.length === 0) {
    console.log(`\nAucune branche vivante n'écrit : ${o.chemins.join(', ')}`);
    return verdict(contentions, { fraisDepuisMin: frais, exigeFrais: o.exigeFrais });
  }

  console.log(`\n${contentions.length} branche(s) vivante(s) écrivent déjà ces chemins :\n`);
  contentions.forEach(({ branche, age, fichiers }) => {
    console.log(`  ${branche}  (${age} h)`);
    fichiers.slice(0, PLAFOND_FICHIERS).forEach((f) => console.log(`      ${f}`));
    if (fichiers.length > PLAFOND_FICHIERS) console.log(`      … et ${fichiers.length - PLAFOND_FICHIERS} autre(s).`);
  });
  console.log('\nCe sont des CANDIDATS : une branche squashée puis dépassée par la base a la même');
  console.log('forme qu\'une branche vivante (§ LA LIMITE QUI RESTE). Avant de céder, trancher par');
  console.log(`  git merge-tree --write-tree ${o.base} <branche>   # que des conflits ⇒ doublon squashé`);
  console.log('\nPuis leçon 322 — quand deux lots se disputent un fichier, celui qui n\'a RIEN ÉCRIT');
  console.log('cède : un lot arrêté avant sa première écriture ne coûte que de la lecture.');

  return verdict(contentions, { fraisDepuisMin: frais, exigeFrais: o.exigeFrais });
};

process.exit(await main());
