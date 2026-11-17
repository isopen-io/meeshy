import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyTranslationMark, meeshyTranslationMarkRecipe, meeshyTranslationMarkTexts, type MeeshyTranslationMarkWords } from './meeshy-translation-mark';

const { mount, render, act } = kitMount();

const WORDS: MeeshyTranslationMarkWords = { translated: 'Traduit', original: 'Original', showOriginal: 'Voir l’original', showTranslation: 'Voir la traduction' };

describe('MeeshyTranslationMark — les textes', () => {
  test('traduit : « Traduit de l’italien », avec la bascule « Voir l’original »', () => {
    expect(meeshyTranslationMarkTexts({ mode: 'translated', sourceLanguageName: 'de l’italien', words: WORDS })).toEqual({ mention: 'Traduit de l’italien', toggle: 'Voir l’original' });
  });

  test('original : « Original en italien », bascule « Voir la traduction »', () => {
    expect(meeshyTranslationMarkTexts({ mode: 'original', originalLanguageName: 'en italien', words: WORDS })).toEqual({ mention: 'Original en italien', toggle: 'Voir la traduction' });
  });

  test('sans nom de langue : « Traduit », « Original » seuls', () => {
    expect(meeshyTranslationMarkTexts({ mode: 'translated', words: WORDS }).mention).toBe('Traduit');
    expect(meeshyTranslationMarkTexts({ mode: 'original', words: WORDS }).mention).toBe('Original');
  });
});

describe('MeeshyTranslationMark — la recette', () => {
  test('une taille : glyphe 16, texte 12,5 (13 en annonce), cible de 44, point de 7 de chaque côté', () => {
    expect(meeshyTranslationMarkRecipe({ density: 'line', mode: 'translated', hasToggle: true })).toMatchObject({ glyph: 16, fontSize: 12.5, tapTarget: 44, separatorGap: 7 });
    expect(meeshyTranslationMarkRecipe({ density: 'line', mode: 'announce', hasToggle: false }).fontSize).toBe(13);
  });

  test('sans geste : ni bascule, ni point ; en annonce et en icône : jamais de bascule', () => {
    expect(meeshyTranslationMarkRecipe({ density: 'line', mode: 'translated', hasToggle: false })).toMatchObject({ showsToggle: false, showsSeparator: false });
    expect(meeshyTranslationMarkRecipe({ density: 'line', mode: 'announce', hasToggle: true }).showsToggle).toBe(false);
    expect(meeshyTranslationMarkRecipe({ density: 'icon', mode: 'translated', hasToggle: true })).toMatchObject({ showsToggle: false, showsMention: false });
  });

  test('l’original montré atténue le glyphe en ink3', () => {
    expect(meeshyTranslationMarkRecipe({ density: 'line', mode: 'original', hasToggle: true }).glyphTone).toBe('ink3');
    expect(meeshyTranslationMarkRecipe({ density: 'line', mode: 'translated', hasToggle: true }).glyphTone).toBe('accent');
  });

  test('pressé : échelle 0,94, encre à 62 % ; en attente : 50 %', () => {
    expect(meeshyTranslationMarkRecipe({ density: 'line', mode: 'translated', hasToggle: true, isPressed: true })).toMatchObject({ pressedScale: 0.94, pressedOpacity: 0.62 });
    expect(meeshyTranslationMarkRecipe({ density: 'line', mode: 'translated', hasToggle: true, isPending: true }).toggleOpacity).toBe(0.5);
  });

  test('légende : rayon 13, marges 9 · 10, écart 7', () => {
    expect(meeshyTranslationMarkRecipe({ density: 'legend', mode: 'translated', hasToggle: false })).toMatchObject({ legendRadius: 13, legendPadding: [9, 10], legendGap: 7 });
  });
});

