/**
 * Aucun filtre `NOT` de la passerelle n'écarte en silence les documents où le
 * champ est ABSENT (#8309).
 *
 * Sur MongoDB, Prisma écarte de toute négation — `NOT`, `not`, `notIn`, sur un
 * scalaire comme sur une liste — le document où la clé n'existe pas (mesuré
 * contre `mongo:8` avec le vrai client, 2026-10-02 ; `helpers/mongo-where.ts`
 * en porte les sémantiques). Et Prisma n'écrit pas un champ optionnel qu'on ne
 * lui donne pas. Le journal des appels a été vide pour cette raison (#8294), la
 * page 2 de la liste des conversations perdait chaque conversation sans
 * activité, l'instantané de présence chaque invité anonyme.
 *
 * Deux règles, lues dans le source (commentaires retirés) et dans le schéma :
 *
 * 1. Une LISTE lue sous `NOT` (`has`, `hasSome`, `hasEvery`, `equals`,
 *    `isEmpty`) naît vide : chaque déclaration du champ porte `@default([])`.
 *    `isSet` n'existe pas sur une liste scalaire — le défaut, et la migration
 *    qui le pose sur l'existant, sont le seul remède typé.
 * 2. Un scalaire OPTIONNEL lu sous `NOT` dit l'absence à part, dans le même
 *    fichier : `{ champ: { isSet: false } }`. Sinon le site figure ci-dessous,
 *    avec sa raison.
 *
 * Le nom du champ suffit : un même nom déclaré optionnel dans un modèle et
 * requis dans un autre est traité comme optionnel — la garde préfère une entrée
 * justifiée à une absence ratée.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { walk } from './helpers/file-size-sweep';

const SRC_DIR = join(__dirname, '..');
const SCHEMA = join(__dirname, '../../../../packages/shared/prisma/schema.prisma');

const SITES_JUSTIFIES: Readonly<Record<string, string>> = {
  'routes/conversations/messages-search.ts#content': 'Message.content est requis ; seul Post.content est optionnel.',
  'routes/conversations/messages-list-views.ts#content': 'Message.content est requis ; seul Post.content est optionnel.',
};

type Declaration = { readonly kind: 'list' | 'optional' | 'required'; readonly attributes: string };

const declarations = (() => {
  const byField = new Map<string, Declaration[]>();
  const schema = readFileSync(SCHEMA, 'utf8');
  for (const match of schema.matchAll(/^\s+(\w+)\s+\w+(\[\]|\?)?([^\n]*)$/gm)) {
    const kind = match[2] === '[]' ? 'list' : match[2] === '?' ? 'optional' : 'required';
    byField.set(match[1], [...(byField.get(match[1]) ?? []), { kind, attributes: match[3] }]);
  }
  return byField;
})();

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const productionSources = () =>
  walk(SRC_DIR)
    .filter((file) => file.endsWith('.ts') && !file.includes('__tests__') && !file.endsWith('.test.ts'))
    .map((file) => ({ file: relative(SRC_DIR, file), source: withoutComments(readFileSync(file, 'utf8')) }));

const LIST_NEGATION = /NOT:\s*\{\s*(\w+)\s*:\s*\{\s*(?:has|hasSome|hasEvery|equals|isEmpty)\b/g;
const SCALAR_NEGATION = /NOT:\s*\{\s*(\w+)\b/g;

describe('aucune négation n’écarte en silence un document sans le champ (#8309)', () => {
  it('le balayage voit bien des négations — sinon une mesure vide passerait au vert', () => {
    const count = productionSources().reduce((sum, { source }) => sum + [...source.matchAll(SCALAR_NEGATION)].length, 0);
    expect(count).toBeGreaterThan(10);
  });

  it('chaque liste lue sous NOT naît vide (@default([]))', () => {
    const offenders = productionSources().flatMap(({ file, source }) =>
      [...source.matchAll(LIST_NEGATION)]
        .map((match) => match[1])
        .filter((field) =>
          (declarations.get(field) ?? []).some((d) => d.kind === 'list' && !d.attributes.includes('@default([])'))
        )
        .map((field) => `${file}#${field}`)
    );
    expect(offenders).toEqual([]);
  });

  it('chaque scalaire optionnel lu sous NOT dit l’absence à part, ou figure parmi les sites justifiés', () => {
    const offenders = productionSources().flatMap(({ file, source }) =>
      [...source.matchAll(SCALAR_NEGATION)]
        .map((match) => match[1])
        .filter((field) => (declarations.get(field) ?? []).some((d) => d.kind === 'optional'))
        .filter((field) => !new RegExp(`${field}:\\s*\\{\\s*isSet:\\s*false`).test(source))
        .map((field) => `${file}#${field}`)
        .filter((site) => !(site in SITES_JUSTIFIES))
    );
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('chaque site justifié existe encore — une entrée sans site est une dette soldée à retirer', () => {
    const live = new Set(
      productionSources().flatMap(({ file, source }) =>
        [...source.matchAll(SCALAR_NEGATION)].map((match) => `${file}#${match[1]}`)
      )
    );
    expect(Object.keys(SITES_JUSTIFIES).filter((site) => !live.has(site))).toEqual([]);
  });
});
