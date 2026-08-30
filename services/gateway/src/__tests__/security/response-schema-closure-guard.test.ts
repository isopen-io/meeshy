/**
 * Le balayage des schémas de réponse OUVERTS — `additionalProperties: true`
 * — et des schémas de réponse ABSENTS (#4168).
 *
 * `routes/__tests__/response-schema-sweep.ts` garde contre l'objet NU
 * (`{ type: 'object' }` sans aucune des trois clés qui bornent une réponse) :
 * ce défaut-là fait sérialiser `{}`, il TRONQUE. `#4168` documente le défaut
 * SYMÉTRIQUE, plus discret parce qu'il ne tronque RIEN : un schéma de réponse
 * qui pose `additionalProperties: true` désarme `fast-json-stringify` en
 * sens inverse — tout ce que le service ajoute au fil part sans revue, y
 * compris ce que personne n'a voulu exposer. Mesuré sur ce mécanisme exact :
 * `GET /tracking-links/:token/clicks` et sa jumelle admin servaient les
 * lignes `trackingLinkClick` BRUTES — `ipAddress`, `deviceFingerprint`,
 * `userAgent` et onze champs de fingerprinting navigateur compris — à
 * quiconque possédait un jeton vers SA PROPRE route (voir
 * `routes/tracking-links/response-schemas.ts` pour l'inventaire colonne par
 * colonne et la décision produit).
 *
 * Une SECONDE forme du même défaut n'est vue par AUCUN balayage existant :
 * une route dont le bloc `schema` ne porte PAS de clé `response`, ou dont le
 * `response` ne déclare AUCUN code de succès (< 400) — l'objet que le handler
 * renvoie à `sendSuccess`/`reply.send` traverse alors ENTIER, pour la même
 * raison mais sans qu'aucun `additionalProperties` n'apparaisse nulle part :
 * il n'y a simplement rien à lire. C'est la « subtilité d'emplacement » que
 * le critère 4 de #4168 nomme explicitement. Les deux formes sont donc
 * balayées ici, par deux fonctions distinctes.
 *
 * ## Ce que ce témoin GARDE, et ce qu'il ne corrige pas
 *
 * Le lot 1 de #4168 a fermé TOUS les schémas de réponse ouverts de son
 * territoire (`routes/tracking-links/*`, `routes/affiliate.ts` — zéro entrée
 * restante, prouvé par le test dédié ci-dessous, indépendant de l'inventaire
 * gelé). Le balayage du DÉPÔT ENTIER (`routes/`, comme son frère) en trouve
 * davantage : 23 schémas ouverts et 10 schémas de succès absents, tous hors
 * territoire de ce lot (`routes/admin/**`, `routes/conversations/**`,
 * `routes/me/**`, `routes/users/**`, `routes/posts/**`, `routes/auth/**`,
 * `routes/user-stats.ts`, `routes/voice-profile.ts` — chacun explicitement
 * réservé à une autre session dans ce lot, ou à un lot suivant). Ils sont
 * GELÉS ci-dessous, PAS corrigés — geler documente qu'ils sont VUS, pas
 * qu'ils sont bons. Deux familles s'y distinguent déjà à la lecture, sans
 * levier pour agir dessus ici :
 *
 * - Une carte à clés VRAIMENT inconnues (`me/preferences/index.ts`,
 *   `me/preferences/preference-router-factory.ts` : chaque catégorie de
 *   préférences est un sac de réglages hétérogène, avec sa propre note dans
 *   le fichier) est la forme JUSTE d'`additionalProperties: true` — le
 *   défaut n'est jamais le mot-clé, c'est son usage sur une ligne de donnée
 *   qui, elle, a des colonnes NOMMÉES (le cas `trackingLinkClick`).
 * - `users/preferences.ts:374` porte une note d'incident : une liste blanche
 *   posée trop tôt y avait fait disparaître `achievements` et consorts,
 *   laissant `additionalProperties: true` comme correctif volontaire en
 *   attendant une liste blanche COMPLÈTE — exactement le piège inverse que
 *   le critère (d) de #4168 met en garde. Le fermer sans relire d'abord
 *   l'émetteur rejouerait l'incident qu'il documente.
 *
 * Ni l'un ni l'autre ne justifie qu'ils entrent dans #4168 lot 1 : ce sont
 * des décisions par SITE, hors du territoire assigné ici. Quand ce témoin
 * tombe :
 *
 * - **une entrée EN TROP dans le balayage réel, absente de l'inventaire
 *   gelé** ⇒ un nouveau schéma vient de s'ouvrir (ou de perdre son
 *   `response`). Pas un choix silencieux : fermer (`properties` nommées) ou
 *   motiver l'ouverture dans une issue et l'ajouter à l'inventaire gelé AVEC
 *   sa raison.
 * - **une entrée EN MOINS** ⇒ un site a été réparé ailleurs ; retirer sa
 *   ligne fait partie du correctif qui l'a fermé.
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
// Même méthode que `response-schema-sweep.ts` (frère du même dépôt) : un
// `grep` seul ne sait dire ni « suis-je sous `response:` ? » ni « le bloc de
// route porte-t-il un code de succès ? ».
// =============================================================================

/** Fin (exclusive) de l'objet littéral ouvert à `openIndex`. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** Les intervalles couverts par une clé `response:`. */
function responseRanges(source: string): ReadonlyArray<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  const re = /\bresponse\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const open = source.indexOf('{', m.index);
    ranges.push([open, matchBrace(source, open)] as const);
  }
  return ranges;
}

