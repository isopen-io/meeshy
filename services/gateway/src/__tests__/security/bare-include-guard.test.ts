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
import {
  datamodelReel,
  construireIndexDesRelations,
  estUneRelation,
  modeleCible,
  modeleDuDelegue,
  type IndexDesRelations,
} from './prisma-relation-fields';

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

/**
 * #4888 — la SECONDE forme d'une relation embarquée ENTIÈRE : `select: {
 * <relation>: true }` charge exactement la même relation complète, mais
 * `select` peut aussi désigner un SCALAIRE (`select: { translations: true }`
 * sur `Message`, un `Json`) — `include`, lui, ne peut désigner qu'une
 * relation, Prisma refuse un scalaire là. Distinguer les deux exige de
 * connaître le MODÈLE interrogé, jamais le seul nom du champ.
 *
 * Portée assumée : la résolution part d'un appel `prisma.<délégué>.<méthode>(`
 * littéral — ni `tx.<délégué>.` (transactions interactives), ni un client
 * réassigné sous un autre nom. `services/gateway/src/routes/` n'emploie aucune
 * transaction interactive (mesuré : zéro `async (tx`), donc cette portée
 * couvre le répertoire balayé en entier ; l'élargir à `tx.` se ferait le jour
 * où un premier appelant l'exigerait, avec son propre témoin RED.
 */
function matchParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

/**
 * Les occurrences `select:` / `include:` directement au premier niveau d'un
 * corps d'arguments de requête (`body` = l'intérieur de l'objet options d'un
 * appel Prisma, OU l'intérieur de la config d'une relation imbriquée), dans
 * le contexte du modèle `model` — c'est ce contexte qui descend à chaque
 * relation traversée.
 */
function scanForSelectInclude(
  code: string,
  body: string,
  bodyStartAbs: number,
  model: string,
  file: string,
  sites: BareIncludeSite[],
  index: IndexDesRelations
): void {
  const re = /\b(select|include)\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (braceDepthAt(body, 0, m.index) !== 0) continue;
    const kind = m[1] as 'select' | 'include';
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = matchBrace(body, openIdx);
    const fieldsBody = body.slice(openIdx + 1, closeIdx);
    walkFieldsObject(code, fieldsBody, bodyStartAbs + openIdx + 1, model, kind, file, sites, index);
  }
}

/**
 * Les propriétés DIRECTES d'un corps `select: {…}` / `include: {…}`. Une
 * valeur `true` sur un champ RELATION, sous `select`, est le motif recherché
 * (`include` ne peut pas porter cette ambiguïté). Une valeur objet désigne
 * TOUJOURS une relation (ou `_count`, sans modèle cible) — on y redescend
 * `scanForSelectInclude` avec le modèle CIBLE de la relation, jamais avec
 * `model` inchangé.
 */
function walkFieldsObject(
  code: string,
  body: string,
  bodyStartAbs: number,
  model: string,
  kind: 'select' | 'include',
  file: string,
  sites: BareIncludeSite[],
  index: IndexDesRelations
): void {
  const re = /([A-Za-z_$][\w$]*)\s*:\s*(true\b|\{)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (braceDepthAt(body, 0, m.index) !== 0) continue;
    const key = m[1];

    if (m[2] === 'true') {
      if (kind === 'select' && estUneRelation(index, model, key)) {
        sites.push({ file, line: lineOf(code, bodyStartAbs + m.index), relation: key });
      }
      continue;
    }

    if (key === '_count') continue;
    const target = modeleCible(index, model, key);
    if (!target) continue;

    const openIdx = m.index + m[0].length - 1;
    const closeIdx = matchBrace(body, openIdx);
    const nestedBody = body.slice(openIdx + 1, closeIdx);
    scanForSelectInclude(code, nestedBody, bodyStartAbs + openIdx + 1, target, file, sites, index);
  }
}

/**
 * Balaie `source` pour `select: { <relation>: true }`, résolu PAR MODÈLE
 * depuis chaque appel `prisma.<délégué>.<méthode>({ … })` qu'il contient.
 */
