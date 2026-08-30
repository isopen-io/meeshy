/**
 * #4166 — « Une lecture ne demande à la base que ce qu'elle sert ».
 *
 * Critère 5 : une garde de SOURCE qui rougit si `include: { <relation>: true }`
 * réapparaît dans `services/gateway/src/routes/` — une relation embarquée
 * ENTIÈRE (aucune projection : toute colonne future du modèle cible part
 * automatiquement), la forme la plus sévère de la famille « include sans
 * select ». L'issue nomme elle-même la subtilité : une garde NÉGATIVE meurt
 * en silence le jour où son balayage ne matche plus rien — elle s'accompagne
 * donc d'un cas POSITIF (§ « Ce que le balayage sait discriminer ») prouvant
 * qu'elle rougit bien quand on réintroduit le motif, et d'une garde de
 * PÉRIMÈTRE (§ « Le balayage LIT bien le répertoire ») prouvant qu'elle ne
 * s'est pas vidée en cessant de trouver des fichiers.
 *
 * Patron repris de `unbounded-findmany-guard.test.ts` (#4165, la garde
 * négative sœur de ce même chantier d'API-simplification) : accolades
 * appariées et insensibles aux commentaires (`stripComments`, importé — pas
 * redéfini), inventaire GELÉ des sites hors territoire de CE lot, clé par
 * FICHIER + NOMBRE — jamais par numéro de ligne (« une clé de ligne dérive à
 * la première édition et transforme le cliquet en bruit »,
 * `services/gateway/CLAUDE.md`).
 *
 * Ce que ce témoin GARDE, et ce qu'il ne corrige pas : il balaie TOUT
 * `services/gateway/src/routes/` (comme l'issue le demande), pas seulement
 * le territoire de #4166. Les neuf sites déjà présents avant ce lot — aucun
 * dans `links/`, `attachments/`, ou `admin/` (le territoire de #4166) — sont
 * GELÉS : geler documente qu'ils sont VUS, pas qu'ils sont bons. Ce lot ne
 * les répare pas — ni le corps de l'issue ni la réservation de session ne
 * les nomment, et « no laziness, minimal impact » interdit d'élargir un lot
 * réservé au-delà de son périmètre déclaré.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { stripComments } from '../../routes/__tests__/response-schema-sweep';

const ROUTES_DIR = join(__dirname, '../../routes');

// =============================================================================
// Mécanique de balayage — accolades appariées, insensible aux commentaires.
// Un `grep 'include:.*true'` seul ne sait pas distinguer `x: true` (relation
// embarquée ENTIÈRE, le motif interdit) de `x: { select: { id: true } }` (un
// scalaire `true` enfoui dans un `select` imbriqué, parfaitement légitime) —
// il faut apparier l'accolade OUVRANTE de CHAQUE `include: {` à sa fermante,
// puis ne chercher `<clé>: true` qu'à la profondeur 0 de CET objet-là.
// =============================================================================

/** Fin (inclusive) de l'objet ouvert par l'accolade à `openIndex`. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/**
 * La profondeur d'accolades en `position`, comptée depuis `start` (inclus,
 * relatif au CORPS d'un objet — pas à sa propre accolade ouvrante). Sert à
 * ne retenir que les propriétés DIRECTES de l'objet `include: {...}` visé,
 * jamais un `true` enfoui dans une relation imbriquée qui porte son PROPRE
 * `select` (`include: { x: { select: { id: true } } }` — `id: true` vit à
 * la profondeur 2 du corps de l'`include` racine, pas 0).
 */
function braceDepthAt(source: string, start: number, position: number): number {
  let depth = 0;
  for (let i = start; i < position; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
  }
  return depth;
}

export type BareIncludeSite = {
  readonly file: string;
  readonly line: number;
  readonly relation: string;
};

