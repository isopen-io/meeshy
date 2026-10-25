import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameVisibility } from '@meeshy/shared/types/game';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameSettings, type GameSettingsProps } from './game-settings';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/reglages' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const game = gameBlockWithExtrasFixture();

const props = (patch: Partial<GameSettingsProps> = {}): GameSettingsProps => ({
  prefs: { hidden: false, celebrations: true },
  visibility: game.visibility,
  league: game.league,
  online: true,
  savingVisibility: false,
  leavingLeague: false,
  errors: {},
  onCelebrations: () => undefined,
  onHidden: () => undefined,
  onVisibility: () => undefined,
  onLeaveLeague: () => undefined,
  ...patch,
});

/**
 * LES RÉGLAGES DU JEU (#9481) — célébrations, « Jeu masqué », qui voit quoi,
 * ligue publique. « Jeu masqué » dit ce qu’il fait ; réafficher ne rouvre rien
 * côté serveur et l’écran le dit.
 */
describe('les célébrations', () => {
  test('un interrupteur, coché par défaut, qui envoie son nouvel état', async () => {
    const calls: boolean[] = [];
    const host = await mount(<GameSettings {...props({ onCelebrations: (on) => calls.push(on) })} />);
    const input = host.querySelector<HTMLInputElement>('[data-game-setting-celebrations]');
    expect(input?.checked).toBe(true);
    await click(input);
    expect(calls).toEqual([false]);
  });

  test('le texte dit que le réglage vaut pour cet appareil seulement', () => {
    expect(text(renderToStaticMarkup(<GameSettings {...props()} />))).toContain('cet appareil seulement');
  });
});

describe('« Jeu masqué »', () => {
  test('le texte dit tout ce que le geste fait : appareil, visibilités, ligue — et ce qui est gardé', () => {
    const t = text(renderToStaticMarkup(<GameSettings {...props()} />));
    expect(t).toContain('Masque le jeu partout sur cet appareil');
    expect(t).toContain('te retire de la joute publique');
    expect(t).toContain('Tes étincelles et tes trophées sont gardés');
  });

  test('l’interrupteur envoie son nouvel état ; masqué, il rappelle que réafficher ne rouvre rien', async () => {
    const calls: boolean[] = [];
    const host = await mount(<GameSettings {...props({ prefs: { hidden: true, celebrations: true }, onHidden: (on) => calls.push(on) })} />);
    expect(host.textContent).toContain('restent fermés');
    await click(host.querySelector('[data-game-setting-hidden]'));
    expect(calls).toEqual([false]);
  });

  test('hors ligne : on ne peut ni masquer ni réafficher — le serveur fait foi, et une bascule qui ne partirait pas serait défaite à la lecture suivante', async () => {
    const off = await mount(<GameSettings {...props({ online: false })} />);
    expect(off.querySelector<HTMLInputElement>('[data-game-setting-hidden]')?.disabled).toBe(true);
    unmountAll();
    const hidden = await mount(<GameSettings {...props({ online: false, prefs: { hidden: true, celebrations: true } })} />);
    expect(hidden.querySelector<HTMLInputElement>('[data-game-setting-hidden]')?.disabled).toBe(true);
  });
});

/**
 * LES NOTIFICATIONS DU JEU (#9490) — un interrupteur « Jeu » dans les réglages du jeu, branché sur la
 * préférence du COMPTE (`notification.gameEnabled`, défaut reçu). Au plus une notification du jeu par jour :
 * l'écran le dit.
 */
