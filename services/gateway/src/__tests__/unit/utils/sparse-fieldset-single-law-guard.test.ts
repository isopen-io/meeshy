/**
 * `?fields=` / `?expand=` — la garde qui empêche un CINQUIÈME analyseur (#4356 c.5).
 *
 * #4356 a consolidé quatre analyseurs indépendants dans
 * `utils/sparse-fieldset.ts`. Son critère 5 demande la garde qui arrête
 * l'hémorragie — et il dit pourquoi elle vaut d'être posée TÔT : « elle
 * rougirait immédiatement aujourd'hui […] elle arrête l'hémorragie pendant que
 * la consolidation se fait, plutôt qu'après ». La consolidation est faite
 * (#4356 puis #4406, qui a trouvé le cinquième site que l'énumération d'origine
 * ne nommait pas) ; ce qui manquait est ce qui EMPÊCHE le sixième.
 *
 * ## Ce que la garde cherche, et pourquoi pas un import
 *
 * Chercher « qui importe le module » mesurerait la POPULARITÉ d'un import, pas
 * une propriété — c'est la faute de méthode du cycle 107, dont le balayage a
 * été JETÉ plutôt que gelé. La propriété gardée est l'inverse : **un site qui
 * lit `fields`/`expand` dans sa query et le DÉCOUPE lui-même**. Un site qui
 * lit le paramètre et le passe au module ne découpe rien, donc ne compte pas ;
 * un site qui découpe sans jamais lire ces paramètres découpe autre chose.
 *
 * ## L'inventaire, et la seule entrée qui a le droit d'y être
 *
 * `routes/me/preferences/preference-selection.ts` porte une AUTRE grammaire, et
 * le doc-comment du module partagé l'établit sur trois points : vocabulaire
 * FERMÉ (400 sur l'inconnu, quand celle-ci ignore en silence), DEUX niveaux
 * (`catégorie.clé`), et un second niveau qui nomme des clés à l'intérieur d'une
 * colonne JSON que Prisma ne sait pas projeter. « Le dépôt préfère deux règles
 * honnêtes à une abstraction qui ment » — cette entrée est donc permanente, et
 * c'est la seule.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROUTES_ROOT = path.join(__dirname, '../../../routes');

/** Le découpage d'une liste séparée par des virgules. */
const DECOUPE = /\.split\(\s*['"],['"]\s*\)/;

/** Le vocabulaire de CETTE grammaire, lu dans du CODE. */
const LE_PARAMETRE = /\b(fields|expand)\b/i;

/** L'appel au module partagé, sous n'importe quelle forme d'import. */
const APPELLE_LE_MODULE = /sparse-fieldset/;

/**
 * Dépouille ce qui n'est pas du code : commentaires **et littéraux de
 * chaîne**.
 *
 * Les chaînes comptent autant que les commentaires, et c'est le faux positif
 * du premier passage qui l'a montré — `conversations/messages.ts` découpe une
 * liste de LANGUES, et ne doit son « fields » qu'à la `description` d'un
 * schéma : *« fast-json-stringify strips undeclared fields »*. Une garde qui
 * lit les chaînes mesure de quoi le fichier PARLE, pas ce qu'il FAIT.
 */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/**
 * Un analyseur en ligne, c'est trois choses ENSEMBLE : découper une liste de
 * jetons, nommer `fields`/`expand` dans du CODE, et ne pas passer par le
 * module partagé.
 *
 * Aucune des trois ne suffit seule, et c'est le point. « Qui importe le
 * module ? » mesurerait la popularité d'un import ; « qui dit `expand` ? »
 * mesurerait un vocabulaire ; « qui découpe une liste ? » attraperait toutes
 * les listes du dépôt. La faute de méthode du cycle 107 — un balayage jeté
 * parce qu'il cherchait UN idiome — est ici évitée par la conjonction.
 *
 * Exposé pour être exercé sur du texte SYNTHÉTIQUE : une garde négative dont
 * on n'a pas prouvé qu'elle sait rougir n'est pas une garde.
 */
export function analyseEnLigne(source: string): boolean {
  // Les deux mesures ne se prennent PAS sur le même texte, et l'inverse a
  // cassé la garde à l'écriture : le dépouillement des chaînes remplace
  // `.split(',')` par `.split('')` — il efface le motif qu'on cherche. Le
  // DÉCOUPAGE se lit donc sur le code commenté-dépouillé seulement, et le
  // VOCABULAIRE sur le code sans ses chaînes.
  const sansCommentaires = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  return (
    DECOUPE.test(sansCommentaires) &&
    LE_PARAMETRE.test(codeSeul(source)) &&
    !APPELLE_LE_MODULE.test(source)
  );
}

function fichiersSource(dir: string): string[] {
  const acc: string[] = [];
  for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
    const complet = path.join(dir, entree.name);
    if (entree.isDirectory()) { acc.push(...fichiersSource(complet)); continue; }
    if (/\.ts$/.test(entree.name) && !/\.(test|spec|d)\.ts$/.test(entree.name)) acc.push(complet);
  }
  return acc;
}

function sitesQuiAnalysentEnLigne(): string[] {
  return fichiersSource(ROUTES_ROOT)
    .filter((f) => analyseEnLigne(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROUTES_ROOT, f))
    .sort();
}

/**
 * Inventaire GELÉ, et **VIDE** — l'état à défendre, pas un état atteint par
 * chance. La grammaire des préférences elle-même passe par le module partagé
 * pour son dépouillement de jetons ; elle n'y garde que ce qui lui est propre
 * (le vocabulaire fermé, les deux niveaux, le 400 sur l'inconnu).
 *
 * Quand cette garde tombe, la réparation est d'appeler
 * `utils/sparse-fieldset.ts` — jamais d'ajouter une ligne ci-dessous : il n'y
 * a pas d'analyseur en ligne légitime à porter.
 */
const INVENTAIRE_GELE: readonly string[] = [];

describe('le balayage LIT bien routes/ — sinon la garde serait verte à vide', () => {
  it('parcourt plus de cent fichiers de route', () => {
    expect(fichiersSource(ROUTES_ROOT).length).toBeGreaterThan(100);
  });

  it('sait reconnaître un analyseur en ligne sur du texte SYNTHÉTIQUE', () => {
    expect(
      analyseEnLigne(`const { expand } = request.query as { expand?: string };
        const demandes = new Set(String(expand ?? '').split(','));`)
    ).toBe(true);
  });

  it("ne compte pas un site qui PASSE le paramètre au module partagé", () => {
    expect(
      analyseEnLigne(`import { parseTokenSet } from '../../utils/sparse-fieldset';
        const { expand } = request.query as { expand?: string };
        const demandes = parseTokenSet(expand, VOCABULAIRE);`)
    ).toBe(false);
  });

  it('ne compte pas un découpage qui ne concerne NI `fields` NI `expand`', () => {
    expect(analyseEnLigne(`const langues = header.split(',').map((l) => l.trim());`)).toBe(false);
  });

  /**
   * Le faux positif RÉEL du premier passage, gelé comme cas de test : un
   * fichier qui découpe une liste de LANGUES et dont le mot « fields » ne vit
   * que dans la `description` d'un schéma, hors de toute portée de découpage.
   * C'est lui qui a fait resserrer le prédicat du FICHIER vers la PORTÉE.
   */
  it("ne compte pas un `fields` qui vit dans une CHAÎNE plutôt que dans le code", () => {
    expect(
      analyseEnLigne(
        "const schema = { description: 'fast-json-stringify strips undeclared fields' };\n" +
        "const languageFilter = languagesStr.split(',').map((l) => l.trim());"
      )
    ).toBe(false);
  });

  it("ne se laisse pas tromper par un analyseur cité en COMMENTAIRE", () => {
    expect(
      analyseEnLigne(`// avant #4356 : new Set(String(expand).split(','))\nconst x = 1;`)
    ).toBe(false);
  });
});

describe('#4356 c.5 — aucun analyseur de `fields`/`expand` ne renaît hors du module partagé', () => {
  it("n'a AUCUN analyseur en ligne — l'inventaire est vide, et doit le rester", () => {
    // `toEqual` exige l'égalité EXACTE dans les DEUX sens : une entrée en TROP
    // est un analyseur neuf, à câbler ; une entrée en MOINS est un site câblé,
    // et retirer sa ligne fait partie du correctif.
    expect(sitesQuiAnalysentEnLigne()).toEqual([...INVENTAIRE_GELE]);
  });
});