/**
 * Chaque occurrence de `include: {` dans `source`, et pour CHACUNE, ses
 * propriétés DIRECTES dont la valeur est le littéral `true` — une relation
 * demandée SANS projection, chargée avec la totalité de ses colonnes.
 *
 * Une occurrence NICHÉE (`include: { a: { include: { b: true } } }`) est
 * vue deux fois par la regex globale — une fois pour l'`include` racine, une
 * fois pour celui qu'il contient — et c'est voulu : le second appariement de
 * `matchBrace` isole le corps du SECOND `include`, où `b: true` est bien à
 * la profondeur 0 de CE corps-là. `translation-non-blocking.ts` et
 * `translation.ts` sont dans ce cas au moment où ce test est écrit
 * (`conversation: { include: { participants: true } }`).
 */
export function scanBareIncludes(source: string, file: string): ReadonlyArray<BareIncludeSite> {
  const code = stripComments(source);
  const sites: BareIncludeSite[] = [];
  const re = /\binclude\s*:\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    const openBrace = code.indexOf('{', m.index);
    const close = matchBrace(code, openBrace);
    const body = code.slice(openBrace + 1, close);
    const keyRe = /([A-Za-z_$][\w$]*)\s*:\s*true\b/g;
    let km: RegExpExecArray | null;
    while ((km = keyRe.exec(body)) !== null) {
      if (braceDepthAt(body, 0, km.index) === 0) {
        sites.push({ file, line: lineOf(code, openBrace + 1 + km.index), relation: km[1] });
      }
    }
  }

  return sites;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