/** Le code de statut dont relève la position donnée, au sein d'un `response:`. */
function statusCodeAt(source: string, rangeStart: number, position: number): string {
  const re = /(\d{3})\s*:\s*\{/g;
  const window = source.slice(rangeStart, position);
  let last = 'unknown';
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) {
    const open = rangeStart + m.index + m[0].length - 1;
    if (matchBrace(source, open) > position) last = m[1];
  }
  return last;
}

export type OpenResponseSite = {
  readonly file: string;
  readonly line: number;
  readonly statusCode: string;
};

/**
 * Un fichier `…response-schemas.ts` (convention posée par ce lot :
 * `routes/tracking-links/response-schemas.ts`,
 * `routes/affiliate-response-schemas.ts`) ne contient PAR CONSTRUCTION que du
 * matériau de réponse — schémas extraits pour ne pas alourdir un fichier de
 * routes proche du plafond de lignes. Il ne porte JAMAIS le mot-clé
 * `response:` (les routes qui les consomment le portent, dans un AUTRE
 * fichier), donc `responseRanges` y trouve toujours ZÉRO plage et le laisse
 * hors de portée du balayage `response:`-scopé — un `additionalProperties:
 * true` qui s'y réintroduirait serait invisible au texte, quoique visible au
 * sérialiseur (couvert séparément par un témoin HTTP, voir
 * `__tests__/unit/routes/tracking-links/response-schema-pii-closure.test.ts`
 * et `__tests__/unit/routes/affiliate-response-schema-pii-closure.test.ts`).
 * Pour ce nom de fichier précis, le fichier ENTIER est donc traité comme
 * portée « réponse ».
 */
function isExtractedResponseSchemaFile(file: string): boolean {
  return file.endsWith('response-schemas.ts');
}

/**
 * Les `additionalProperties: true` d'un fichier, SOUS `response:` — ou dans
 * le fichier entier pour un fichier `…response-schemas.ts` (voir
 * `isExtractedResponseSchemaFile`). Un même mot-clé dans `body`/
 * `querystring` est permissif côté validation (Ajv), jamais destructeur côté
 * sérialisation, et hors du chantier « serveur pur » que #4168 délimite
 * explicitement — d'où le filtre sur `response:` pour tout AUTRE fichier.
 */
export function scanOpenResponseSchemas(source: string, file: string): ReadonlyArray<OpenResponseSite> {
  const code = stripComments(source);

  if (isExtractedResponseSchemaFile(file)) {
    const sites: OpenResponseSite[] = [];
    const re = /additionalProperties\s*:\s*true/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      sites.push({ file, line: lineOf(code, m.index), statusCode: 'n/a (fichier extrait)' });
    }
    return sites;
  }

  const ranges = responseRanges(code);
  if (ranges.length === 0) return [];

  const sites: OpenResponseSite[] = [];
  const re = /additionalProperties\s*:\s*true/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const range = ranges.find(([s, e]) => m!.index > s && m!.index < e);
    if (!range) continue;
    sites.push({ file, line: lineOf(code, m.index), statusCode: statusCodeAt(code, range[0], m.index) });
  }
  return sites;
}

export type MissingSuccessSite = {
  readonly file: string;
  readonly line: number;
  readonly method: string;
  readonly path: string;
  readonly kind: 'no-response-key' | 'response-no-success-code';
};

/** Les intervalles couverts par une clé `schema:` (options de route Fastify). */
function schemaRanges(source: string): ReadonlyArray<readonly [number, number, number]> {
  const ranges: Array<readonly [number, number, number]> = [];
  const re = /\bschema\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const open = source.indexOf('{', m.index);
    ranges.push([m.index, open, matchBrace(source, open)] as const);
  }
  return ranges;
}

