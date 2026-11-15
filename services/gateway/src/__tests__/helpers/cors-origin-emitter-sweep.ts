/**
 * La MESURE des portes qui DÉCIDENT d'une origine — écrite sur ce qui SORT (#4538).
 *
 * ## Pourquoi ce balayage est écrit à l'envers du précédent
 *
 * #4480 a rendu la résolution des origines UNIQUE pour les portes qui LISENT
 * `CORS_ORIGINS` / `ALLOWED_ORIGINS`. L'inventaire de ces LECTEURS était complet,
 * et il a quand même laissé une porte dehors :
 *
 * ```
 * routes/attachments/download.ts → reply.header('Access-Control-Allow-Origin', '*')
 * ```
 *
 * Elle ne participe à AUCUNE phrase contenant le nom de la variable. Chercher
 * « qui lit `CORS_ORIGINS` » en trouve deux ; chercher « qu'est-ce qui POSE un
 * en-tête d'origine » en trouve quatre. D'où l'angle de ce module : il ne
 * cherche jamais ce qui est lu, seulement ce qui est ÉMIS.
 *
 * ## Les deux formes d'émission, mesurées le 2026-08-31
 *
 * Un balayage qui ne connaîtrait que la première serait vert sur la moitié du
 * dépôt, et sur la moitié la plus difficile à voir :
 *
 * | forme | ce que la source contient | portes mesurées |
 * |---|---|---|
 * | `litterale` | le NOM de l'en-tête, dans un appel qui le pose | 1 (`download.ts`) |
 * | `deleguee` | la CONSTRUCTION d'un composant qui le pose à sa place | 3 (`server.ts`, `MeeshySocketIOManager.ts`, `tus-handler.ts`) |
 *
 * **Trois portes sur quatre ne nomment jamais l'en-tête qu'elles font poser.**
 * `server.ts` ne contient pas la chaîne `Access-Control-Allow-Origin` ; c'est
 * `@fastify/cors` qui la pose, depuis l'option `origin` qu'on lui donne. Un
 * balayage écrit sur le seul nom de l'en-tête raterait donc les trois — dont
 * `tus-handler.ts`, la quatrième porte, que #4538 ne connaissait pas et qui
 * n'est gouvernée par rien (voir `PORTES_HORS_REGLE` dans `config/cors-origins.ts`).
 *
 * ## Ce qui distingue une délégation d'un simple import
 *
 * Quatre fichiers de production importent `socket.io` ; un seul en CONSTRUIT le
 * serveur. Les trois autres n'en prennent que des types (`import type { Socket }`,
 * `utils/socket-rate-limiter.ts`) et ne posent aucun en-tête. Le discriminant
 * est donc la CONSTRUCTION (`new <liaison>(…)`, `register(<liaison>, …)`), jamais
 * l'import : un balayage bâti sur l'import rendrait trois faux positifs, et un
 * cliquet qui rougit à tort finit désactivé.
 *
 * ## Deux limites, dites plutôt que découvertes
 *
 * 1. **Le détecteur littéral ne dépouille pas les commentaires.** Un fichier qui
 *    se contente de MENTIONNER `Access-Control-Allow-Origin` en prose est donc
 *    relevé comme une porte. C'est le bon sens de l'erreur — il rougit, quelqu'un
 *    regarde — et c'est ce qui évite d'écrire un dépouilleur de commentaires dont
 *    la seule façon de se tromper serait de manquer une VRAIE émission. Seule
 *    exception : le module de la règle, qui nomme forcément l'en-tête qu'il
 *    gouverne, et dont le cliquet vérifie en retour qu'il ne pose rien.
 * 2. **Le détecteur de délégation part d'un registre DÉCLARÉ**
 *    (`COMPOSANTS_EMETTEURS`), vérifié contre les paquets installés mais pas
 *    découvert depuis eux. Une dépendance NEUVE qui poserait l'en-tête n'est vue
 *    qu'une fois inscrite ici. La découverte automatique a été mesurée puis
 *    ÉCARTÉE : balayer les 47 dépendances directes coûte 9 s, rate `socket.io`
 *    (son émetteur est le paquet `cors`, atteint par un lien symbolique que le
 *    parcours ne suivait pas) et rend `@prisma/client` en faux positif — un
 *    balayage plus lent, moins juste, et faux dans le sens rassurant.
 *
 * ## Ce que ce module ne décide pas
 *
 * Il MESURE, il ne juge pas. « Cette porte est-elle gouvernée par la règle ? »
 * est répondu par `citeLaRegle`, dont les noms à chercher sont un PARAMÈTRE
 * (`RESOLVEURS_DE_LA_REGLE`, exporté par la règle elle-même) — comme
 * `SelecteurDeFichier` l'est pour `file-size-sweep`. Le balayage ignore ainsi
 * tout de la règle qu'il sert, et la renommer ne le fait pas mentir.
 *
 * Le VERDICT — gouvernée, déclarée hors règle, ou inconnue — vit chez son
 * cliquet, `cors-origin-emitter-sweep.test.ts`.
 */