export function sweepBareIncludes(routesDir: string): ReadonlyArray<BareIncludeSite> {
  return walk(routesDir).flatMap((full) =>
    scanBareIncludes(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}

/** Compte les sites par FICHIER — la clé stable (§ header). */
function compterParFichier(sites: ReadonlyArray<BareIncludeSite>): Record<string, number> {
  return sites.reduce<Record<string, number>>((acc, s) => {
    return { ...acc, [s.file]: (acc[s.file] ?? 0) + 1 };
  }, {});
}

// =============================================================================
// Inventaire GELÉ — hors territoire de #4166 (réservation : « routes de
// LECTURE nommées au corps de l'issue — liens, pièces jointes, admin »).
// Aucun des neuf sites ci-dessous n'est dans `links/`, `attachments/`, ni
// `admin/` : ce lot ne les a pas touchés, ne les touche pas, et ne prétend
// pas qu'ils sont bons — seulement VUS. Un futur lot qui les répare retire
// leur ligne d'ici, comme #4166 l'a fait pour son propre territoire
// (`admin/anonymous-users.ts`, réparé par un lot antérieur — #4157 — n'a
// jamais figuré dans cet inventaire).
// =============================================================================
const FROZEN_BARE_INCLUDES: Readonly<Record<string, number>> = {
  'conversation-preferences.ts': 2,
  'conversations/core.ts': 1,
  'conversations/participant-removal.ts': 1,
  'conversations/participant-role.ts': 1,
  'reactions.ts': 1,
  'translation-non-blocking.ts': 1,
  'translation.ts': 1,
};

describe("Aucun include: { relation: true } hors inventaire figé (#4166 critère 5)", () => {
  it("n'introduit aucun site neuf sous services/gateway/src/routes/", () => {
    expect(compterParFichier(sweepBareIncludes(ROUTES_DIR))).toEqual(FROZEN_BARE_INCLUDES);
  });

  it('le territoire de CE lot (liens, pièces jointes, admin) ne porte plus un seul include: {relation: true}', () => {
    const targeted = [
      'links/utils/prisma-queries.ts',
      'links/messages-retrieval.ts',
      'anonymous.ts',
      'admin/posts.ts',
      'admin/broadcasts.ts',
      'admin/anonymous-users.ts',
      'attachments/translation.ts',
      'attachments/download.ts',
      'attachments/metadata.ts',
    ];
    for (const rel of targeted) {
      const source = readFileSync(join(ROUTES_DIR, rel), 'utf8');
      expect(scanBareIncludes(source, rel)).toEqual([]);
    }
  });
});

describe('Ce que le balayage sait discriminer', () => {
  it('signale include: { relation: true } au premier niveau', () => {
    const source = `
      const community = await prisma.community.findFirst({
        where: { id: communityId },
        include: { members: true }
      });`;

    expect(scanBareIncludes(source, 'x.ts')).toMatchObject([{ file: 'x.ts', relation: 'members' }]);
  });

  it('signale une relation embarquée NICHÉE (include imbriqué dans include)', () => {
    // Le patron exact de `translation.ts` / `translation-non-blocking.ts` :
    // `message → conversation → participants`, chaque niveau son propre
    // `include`, et la relation la plus profonde chargée SANS projection.
    const source = `
      const existingMessage = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              participants: true
            }
          }
        }
      });`;

    expect(scanBareIncludes(source, 'x.ts')).toMatchObject([{ file: 'x.ts', relation: 'participants' }]);
  });

  it("ne signale RIEN quand la relation porte son propre `select` imbriqué", () => {
    const source = `
      const post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
          author: { select: authorSelect },
          media: { select: mediaSelect, take: 50 }
        }
      });`;

    expect(scanBareIncludes(source, 'x.ts')).toEqual([]);
  });

  it("ne confond pas un scalaire `true` enfoui dans un select imbriqué avec une relation racine — le faux positif mesuré de la première version de ce balayage", () => {
    // `include: { x: { select: { id: true } } }` : `id: true` est à la
    // profondeur 2 du corps de l'`include`, jamais 0. Une version naïve
    // (regex sur toute la plage de l'`include`, sans compter les accolades)
    // signalerait `id` comme une relation embarquée — faux, `id` n'est même
    // pas une relation.
    const source = `
      const link = await prisma.conversationShareLink.findUnique({
        where: { id },
        include: {
          conversation: { select: { id: true, title: true } }
        }
      });`;

    expect(scanBareIncludes(source, 'x.ts')).toEqual([]);
  });

  it('ne rapporte pas un include: {x: true} cité en commentaire', () => {
    const source = `
      // ancien code : include: { members: true }
      const rows = await prisma.community.findFirst({
        where: { id },
        include: { members: { select: { id: true }, take: 100 } }
      });`;

    expect(scanBareIncludes(source, 'x.ts')).toEqual([]);
  });

  it('distingue deux include voisins : un nu, un projeté — sans confondre leurs corps', () => {
    const source = `
      const a = await prisma.x.findFirst({ include: { rel: true } });
      const b = await prisma.y.findFirst({ include: { rel: { select: { id: true } } } });`;

    const sites = scanBareIncludes(source, 'x.ts');
    expect(sites).toHaveLength(1);
    expect(sites[0].line).toBe(2);
  });

  it('_count: true n\'est jamais confondu (il ne vit que dans include, comme relation directe — cas déjà couvert, mais vérifié explicitement car _count a une sémantique différente : un compteur, pas une ligne)', () => {
    const source = `
      const post = await prisma.post.findFirst({
        where: { id },
        include: { _count: { select: { comments: true } } }
      });`;

    expect(scanBareIncludes(source, 'x.ts')).toEqual([]);
  });
});

describe('Le balayage LIT bien le répertoire — sans quoi il passerait au vert à vide', () => {
  it('trouve des fichiers de routes, et les fichiers que #4166 a touchés existent toujours', () => {
    // Une garde négative meurt en silence quand son terrain disparaît (même
    // leçon que `unbounded-findmany-guard.test.ts`) : un répertoire renommé
    // rendrait `[]` des deux côtés et ce témoin serait vert en ne mesurant
    // plus rien.
    expect(walk(ROUTES_DIR).length).toBeGreaterThan(50);

    for (const rel of [
      'links/utils/prisma-queries.ts',
      'links/messages-retrieval.ts',
      'anonymous.ts',
      'admin/posts.ts',
      'admin/broadcasts.ts',
      'attachments/translation.ts',
      'conversations/core.ts',
      'translation.ts',
    ]) {
      expect(readFileSync(join(ROUTES_DIR, rel), 'utf8').length).toBeGreaterThan(500);
    }
  });
});
