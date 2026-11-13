import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameSettings, type GameSettingsProps } from './game-settings';
import { GroupedSection } from './grouped-section';
import { SETTINGS_GLYPHS } from './glyphs-settings';
import { InfoHintScope, type InfoHint } from './info-hint';

/**
 * LE (i) DES RANGÉES ET DES TITRES (#17587, épure #17584) — l'explication passe
 * derrière un (i) dont le nom est la QUESTION, reste lue repliée, s'ouvre au
 * toucher, se referme à Échap, et un seul (i) est ouvert par écran.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/settings' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const note = (label: string, text: string): InfoHint => ({ label, text, glyph: SETTINGS_GLYPHS.info });
const PRIVACY = note('Qui voit ma présence ?', 'Seuls vos amis voient que vous êtes en ligne.');
const NOTIFS = note('Que coupe ce réglage ?', 'Les sons et les bannières, jamais les badges.');

const infoButton = (host: ParentNode, question: string): HTMLButtonElement => {
  const button = [...host.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === question);
  if (button === undefined) throw new Error(`aucun (i) nommé « ${question} »`);
  return button;
};

const noteOf = (host: ParentNode, button: HTMLButtonElement): HTMLElement => {
  const id = button.getAttribute('aria-controls');
  const element = id === null ? null : host.querySelector<HTMLElement>(`[id="${id}"]`);
  if (element === null) throw new Error('note introuvable');
  return element;
};

const sections = () => (
  <InfoHintScope>
    <GroupedSection id="privacy" title="CONFIDENTIALITÉ" icon={null} note={PRIVACY}>
      <span>rangées</span>
    </GroupedSection>
    <GroupedSection id="notifications" title="NOTIFICATIONS" icon={null} note={NOTIFS}>
      <span>rangées</span>
    </GroupedSection>
  </InfoHintScope>
);

describe('le (i) d’un titre de bloc', () => {
  test('sans note, le titre est seul : aucun (i)', async () => {
    const host = await mount(
      <GroupedSection id="about" title="À PROPOS" icon={null}>
        <span>rangées</span>
      </GroupedSection>,
    );
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.querySelector('h2')?.textContent).toBe('À PROPOS');
  });

  test('le (i) porte la question pour nom, cible 44 pt, et sa note est lue même repliée', async () => {
    const host = await mount(sections());
    const button = infoButton(host, 'Qui voit ma présence ?');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.style.minWidth).toBe('44px');
    expect(button.style.minHeight).toBe('44px');
    const hint = noteOf(host, button);
    expect(hint.textContent).toBe('Seuls vos amis voient que vous êtes en ligne.');
    expect(hint.className).toContain('sr-only');
    expect(host.querySelector('h2#privacy')?.textContent).toBe('CONFIDENTIALITÉ');
  });

  test('toucher le (i) déplie la note', async () => {
    const host = await mount(sections());
    const button = infoButton(host, 'Qui voit ma présence ?');
    await click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(noteOf(host, button).className).not.toContain('sr-only');
  });

  test('un seul (i) ouvert par écran : ouvrir le second referme le premier', async () => {
    const host = await mount(sections());
    const first = infoButton(host, 'Qui voit ma présence ?');
    const second = infoButton(host, 'Que coupe ce réglage ?');
    await click(first);
    await click(second);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(second.getAttribute('aria-expanded')).toBe('true');
    expect(noteOf(host, first).className).toContain('sr-only');
  });

  test('Échap referme la note ouverte', async () => {
    const host = await mount(sections());
    const button = infoButton(host, 'Qui voit ma présence ?');
    await click(button);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});

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

describe('le (i) des titres des réglages du jeu', () => {
  test('sans note, les titres restent nus et gardent leur identifiant', async () => {
    const host = await mount(<GameSettings {...props()} />);
    expect(host.querySelector('#game-settings-celebrations-title')).not.toBeNull();
    expect(host.querySelectorAll('button[aria-controls]')).toHaveLength(0);
  });

  test('une note sur un bloc pose son (i) à côté du seul titre visé', async () => {
    const host = await mount(
      <InfoHintScope>
        <GameSettings {...props({ notes: { celebrations: note('Que fêtent Mee et Meo ?', 'Chaque étape franchie.') } })} />
      </InfoHintScope>,
    );
    const button = infoButton(host, 'Que fêtent Mee et Meo ?');
    expect(noteOf(host, button).textContent).toBe('Chaque étape franchie.');
    expect(host.querySelectorAll('button[aria-controls]')).toHaveLength(1);
  });
});