describe('les notifications du jeu', () => {
  test('un interrupteur, coché par défaut, qui envoie son nouvel état', async () => {
    const calls: boolean[] = [];
    const host = await mount(<GameSettings {...props({ gameNotifications: true, onGameNotifications: (on) => calls.push(on) })} />);
    const input = host.querySelector<HTMLInputElement>('[data-game-setting-notifications]');
    expect(input?.checked).toBe(true);
    await click(input);
    expect(calls).toEqual([false]);
  });

  test('le texte dit « au plus une par jour »', () => {
    const html = renderToStaticMarkup(<GameSettings {...props({ gameNotifications: true, onGameNotifications: () => undefined })} />);
    expect(text(html)).toContain('Notifications du jeu');
    expect(text(html)).toContain('au plus une notification du jeu par jour');
  });

  test('réglage du compte éteint : l’interrupteur est décoché', () => {
    const html = renderToStaticMarkup(<GameSettings {...props({ gameNotifications: false, onGameNotifications: () => undefined })} />);
    expect(html).toMatch(/data-game-setting-notifications=""[^>]*/);
    expect(html).not.toMatch(/data-game-setting-notifications=""[^>]*checked/);
  });

  test('pas encore lu : l’interrupteur attend (désactivé) plutôt que de deviner un état', async () => {
    const host = await mount(<GameSettings {...props({ gameNotifications: undefined, onGameNotifications: () => undefined })} />);
    expect(host.querySelector<HTMLInputElement>('[data-game-setting-notifications]')?.disabled).toBe(true);
  });

  test('hors ligne : suspendu, comme tout geste qui écrit le compte', async () => {
    const host = await mount(<GameSettings {...props({ online: false, gameNotifications: true, onGameNotifications: () => undefined })} />);
    expect(host.querySelector<HTMLInputElement>('[data-game-setting-notifications]')?.disabled).toBe(true);
  });

  test('un refus se lit sous l’interrupteur', () => {
    const html = renderToStaticMarkup(<GameSettings {...props({ gameNotifications: true, onGameNotifications: () => undefined, errors: { notifications: 'Réessaie.' } })} />);
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('Réessaie.');
  });

  test('sans branchement, la carte n’existe pas (l’écran d’avant)', () => {
    expect(renderToStaticMarkup(<GameSettings {...props()} />)).not.toContain('data-game-setting-notifications');
  });
});

/**
 * « MOMENTS À IMMORTALISER » (#10268) — `notification.gamePhotoEnabled`, le push d'une étape franchie app fermée, rangé
 * SOUS « Notifications du jeu » parce que les couper le coupe aussi (D8). Préférence du COMPTE, défaut reçu.
 */
describe('« Moments à immortaliser »', () => {
  const photo = (patch: Partial<GameSettingsProps> = {}): GameSettingsProps =>
    props({ gameNotifications: true, onGameNotifications: () => undefined, gamePhoto: true, onGamePhoto: () => undefined, ...patch });

  test('un interrupteur dans la carte des notifications du jeu, coché par défaut, qui envoie son nouvel état', async () => {
    const calls: boolean[] = [];
    const host = await mount(<GameSettings {...photo({ onGamePhoto: (on) => calls.push(on) })} />);
    const input = host.querySelector<HTMLInputElement>('#game-settings-notifications [data-game-setting-photo]');
    expect(input?.checked).toBe(true);
    expect(input?.disabled).toBe(false);
    await click(input);
    expect(calls).toEqual([false]);
  });

  test('l’interrupteur porte son nom et dit ce qu’il règle', () => {
    const t = text(renderToStaticMarkup(<GameSettings {...photo()} />));
    expect(t).toContain('Moments à immortaliser');
    expect(t).toContain('app fermée');
  });

  test('réglage du compte éteint : décoché', async () => {
    const host = await mount(<GameSettings {...photo({ gamePhoto: false })} />);
    expect(host.querySelector<HTMLInputElement>('[data-game-setting-photo]')?.checked).toBe(false);
  });

  test('« Notifications du jeu » coupées : l’interrupteur est éteint et suspendu, et l’écran dit pourquoi — sans écraser le choix gardé', async () => {
    const calls: boolean[] = [];
    const host = await mount(<GameSettings {...photo({ gameNotifications: false, gamePhoto: true, onGamePhoto: (on) => calls.push(on) })} />);
    const input = host.querySelector<HTMLInputElement>('[data-game-setting-photo]');
    expect(input?.checked).toBe(false);
    expect(input?.disabled).toBe(true);
    expect(host.textContent).toContain('Coupés avec les notifications du jeu');
    expect(calls).toEqual([]);
  });

  test('pas encore lu : l’interrupteur attend (désactivé) plutôt que de deviner un état', async () => {
    const host = await mount(<GameSettings {...photo({ gamePhoto: undefined })} />);
    expect(host.querySelector<HTMLInputElement>('[data-game-setting-photo]')?.disabled).toBe(true);
  });

  test('hors ligne : suspendu, comme tout geste qui écrit le compte', async () => {
    const host = await mount(<GameSettings {...photo({ online: false })} />);
    expect(host.querySelector<HTMLInputElement>('[data-game-setting-photo]')?.disabled).toBe(true);
  });

  test('sans branchement, pas d’interrupteur (l’écran d’avant)', () => {
    expect(renderToStaticMarkup(<GameSettings {...props({ gameNotifications: true, onGameNotifications: () => undefined })} />)).not.toContain('data-game-setting-photo');
  });
});

