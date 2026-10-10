import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { detailStore } from '@/lib/view/detail-store';
import { levelsLabel, meeshCount } from '@/lib/view/game-copy';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameRequirementLine, GameSpendLine } from './game-touch';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  unmountAll();
  detailStore.close();
});

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * CE QU'UN GESTE DÉPENSE, AVANT LE GESTE (#9705) — ce qu'on a, ce que ça coûte,
 * ce qui restera ; ou, quand le solde ne suffit pas, combien il manque.
 */
describe('la ligne de dépense', () => {
  test('dit le solde, le prix et ce qui restera quand le geste est possible', () => {
    const page = text(renderToStaticMarkup(<GameSpendLine concept="flame" held={5} cost={3} format={meeshCount} />));
    expect(page).toContain('En poche 5 Meeshes');
    expect(page).toContain('Coûte 3 Meeshes');
    expect(page).toContain('Restera 2 Meeshes');
    expect(page).not.toContain('Il manque');
  });

  test('dit combien il manque, au lieu de ce qui restera, quand le solde ne suffit pas', () => {
    const page = text(renderToStaticMarkup(<GameSpendLine concept="season" held={4} cost={10} format={meeshCount} />));
    expect(page).toContain('En poche 4 Meeshes');
    expect(page).toContain('Coûte 10 Meeshes');
    expect(page).toContain('Il manque 6 Meeshes');
    expect(page).not.toContain('Restera');
  });

  test('le manque peut se dire dans une autre unité que le solde (les points convertibles d’une frappe)', () => {
    const page = text(
      renderToStaticMarkup(
        <GameSpendLine concept="meesh" held={5000} cost={1221} spendable={900} format={(n) => `${n} pts`} formatMissing={(n) => `${n} convertibles`} />,
      ),
    );
    expect(page).toContain('En poche 5000 pts');
    expect(page).toContain('Il manque 321 convertibles');
  });

  test('chaque valeur se touche et ouvre SES précisions', async () => {
    const host = await mount(<GameSpendLine concept="flame" held={5} cost={3} format={meeshCount} />);
    const chips = Array.from(host.querySelectorAll<HTMLElement>('[data-game-spend] [data-detail]'));
    expect(chips).toHaveLength(3);
    await click(chips[2] ?? null);
    expect(detailStore.get()?.detail.name).toBe('Restera');
    expect(detailStore.get()?.detail.what).toBe('C’est ce qu’il te restera après ce geste.');
  });
});

describe('la ligne d’exigence', () => {
  test('dit où l’on en est, le seuil et ce qui manque', () => {
    const page = text(renderToStaticMarkup(<GameRequirementLine concept="missions" current={3} required={5} />));
    expect(page).toContain('Niveau 3');
    expect(page).toContain('Requis 5');
    expect(page).toContain(`Il manque ${levelsLabel(2)}`);
  });

  test('se tait sur le manque quand l’exigence est remplie', () => {
    const page = text(renderToStaticMarkup(<GameRequirementLine concept="missions" current={7} required={5} />));
    expect(page).not.toContain('Il manque');
  });

  test('le niveau compté peut être le RECORD (la ligue, le duo)', () => {
    const page = text(renderToStaticMarkup(<GameRequirementLine concept="league" current={8} required={10} record />));
    expect(page).toContain('Record 8');
  });
});
