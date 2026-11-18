import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Un geste sur un message d'un fil TERMINÉ rend 410 et NOMME sa raison
 * (`code: 'CONVERSATION_CLOSED'`, audit #19352 A6). Sans code, le client
 * Android substitue `HTTP_410`, classe le refus en panne passagère et rejoue
 * le geste cinq fois. La garde couvre la classe : tout site, présent ou à
 * venir, qui rend la phrase de clôture en 410 — par sa constante ou écrite en
 * toutes lettres (ajout d'un membre, invitation).
 */
const ROUTES = join(__dirname, '../../../routes');

function sourcesUnder(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourcesUnder(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

/* La phrase de clôture, par sa constante ou en toutes lettres (ajouter un membre, inviter dans un fil terminé). */
const CLOSED_GONE = /sendError\(\s*reply\s*,\s*410\s*,\s*(?:CONVERSATION_CLOSED_EDIT_MESSAGE|'Cette conversation est terminée')([^)]*)\)/g;

describe('un 410 de fil terminé porte toujours son code', () => {
  const sites = sourcesUnder(ROUTES).flatMap((path) =>
    [...readFileSync(path, 'utf8').matchAll(CLOSED_GONE)].map((match) => ({ file: relative(ROUTES, path), rest: match[1] ?? '' })),
  );

  it('trouve les sites de la phrase de clôture (la garde ne garde pas un ensemble vide)', () => {
    expect(sites.length).toBeGreaterThanOrEqual(7);
  });

  it("aucun de ces sites ne rend le 410 sans `code: 'CONVERSATION_CLOSED'`", () => {
    expect(sites.filter((site) => !site.rest.includes("code: 'CONVERSATION_CLOSED'")).map((site) => site.file)).toEqual([]);
  });
});