export function scanBareSelects(source: string, file: string, index: IndexDesRelations): ReadonlyArray<BareIncludeSite> {
  const code = stripComments(source);
  const sites: BareIncludeSite[] = [];
  const callRe = /\bprisma\.([A-Za-z_$][\w$]*)\.[A-Za-z_$][\w$]*\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = callRe.exec(code)) !== null) {
    const model = modeleDuDelegue(index, m[1]);
    if (!model) continue;

    const openParen = m.index + m[0].length - 1;
    const closeParen = matchParen(code, openParen);

    let i = openParen + 1;
    while (i < closeParen && /\s/.test(code[i])) i++;
    if (code[i] !== '{') continue;

    const openBrace = i;
    const closeBrace = matchBrace(code, openBrace);
    if (closeBrace > closeParen) continue;

    const argsBody = code.slice(openBrace + 1, closeBrace);
    scanForSelectInclude(code, argsBody, openBrace + 1, model, file, sites, index);
  }

  return sites;
}

export function sweepBareSelects(routesDir: string, index: IndexDesRelations): ReadonlyArray<BareIncludeSite> {
  return walk(routesDir).flatMap((full) =>
    scanBareSelects(readFileSync(full, 'utf8'), relative(routesDir, full), index)
  );
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
  // #4284 a découpé conversations/core.ts en fichiers frères ; ce site vit
  // désormais dans core-lifecycle.ts (compte inchangé : 1).
  'conversations/core-lifecycle.ts': 1,
  'conversations/participant-removal.ts': 1,
  // #4713 a extrait le NOYAU de `PATCH …/role` hors de son gestionnaire ; ce
  // site (`include: { user: true }` sur la ligne du demandeur) vit desormais
  // dans `participant-role-core.ts`, inchange. Compte inchange : 1 — meme
  // mecanique que #4284 sur `core-lifecycle.ts`.
  'conversations/participant-role-core.ts': 1,
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

// =============================================================================
// #4888 — la SECONDE forme, `select: { <relation>: true }`, résolue PAR
// MODÈLE. C'est elle qui a laissé partir l'enveloppe E2EE de #4392
// (`messages-pin.ts`, avant son correctif) : `select: { attachments: true }`
// charge la relation ENTIÈRE — 51 clés, chiffrement compris — exactement
// comme `include: { attachments: true }`, mais sous une forme que le
// balayage ci-dessus, qui ne cherche QUE `include:`, ne voit pas.
// =============================================================================

const INDEX_DES_RELATIONS: IndexDesRelations = construireIndexDesRelations(datamodelReel());

describe('Le datamodel réel est lisible depuis ce balayage', () => {
  it('expose au moins un modèle, sans quoi tout le reste serait vert à vide', () => {
    // Le client Prisma est stubbé par jest.config.json pour le spécificateur
    // `@meeshy/shared/prisma/client` ; `datamodelReel()` le contourne par un
    // chemin RELATIF vers le client généré. Si ce chemin se rompt (client
    // déplacé, régénéré ailleurs), ce témoin tombe plutôt que de laisser
    // silencieusement `estUneRelation` répondre `false` à tout — la même
    // leçon que « une garde négative meurt en silence quand son terrain
    // disparaît » appliquée au DATAMODEL plutôt qu'au répertoire de routes.
    expect(datamodelReel().length).toBeGreaterThan(50);
  });
});

describe("Aucun select: { relation: true } sous services/gateway/src/routes/ (#4888)", () => {
  it("n'introduit aucun site — l'inventaire est VIDE, contrairement à celui d'`include:`", () => {
    // #4392 a corrigé le seul site connu (`messages-pin.ts`) avant même que
    // ce balayage n'existe : l'extension se pose donc sur un terrain déjà
    // propre, la seule situation où un cliquet ne fige pas une dette au
    // passage (§ tête de fichier de l'issue).
    expect(sweepBareSelects(ROUTES_DIR, INDEX_DES_RELATIONS)).toEqual([]);
  });
});

describe('Le balayage de `select:` sait discriminer PAR MODÈLE', () => {
  it('ne signale RIEN pour un scalaire JSON `select: { translations: true }` sur Message', () => {
    // Le cas que l'issue nomme explicitement : `translations` est un `Json`
    // sur `Message` (et sur `Post`) — un balayage par simple NOM le
    // confondrait avec une relation portant le même nom ailleurs.
    const source = `
      const rows = await prisma.message.findMany({
        where: { conversationId },
        select: { id: true, translations: true }
      });`;

    expect(scanBareSelects(source, 'x.ts', INDEX_DES_RELATIONS)).toEqual([]);
  });

  it('signale `select: { attachments: true } sur Message — le défaut réel de #4392, avant son correctif', () => {
    const source = `
      const rows = await prisma.message.findMany({
        where: { conversationId },
        select: { id: true, translations: true, attachments: true }
      });`;

    expect(scanBareSelects(source, 'x.ts', INDEX_DES_RELATIONS)).toMatchObject([
      { file: 'x.ts', relation: 'attachments' },
    ]);
  });

  it('ne signale rien quand la relation porte sa propre projection nommée (la forme corrigée de #4392)', () => {
    const source = `
      const rows = await prisma.message.findMany({
        select: { id: true, attachments: { select: attachmentForwardPreviewSelect } }
      });`;

    expect(scanBareSelects(source, 'x.ts', INDEX_DES_RELATIONS)).toEqual([]);
  });

  it('_count: { select: { … } } n\'a pas de modèle cible — jamais confondu avec une relation nue', () => {
    const source = `
      const rows = await prisma.message.findMany({
        select: { id: true, _count: { select: { reactions: true } } }
      });`;

    expect(scanBareSelects(source, 'x.ts', INDEX_DES_RELATIONS)).toEqual([]);
  });

  it('redescend le MODÈLE CIBLE dans une relation imbriquée : un scalaire du modèle parent n\'est pas celui de l\'enfant', () => {
    // `Message.attachments` cible `MessageAttachment`, qui porte SA PROPRE
    // relation `reactions` (vers `AttachmentReaction`) — un select nu dessus,
    // sous la config de la relation, doit être vu, à la ligne où IL vit.
    const source = `
      const rows = await prisma.message.findMany({
        select: {
          attachments: {
            select: { id: true, reactions: true }
          }
        }
      });`;

    const sites = scanBareSelects(source, 'x.ts', INDEX_DES_RELATIONS);
    expect(sites).toHaveLength(1);
    expect(sites[0].relation).toBe('reactions');
  });

  it('un délégué Prisma inconnu (faute de frappe, ou pas un modèle) ne fait pas lever le balayage', () => {
    const source = `
      const rows = await prisma.ceModeleNexistePas.findMany({
        select: { attachments: true }
      });`;

    expect(scanBareSelects(source, 'x.ts', INDEX_DES_RELATIONS)).toEqual([]);
  });

  it("ne rapporte pas un select: {relation: true} cité en commentaire", () => {
    const source = `
      // ancien code : select: { attachments: true }
      const rows = await prisma.message.findMany({
        select: { attachments: { select: attachmentForwardPreviewSelect } }
      });`;

    expect(scanBareSelects(source, 'x.ts', INDEX_DES_RELATIONS)).toEqual([]);
  });
});

describe('Mutation (#4888 critère 4) — le défaut réintroduit sur le vrai fichier tombe, nommé', () => {
  it('`select: { attachments: true }` réintroduit sur messages-pin.ts fait tomber le balayage', () => {
    const original = readFileSync(join(ROUTES_DIR, 'conversations/messages-pin.ts'), 'utf8');
    const muté = original.replace(
      'attachments: { select: attachmentForwardPreviewSelect }',
      'attachments: true'
    );
    // La mutation doit avoir PRIS — sans quoi ce témoin passerait pour la
    // mauvaise raison (le texte ciblé aurait changé sans que ce test suive).
    expect(muté).not.toBe(original);

    const sites = scanBareSelects(muté, 'conversations/messages-pin.ts', INDEX_DES_RELATIONS);
    expect(sites).toMatchObject([{ file: 'conversations/messages-pin.ts', relation: 'attachments' }]);
  });
});
