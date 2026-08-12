/**
 * storyContentComposition — le `content` d'une story est un DÉRIVÉ des textes
 * posés sur le canvas, jamais une source traduite pour elle-même.
 *
 * Avant ce module, la gateway traduisait les deux séparément : le `content`
 * partait au traducteur comme n'importe quel post, les `textObjects` avaient
 * leur propre pipeline. Les deux divergeaient dès que l'un des pipelines
 * bronchait — constaté en production le 2026-07-27 sur la story
 * `6a6673870677d29b325a1a83` : six langues sur le `content`, zéro sur les trois
 * textObjects, alors que le `content` n'est QUE la concaténation de ces trois
 * textes.
 */

import { describe, it, expect } from '@jest/globals';
import {
  storyTextObjectText,
  composeStoryContent,
  composeStoryContentForLanguage,
  isContentDerivedFromTextObjects,
} from '../storyContentComposition';

const textObject = (text: string, translations?: Record<string, string>) => ({
  text,
  ...(translations ? { translations } : {}),
});

describe('storyTextObjectText — résolveur canonique du texte d\'un overlay', () => {
  it('lit la clé canonique `text`', () => {
    expect(storyTextObjectText({ text: 'bonjour' })).toBe('bonjour');
  });

  it('retombe sur l\'alias legacy `content`', () => {
    expect(storyTextObjectText({ content: 'legacy' })).toBe('legacy');
  });

  it('préfère `text` quand les deux sont présents', () => {
    expect(storyTextObjectText({ text: 'neuf', content: 'vieux' })).toBe('neuf');
  });

  it('ignore une valeur non textuelle', () => {
    expect(storyTextObjectText({ text: 42 as unknown })).toBeUndefined();
    expect(storyTextObjectText({})).toBeUndefined();
  });
});

describe('composeStoryContent — index original', () => {
  it('concatène les textes dans l\'ordre du canvas', () => {
    expect(composeStoryContent([textObject('Bonjour'), textObject('le monde')]))
      .toBe('Bonjour le monde');
  });

  it('saute les overlays sans texte exploitable', () => {
    expect(composeStoryContent([textObject('Bonjour'), { text: 42 }, textObject('monde')]))
      .toBe('Bonjour monde');
  });

  it('rend une chaîne vide sur une entrée non exploitable', () => {
    expect(composeStoryContent(undefined)).toBe('');
    expect(composeStoryContent(null)).toBe('');
    expect(composeStoryContent('pas un tableau')).toBe('');
    expect(composeStoryContent([])).toBe('');
  });
});

describe('composeStoryContentForLanguage — le content dérivé d\'une langue', () => {
  it('assemble les traductions de chaque overlay', () => {
    const objects = [
      textObject('Bonjour', { en: 'Hello' }),
      textObject('le monde', { en: 'the world' }),
    ];
    expect(composeStoryContentForLanguage(objects, 'en')).toBe('Hello the world');
  });

  it('garde l\'original des bouts non traduits — une story est multilingue par nature', () => {
    // Directive produit : plusieurs bouts peuvent être dans des langues
    // différentes. Un overlay déjà en anglais n'a pas de traduction `en` et
    // doit rester tel quel, pas disparaître du content.
    const objects = [
      textObject('15 years old ago'),
      textObject('Et désormais', { en: 'And from now on' }),
    ];
    expect(composeStoryContentForLanguage(objects, 'en'))
      .toBe('15 years old ago And from now on');
  });

  it('rend null tant qu\'aucun overlay n\'a cette langue — ne pas écraser avec l\'original', () => {
    const objects = [textObject('Bonjour', { en: 'Hello' })];
    expect(composeStoryContentForLanguage(objects, 'de')).toBeNull();
  });

  it('rend null sur une entrée non exploitable', () => {
    expect(composeStoryContentForLanguage(undefined, 'en')).toBeNull();
    expect(composeStoryContentForLanguage([], 'en')).toBeNull();
  });

  it('ignore une traduction non textuelle ou vide', () => {
    const objects = [
      textObject('Bonjour', { en: '   ' }),
      { text: 'monde', translations: { en: 42 } },
    ];
    expect(composeStoryContentForLanguage(objects, 'en')).toBeNull();
  });
});

describe('isContentDerivedFromTextObjects — légende d\'auteur ou index dérivé ?', () => {
  it('reconnaît le content produit par la concaténation', () => {
    const objects = [textObject('Bonjour'), textObject('le monde')];
    expect(isContentDerivedFromTextObjects('Bonjour le monde', objects)).toBe(true);
  });

  it('tolère les espaces de bord', () => {
    const objects = [textObject('Bonjour')];
    expect(isContentDerivedFromTextObjects('  Bonjour  ', objects)).toBe(true);
  });

  it('refuse une vraie légende d\'auteur — elle garde son pipeline propre', () => {
    const objects = [textObject('Bonjour')];
    expect(isContentDerivedFromTextObjects('Ma légende à moi', objects)).toBe(false);
  });

  it('refuse un content vide ou absent', () => {
    const objects = [textObject('Bonjour')];
    expect(isContentDerivedFromTextObjects('', objects)).toBe(false);
    expect(isContentDerivedFromTextObjects(null, objects)).toBe(false);
    expect(isContentDerivedFromTextObjects(undefined, objects)).toBe(false);
  });

  it('refuse quand il n\'y a aucun overlay', () => {
    expect(isContentDerivedFromTextObjects('Bonjour', [])).toBe(false);
  });
});
