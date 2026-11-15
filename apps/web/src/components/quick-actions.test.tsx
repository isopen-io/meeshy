import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { HERO_THRESHOLD, QuickActions, showsHeroes, type QuickAction } from './quick-actions';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, click, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const action = (partial: Partial<QuickAction> = {}): QuickAction => ({
  key: 'inviter',
  label: 'Inviter des amis',
  hint: 'Partagez votre lien.',
  hintQuestion: 'À quoi sert ce lien ?',
  glyph: 'linkSimple',
  run: () => null,
  ...partial,
});

const story = (run: QuickAction['run'] = () => null) => ({ key: 'story', label: 'Créer une story', hint: 'Une image, vingt heures.', glyph: 'image', run }) satisfies QuickAction;
const mood = () => ({ key: 'humeur', label: 'Partager une humeur', hint: 'Un emoji.', glyph: 'smiley', run: () => null }) satisfies QuickAction;

const rendu = (actions: readonly QuickAction[], conversationCount: number) => <QuickActions moreLabel="Plus" actions={actions} conversationCount={conversationCount} />;

describe('showsHeroes — le seuil de démarrage', () => {
  test('le seuil est INCLUSIF : dix gardent les héros, la onzième les range', () => {
    expect(HERO_THRESHOLD).toBe(10);
    expect(showsHeroes(10)).toBe(true);
    expect(showsHeroes(11)).toBe(false);
  });
});

/**
 * ÉPURE #18361 (règles 2, 4, 6) : ni titre ni sous-titre, UNE action nominale visible, le reste derrière « Plus »,
 * l'explication derrière un (i) dont le nom est la question.
 */
describe('QuickActions', () => {
  test('« Plus » désigne une liste présente même repliée, que le lecteur d’écran peut suivre', async () => {
    const host = await mount(rendu([action({ hero: true }), story(), mood()], 0));
    const more = buttonNamed(host, 'Plus');
    const target = document.getElementById(more?.getAttribute('aria-controls') ?? '');
    expect(target).not.toBeNull();
    expect(target?.hidden).toBe(true);
    await click(more);
    expect(target?.hidden).toBe(false);
    expect(target?.textContent).toContain('Créer une story');
  });

  test('rien à proposer ⇒ rien ne se peint', async () => {
    const host = await mount(rendu([], 0));
    expect(host.innerHTML).toBe('');
  });

  test('l’action nominale seule est à l’écran ; le reste attend « Plus »', async () => {
    const host = await mount(rendu([action({ hero: true }), story(), mood()], 0));
    expect(buttonNamed(host, 'Inviter des amis')).not.toBeNull();
    expect(buttonNamed(host, 'Créer une story')?.closest('[hidden]')).not.toBeNull();
    expect(buttonNamed(host, 'Partager une humeur')?.closest('[hidden]')).not.toBeNull();
    expect(host.textContent).not.toContain('Et maintenant');
    expect(buttonNamed(host, 'Plus')?.getAttribute('aria-expanded')).toBe('false');
  });

  test('« Plus » offre les autres portes, et elles agissent', async () => {
    const ran: string[] = [];
    const host = await mount(rendu([action({ hero: true }), story(() => (ran.push('story'), null)), mood()], 3));
    await click(buttonNamed(host, 'Plus'));
    expect(buttonNamed(host, 'Partager une humeur')).not.toBeNull();
    await click(buttonNamed(host, 'Créer une story'));
    expect(ran).toEqual(['story']);
  });

  test('sans autre porte, pas de « Plus »', async () => {
    const host = await mount(rendu([action({ hero: true })], 0));
    expect(buttonNamed(host, 'Plus')).toBeNull();
  });

  test('l’explication est derrière un (i) nommé par sa question, lue repliée', async () => {
    const host = await mount(rendu([action({ hero: true })], 0));
    const info = host.querySelector<HTMLButtonElement>('button[aria-label="À quoi sert ce lien ?"]');
    expect(info).not.toBeNull();
    const note = host.querySelector<HTMLElement>(`[id="${info?.getAttribute('aria-controls')}"]`);
    expect(note?.textContent).toBe('Partagez votre lien.');
    expect(note?.className).toContain('sr-only');
    await click(info);
    expect(note?.className).not.toContain('sr-only');
  });

  test('passé le seuil, l’action nominale reste là, plus discrète', async () => {
    const host = await mount(rendu([action({ hero: true })], HERO_THRESHOLD + 1));
    expect(buttonNamed(host, 'Inviter des amis')).not.toBeNull();
    expect(host.querySelector('[data-quick-action-primary]')?.getAttribute('data-quick-action-primary')).toBe('quiet');
  });

  test('le retour d’un geste invisible a sa zone annoncée', async () => {
    const host = await mount(rendu([action({ hero: true })], 0));
    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
