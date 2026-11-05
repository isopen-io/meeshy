import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { useState } from 'react';

import type { ConsentPurpose } from '@meeshy/shared/types/consents';

import { loadVoiceCatalog } from '@/lib/i18n-voice-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { settingRequestedIn, settingFocusPath } from '@/lib/view/setting-focus';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { VOICE_CONSENT_PURPOSE } from '@/lib/api/consents';

import { VoiceSectionView, type VoiceView } from './settings-voice';

/**
 * RÉGLAGES › VOIX (#16419) — trois droits lus sur les consentements de la
 * passerelle, montrés à leur état EFFECTIF, basculés d'un geste, grisés hors
 * ligne ; un chargement et une erreur dessinés ; des cibles de 44 px nommées.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadVoiceCatalog('fr'), loadVoiceCatalog('ar')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

function Host(props: {
  readonly view: VoiceView;
  readonly disabled: boolean;
  readonly language: InterfaceLanguage;
  readonly onToggle: (purpose: ConsentPurpose, granted: boolean) => void;
  readonly onRetry: () => void;
}) {
  const [view, setView] = useState(props.view);
  return (
    <VoiceSectionView
      language={props.language}
      view={view}
      disabled={props.disabled}
      onToggle={(purpose, granted) => {
        props.onToggle(purpose, granted);
        setView((current) =>
          current.kind === 'ready'
            ? { kind: 'ready', granted: granted ? [...current.granted, purpose] : current.granted.filter((entry) => entry !== purpose) }
            : current,
        );
      }}
      onRetry={props.onRetry}
    />
  );
}

function section(params: { readonly view?: VoiceView; readonly disabled?: boolean; readonly language?: InterfaceLanguage } = {}) {
  const toggled: Array<readonly [ConsentPurpose, boolean]> = [];
  const retries: string[] = [];
  const element = (
    <Host
      language={params.language ?? 'fr'}
      view={params.view ?? { kind: 'ready', granted: ['data-processing', 'voice-data'] }}
      disabled={params.disabled ?? false}
      onToggle={(purpose, granted) => toggled.push([purpose, granted])}
      onRetry={() => retries.push('retry')}
    />
  );
  return { element, toggled, retries };
}

const switchOf = (host: HTMLElement, purpose: string) => host.querySelector<HTMLButtonElement>(`[role="switch"][data-setting="${purpose}"]`);

describe('Réglages › Voix — l’état lu', () => {
  test('trois droits nommés, à leur état effectif', async () => {
    const host = await mount(section().element);
    expect(host.querySelector('h2')?.textContent).toBe('VOIX');
    expect(switchOf(host, 'voice-data')?.getAttribute('aria-label')).toBe('Transcrire mes vocaux');
    expect(switchOf(host, 'voice-data')?.getAttribute('aria-checked')).toBe('true');
    expect(switchOf(host, 'voice-profile')?.getAttribute('aria-label')).toBe('Traduire mes vocaux');
    expect(switchOf(host, 'voice-profile')?.getAttribute('aria-checked')).toBe('false');
    expect(switchOf(host, 'voice-cloning')?.getAttribute('aria-label')).toBe('Cloner ma voix');
    expect(switchOf(host, 'voice-cloning')?.getAttribute('aria-checked')).toBe('false');
  });

  test('un droit dont la chaîne est rompue se montre inactif', async () => {
    const host = await mount(section({ view: { kind: 'ready', granted: ['data-processing', 'voice-profile', 'voice-cloning'] } }).element);
    expect(switchOf(host, 'voice-profile')?.getAttribute('aria-checked')).toBe('false');
    expect(switchOf(host, 'voice-cloning')?.getAttribute('aria-checked')).toBe('false');
  });

  test('chaque bascule est une cible de 44 px décrite par sa légende', async () => {
    const host = await mount(section().element);
    for (const purpose of ['voice-data', 'voice-profile', 'voice-cloning']) {
      const toggle = switchOf(host, purpose);
      expect(toggle?.style.minHeight).toBe('44px');
      const caption = host.querySelector(`#${CSS.escape(toggle?.getAttribute('aria-describedby') ?? 'absent')}`);
      expect((caption?.textContent ?? '').length).toBeGreaterThan(0);
    }
  });

  test('la note sous mon vocal vise la bascule du consentement vocal', () => {
    expect(VOICE_CONSENT_PURPOSE).toBe('voice-profile');
    const path = settingFocusPath(VOICE_CONSENT_PURPOSE);
    expect(settingRequestedIn(path.slice(path.indexOf('?')))).toBe('voice-profile');
  });

  test('en arabe, la section se lit dans sa langue', async () => {
    const host = await mount(section({ language: 'ar' }).element);
    expect(host.querySelector('h2')?.textContent).toBe('الصوت');
  });
});

describe('Réglages › Voix — basculer', () => {
  test('un geste bascule le droit et le montre aussitôt', async () => {
    const { element, toggled } = section();
    const host = await mount(element);
    const translation = switchOf(host, 'voice-profile');
    if (translation !== null) await click(translation);
    expect(toggled).toEqual([['voice-profile', true]]);
    expect(switchOf(host, 'voice-profile')?.getAttribute('aria-checked')).toBe('true');
    const transcription = switchOf(host, 'voice-data');
    if (transcription !== null) await click(transcription);
    expect(toggled).toEqual([
      ['voice-profile', true],
      ['voice-data', false],
    ]);
  });

  test('hors ligne, les bascules sont grisées', async () => {
    const host = await mount(section({ disabled: true }).element);
    for (const purpose of ['voice-data', 'voice-profile', 'voice-cloning']) expect(switchOf(host, purpose)?.disabled).toBe(true);
  });
});

describe('Réglages › Voix — chargement et erreur', () => {
  test('le chargement est annoncé, sans bascule devinée', async () => {
    const host = await mount(section({ view: { kind: 'loading' } }).element);
    expect(host.querySelector('[data-voice-loading]')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[role="switch"]')).toBeNull();
  });

  test('une lecture ratée se dit et se relance', async () => {
    const { element, retries } = section({ view: { kind: 'error' } });
    const host = await mount(element);
    expect(host.querySelector('[data-voice-error]')?.textContent).toContain('Impossible de lire vos droits vocaux.');
    const retry = host.querySelector<HTMLButtonElement>('[data-voice-retry]');
    expect(retry?.style.minHeight).toBe('44px');
    if (retry !== null) await click(retry);
    expect(retries).toEqual(['retry']);
  });
});