import type { Stats } from 'fs';
import { readFileSync, readdirSync, realpathSync, statSync } from 'fs';
import { dirname, extname, join, relative } from 'path';

import { isHandWrittenSource, walk } from './file-size-sweep';

/**
 * L'en-tête qui PORTE la décision, en minuscules — les noms d'en-têtes HTTP
 * sont insensibles à la casse et rien n'oblige une source à écrire la forme
 * canonique. Les autres `Access-Control-Allow-*` (`Credentials`, `Methods`,
 * `Headers`) QUALIFIENT la même décision : ils sont relevés, jamais confondus
 * avec elle.
 */
export const ENTETE_ORIGINE = 'access-control-allow-origin';

const MOTIF_ENTETE = /Access-Control-Allow-[A-Za-z]+/gi;

/**
 * L'en-tête ET la valeur qu'on lui donne, dans les deux formes que ce dépôt
 * emploie : l'appel (`reply.header(nom, valeur)`, `headers.set(nom, valeur)`)
 * et l'objet littéral (`{ nom: valeur }`). C'est ce qui permet au cliquet de
 * comparer la valeur DÉCLARÉE à la valeur réellement posée, plutôt que de
 * croire une table sur parole.
 */
const MOTIF_ENTETE_VALEUR = /['"](Access-Control-Allow-[A-Za-z]+)['"]\s*[,:]\s*['"]([^'"]*)['"]/gi;

/** Ce qui POSE un en-tête, toutes formes confondues — sert à mesurer un trou, pas une porte. */
const MOTIF_POSE_ENTETE = /\.(?:header|headers|setHeader)\s*\(|\bwriteHead\s*\(|\bheaders\.set\s*\(/;

/**
 * Un composant qui pose un en-tête d'origine À LA PLACE de la source qui le
 * construit. La liste est VÉRIFIÉE contre le paquet installé par
 * `composantPoseLEnTete` : une entrée qui cesse d'émettre (paquet mis à jour,
 * CORS retiré) est une déclaration périmée, pas un acquis.
 */
export type ComposantEmetteur = {
  /** Le spécificateur de module, tel qu'un `import … from '…'` le porte. */
  readonly module: string;
  /** Ce qu'il pose, et d'où il tire la valeur — mesuré dans le paquet installé. */
  readonly quoi: string;
};

export const COMPOSANTS_EMETTEURS: readonly ComposantEmetteur[] = Object.freeze([
  {
    module: '@fastify/cors',
    quoi: "pose `Access-Control-Allow-Origin` (et `…-Credentials`, `…-Methods`) depuis son option `origin`",
  },
  {
    module: 'socket.io',
    quoi: "délègue au paquet `cors` de son propre îlot, qui pose l'en-tête depuis `cors.origin`",
  },
  {
    module: '@tus/server',
    quoi: "pose l'en-tête depuis `allowedOrigins` — et rend `'*'` quand l'option manque (`getCorsOrigin`)",
  },
]);

type EmissionCommune = {
  /** Chemin relatif à la racine balayée, séparateurs POSIX comme partout ailleurs. */
  readonly fichier: string;
  /**
   * Le fichier IMPORTE-t-il la règle et en cite-t-il un résolveur ? MESURÉ.
   * L'import est exigé en plus du nom pour qu'un doc-comment qui NOMME un
   * résolveur — pour dire qu'il ne l'emploie pas, par exemple — ne fasse pas
   * passer une porte pour gouvernée.
   */
  readonly citeLaRegle: boolean;
};

export type EmissionLitterale = EmissionCommune & {
  readonly forme: 'litterale';
  /** Les `Access-Control-Allow-*` nommés par la source, en minuscules. */
  readonly entetes: readonly string[];
  /** Les valeurs littérales données à `Access-Control-Allow-Origin`. */
  readonly valeurs: readonly string[];
};

export type EmissionDeleguee = EmissionCommune & {
  readonly forme: 'deleguee';
  readonly composant: string;
};

export type EmissionOrigine = EmissionLitterale | EmissionDeleguee;

const echapper = (texte: string): string => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Les liaisons locales qu'un `import … from '<module>'` introduit, hors imports
 * de TYPE : `import type { Server } from 'socket.io'` n'appelle rien à
 * l'exécution et ne peut donc rien poser.
 */
const liaisonsDeLaClause = (clause: string): readonly string[] => {
  const brut = clause.trim();
  if (brut.startsWith('type ')) return [];

  return brut
    .replace(/[{}]/g, ' ')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('type '))
    .map((part) => {
      const alias = /\bas\s+([A-Za-z_$][\w$]*)/.exec(part);
      return alias ? alias[1] : part.replace(/^\*\s*/, '').trim();
    })
    .filter((nom) => /^[A-Za-z_$][\w$]*$/.test(nom));
};

const liaisonsImportees = (texte: string, module: string): readonly string[] => {
  const motif = new RegExp(`import\\s+([^;]*?)\\s+from\\s+['"]${echapper(module)}['"]`, 'g');
  return [...texte.matchAll(motif)].flatMap(([, clause]) => liaisonsDeLaClause(clause));
};

/**
 * La liaison est-elle CONSTRUITE ? Les deux formes du dépôt : `new X(…)`
 * — avec ses paramètres de type éventuels, `new SocketIOServer<A, B>(…)` — et
 * `register(X, …)`, par quoi Fastify installe un greffon.
 */
const construit = (texte: string, liaison: string): boolean => {
  const nom = echapper(liaison);
  return (
    new RegExp(`new\\s+${nom}\\s*(?:<[^<>]*>)?\\s*\\(`).test(texte) ||
    new RegExp(`register\\s*\\(\\s*${nom}\\b`).test(texte)
  );
};

/**
 * `require('<module>')` compte SANS chercher de construction : cette forme ne
 * donne pas de liaison analysable aussi simplement, et la manquer coûterait une
 * porte. Aucune source de production ne l'emploie aujourd'hui — le jour où
 * l'une le fera, le cliquet rougira et quelqu'un regardera, ce qui est le bon
 * sens de l'erreur.
 */
const delegue = (texte: string, module: string): boolean =>
  new RegExp(`require\\(\\s*['"]${echapper(module)}['"]\\s*\\)`).test(texte) ||
  liaisonsImportees(texte, module).some((liaison) => construit(texte, liaison));

const importeLaRegle = (texte: string, moduleDeLaRegle: string): boolean =>
  new RegExp(`from\\s+['"][^'"]*${echapper(moduleDeLaRegle.replace(/\.ts$/, ''))}['"]`).test(texte);

/** Un fichier POSE-t-il un en-tête, quel qu'il soit ? Sert à prouver l'absence, pas la présence. */
export const poseUnEnTete = (texte: string): boolean => MOTIF_POSE_ENTETE.test(texte);

const emissionsDuFichier = (
  fichier: string,
  texte: string,
  regle: RegleDesOrigines
): readonly EmissionOrigine[] => {
  const citeLaRegle =
    importeLaRegle(texte, regle.module) && regle.resolveurs.some((nom) => texte.includes(nom));

  const entetes = [...new Set((texte.match(MOTIF_ENTETE) ?? []).map((e) => e.toLowerCase()))];
  const valeurs = [
    ...new Set(
      [...texte.matchAll(MOTIF_ENTETE_VALEUR)]
        .filter(([, entete]) => entete.toLowerCase() === ENTETE_ORIGINE)
        .map(([, , valeur]) => valeur)
    ),
  ];

  const litterale: readonly EmissionOrigine[] =
    entetes.length > 0 ? [{ forme: 'litterale', fichier, citeLaRegle, entetes, valeurs }] : [];

  const deleguees: readonly EmissionOrigine[] = COMPOSANTS_EMETTEURS.filter((composant) =>
    delegue(texte, composant.module)
  ).map((composant) => ({ forme: 'deleguee', fichier, citeLaRegle, composant: composant.module }));

  return [...litterale, ...deleguees];
};

/**
 * La règle dont ce balayage cherche les clients — passée en PARAMÈTRE pour que
 * la mesure ne connaisse rien de ce qu'elle sert.
 */
export type RegleDesOrigines = {
  /** Chemin du module de la règle, relatif à la racine balayée. */
  readonly module: string;
  /** Les noms par lesquels une porte gouvernée l'invoque. */
  readonly resolveurs: readonly string[];
};

const versPosix = (chemin: string): string => chemin.split(/[\\/]/).join('/');

/**
 * Toutes les émissions d'en-tête d'origine des sources de PRODUCTION sous
 * `racine`, dans les deux formes. Le sélecteur de fichiers est celui de
 * `file-size-sweep` — la même notion de « source écrite à la main », pour que
 * les deux cliquets ne divergent pas sur ce qu'est un fichier de production.
 */
export const balayerEmissions = (
  racine: string,
  regle: RegleDesOrigines
): readonly EmissionOrigine[] =>
  walk(racine, isHandWrittenSource).flatMap((chemin) =>
    emissionsDuFichier(versPosix(relative(racine, chemin)), readFileSync(chemin, 'utf8'), regle)
  );

const EXTENSIONS_DE_CODE = new Set(['.js', '.cjs', '.mjs', '.ts']);

const infosOuRien = (chemin: string): Stats | undefined => {
  try {
    return statSync(chemin, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
};

/**
 * Les fichiers de code d'un paquet installé. `statSync` SUIT les liens
 * symboliques, délibérément : bun 1.3 installe en mode isolé, si bien que les
 * dépendances d'un paquet sont des liens vers d'autres îlots — un parcours qui
 * ne les suit pas ne voit pas le paquet `cors` de `socket.io`, et conclut à
 * tort que Socket.IO ne pose aucun en-tête. La profondeur est bornée : suivre
 * les liens rend le graphe cyclique.
 */
const fichiersDeCode = (dir: string, profondeur = 0): readonly string[] => {
  if (profondeur > 8) return [];
  const entrees = (() => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  })();

  return entrees.flatMap((entree) => {
    const complet = join(dir, entree.name);
    const infos = infosOuRien(complet);
    if (infos === undefined) return [];
    if (infos.isDirectory()) return fichiersDeCode(complet, profondeur + 1);
    return EXTENSIONS_DE_CODE.has(extname(entree.name)) ? [complet] : [];
  });
};

const contientLEnTete = (chemin: string): boolean => {
  try {
    return readFileSync(chemin, 'utf8').includes('Access-Control-Allow-Origin');
  } catch {
    return false;
  }
};

/**
 * L'îlot d'installation d'un paquet : le répertoire où vivent ses dépendances
 * privées. Un paquet PORTÉE (`@tus/server`) est d'un cran plus profond que les
 * autres — sans ce décalage, l'îlot de `@tus/server` serait `node_modules/@tus`,
 * qui ne contient aucune dépendance.
 */
const ilotDe = (reel: string, module: string): string =>
  module.startsWith('@') ? dirname(dirname(reel)) : dirname(reel);

/**
 * Le composant installé POSE-t-il réellement l'en-tête ? Cherché d'abord dans
 * son propre paquet, puis dans son îlot — c'est là que `socket.io` cache le
 * sien, dans le paquet `cors` dont il dépend.
 *
 * C'est la garde d'anti-péremption de `COMPOSANTS_EMETTEURS` : une entrée qu'on
 * garderait après que le paquet a cessé d'émettre ferait porter au cliquet une
 * délégation qui n'existe plus.
 */
export const composantPoseLEnTete = (racineGateway: string, module: string): boolean => {
  const reel = (() => {
    try {
      return realpathSync(join(racineGateway, 'node_modules', module));
    } catch {
      return undefined;
    }
  })();
  if (reel === undefined) return false;

  return (
    fichiersDeCode(reel).some(contientLEnTete) ||
    fichiersDeCode(ilotDe(reel, module)).some(contientLEnTete)
  );
};
