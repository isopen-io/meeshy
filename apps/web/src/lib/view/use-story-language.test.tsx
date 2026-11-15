import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { StoryPlaybackStory } from '@/lib/stories/playback';

import { useStoryLanguage, type StoryLanguage } from './use-story-language';

/**
 * `useStoryLanguage` (#7114, § 5.2) — le choix ÉPHÉMÈRE d'une langue pour le
 * lecteur de stories, étiqueté par `storyId` (même discipline que
 * `frozenRail`, `mediaDuration`, `soundAvailability`).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const seen: StoryLanguage[] = [];

const storyOf = (id: string): StoryPlaybackStory => ({
  id,
  content: 'Hello from the park!',
  originalLanguage: 'en',
  translations: { fr: { text: 'Bonjour depuis le parc !' } },
  createdAt: '2026-09-25T00:00:00.000Z',
});

function Harness({ story, readerLanguages = ['fr'] }: { readonly story: StoryPlaybackStory | undefined; readonly readerLanguages?: readonly string[] }) {
  const language = useStoryLanguage({ story, document: null, readerLanguages, canRequestTranslation: false });
  seen.push(language);
  return (
    <div>
      <span data-choice>{language.choice.kind}</span>
      <span data-bar-open>{language.barOpen ? 'ouverte' : 'fermée'}</span>
      <span data-badge>{language.badgeCode ?? ''}</span>
      <button type="button" data-open onClick={language.openBar} />
      <button type="button" data-close onClick={language.closeBar} />
      <button type="button" data-choose-en onClick={() => language.choose('en')} />
      <button type="button" data-choose-original onClick={() => language.choose('original')} />
      <button type="button" data-toggle-original onClick={language.toggleOriginal} />
    </div>
  );
}

function mount(story: StoryPlaybackStory | undefined, readerLanguages?: readonly string[]): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness story={story} {...(readerLanguages === undefined ? {} : { readerLanguages })} />);
  });
  return container;
}

const choiceOf = (el: HTMLDivElement) => el.querySelector('[data-choice]')!.textContent;
const barOpenOf = (el: HTMLDivElement) => el.querySelector('[data-bar-open]')!.textContent;
const badgeOf = (el: HTMLDivElement) => el.querySelector('[data-badge]')!.textContent;

describe('useStoryLanguage — part en auto, openBar/closeBar basculent barOpen', () => {
  test('part en auto, barre fermée, badge = tête du lecteur ("FR")', () => {
    const el = mount(storyOf('st-1'));
    expect(choiceOf(el)).toBe('auto');
    expect(barOpenOf(el)).toBe('fermée');
    expect(badgeOf(el)).toBe('FR');
  });

  test('openBar/closeBar basculent barOpen', () => {
    const el = mount(storyOf('st-1'));
    act(() => el.querySelector<HTMLButtonElement>('[data-open]')!.click());
    expect(barOpenOf(el)).toBe('ouverte');
    act(() => el.querySelector<HTMLButtonElement>('[data-close]')!.click());
    expect(barOpenOf(el)).toBe('fermée');
  });

  test('choose("en") pose "explore" ET ferme la barre — badgeCode "EN"', () => {
    const el = mount(storyOf('st-1'));
    act(() => el.querySelector<HTMLButtonElement>('[data-open]')!.click());
    act(() => el.querySelector<HTMLButtonElement>('[data-choose-en]')!.click());
    expect(choiceOf(el)).toBe('explore');
    expect(barOpenOf(el)).toBe('fermée');
    expect(badgeOf(el)).toBe('EN');
  });

  test('choose("original") pose "original" — aucun badge', () => {
    const el = mount(storyOf('st-1'));
    act(() => el.querySelector<HTMLButtonElement>('[data-choose-original]')!.click());
    expect(choiceOf(el)).toBe('original');
    expect(badgeOf(el)).toBe('');
  });
});

describe('le choix TOMBE au changement de storyId (StoryViewerView.swift:823-827)', () => {
  test('un choix "explore" ne survit pas au changement de story', () => {
    const el = mount(storyOf('st-1'));
    act(() => el.querySelector<HTMLButtonElement>('[data-choose-en]')!.click());
    expect(choiceOf(el)).toBe('explore');
    act(() => {
      root.render(<Harness story={storyOf('st-2')} />);
    });
    expect(choiceOf(el)).toBe('auto');
  });

  test('la barre ferme aussi au changement de story', () => {
    const el = mount(storyOf('st-1'));
    act(() => el.querySelector<HTMLButtonElement>('[data-open]')!.click());
    expect(barOpenOf(el)).toBe('ouverte');
    act(() => {
      root.render(<Harness story={storyOf('st-2')} />);
    });
    expect(barOpenOf(el)).toBe('fermée');
  });
});

describe('prism garde son identité tant que ni le lecteur ni le choix ne changent', () => {
  test('même identité de tableau à travers un rendu qui ne touche ni languages ni choice', () => {
    seen.length = 0;
    const readerLanguages = ['fr'];
    mount(storyOf('st-1'), readerLanguages);
    act(() => {
      root.render(<Harness story={storyOf('st-1')} readerLanguages={readerLanguages} />);
    });
    const [first, last] = [seen[0], seen[seen.length - 1]];
    expect(first?.prism).toBe(last?.prism);
  });
});

describe('badgeCode — la tête de la chaîne en MAJUSCULES, null en original', () => {
  test('auto sur lecteur ["fr"] rend "FR"', () => {
    const el = mount(storyOf('st-1'), ['fr']);
    expect(badgeOf(el)).toBe('FR');
  });

  test('original rend null (chaîne vide)', () => {
    const el = mount(storyOf('st-1'));
    act(() => el.querySelector<HTMLButtonElement>('[data-choose-original]')!.click());
    expect(badgeOf(el)).toBe('');
  });
});
