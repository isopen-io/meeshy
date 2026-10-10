import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { belowScreenTop } from './safe-area';

const SRC = new URL('../..', import.meta.url).pathname;
const source = (chemin: string): string => readFileSync(join(SRC, chemin), 'utf8');

/**
 * **UNE COTE COMPTÉE DEPUIS LE HAUT DE L'ÉCRAN S'ÉCRIT UNE FOIS** (#9942, #9517).
 *
 * Le haut RÉSERVÉ de l'écran n'est pas l'encoche : sur les hubs, la coquille y
 * ajoute le bandeau du haut quand la bannière du joueur l'occupe (#9494), et
 * `--safe-top` porte la somme. Deux chromes `fixed` recopiaient la même
 * formule — le couloir des disques et la pastille de synchronisation — alors
 * que `safe-area.ts` nomme ce cas exactement : « deux ÉCRITURES de la lecture,
 * non — c'est la jumelle divergente que CLAUDE.md interdit ». Un troisième
 * chrome posé demain recopierait la formule ou, plus probablement, écrirait
 * `env(safe-area-inset-top)` seul, et rejouerait le défaut que #9517 a coûté :
 * l'écran descend, le chrome reste.
 *
 * La garde juge l'INVENTAIRE, pas la géométrie : la formule complète ne vit
 * qu'ici, et les deux chromes passent par le nom.
 */
describe('belowScreenTop', () => {
  test('rend la cote depuis le haut réservé, l’encoche en repli', () => {
    expect(belowScreenTop(126)).toBe('calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 126px)');
  });

  test('zéro reste une cote, pas une absence de cote', () => {
    expect(belowScreenTop(0)).toBe('calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 0px)');
  });

  test('le repli `env()` est TOUJOURS là — sans lui, un écran sans feuille chargée perd la cote', () => {
    expect(belowScreenTop(8)).toContain('env(safe-area-inset-top, 0px)');
  });
});

describe('la formule ne s’écrit qu’une fois', () => {
  const FORMULE = 'var(--safe-top, env(safe-area-inset-top, 0px))';

  test('seul `lib/view/safe-area.ts` porte la formule complète', () => {
    expect(source('lib/view/safe-area.ts')).toContain(FORMULE);
  });

  for (const chemin of ['components/sync-pill.tsx', 'components/floating-menus.tsx']) {
    test(`${chemin} appelle le nom, il ne recopie pas la formule`, () => {
      const code = source(chemin);
      expect(code).not.toContain(FORMULE);
      expect(code).toContain('belowScreenTop(');
    });
  }
});
