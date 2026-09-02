/**
 * `?cursor=` — la garde qui empêche un codec de curseur de plus (#4175 c.5).
 *
 * `sparse-fieldset-single-law-guard.test.ts` fait exactement cela pour
 * `?fields=`, et son doc-comment dit pourquoi une telle garde vaut d'être posée
 * TÔT : « elle arrête l'hémorragie pendant que la consolidation se fait, plutôt
 * qu'après ». C'est le cas ici, et à un degré rare : #4175 vise 43 routes, ce
 * lot en livre DEUX. L'inventaire ci-dessous n'est donc pas un état atteint,
 * c'est **le travail qui reste**, gelé pour qu'il ne grandisse plus.
 *
 * ## Ce que la garde cherche, et pourquoi pas un import
 *
 * Chercher « qui importe la loi » mesurerait la POPULARITÉ d'un import, pas une
 * propriété. La propriété gardée est l'inverse : **un site qui transforme
 * lui-même un `cursor` d'appelant en position de reprise**. Trois signaux, et
 * il en suffit d'un, tous rencontrés dans le dépôt :
 *
 * | signal | ce qu'il attrape | exemple réel |
 * |---|---|---|
 * | un littéral `base64` / `base64url` | un codec de jeton écrit à la main | `conversations/receipts.ts` — `base64url("offset:<n>")`, **un offset déguisé** |
 * | `new Date(<…>cursor)` | l'horodatage ISO servi en clair comme curseur | `posts/sounds.ts` (et `directory/friend-requests-core.ts`, ralliée par #4900 — elle porte encore le motif, pour RELIRE les jetons en vol, mais appelle la loi) |
 * | `findIndex` sur la MÊME ligne que `cursor` | un curseur d'identifiant retrouvé en mémoire | `directory/blocks.ts` |
 *
 * Aucun de ces signaux ne suffit seul : il faut AUSSI que le fichier nomme
 * `cursor` dans du CODE (pas dans une chaîne ni un commentaire) et qu'il
 * n'appelle PAS la loi partagée. C'est la conjonction qui évite la faute de
 * méthode d'un balayage qui cherche un seul idiome.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROUTES_ROOT = path.join(__dirname, '../../../routes');

/** Un littéral `base64` / `base64url` — l'encodage d'un jeton écrit à la main. */
const CODEC_BASE64 = /(['"])base64(url)?\1/;

/** Un horodatage d'appelant transformé en borne — le curseur « identifiant lisible ». */
const CODEC_DATE = /new Date\s*\(\s*[\w.?![\]'"]*[Cc]ursor/;

/** Un curseur d'identifiant retrouvé en mémoire, sur la MÊME ligne. */
const CODEC_INDEX = /^.*(?:\bfindIndex\b.*\bcursor\b|\bcursor\b.*\bfindIndex\b).*$/m;

/** Le vocabulaire de cette grammaire, lu dans du CODE. */
const LE_PARAMETRE = /\bcursor\b/i;

/** L'appel à la loi partagée, sous n'importe quelle forme d'import. */
const APPELLE_LA_LOI = /cursor-pagination/;

/**
 * Dépouille les commentaires. Le DÉCOUPAGE se lit ici : dépouiller aussi les
 * chaînes effacerait le littéral `'base64url'` que l'on cherche.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * Dépouille commentaires ET chaînes. Le VOCABULAIRE se lit ici : une route qui
 * ne doit son mot « cursor » qu'à la `description` d'un schéma ne fabrique
 * aucun curseur.
 */
function codeSeul(source: string): string {
  return sansCommentaires(source)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/**
 * Un codec en ligne : un signal de codec, le vocabulaire dans du CODE, et
 * l'absence de la loi partagée.
 *
 * Exposé pour être exercé sur du texte SYNTHÉTIQUE — une garde négative dont on
 * n'a pas prouvé qu'elle sait rougir n'est pas une garde.
 */
export function codecEnLigne(source: string): boolean {
  const code = sansCommentaires(source);
  const unSignal = CODEC_BASE64.test(code) || CODEC_DATE.test(code) || CODEC_INDEX.test(code);
  return unSignal && LE_PARAMETRE.test(codeSeul(source)) && !APPELLE_LA_LOI.test(source);
}

function fichiersSource(dir: string): string[] {
  const acc: string[] = [];
  for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
    const complet = path.join(dir, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === '__tests__') continue;
      acc.push(...fichiersSource(complet));
      continue;
    }
    if (/\.ts$/.test(entree.name) && !/\.(test|spec|d)\.ts$/.test(entree.name)) acc.push(complet);
  }
  return acc;
}

function sitesQuiCodentLeurCurseur(): string[] {
  return fichiersSource(ROUTES_ROOT)
    .filter((f) => codecEnLigne(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROUTES_ROOT, f).split(path.sep).join('/'))
    .sort();
}

/**
 * Inventaire GELÉ — **le travail qui reste**, pas un état à défendre.
 *
 * Chaque entrée est un curseur écrit à la main, avec ce qu'il lui manque. Cette
 * liste ne peut que RÉTRÉCIR : quand une route rejoint `utils/cursor-pagination.ts`,
 * on retire sa ligne dans le même commit.
 *
 * - `conversations/receipts.ts` — `base64url("offset:<n>")`. **Un offset déguisé** :
 *   il a l'air d'un curseur, saute des lignes comme un offset. Le pire des deux.
 * - `directory/blocks.ts` — curseur sur l'id, retrouvé par `findIndex` sur une
 *   liste rechargée à chaque appel : un identifiant lisible, et un curseur périmé
 *   n'y termine pas la pagination, il repart de la page 1.
 * - `posts/sounds.ts` — le cas nommé par #4175 : le curseur pagine les USAGES et
 *   non les publications, donc plusieurs pages peuvent ne rien rendre de neuf, et
 *   le client iOS compense par un compteur `emptyStreak`.
 * - `sync/cursor.ts` + ses quatre consommateurs (`conversations`, `messages`,
 *   `participants`, `reactions`) — la SECONDE loi, celle que #4175 nomme comme
 *   forme de référence. Un jeton `/sync` porte une position par FLUX dans un seul
 *   token, ce qu'une position unique n'exprime pas. Les deux règles sont justes ;
 *   les fondre en trahirait une. Ces cinq lignes sont permanentes tant que la
 *   fusion n'est pas décidée.
 */
const INVENTAIRE_GELE: readonly string[] = [
  'conversations/receipts.ts',
  'directory/blocks.ts',
  'posts/sounds.ts',
  'sync/conversations.ts',
  'sync/cursor.ts',
  'sync/messages.ts',
  'sync/participants.ts',
  'sync/reactions.ts',
];

describe('le balayage LIT bien routes/ — sinon la garde serait verte à vide', () => {
  it('parcourt plus de cent fichiers de route', () => {
    expect(fichiersSource(ROUTES_ROOT).length).toBeGreaterThan(100);
  });

  it('sait reconnaître un codec base64 écrit à la main', () => {
    expect(
      codecEnLigne(`const { cursor } = request.query as { cursor?: string };
        const rang = Number(Buffer.from(cursor, 'base64url').toString('utf8'));`)
    ).toBe(true);
  });

  it("sait reconnaître un horodatage d'appelant transformé en borne", () => {
    expect(
      codecEnLigne(`const borne = params.cursor ? new Date(params.cursor) : null;`)
    ).toBe(true);
  });

  it('sait reconnaître un curseur retrouvé en mémoire', () => {
    expect(codecEnLigne(`const depart = tous.findIndex((id) => id > options.cursor!);`)).toBe(true);
  });

  it('ne compte pas un site qui PASSE son curseur à la loi', () => {
    expect(
      codecEnLigne(`import { cursorQuery } from '../utils/cursor-pagination';
        const { cursor } = request.query as { cursor?: string };
        const page = cursorQuery({ sort: ORDRE, cursor, limit, where });`)
    ).toBe(false);
  });

  it("ne compte pas un base64 qui n'a rien à voir avec une pagination", () => {
    expect(codecEnLigne(`const audioBase64 = buffer.toString('base64');`)).toBe(false);
  });

  it("ne compte pas un `cursor` qui vit dans une CHAÎNE plutôt que dans le code", () => {
    expect(
      codecEnLigne(
        "const schema = { description: 'Opaque cursor from pagination.nextCursor' };\n" +
          "const jeton = crypto.randomBytes(32).toString('base64url');"
      )
    ).toBe(false);
  });

  it('ne se laisse pas tromper par un codec cité en COMMENTAIRE', () => {
    expect(
      codecEnLigne(`// avant #4175 : new Date(params.cursor)\nconst x = 1;`)
    ).toBe(false);
  });
});

describe('#4175 c.5 — aucun codec de curseur ne naît hors de la loi partagée', () => {
  it("n'a que les codecs GELÉS — un de plus est un codec neuf, un de moins est une route ralliée", () => {
    // `toEqual` exige l'égalité EXACTE dans les DEUX sens : une entrée en TROP
    // est un codec neuf, à câbler sur `utils/cursor-pagination.ts` ; une entrée
    // en MOINS est une route ralliée, et retirer sa ligne fait partie du lot.
    expect(sitesQuiCodentLeurCurseur()).toEqual([...INVENTAIRE_GELE]);
  });

  it("ne compte AUCUNE des trois routes ralliées", () => {
    // `notifications.ts` et `friends.ts` (#4175), puis la route CANONIQUE des
    // demandes d'ami (#4900) — que son alias déprécié `friends.ts` avait
    // devancée : depuis `5bcbdefee6`, le déprécié départageait ses ex æquo et
    // servait un jeton opaque quand son successeur ne faisait ni l'un ni
    // l'autre. Une liste qui RÉTRÉCIT est ce que ce cliquet mesure.
    const sites = sitesQuiCodentLeurCurseur();
    expect(sites).not.toContain('notifications.ts');
    expect(sites).not.toContain('friends.ts');
    expect(sites).not.toContain('directory/friend-requests-core.ts');
  });
});