describe('qui voit quoi', () => {
  test('quatre sélecteurs : rang et niveau, trésor et Flamme, vitrine, Atlas', () => {
    const html = renderToStaticMarkup(<GameSettings {...props()} />);
    expect((html.match(/data-game-visibility/g) ?? []).length).toBe(4);
    for (const legend of ['Rang et niveau', 'Héritage et Flamme', 'Trophées', 'Atlas des langues']) expect(text(html)).toContain(legend);
  });

  test('un changement n’envoie QUE le champ touché', async () => {
    const patches: Array<Partial<GameVisibility>> = [];
    const host = await mount(<GameSettings {...props({ onVisibility: (patch) => patches.push(patch) })} />);
    const fieldset = [...host.querySelectorAll('[data-game-visibility]')].find((node) => node.textContent?.includes('Héritage et Flamme'));
    await click(fieldset?.querySelector('input[value="me"]') ?? null);
    expect(patches).toEqual([{ treasury: 'me' }]);
  });

  test('l’Atlas est fermé (moi seul) par défaut quand le serveur ne sert pas son réglage', () => {
    const partial = { ...game.visibility, atlas: undefined } as unknown as GameVisibility;
    const html = renderToStaticMarkup(<GameSettings {...props({ visibility: partial })} />);
    const atlas = html.split('data-game-visibility').find((chunk) => chunk.includes('Atlas des langues')) ?? '';
    expect(atlas).toContain('checked="" value="me"');
  });

  test('un serveur sans réglages : la section ne s’affiche pas', () => {
    expect(renderToStaticMarkup(<GameSettings {...props({ visibility: undefined })} />)).not.toContain('Qui voit quoi');
  });
});

describe('la ligue publique', () => {
  test('dedans : le pseudonyme et le départ en un geste', async () => {
    let left = 0;
    const host = await mount(<GameSettings {...props({ onLeaveLeague: () => (left += 1) })} />);
    expect(host.textContent).toContain('sous le nom Colibri-4821');
    await click(host.querySelector('[data-game-setting-league-leave]'));
    expect(left).toBe(1);
  });

  test('dehors : on le dit, il n’y a rien à quitter', () => {
    const closed = game.league === undefined ? undefined : { ...game.league, access: 'consent-required' as const, current: null };
    const html = renderToStaticMarkup(<GameSettings {...props({ league: closed })} />);
    expect(text(html)).toContain('Tu n’es pas dans la joute publique');
    expect(html).not.toContain('data-game-setting-league-leave');
  });
});

/* Carte de navigation (#9563, amendement n° 4) : les Réglages sont un niveau 2 sous Progression ; règles, carnet et classement ont leur propre chemin. */
describe('aucun lien transverse', () => {
  test('ni les règles, ni le carnet, ni le classement : un écran du jeu n’a qu’un parent', () => {
    const html = renderToStaticMarkup(<GameSettings {...props()} />);
    for (const path of ['/me/progression/regles', '/me/progression/carnet', '/me/progression/ligue']) expect(html).not.toContain(`href="${path}"`);
  });
});

/**
 * « ME PROPOSER D'IMMORTALISER » (#10174, L18) — trois choix, une préférence de compte ; le réglage dit que la
 * Chronique garde tout ; sans branchement, pas de carte.
 */
describe('les invitations à immortaliser', () => {
  test('trois choix, le courant coché, et le choix envoyé', async () => {
    const calls: string[] = [];
    const host = await mount(<GameSettings {...props({ invitations: { current: 'every', onChange: (next) => calls.push(next) } })} />);
    const inputs = [...host.querySelectorAll<HTMLInputElement>('[data-game-setting-invitations]')];
    expect(inputs.map((input) => [input.value, input.checked])).toEqual([
      ['every', true],
      ['major', false],
      ['never', false],
    ]);
    await click(host.querySelector('[data-game-setting-invitations="major"]'));
    expect(calls).toEqual(['major']);
    expect(host.textContent).toContain('la Chronique garde tout');
  });

  test('sans branchement : pas de carte ; hors ligne, la carte dit que le choix partira avec la connexion', () => {
    expect(renderToStaticMarkup(<GameSettings {...props()} />)).not.toContain('data-game-setting-invitations');
    const queued = renderToStaticMarkup(<GameSettings {...props({ invitations: { current: 'never', onChange: () => undefined, notice: 'Hors ligne : ton choix partira avec la connexion.' } })} />);
    expect(text(queued)).toContain('partira avec la connexion');
  });
});
