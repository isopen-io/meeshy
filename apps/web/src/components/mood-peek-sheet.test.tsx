import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { closeMoodPeek, currentMoodPeek, registerMoodPeekHost } from '@/lib/view/mood-peek';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';
import { MoodPeekBody } from './mood-peek-sheet';

/**
 * **AU TOUCHER, L'HUMEUR ET SON TEXTE** (#10528) — le témoin d'EFFET : toucher
 * la cible pose l'humeur dans le magasin, sans laisser le clic ouvrir le
 * profil autour ; et la feuille montre ce qu'on lui remet.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  closeMoodPeek();
  document.body.innerHTML = '';
});

describe('toucher la cible', () => {
  test('pose l’humeur de l’auteur, et le clic ne remonte pas', () => {
    const release = registerMoodPeekHost();
    const host = document.createElement('div');
    document.body.append(host);
    let bubbled = 0;
    const root = createRoot(host);
    act(() => {
      root.render(
        <div
          onClick={() => {
            bubbled += 1;
          }}
        >
          <Avatar initials="NO" color="#4455ff" size={44} name="Nour" mood="🎉" moodAuthorId="u-nour" />
        </div>,
      );
    });

    const target = host.querySelector<HTMLButtonElement>('[data-mood-peek="u-nour"]');
    expect(target).not.toBeNull();
    act(() => {
      target?.click();
    });

    expect(currentMoodPeek()).toEqual({ authorId: 'u-nour', emoji: '🎉', name: 'Nour' });
    expect(bubbled).toBe(0);
    act(() => root.unmount());
    release();
  });
});

describe('la feuille', () => {
  const body = (text: string) =>
    renderToStaticMarkup(
      <MoodPeekBody content={{ emoji: '🎉', text, ...(text === '' ? {} : { language: 'fr' }) }} name="Nour" authorId="u-nour" onClose={() => {}} />,
    );

  test('montre l’humeur, le nom et le texte qui l’accompagne', () => {
    const html = body('On fête ça ce soir');

    expect(html).toContain('Humeur de Nour');
    expect(html).toMatch(/data-mood-peek-emoji[^>]*>🎉</);
    expect(html).toMatch(/data-mood-peek-text[^>]*lang="fr"[^>]*>On fête ça ce soir</);
  });

  test('sans texte, l’humeur seule, sous le nom de son auteur', () => {
    const html = body('');

    expect(html).not.toContain('data-mood-peek-text');
    expect(html).toContain('Humeur de Nour');
    expect(html).toMatch(/data-mood-peek-emoji[^>]*>🎉</);
  });
});
