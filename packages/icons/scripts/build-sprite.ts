#!/usr/bin/env node
// LE sprite Phosphor de la v3 web [infra-2, issue #4446] — conception § 3.3,
// § 8.5 et annexe (« Sprite des 72 glyphes — brut / gzip »).
//
//   node packages/icons/scripts/build-sprite.ts             génère et mesure
//   node packages/icons/scripts/build-sprite.ts --verifie    ne touche à rien, rend rc=1 sur défaut
//   node packages/icons/scripts/build-sprite.ts --json
//
// POURQUOI UN SPRITE COMMITÉ, ET PAS LA FONTE
//
// La fonte `@phosphor-icons/web` pèse 224 Ko pour une seule graisse (mesuré :
// 144 Ko woff2 + 80 Ko css) et bloque le premier pixel. Les 72 glyphes que la
// planche réclame tiennent dans un document SVG de quelques kilo-octets, servi
// en UNE requête à cache immuable (§ 8.5). Le sprite est COMMITÉ : la v3 ne
// télécharge rien au build, et un dépôt cloné sans réseau rend les mêmes
// octets. `@phosphor-icons/core` n'est qu'une devDependency — la source des
// tracés, jamais une dépendance de service.
//
// CE QUE CE FICHIER GARDE, ET POURQUOI LES CINQ DÉFAUTS TIENNENT ENSEMBLE
//
//   1. MANQUANT — une classe `ph-*` réclamée sans son `<symbol>`. C'est la
//      panne MUETTE du § 8.5 : le `<use>` ne rend rien, aucune console ne
//      rougit, et la capture de conformité montre un trou qu'on prend pour une
//      marge. C'est le gate anti-panne que #4442 attend, et `glyphesReferences`
//      en est le site unique — un consommateur qui réécrit la regex fabrique la
//      jumelle.
//   2. ORPHELIN — un `<symbol>` que personne ne réclame. Des octets servis à
//      tous les lecteurs du rôle premier pour un glyphe que rien n'affiche.
//   3. DÉRIVE — un fichier commité qui n'est plus la sortie du script. Un actif
//      généré qu'on peut éditer à la main est un actif qui DIVERGERA de son
//      générateur ; le témoin compare les octets, pas les intentions.
//   4. DÉPASSEMENT — le poids gzip du sprite contre le plafond de 12 Ko du
//      § 8.5, et le NOMBRE de glyphes du sous-sprite critique contre les 8 que
//      le même paragraphe autorise à inliner. Le § 8.5 ne donne aucun POIDS au
//      sous-sprite : on ne lui en invente pas un, on borne ce qui est écrit et
//      on MESURE le reste.
//   5. HORS CRITIQUE — une référence LOCALE (`<use href="#ph-x">`) à un glyphe
//      absent de `critical.svg`. La livraison à DEUX fichiers crée ce clivage :
//      un fragment sans hôte ne résout que dans le document courant, donc dans
//      le seul sous-sprite inliné. Le symbole existe bien — dans `sprite.svg` —
//      et c'est précisément ce qui rend le défaut n° 1 aveugle à ce cas : sans
//      la PORTÉE de la référence, l'audit rend un rapport vert sur un écran qui
//      n'affiche rien. Même panne muette, une couche plus bas.
//
// Les cinq se lisent sur les mêmes entrées (les références réclamées, les
// fichiers commités, les tracés de la source) : les séparer en cinq scripts les
// ferait diverger sur la définition de « ce qui est réclamé ».
//
// CE QUI RÉCLAME, ET CE QUE CETTE MESURE VAUT ENCORE
//
// `sourcesQuiReclament()` rend la planche ET l'arbre de sources de la v3
// (`app/`, `components/`, `lib/`). Les deux, jamais l'une : la planche seule
// laisserait le gate du § 8.5 VIDE quoi qu'écrive la v3 (aucun de ses chemins
// n'étant lu), et obligerait à éditer une maquette de DESIGN pour débloquer un
// actif de PRODUCTION dès qu'un écran réclame un glyphe de plus.
//
// Le défaut ORPHELIN, lui, reste mesuré contre l'UNION — donc, tant que la v3
// est vide, contre la planche. Quand la v3 n'utilisera réellement que ~20 des
// 73 symboles, les 53 autres seront toujours servis à chaque lecteur du rôle
// premier et l'audit les déclarera légitimes. Ce n'est PAS gardé ici : c'est
// l'issue #4469, qui se solde en retirant la planche de `sourcesQuiReclament()`
// une fois les 44 lignes de la matrice livrées.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export type Glyphe = {
  readonly nom: string;
  readonly viewBox: string;
  readonly corps: string;
};