/**
 * Le `fastify.<méthode>(<...générique optionnel...>)('<chemin>', …)` le plus
 * proche AVANT `index`.
 *
 * Le générique de route (`fastify.get<{ Params: X }>('/…')`, très employé
 * dans ce dépôt) se place APRÈS le nom de méthode, jamais entre `fastify` et
 * `.` — un simple `(?:<[^>]*>)?` mal placé saute silencieusement toute route
 * générique et attribue la trouvaille à la route précédente. D'où un compteur
 * de profondeur `<`/`>` explicite plutôt qu'une regex à motif fixe.
 */
function routeBefore(source: string, index: number): { readonly method: string; readonly path: string } {
  const before = source.slice(0, index);
  const methodRe = /fastify\s*\.\s*(get|post|put|patch|delete|head|options)\b/g;
  let last: { method: string; path: string } | null = null;
  let m: RegExpExecArray | null;

  while ((m = methodRe.exec(before)) !== null) {
    let i = methodRe.lastIndex;
    const skipSpace = () => { while (i < before.length && /\s/.test(before[i])) i++; };

    skipSpace();
    if (before[i] === '<') {
      let depth = 0;
      do {
        if (before[i] === '<') depth++;
        else if (before[i] === '>') depth--;
        i++;
      } while (depth > 0 && i < before.length);
      skipSpace();
    }
    if (before[i] !== '(') continue; // `fastify.get` utilisé hors appel de route (lecture de propriété, etc.)

    i++;
    skipSpace();
    const quote = before[i];
    if (quote !== '"' && quote !== "'" && quote !== '`') continue;

    let j = i + 1;
    let path = '';
    while (j < before.length && before[j] !== quote) {
      if (before[j] === '\\') { path += before[j] + before[j + 1]; j += 2; continue; }
      path += before[j];
      j++;
    }
    last = { method: m[1], path };
  }

  return last ?? { method: 'unknown', path: 'unknown' };
}

/**
 * Les blocs `schema: { … }` sans clé `response`, ou dont le `response` ne
 * déclare aucun code < 400 — dans les deux cas, ce que le handler renvoie
 * traverse la sérialisation sans qu'AUCUNE déclaration ne le borne, et le
 * balayage des objets nus (`response-schema-sweep.ts`) ne voit ni l'un ni
 * l'autre puisqu'il ne regarde QUE l'intérieur d'un `response:` déjà présent.
 */