describe('MeeshyTranslationMark — le composant', () => {
  test('ligne : glyphe caché, mention, point caché, bascule en bouton nommé', () => {
    const container = mount(<MeeshyTranslationMark sourceLanguageName="de l’italien" isShowingOriginal={false} onToggle={() => {}} words={WORDS} />);
    expect(container.textContent).toContain('Traduit de l’italien');
    const button = container.querySelector<HTMLButtonElement>('button');
    expect(button?.textContent).toBe('Voir l’original');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-kit-translation-glyph]')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-kit-translation-dot]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('la bascule appelle onToggle une fois et ne change rien d’elle-même', () => {
    let toggles = 0;
    const container = mount(<MeeshyTranslationMark sourceLanguageName="de l’italien" isShowingOriginal={false} onToggle={() => (toggles += 1)} words={WORDS} />);
    act(() => container.querySelector('button')?.click());
    expect(toggles).toBe(1);
    expect(container.querySelector('button')?.textContent).toBe('Voir l’original');
  });

  test('le libellé ne s’inverse que si l’hôte remet isShowingOriginal', () => {
    const container = mount(<MeeshyTranslationMark sourceLanguageName="de l’italien" originalLanguageName="en italien" isShowingOriginal={false} onToggle={() => {}} words={WORDS} />);
    render(<MeeshyTranslationMark sourceLanguageName="de l’italien" originalLanguageName="en italien" isShowingOriginal onToggle={() => {}} words={WORDS} />);
    expect(container.textContent).toContain('Original en italien');
    expect(container.querySelector('button')?.textContent).toBe('Voir la traduction');
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('sans onToggle : un texte, aucun bouton, aucune halte de clavier, aucun point', () => {
    const container = mount(<MeeshyTranslationMark sourceLanguageName="de l’italien" isShowingOriginal={false} words={WORDS} />);
    expect(container.querySelectorAll('button, [tabindex]').length).toBe(0);
    expect(container.querySelector('[data-kit-translation-dot]')).toBeNull();
    expect(container.textContent).toBe('Traduit de l’italien');
  });

  test('en attente : un second toucher est ignoré', () => {
    let toggles = 0;
    const container = mount(<MeeshyTranslationMark sourceLanguageName="de l’italien" isShowingOriginal={false} isPending onToggle={() => (toggles += 1)} words={WORDS} />);
    act(() => container.querySelector('button')?.click());
    expect(toggles).toBe(0);
  });

  test('label remplace le nom dit de la bascule', () => {
    const container = mount(<MeeshyTranslationMark sourceLanguageName="de l’italien" isShowingOriginal={false} onToggle={() => {}} label="Afficher le message d’origine" words={WORDS} />);
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Afficher le message d’origine');
  });

  test('icône : le glyphe seul, nommé, sans geste', () => {
    const container = mount(<MeeshyTranslationMark density="icon" isShowingOriginal={false} words={WORDS} sourceLanguageName="de l’italien" />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Traduit de l’italien');
  });

  test('annonce : la phrase entière, jamais de bascule', () => {
    const container = mount(<MeeshyTranslationMark mode="announce" announcement="Il le lira en portugais" isShowingOriginal={false} onToggle={() => {}} words={WORDS} />);
    expect(container.textContent).toBe('Il le lira en portugais');
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  test('légende : le texte de l’hôte dans une capsule de verre demandée à K01', () => {
    const container = mount(<MeeshyTranslationMark density="legend" caption={<span>Le tram 28</span>} isShowingOriginal={false} words={WORDS} />);
    expect(container.textContent).toContain('Le tram 28');
    expect(container.querySelector('[data-kit-translation-legend]')).not.toBeNull();
  });

  test('appui long : onExplore ; Maj+F10 aussi', () => {
    let explored = 0;
    const container = mount(<MeeshyTranslationMark sourceLanguageName="de l’italien" isShowingOriginal={false} onToggle={() => {}} onExplore={() => (explored += 1)} words={WORDS} />);
    act(() => container.querySelector('button')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })));
    expect(explored).toBe(1);
  });

  test('la nouvelle traduction entre une fois : data-enters seulement au premier rendu', () => {
    const container = mount(<MeeshyTranslationMark sourceLanguageName="de l’italien" isShowingOriginal={false} words={WORDS} />);
    expect(container.querySelector('[data-kit-translation-mark]')?.hasAttribute('data-enters')).toBe(true);
  });
});

describe('MeeshyTranslationMark — pureté', () => {
  test('aucun type du domaine, aucun code de langue, aucun résolveur du Prisme, aucun flou', () => {
    for (const file of ['./meeshy-translation-mark.tsx', './meeshy-translation-mark-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api|resolvePrism|resolveUserLanguage|backdrop-filter|box-shadow/);
    }
  });
});