export type Mesure = {
  readonly brut: number;
  readonly gzip: number;
};

export type Depassement = {
  readonly quoi: string;
  readonly unite: string;
  readonly valeur: number;
  readonly plafond: number;
};

export type RapportDeSprite = {
  readonly manquants: readonly string[];
  readonly orphelins: readonly string[];
  readonly horsCritique: readonly string[];
  readonly derives: readonly string[];
  readonly depassements: readonly Depassement[];
};

// Où une référence peut RÉSOUDRE, ce qui n'est pas la même question que « quel
// glyphe nomme-t-elle ». `classe` est la forme de la planche (`class="ph ph-x"`,
// la fonte) ; `local` est un fragment SANS hôte (`href="#ph-x"`), qui ne résout
// que dans le document courant — donc dans le seul sous-sprite INLINÉ ; `externe`
// porte son hôte (`href="/sprite.svg#ph-x"`) et atteint le sprite complet.
export type Portee = 'classe' | 'local' | 'externe';

export type Reference = {
  readonly nom: string;
  readonly portee: Portee;
};

export type GlypheCritique = {
  readonly nom: string;
  readonly pourquoi: string;
};

export type Critique = {
  readonly revise_par: string;
  readonly glyphes: readonly GlypheCritique[];
};

// Une GRAISSE n'est pas un glyphe : c'est un QUALIFIANT posé à côté du nom
// (`class="ph-fill ph-play"`). Elle ne se JETTE pas pour autant — le bouton
// LECTURE de la planche (cercle de reel 68 px, lecteur audio 44 px, story 56 px,
// bulle vocale 38 px) est un triangle PLEIN, et lui servir la variante regular
// rendrait un triangle CREUX au centre d'un disque plein : un écart de
// DISPOSITION, hors de l'écart typographique que la v3 assume. Le couple se
// RÉSOUT donc en un symbole à lui : `ph-fill ph-play` → `<symbol id="ph-fill-play">`,
// tracé pris dans `assets/fill/play-fill.svg`.
//
// La valeur est le DOSSIER de `@phosphor-icons/core/assets` ET le suffixe du
// fichier, qui sont le même mot chez Phosphor. L'identifiant composé ne peut
// collisionner avec un glyphe regular : aucun nom d'`assets/regular/` ne commence
// par `fill-` (vérifié sur la 2.1.1, 1 512 fichiers).
const GRAISSES: ReadonlyMap<string, string> = new Map([['ph-fill', 'fill']]);

const PREFIXE = 'ph-';
const NOM = 'ph-[a-z0-9]+(?:-[a-z0-9]+)*';
const GRAISSE_ALT = [...GRAISSES.keys()].join('|');

// UNE regex pour les trois formes, parce qu'elles répondent à la même question
// (« qu'est-ce que cette source réclame, et où ça résout ») et que deux regexes
// divergeraient sur la réponse. La forme `href` passe EN PREMIER : elle consomme
// le guillemet fermant, donc l'alternative de classe ne repasse pas sur l'ancre.
const REFERENCE = new RegExp(
  `href=["']([^"'#]*)#(${NOM})["']|\\b(?:(${GRAISSE_ALT})\\s+)?(${NOM})\\b`,
  'g',
);

const OUVERTURE = /^<svg\b[^>]*>/;
const FERMETURE = /<\/svg>\s*$/;
const VIEW_BOX = /\bviewBox="([^"]+)"/;
// Le rectangle de cadrage de certains exports Phosphor : il ne peint rien
// (`fill="none"`) et ne sert qu'à figer la boîte dans un éditeur.
const CADRE = /<rect\b[^>]*\bfill="none"[^>]*\/>/g;
const SYMBOLE_ID = /<symbol\b[^>]*\bid="(ph-[a-z0-9-]+)"/g;

const RACINE_ASSETS = ['node_modules', '@phosphor-icons', 'core', 'assets'] as const;