export function scanMissingSuccessSchemas(source: string, file: string): ReadonlyArray<MissingSuccessSite> {
  const code = stripComments(source);
  const sites: MissingSuccessSite[] = [];

  for (const [schemaKeywordIndex, open, close] of schemaRanges(code)) {
    const body = code.slice(open, close + 1);
    const responseMatch = /\bresponse\s*:\s*\{/.exec(body);
    const route = routeBefore(code, schemaKeywordIndex);

    if (!responseMatch) {
      sites.push({ file, line: lineOf(code, schemaKeywordIndex), method: route.method, path: route.path, kind: 'no-response-key' });
      continue;
    }

    const responseOpen = open + responseMatch.index + responseMatch[0].length - 1;
    const responseClose = matchBrace(code, responseOpen);
    const responseBody = code.slice(responseOpen, responseClose);

    const codeRe = /(\d{3})\s*:/g;
    let hasSuccessCode = false;
    let cm: RegExpExecArray | null;
    while ((cm = codeRe.exec(responseBody)) !== null) {
      if (Number(cm[1]) < 400) hasSuccessCode = true;
    }

    if (!hasSuccessCode) {
      sites.push({ file, line: lineOf(code, responseOpen), method: route.method, path: route.path, kind: 'response-no-success-code' });
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

export function sweepOpenResponseSchemas(routesDir: string): ReadonlyArray<OpenResponseSite> {
  return walk(routesDir).flatMap((full) =>
    scanOpenResponseSchemas(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}

export function sweepMissingSuccessSchemas(routesDir: string): ReadonlyArray<MissingSuccessSite> {
  return walk(routesDir).flatMap((full) =>
    scanMissingSuccessSchemas(readFileSync(full, 'utf8'), relative(routesDir, full))
  );
}

// =============================================================================
// Inventaire GELÉ — hors territoire du lot 1 de #4168 (tracking-links/,
// affiliate.ts), à traiter dans un lot suivant. Chaque famille est expliquée
// dans le header ; le détail par fichier vit dans le compte rendu de session
// qui a posé ce témoin (issue #4168) plutôt que d'être répété 33 fois ici.
// =============================================================================

/**
 * CLÉ SANS NUMÉRO DE LIGNE, et c'est une loi du dépôt : « l'inventaire est clé
 * par fichier + champ + code de statut, JAMAIS par numéro de ligne — une clé de
 * ligne dérive à la première édition et transforme le cliquet en bruit »
 * (`services/gateway/CLAUDE.md`). La première version de ce témoin l'ignorait,
 * et elle a rougi le jour même : une session voisine a inséré une ligne dans
 * `conversations/messages.ts`, et deux sites INCHANGÉS sont passés de 1733/1735
 * à 1734/1736. Un cliquet qui rougit sur une insertion sans rapport apprend à
 * ses lecteurs à le regeler sans lire — c'est-à-dire à ne plus le lire.
 *
 * Plusieurs sites d'un même fichier partagent le même code de statut : la valeur
 * est donc leur NOMBRE. Un site ouvert de plus fait rougir (le compte monte), un
 * site réparé aussi (le compte descend) — et le retirer de cet inventaire fait
 * partie du correctif qui l'a réparé. La CIBLE est un objet vide.
 */
const FROZEN_OPEN_RESPONSE_SCHEMAS: Readonly<Record<string, number>> = {
  'admin/content.ts|200': 2,
  'admin/posts.ts|200': 2,
  // #4284 a découpé conversations/messages.ts en fichiers frères ; ces deux
  // sites vivent désormais dans messages-send.ts (compte inchangé : 2).
  'conversations/messages-send.ts|200': 2,
  'conversations/threads.ts|200': 1,
  'me/export.ts|200': 3,
  'me/preferences/preference-router-factory.ts|200': 3,
  'user-stats.ts|200': 1,
  'users/preferences.ts|200': 1,
  'voice-profile.ts|200': 1,
};

/**
 * Même règle qu'au-dessus. Ici le discriminant naturel n'est pas un compte mais
 * la ROUTE elle-même : (méthode, chemin) identifie le site sans ambiguïté et
 * survit à toute édition du fichier.
 */
const FROZEN_MISSING_SUCCESS_SCHEMAS: readonly string[] = [
  'auth/revoke-all-sessions.ts|get|/revoke-all-sessions|no-response-key',
  // #4284 a découpé conversations/core.ts en fichiers frères ; cette route
  // vit désormais dans core-detail.ts (compte inchangé : cette seule route).
  'conversations/core-detail.ts|get|/conversations/:id/analysis|response-no-success-code',
  'invitations.ts|post|/invitations/email|no-response-key',
  'me/delete-account.ts|get|/account/deletion|no-response-key',
  // Les deux memes routes, dans leur fichier propre (#4146). Leur schema de
  // reponse reste a declarer : le deplacement ne repare rien, et le gel le dit.
  'posts/impressions.ts|post|/posts/:postId/impression|no-response-key',
  'posts/impressions.ts|post|/posts/impressions/batch|no-response-key',
];

/** Compte les sites ouverts par (fichier, code de statut) — la clé stable. */
function compterParFichierEtStatut(sites: ReadonlyArray<OpenResponseSite>): Record<string, number> {
  return sites.reduce<Record<string, number>>((acc, s) => {
    const cle = `${s.file}|${s.statusCode}`;
    return { ...acc, [cle]: (acc[cle] ?? 0) + 1 };
  }, {});
}

/** Clé stable d'un site sans schéma de succès : la ROUTE, jamais sa ligne. */
function cleDeRoute(s: MissingSuccessSite): string {
  return `${s.file}|${s.method}|${s.path}|${s.kind}`;
}

describe('Aucun schéma de réponse OUVERT (additionalProperties: true) hors inventaire figé', () => {
  it("n'introduit aucun site neuf sous services/gateway/src/routes/", () => {
    expect(compterParFichierEtStatut(sweepOpenResponseSchemas(ROUTES_DIR)))
      .toEqual(FROZEN_OPEN_RESPONSE_SCHEMAS);
  });

  it("critères 1 et 2 de #4168 — les trois routes nommées par l'issue et leurs deux jumelles fermées par ce lot ne portent PLUS additionalProperties:true, indépendamment de l'inventaire figé", () => {
    const trackingLinks = sweepOpenResponseSchemas(join(ROUTES_DIR, 'tracking-links'));
    const affiliate = scanOpenResponseSchemas(
      readFileSync(join(ROUTES_DIR, 'affiliate.ts'), 'utf8'),
      'affiliate.ts'
    );

    expect(trackingLinks).toEqual([]);
    expect(affiliate).toEqual([]);
  });
});

describe('Aucun schéma de réponse ABSENT (pas de code de succès déclaré) hors inventaire figé', () => {
  it("n'introduit aucun site neuf sous services/gateway/src/routes/", () => {
    expect(sweepMissingSuccessSchemas(ROUTES_DIR).map(cleDeRoute).sort())
      .toEqual([...FROZEN_MISSING_SUCCESS_SCHEMAS].sort());
  });

  it('les cinq routes fermées par #4168 lot 1 déclarent toutes un code de succès', () => {
    const trackingLinks = sweepMissingSuccessSchemas(join(ROUTES_DIR, 'tracking-links'));
    const affiliate = scanMissingSuccessSchemas(
      readFileSync(join(ROUTES_DIR, 'affiliate.ts'), 'utf8'),
      'affiliate.ts'
    );

    expect(trackingLinks).toEqual([]);
    expect(affiliate).toEqual([]);
  });
});

describe('Ce que le balayage sait discriminer', () => {
  it('voit `additionalProperties: true` sous `response`, et ignore la même clause ailleurs', () => {
    const source = `
      fastify.post('/x', {
        schema: {
          body: { type: 'object', additionalProperties: true },
          querystring: { type: 'object', additionalProperties: true },
          response: {
            200: { type: 'object', properties: { data: { type: 'object', additionalProperties: true } } }
          }
        }
      }, handler);`;

    const sites = scanOpenResponseSchemas(source, 'x.ts');
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ statusCode: '200' });
  });

  it('ne confond pas une carte à clés TYPÉES (`additionalProperties: { type: … }`) avec la forme booléenne dangereuse', () => {
    const source = `
      response: { 200: { type: 'object', properties: {
        clicksByCountry: { type: 'object', additionalProperties: { type: 'number' } }
      } } }`;

    expect(scanOpenResponseSchemas(source, 'x.ts')).toEqual([]);
  });

  it("ne rapporte pas un `additionalProperties: true` cité en commentaire", () => {
    const source = `
      response: { 200: {
        // ancien schéma : { type: 'object', additionalProperties: true }
        type: 'object', properties: { id: { type: 'string' } }
      } }`;

    expect(scanOpenResponseSchemas(source, 'x.ts')).toEqual([]);
  });

  it("signale un bloc `schema` sans clé `response` du tout", () => {
    const source = `
      fastify.post('/webhook', {
        schema: { body: { type: 'object' } }
      }, handler);`;

    const sites = scanMissingSuccessSchemas(source, 'x.ts');
    expect(sites).toMatchObject([{ method: 'post', path: '/webhook', kind: 'no-response-key' }]);
  });

  it('signale un `response` qui ne déclare que des codes `>= 400`', () => {
    const source = `
      fastify.get('/thing/:id', {
        schema: { response: { 401: errorResponseSchema, 404: errorResponseSchema } }
      }, handler);`;

    const sites = scanMissingSuccessSchemas(source, 'x.ts');
    expect(sites).toMatchObject([{ method: 'get', path: '/thing/:id', kind: 'response-no-success-code' }]);
  });

  it('ne signale RIEN pour une redirection dont le seul code déclaré est un 3xx — pas de corps à borner', () => {
    const source = `
      fastify.get('/l/:token', {
        schema: { response: { 302: { description: 'Redirect' }, 404: errorResponseSchema } }
      }, handler);`;

    expect(scanMissingSuccessSchemas(source, 'x.ts')).toEqual([]);
  });

  it('ne signale RIEN pour une route dont le 200 déclare `properties` sans porte ouverte', () => {
    const source = `
      fastify.get('/thing', {
        schema: { response: { 200: { type: 'object', properties: { id: { type: 'string' } } } } }
      }, handler);`;

    expect(scanMissingSuccessSchemas(source, 'x.ts')).toEqual([]);
    expect(scanOpenResponseSchemas(source, 'x.ts')).toEqual([]);
  });
});

describe('Le balayage LIT bien le répertoire — sans quoi il passerait au vert à vide', () => {
  it('trouve des fichiers de routes, et les deux fichiers que #4168 lot 1 a fermés existent toujours', () => {
    // Une garde négative meurt en silence quand son terrain disparaît
    // (leçon 308) : un répertoire renommé rendrait `[]` des deux côtés et ce
    // témoin serait vert en ne mesurant plus rien.
    expect(walk(ROUTES_DIR).length).toBeGreaterThan(50);

    const trackingTs = join(ROUTES_DIR, 'tracking-links', 'tracking.ts');
    const affiliateTs = join(ROUTES_DIR, 'affiliate.ts');
    expect(readFileSync(trackingTs, 'utf8').length).toBeGreaterThan(500);
    expect(readFileSync(affiliateTs, 'utf8').length).toBeGreaterThan(500);
  });
});
