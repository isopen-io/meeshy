// packages/shared/__tests__/ci/ci-zones-base.test.ts
//
// #12531 — `ci.yml` saute des zones (gardes navigateur, traducteur, coque
// Android, cadres de gloire) d'après le diff depuis une BASE. Sur une poussée,
// cette base est le dernier run VERT de la branche : c'est ce qui rend le saut
// sûr, puisqu'une poussée évincée ou restée rouge ne perd pas son diff.
//
// Le résolveur partagé avec `docker.yml` (#6551) retombe, faute de dernier
// vert, sur `github.event.before` — la poussée PRÉCÉDENTE, c'est-à-dire le
// défaut même que #6551 décrit. Pour une image Docker, c'est le comportement
// historique ; pour une zone de tests sautée, c'est un vert sans preuve. La CI
// ne lui passe donc jamais la poussée précédente : relevé en échec ou aucun
// vert connu, il ne rend aucune base, et tout tourne.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CI = readFileSync(fileURLToPath(new URL('../../../../.github/workflows/ci.yml', import.meta.url)), 'utf8');

const sansCommentaires = (texte: string): string =>
  texte
    .split('\n')
    .filter((ligne) => !/^\s*#/.test(ligne))
    .join('\n');

/** Le bloc du job `id`, de sa clé jusqu'au job suivant, commentaires retirés. */
const job = (id: string): string => {
  const lignes = sansCommentaires(CI).split('\n');
  const debut = lignes.findIndex((ligne) => ligne === `  ${id}:`);
  if (debut < 0) return '';
  const fin = lignes.findIndex((ligne, index) => index > debut && /^ {2}\S/.test(ligne));
  return lignes.slice(debut, fin < 0 ? lignes.length : fin).join('\n');
};

describe('la base des zones de ci.yml', () => {
  const zones = job('changes');

  it('le job des zones est bien celui qui est lu', () => {
    expect(zones).toContain('name: Zones touchées');
  });

  it('une poussée se compare au dernier run VERT de ce workflow sur sa branche', () => {
    expect(zones).toMatch(/gh run list[^\n]*--workflow ci\.yml --branch "\$GITHUB_REF_NAME"/);
    expect(zones).toMatch(/--event push --status success --limit 1/);
    expect(zones).toMatch(/LAST_SUCCESSFUL_SHA: \$\{\{ steps\.dernier_vert\.outputs\.sha \}\}/);
  });

  it('ne retombe jamais sur la poussée précédente', () => {
    expect(zones).not.toContain('github.event.before');
    expect(zones).not.toContain('EVENT_BEFORE');
  });

  it('un relevé en échec se DIT et fait tout tourner, au lieu de se taire', () => {
    expect(zones).not.toMatch(/2>\/dev\/null\) \|\| SHA=""/);
    expect(zones).toMatch(/::warning[^\n]*tout tourne/);
  });

  it('les gardes navigateur ne se sautent que par leur zone', () => {
    expect(job('web-navigateur')).toMatch(/if: needs\.changes\.outputs\.web_navigateur == 'true'/);
  });
});
