import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * **LE BALAYAGE DES PASSAGES QUI ÉNONCENT LA DOCTRINE D'ORDONNANCEMENT D'UNE
 * ACTIVITÉ À COMPTEUR ABSOLU** (#20414).
 *
 * Ces six diffusions — `comment:liked` / `-unliked`,
 * `comment:reaction-added` / `-removed`, `post:liked` / `-unliked`,
 * `post:reaction-added` / `-removed` — portent un compteur ABSOLU, voyagent
 * sans curseur, et sont PERSISTÉES par iOS. La question « que garantit leur
 * ordre de livraison ? » a reçu deux réponses OPPOSÉES, chacune écrite chez
 * elle : #20236 déduisait l'ordre du fil de la position de la lecture, #20337
 * répondait que la fenêtre s'élargit d'un `await` sans s'ouvrir. La décision du
 * 2026-11-27 tranche : **aucun ordre n'est promis, ce qui rattrape l'écart est
 * une RELECTURE**
 * (`services/gateway/decisions/2026-11-27-les-activites-a-compteur-absolu-ne-promettent-aucun-ordre-de-livraison-20414.md`).
 *
 * **Les deux énoncés d'origine ne sont pas CITÉS ici, et c'est une contrainte,
 * pas une pudeur** : une garde de texte ne peut pas reproduire ce qu'elle
 * refuse sans se faire tomber. Elle l'a fait au premier jet — le seul rouge
 * restant du lot était son propre doc-comment. Qui veut les lire les trouve
 * dans la décision, où aucun cliquet ne les cherche.
 *
 * **Pourquoi un balayage, et pas une relecture.** Les quatre cliquets de porte
 * d'émission voisins (`server-emit-door-sweep.ts`) commencent tous par
 * `stripComments` : une doctrine qui vit dans des commentaires est invisible à
 * chacun d'eux, par construction. C'est exactement ce qui a laissé deux énoncés
 * contradictoires cohabiter un cycle entier, et pourquoi #20337 a pu corriger
 * SON doc-comment sans que celui du frère rougisse. Ce balayage-ci ne lit QUE
 * les commentaires — il est le symétrique des quatre autres.
 *
 * **L'inventaire des sites n'est PAS la liste des sites.** L'issue en nommait
 * trois ; le balayage en rend huit en production, dans six fichiers, plus trois
 * dans les harnais (leçon 261 : une énumération porte deux affirmations, et
 * c'est la seconde — « ce sont LES sites » — que personne ne vérifie). D'où la
 * forme retenue : la DÉCOUVERTE balaie `src/` entier, et
 * {@link DOCTRINE_FILES} ne sert qu'à faire rougir la DISPARITION d'un site
 * connu — un balayage qui rend `[]` reste vert, donc une garde négative doit
 * prouver qu'elle regarde quelque chose.
 */
export interface DoctrinePassage {
  /** Chemin relatif à `src/`, en séparateurs POSIX — jamais un numéro de ligne, qui dérive à la première édition. */
  readonly file: string;
  /** Le commentaire, dépouillé de ses préfixes, pour que le verdict se lise sans ouvrir le fichier. */
  readonly excerpt: string;
}

export type DoctrineViolationKind = 'citation-absente' | 'promesse-d-ordre';

export interface DoctrineViolation extends DoctrinePassage {
  readonly kind: DoctrineViolationKind;
  /** Ce qu'il faut faire, pas seulement ce qui ne va pas. */
  readonly detail: string;
}

/** La seule référence admise : le numéro de l'issue qui porte la décision. */
export const DOCTRINE_CITATION = /#20414/;

/**
 * Un passage de doctrine : il nomme une charge ABSOLUE **et** place une lecture
 * par rapport à la mutation (ou parle de réordonnancement) — la doctrine qu'il
 * cherche est celle de la décision du 2026-11-27 (#20414), et cette garde se
 * tient à sa propre règle.
 *
 * Le discriminant exige les DEUX. Avec la seule marque `ABSOLU`, le premier
 * relevé rendait cinq faux positifs — une priorité ABSOLUE du Prisme, une
 * adresse ABSOLUE de média — c'est-à-dire la popularité d'un mot, pas une
 * propriété (la faute du cycle 107, dont le balayage fut JETÉ plutôt que gelé).
 */
const MARQUE_CHARGE_ABSOLUE = /(charge|compteur|agrégat|total)[^.\n]{0,24}ABSOLU/i;
const MARQUE_ORDONNANCEMENT = /(AVANT|APRÈS)\s+(?:sa\s|la\s|l'|le\s)?(?:première\s)?(?:mutation|écriture)|réordonnancement/i;

/**
 * Les formules qui PROMETTENT un ordre, et la raison de chaque refus. Ce ne
 * sont pas des maladresses de style : chacune a été écrite comme une garantie,
 * et au moins un lot s'est appuyé dessus.
 */
const PROMESSES_INTERDITES: readonly { readonly motif: RegExp; readonly pourquoi: string }[] = [
  {
    motif: /rendent le même total final/i,
    pourquoi:
      "mesurée FAUSSE par l'audit adversarial de #20337 : chaque lecture rend le total à l'instant où elle tourne, et c'est la LIVRAISON qui peut les inverser",
  },
  {
    motif: /(re)?(?:de|)vient synchrone|reste synchrone/i,
    pourquoi:
      "une émission synchrone APRÈS un `await` ne garantit aucun ordre : deux gestes concurrents sont deux gestionnaires indépendants, dont les accusés Mongo reviennent sur des connexions poolées distinctes et peuvent s'inverser (mécanisme décrit par `emitWithSeq`)",
  },
  {
    motif: /l'ORDRE du fil de l'ordre des écritures/i,
    pourquoi:
      "c'est la promesse elle-même : résoudre la séparation avant la mutation RESSERRE la fenêtre d'un `await`, elle ne la ferme pas",
  },
];

/**
 * Les fichiers dont la disparition d'un passage doit rougir. Mesuré le
 * 2026-11-27 ; un renommage ou une extraction fait tomber le cliquet, qui
 * demande alors de mettre l'inventaire à jour — jamais de le vider.
 */
export const DOCTRINE_FILES: readonly string[] = [
  'routes/posts/comments.ts',
  'routes/posts/interactions.ts',
  'routes/social/events.ts',
  'socketio/handlers/CommentReactionHandler.ts',
  'socketio/handlers/PostReactionHandler.ts',
  'socketio/handlers/socialEmissionCore.ts',
];

const typescriptFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) typescriptFiles(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
};

/**
 * Les commentaires d'une source, et EUX SEULS. Les chaînes et les littéraux de
 * gabarit sont traversés sans être lus : un `//` dans une URL n'ouvre pas un
 * commentaire, et une regex d'un autre balayage n'en est pas un non plus.
 */
export function commentBlocks(source: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out.push(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      const stop = nl === -1 ? source.length : nl;
      out.push(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\') j += 1;
        j += 1;
      }
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/** Un commentaire sans ses préfixes, replié sur une ligne — ce qu'un verdict affiche. */
export const depouiller = (comment: string): string =>
  comment
    .replace(/^\/\*+|\*+\/$/g, '')
    .replace(/^\s*\/\//gm, '')
    .replace(/^\s*\*+/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .trim();

/** Un commentaire ÉNONCE-t-il la doctrine ? Les deux marques, pas une. */
export const estUnPassageDeDoctrine = (comment: string): boolean =>
  MARQUE_CHARGE_ABSOLUE.test(comment) && MARQUE_ORDONNANCEMENT.test(comment);

/** Ce qu'un passage doit dire, et ne pas dire. */
export function juger(passage: DoctrinePassage): DoctrineViolation[] {
  const violations: DoctrineViolation[] = [];
  for (const { motif, pourquoi } of PROMESSES_INTERDITES) {
    const found = motif.exec(passage.excerpt);
    if (found !== null) {
      violations.push({
        ...passage,
        kind: 'promesse-d-ordre',
        detail: `« ${found[0]} » promet un ordre que rien ne tient — ${pourquoi}`,
      });
    }
  }
  if (!DOCTRINE_CITATION.test(passage.excerpt)) {
    violations.push({
      ...passage,
      kind: 'citation-absente',
      detail:
        "un passage qui énonce la doctrine renvoie à la décision (#20414) au lieu de la réexpliquer chez lui : c'est la réexplication locale qui a produit deux doctrines opposées",
    });
  }
  return violations;
}

export function sweepActivityOrderingDoctrine(srcDir: string): {
  readonly passages: readonly DoctrinePassage[];
  readonly violations: readonly DoctrineViolation[];
} {
  const passages: DoctrinePassage[] = [];
  for (const full of typescriptFiles(srcDir)) {
    const file = relative(srcDir, full).split(sep).join('/');
    for (const comment of commentBlocks(readFileSync(full, 'utf8'))) {
      if (!estUnPassageDeDoctrine(comment)) continue;
      passages.push({ file, excerpt: depouiller(comment) });
    }
  }
  return { passages, violations: passages.flatMap(juger) };
}
