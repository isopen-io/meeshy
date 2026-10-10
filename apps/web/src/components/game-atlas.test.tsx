import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameAtlasBlock } from '@meeshy/shared/types/game';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameAtlas, type GameAtlasProps } from './game-atlas';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/atlas' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const atlas = (patch: Partial<GameAtlasBlock> = {}): GameAtlasBlock => {
  const block = gameBlockWithExtrasFixture().atlas;
  if (block === undefined) throw new Error('la fixture porte l’Atlas');
  return { ...block, ...patch };
};
const props = (patch: Partial<GameAtlasProps> = {}): GameAtlasProps => ({
  atlas: atlas(),
  visibility: 'me',
  online: true,
  savingVisibility: false,
  onVisibility: () => undefined,
  ...patch,
});

/**
 * L’ATLAS DES LANGUES (#9388) — le passeport aux tampons. Privé par défaut : le
 * texte le dit, et le choix de qui le voit est dessous. Rien n’y dit avec qui
 * on a échangé.
 */
describe('un passeport', () => {
  const html = renderToStaticMarkup(<GameAtlas {...props()} />);

  test('le compte, la barre, et ce qui reste à découvrir', () => {
    const t = text(html);
    expect(t).toMatch(/4 langues sur \d+/);
    expect(t).toMatch(/\d+ langues à découvrir/);
    expect(html).toContain('role="progressbar"');
  });

  test('un tampon par langue, nommée dans la langue de l’interface', () => {
    expect((html.match(/data-game-atlas-language=/g) ?? []).length).toBe(4);
    const t = text(html);
    for (const name of ['Français', 'Espagnol', 'Arabe', 'Swahili']) expect(t).toContain(name);
  });

  test('chaque tampon porte sa date', () => {
    expect(text(html)).toMatch(/Tampon du \d+ août 2026/);
  });

  test('l’échange à moitié fait se dit avec le sens qui manque', () => {
    expect(text(html)).toContain('Japonais');
    expect(text(html)).toContain('envoyé — il manque un message reçu');
  });

  test('les places à découvrir sont des tampons en pointillé, cachés au lecteur d’écran', () => {
    expect(html).toContain('data-game-stamp="empty"');
  });
});

describe('la vie privée', () => {
  test('le texte dit que l’Atlas est privé par défaut et ne garde ni l’interlocuteur ni la conversation', () => {
    const t = text(renderToStaticMarkup(<GameAtlas {...props()} />));
    expect(t).toContain('privé par défaut');
    expect(t).toContain('jamais l’interlocuteur ni la conversation');
  });

  test('« Moi seul » est coché quand le serveur le sert', () => {
    expect(renderToStaticMarkup(<GameAtlas {...props({ visibility: 'me' })} />)).toContain('checked="" value="me"');
  });

  test('choisir « Mes amis » envoie ce niveau', async () => {
    const chosen: string[] = [];
    const host = await mount(<GameAtlas {...props({ onVisibility: (level) => chosen.push(level) })} />);
    await click(host.querySelector('input[value="friends"]'));
    expect(chosen).toEqual(['friends']);
  });

  test('hors ligne : le choix est suspendu et l’écran le dit', async () => {
    const host = await mount(<GameAtlas {...props({ online: false })} />);
    expect(host.querySelector<HTMLInputElement>('input[value="friends"]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Hors ligne');
  });
});

describe('les états', () => {
  test('aucun tampon : l’écran invite à écrire dans une autre langue', () => {
    const html = renderToStaticMarkup(<GameAtlas {...props({ atlas: atlas({ stamped: 0, stamps: [], pending: [] }) })} />);
    expect(text(html)).toContain('Pas encore de tampon');
    expect(html).not.toContain('data-game-atlas-pending');
  });

  test('toutes les langues tamponnées : plus rien à découvrir', () => {
    const full = atlas({ stamped: 5, total: 5 });
    const html = text(renderToStaticMarkup(<GameAtlas {...props({ atlas: full })} />));
    expect(html).not.toContain('à découvrir');
  });
});
