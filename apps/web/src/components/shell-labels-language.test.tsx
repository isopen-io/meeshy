import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { menuRows } from '@/lib/reading-mode/catalog';
import { scrollToBottomLabel } from '@/lib/view/thread-chrome';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ComposerFormatBar } from './composer-format-bar';
import { ComposerLanguagePill } from './composer-language-pill';
import { LensPaginationFooter } from './lens-pagination-footer';
import { ScrollToBottomButton } from './thread-chrome';
import { ThreadRefused } from './thread-states';

/**
 * LES LIBELLÉS DE LA COQUILLE SUIVENT LA LANGUE D'INTERFACE — relevé sur
 * émulateur, interface en anglais : « 82 messages non lus, Défiler vers le
 * bas », « Langue d’écriture : English », « Mode de lecture : Script »… Ces
 * libellés étaient écrits en dur en français dans leurs composants ; ils
 * passent désormais par le catalogue (`catalog-*-shell-labels.ts`). Chaque
 * témoin rend le MÊME composant en français puis en anglais : un libellé resté
 * en dur rendrait deux fois le même texte.
 *
 * Les attendus sont RECOPIÉS, à dessein : relus dans le catalogue, ils
 * seraient verts sur un catalogue faux.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

function inLanguage(language: 'fr' | 'en', render: () => string): string {
  document.documentElement.lang = language;
  return render();
}

describe('le bouton de descente du fil', () => {
  test('82 non-lus : français puis anglais, jamais le français sous une interface anglaise', () => {
    const render = () => renderToStaticMarkup(<ScrollToBottomButton visible unreadCount={82} onClick={() => {}} />);
    expect(inLanguage('fr', render)).toContain('aria-label="82 messages non lus, Défiler vers le bas"');
    const english = inLanguage('en', render);
    expect(english).toContain('aria-label="82 unread messages, Scroll to bottom"');
    expect(english).not.toContain('Défiler');
  });

  test('le singulier et l’absence de non-lus ont chacun leur forme', () => {
    expect(scrollToBottomLabel(1, 'en')).toBe('1 unread message, Scroll to bottom');
    expect(scrollToBottomLabel(0, 'en')).toBe('Scroll to bottom');
    expect(scrollToBottomLabel(1, 'fr')).toBe('1 message non lu, Défiler vers le bas');
  });
});

describe('le composeur', () => {
  test('la pastille de langue d’écriture se nomme dans la langue d’interface', () => {
    const render = () => renderToStaticMarkup(<ComposerLanguagePill code="en" onOpen={() => {}} />);
    expect(inLanguage('fr', render)).toContain('aria-label="Langue d’écriture : ');
    const english = inLanguage('en', render);
    expect(english).toContain('aria-label="Writing language: English"');
    expect(english).not.toContain('Langue d’écriture');
  });

  test('la barre de mise en forme nomme ses emphases et son raccourci Maj/Shift', () => {
    const render = () => renderToStaticMarkup(<ComposerFormatBar onFormat={() => {}} />);
    const french = inLanguage('fr', render);
    expect(french).toContain('aria-label="Mise en forme"');
    expect(french).toContain('aria-label="Barré (Ctrl+Maj+X)"');
    const english = inLanguage('en', render);
    expect(english).toContain('aria-label="Formatting"');
    expect(english).toContain('aria-label="Bold (Ctrl+B)"');
    expect(english).toContain('aria-label="Strikethrough (Ctrl+Shift+X)"');
  });
});

describe('le fil et la liste', () => {
  test('une conversation refusée le dit en anglais', () => {
    const english = inLanguage('en', () => renderToStaticMarkup(<ThreadRefused />));
    expect(english).toContain('This conversation isn’t available');
    expect(english).toContain('aria-label="Back"');
    expect(english).not.toContain('Retour');
  });

  test('le pied de la liste en échec propose « Try again »', () => {
    const english = inLanguage('en', () =>
      renderToStaticMarkup(<LensPaginationFooter state="error" showsAllLoadedHint={false} onRetry={() => {}} sentinelRef={null} />),
    );
    expect(english).toContain('Couldn’t load more');
    expect(english).toContain('Try again');
    expect(english).not.toContain('Réessayer');
  });

  test('le menu des modes de lecture se lit en anglais', () => {
    const rows = menuRows({
      availableModes: ['focal', 'script'],
      riverEligibilityReason: { threshold: 5, current: null, riverReason: 'neverEligible' },
      currentMode: 'script',
      language: 'en',
    });
    expect(rows.map((row) => row.title)).toEqual(['Focal', 'Script', 'Bubbles', 'Summary', 'River']);
    expect(rows.find((row) => row.mode === 'summary')?.reason).toBe('For signed-in readers only');
    expect(rows.find((row) => row.mode === 'river')?.reason).toBe('Never in a direct conversation');
  });
});