const uniqueTrie = (valeurs: readonly string[]): readonly string[] =>
  [...new Set(valeurs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Une graisse écrite SEULE (`class="ph-fill"`, sans glyphe à côté) ne nomme
// aucune icône : elle n'entre pas dans la table. Ce n'est pas l'exclusion muette
// d'avant — le couple graisse+glyphe, lui, est RÉSOLU et servi — mais le rejet
// d'un jeton qui ne désigne aucun tracé, dans aucun dossier de la source.
const referenceDe = (trouve: RegExpExecArray): readonly Reference[] => {
  const [, hote, ancre, graisse, classe] = trouve;
  if (ancre !== undefined) {
    return [{ nom: ancre, portee: hote === '' ? 'local' : 'externe' }];
  }
  if (classe === undefined || (graisse === undefined && GRAISSES.has(classe))) return [];
  const nom = graisse === undefined ? classe : `${graisse}-${classe.slice(PREFIXE.length)}`;
  return [{ nom, portee: 'classe' }];
};

export const glyphesReferences = (source: string): readonly Reference[] => {
  const vues = new Map<string, Reference>();
  for (const trouve of source.matchAll(REFERENCE)) {
    for (const reference of referenceDe(trouve)) {
      vues.set(`${reference.nom} ${reference.portee}`, reference);
    }
  }
  return [...vues.values()].sort(
    (a, b) => compare(a.nom, b.nom) || compare(a.portee, b.portee),
  );
};

export const nomsReclames = (references: readonly Reference[]): readonly string[] =>
  uniqueTrie(references.map((reference) => reference.nom));

// `ph-play` → `regular/play.svg` ; `ph-fill-play` → `fill/play-fill.svg`.
export const cheminDuGlyphe = (nom: string): string => {
  const graisse = [...GRAISSES].find(([classe]) => nom.startsWith(`${classe}-`));
  if (graisse === undefined) return join('regular', `${nom.slice(PREFIXE.length)}.svg`);
  const [classe, dossier] = graisse;
  return join(dossier, `${nom.slice(classe.length + 1)}-${dossier}.svg`);
};

export const glypheDeFichier = (nom: string, svg: string): Glyphe => {
  const ouverture = OUVERTURE.exec(svg);
  const viewBox = ouverture === null ? null : VIEW_BOX.exec(ouverture[0]);
  if (viewBox === null) {
    throw new Error(`${nom} : aucun viewBox dans le fichier source — il ne s'invente pas`);
  }
  return {
    nom,
    viewBox: viewBox[1] ?? '',
    corps: svg.replace(OUVERTURE, '').replace(FERMETURE, '').replace(CADRE, '').trim(),
  };
};

// `fill="currentColor"` est posé sur le SYMBOLE, seul niveau que le clone d'un
// `<use>` emporte : le porter sur le `<svg>` racine du sprite ne survit pas à
// une référence externe, où l'hôte ne cascade pas dans le document référencé.
export const symbole = (glyphe: Glyphe): string =>
  `<symbol id="${glyphe.nom}" viewBox="${glyphe.viewBox}" fill="currentColor">${glyphe.corps}</symbol>`;

export const composeSprite = (glyphes: readonly Glyphe[]): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:none">${glyphes
    .map(symbole)
    .join('')}</svg>\n`;

export const symbolesDuSprite = (sprite: string): readonly string[] =>
  [...sprite.matchAll(SYMBOLE_ID)].flatMap((trouve) => (trouve[1] === undefined ? [] : [trouve[1]]));

export const mesure = (svg: string): Mesure => ({
  brut: Buffer.byteLength(svg),
  gzip: gzipSync(Buffer.from(svg), { level: 9 }).length,
});

// Où sont les tracés source — la racine `assets/`, PAS un dossier de graisse :
// un sprite qui sert `regular/` et `fill/` a une seule racine et autant de
// sous-dossiers que de graisses (`cheminDuGlyphe`). `@phosphor-icons/core` est
// une devDependency de la RACINE — le générateur est un outil de dépôt (§ 9.3 le
// lance depuis la racine) et l'image de la v3, qui copie `packages/icons/`, n'a
// aucune raison d'embarquer 1 512 SVG. Le premier candidat reste l'arbre local :
// bun installe en mode ISOLÉ, et le jour où le paquet redescend ici, rien à changer.
export const racineDesTraces = (racineIcones: string): string => {
  const candidats = [
    join(racineIcones, ...RACINE_ASSETS),
    join(racineIcones, '..', '..', ...RACINE_ASSETS),
  ];
  const trouve = candidats.find((chemin) => existsSync(chemin));
  if (trouve === undefined) {
    throw new Error(
      '@phosphor-icons/core est absent — `bun install` puis relancer ; les tracés ne se devinent pas',
    );
  }
  return trouve;
};

export const lisGlyphes = (args: {
  readonly racineIcones: string;
  readonly noms: readonly string[];
}): readonly Glyphe[] => {
  const racine = racineDesTraces(args.racineIcones);
  return args.noms.map((nom) =>
    glypheDeFichier(nom, readFileSync(join(racine, cheminDuGlyphe(nom)), 'utf8')),
  );
};

// Les noms dont la SOURCE porte un tracé. Depuis que l'arbre de la v3 est lu,
// un nom réclamé peut ne correspondre à AUCUN fichier Phosphor — une faute de
// frappe dans du vrai code (`ph-zorglub`). Sans ce filtre, `lisGlyphes` rend un
// ENOENT et l'audit meurt AVANT de pouvoir nommer le défaut : une panne muette
// remplacée par une pile d'appels, ce que ce fichier existe pour empêcher. Le
// nom écarté ici retombe en MANQUANT (aucun `<symbol>` ne le sert), qui est sa
// description exacte ; le composer dans le sprite attendu ferait en plus
// accuser `derives` à tort — un seul défaut par cause.
export const tracesExistantes = (args: {
  readonly racineIcones: string;
  readonly noms: readonly string[];
}): readonly string[] => {
  const racine = racineDesTraces(args.racineIcones);
  return args.noms.filter((nom) => existsSync(join(racine, cheminDuGlyphe(nom))));
};

// Ce que la v3 lit pour savoir CE QUI RÉCLAME. La planche porte la cible de
// design ; l'arbre de sources porte le produit. Les deux, sinon le § 8.5 garde
// une maquette et laisse passer le code (voir l'en-tête).
export const SOURCES_QUI_RECLAMENT: readonly string[] = [
  join('docs', 'product', 'MeeshyWebV3Design', 'MeeshyWebV3.dc.html'),
  join('apps', 'web-v3', 'app'),
  join('apps', 'web-v3', 'components'),
  join('apps', 'web-v3', 'lib'),
];

// Pas les `.svg` : un sous-sprite inliné n'est pas une demande, c'est une
// réponse. Pas `__tests__` non plus — il n'est dans aucun chemin ci-dessus,
// et ses glyphes de fixture (`ph-bell`, `ph-house`) feraient réclamer au
// produit des icônes que personne n'affiche.
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html']);

const IGNORES = new Set(['node_modules', '.next', 'coverage', 'dist']);

const extensionDe = (chemin: string): string => {
  const point = chemin.lastIndexOf('.');
  return point === -1 ? '' : chemin.slice(point);
};

// Un chemin ABSENT n'est pas une erreur : `components/` et `lib/` n'existent pas
// tant qu'aucun lot ne les a créés, et le générateur doit tourner AVANT eux.
export const fichiersQuiReclament = (
  depot: string,
  chemins: readonly string[] = SOURCES_QUI_RECLAMENT,
): readonly string[] =>
  chemins.flatMap((relatif) => {
    const chemin = join(depot, relatif);
    if (!existsSync(chemin)) return [];
    if (!statSync(chemin).isDirectory()) return EXTENSIONS.has(extensionDe(chemin)) ? [chemin] : [];
    return readdirSync(chemin, { withFileTypes: true })
      .filter((entree) => !IGNORES.has(entree.name))
      .map((entree) => join(relatif, entree.name))
      .sort(compare)
      .flatMap((enfant) => fichiersQuiReclament(depot, [enfant]));
  });

// Le sous-sprite critique suit l'ordre DÉCLARÉ dans `critique.json`, pas l'ordre
// alphabétique du sprite complet : la déclaration est la source, et un ordre
// dérivé obligerait le porteur à trier sa liste pour que le fichier ne bouge pas.
export const glyphesCritiquesDe = (
  glyphes: readonly Glyphe[],
  critiques: readonly string[],
): readonly Glyphe[] =>
  critiques.flatMap((nom) => {
    const trouve = glyphes.find((glyphe) => glyphe.nom === nom);
    return trouve === undefined ? [] : [trouve];
  });

export const audit = (args: {
  readonly references: readonly Reference[];
  readonly critiques: readonly string[];
  readonly sprite: string;
  readonly critical: string;
  readonly glyphes: readonly Glyphe[];
  readonly plafondGzipOctets: number;
  readonly plafondGlyphesCritiques: number;
}): RapportDeSprite => {
  const servis = new Set(symbolesDuSprite(args.sprite));
  const inlines = new Set(symbolesDuSprite(args.critical));
  const reclames = new Set([...nomsReclames(args.references), ...args.critiques]);
  const attenduSprite = composeSprite(args.glyphes);
  const attenduCritical = composeSprite(glyphesCritiquesDe(args.glyphes, args.critiques));
  const gzipSprite = mesure(args.sprite).gzip;
  const glyphesCritiques = symbolesDuSprite(args.critical).length;

  return {
    manquants: [...reclames].filter((nom) => !servis.has(nom)).sort(),
    orphelins: [...servis].filter((nom) => !reclames.has(nom)).sort(),
    horsCritique: uniqueTrie(
      args.references
        .filter((reference) => reference.portee === 'local' && !inlines.has(reference.nom))
        .map((reference) => reference.nom),
    ),
    derives: [
      ...(args.sprite === attenduSprite ? [] : ['sprite.svg']),
      ...(args.critical === attenduCritical ? [] : ['critical.svg']),
    ],
    depassements: [
      ...(gzipSprite > args.plafondGzipOctets
        ? [
            {
              quoi: 'sprite.svg',
              unite: 'octets gzip',
              valeur: gzipSprite,
              plafond: args.plafondGzipOctets,
            },
          ]
        : []),
      ...(glyphesCritiques > args.plafondGlyphesCritiques
        ? [
            {
              quoi: 'critical.svg',
              unite: 'glyphes',
              valeur: glyphesCritiques,
              plafond: args.plafondGlyphesCritiques,
            },
          ]
        : []),
    ],
  };
};

export const verdict = (rapport: RapportDeSprite): number =>
  rapport.manquants.length +
    rapport.orphelins.length +
    rapport.horsCritique.length +
    rapport.derives.length +
    rapport.depassements.length ===
  0
    ? 0
    : 1;

const bloc = (titre: string, pourquoi: string, lignes: readonly string[]): readonly string[] =>
  lignes.length === 0 ? [] : ['', titre, `  (${pourquoi})`, ...lignes];

export const formateAudit = (rapport: RapportDeSprite): string =>
  [
    ...bloc(
      'Glyphes réclamés sans <symbol> :',
      "le <use> ne rend RIEN et rien ne rougit — c'est la panne muette du § 8.5",
      rapport.manquants.map((nom) => `  ${nom}`),
    ),
    ...bloc(
      'Symboles que personne ne réclame :',
      'des octets servis à chaque lecteur du rôle premier pour un glyphe que rien n’affiche',
      rapport.orphelins.map((nom) => `  ${nom}`),
    ),
    ...bloc(
      'Glyphes référencés en LOCAL mais absents du sous-sprite inliné :',
      'un fragment sans hôte ne résout que dans critical.svg — le <use> ne rend rien, et le symbole existe pourtant dans sprite.svg',
      rapport.horsCritique.map((nom) => `  ${nom}`),
    ),
    ...bloc(
      'Fichiers commités qui ont dérivé de leur génération :',
      'un actif généré édité à la main divergera de son générateur',
      rapport.derives.map((nom) => `  ${nom}`),
    ),
    ...bloc(
      'Plafonds franchis :',
      '§ 8.5 — sprite externe ≤ 12 Ko gzip, sous-sprite critique ≤ 8 glyphes',
      rapport.depassements.map(
        (d) => `  ${d.quoi} : ${d.valeur} ${d.unite} (plafond ${d.plafond})`,
      ),
    ),
    verdict(rapport) === 0
      ? 'sprite: les glyphes réclamés sont tous servis, aucun de trop, aucune dérive, plafonds tenus.'
      : 'sprite: défauts ci-dessus.',
  ].join('\n');

const COMMANDE = 'node packages/icons/scripts/build-sprite.ts';

export const fragmentDeMesures = (args: {
  readonly sprite: string;
  readonly critical: string;
  readonly date?: string;
}): {
  readonly quoi: string;
  readonly source: string;
  readonly commande: string;
  readonly date: string | undefined;
  readonly sprite_svg: Mesure;
  readonly critical_svg: Mesure;
  readonly glyphes: number;
  readonly glyphes_critiques: number;
} => ({
  quoi: 'Les octets des deux actifs commités de packages/icons — le sprite externe servi en une requête à cache immuable, et le sous-sprite critique inliné dans le layout (§ 8.5).',
  source: '@phosphor-icons/core@2.1.1, assets/regular + assets/fill',
  commande: COMMANDE,
  date: args.date,
  sprite_svg: mesure(args.sprite),
  critical_svg: mesure(args.critical),
  glyphes: symbolesDuSprite(args.sprite).length,
  glyphes_critiques: symbolesDuSprite(args.critical).length,
});

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPOT = join(RACINE, '..', '..');
const MESURES = join(DEPOT, 'apps', 'web-v3', 'budgets-mesures.json');
const BUDGETS = join(DEPOT, 'apps', 'web-v3', 'budgets.json');

const lis = (chemin: string): string => readFileSync(chemin, 'utf8');

const plafonds = (): { readonly gzipOctets: number; readonly glyphesCritiques: number } => {
  const budgets: {
    readonly actifs?: {
      readonly plafonds?: Readonly<Record<string, { readonly valeur?: unknown }>>;
    };
  } = JSON.parse(lis(BUDGETS));
  const sprite = budgets.actifs?.plafonds?.sprite_ko?.valeur;
  const critiques = budgets.actifs?.plafonds?.critical_glyphes?.valeur;
  if (typeof sprite !== 'number' || typeof critiques !== 'number') {
    throw new Error('budgets.json ne porte pas actifs.plafonds — le plafond ne s’invente pas');
  }
  return { gzipOctets: sprite * 1024, glyphesCritiques: critiques };
};

const critique = (): Critique => JSON.parse(lis(join(RACINE, 'critique.json')));

const memeMesure = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const ecritMesures = (sprite: string, critical: string): void => {
  const fichier: Record<string, unknown> = JSON.parse(lis(MESURES));
  const precedent = fichier.sprite_phosphor;
  const frais = fragmentDeMesures({ sprite, critical });
  const inchange =
    typeof precedent === 'object' &&
    precedent !== null &&
    memeMesure({ ...precedent, date: undefined }, frais);
  fichier.sprite_phosphor = inchange
    ? precedent
    : fragmentDeMesures({ sprite, critical, date: new Date().toISOString().slice(0, 10) });
  writeFileSync(MESURES, `${JSON.stringify(fichier, null, 1)}\n`, 'utf8');
};

// UNE lecture de ce qui réclame, partagée par la génération et par l'audit :
// deux lectures divergeraient sur « ce qui est réclamé », et c'est précisément
// l'écart que les cinq défauts ne sauraient pas voir.
const referencesDuDepot = (): readonly Reference[] =>
  glyphesReferences(fichiersQuiReclament(DEPOT).map(lis).join('\n'));

const servables = (references: readonly Reference[]): readonly Glyphe[] =>
  lisGlyphes({
    racineIcones: RACINE,
    noms: tracesExistantes({ racineIcones: RACINE, noms: nomsReclames(references) }),
  });

const genere = (references: readonly Reference[]): readonly [string, string] => {
  const critiques = critique().glyphes.map((g) => g.nom);
  const glyphes = servables(references);
  return [composeSprite(glyphes), composeSprite(glyphesCritiquesDe(glyphes, critiques))];
};

const rapportDuDepot = (
  references: readonly Reference[],
  sprite: string,
  critical: string,
): RapportDeSprite => {
  const { gzipOctets, glyphesCritiques } = plafonds();
  return audit({
    references,
    critiques: critique().glyphes.map((g) => g.nom),
    sprite,
    critical,
    glyphes: servables(references),
    plafondGzipOctets: gzipOctets,
    plafondGlyphesCritiques: glyphesCritiques,
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verifie = process.argv.includes('--verifie');
  const references = referencesDuDepot();
  const [sprite, critical] = verifie
    ? [lis(join(RACINE, 'sprite.svg')), lis(join(RACINE, 'critical.svg'))]
    : genere(references);

  if (!verifie) {
    writeFileSync(join(RACINE, 'sprite.svg'), sprite, 'utf8');
    writeFileSync(join(RACINE, 'critical.svg'), critical, 'utf8');
    ecritMesures(sprite, critical);
  }

  const rapport = rapportDuDepot(references, sprite, critical);
  const mesures = fragmentDeMesures({ sprite, critical });
  const octets = (fichier: string, { brut, gzip }: Mesure): string =>
    `${fichier} ${brut} o brut / ${gzip} o gzip`;

  process.stdout.write(
    process.argv.includes('--json')
      ? `${JSON.stringify({ ...rapport, mesures }, null, 1)}\n`
      : [
          formateAudit(rapport),
          `${octets('sprite.svg', mesures.sprite_svg)} · ${octets('critical.svg', mesures.critical_svg)}`,
          '',
        ].join('\n'),
  );
  process.exit(verdict(rapport));
}
