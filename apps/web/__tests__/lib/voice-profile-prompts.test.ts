/**
 * Miroir de `VoiceProfilePromptsTests.swift` : les deux plateformes doivent
 * faire lire la MÊME chose, sinon un profil enregistré sur l'une n'est pas
 * comparable à un profil enregistré sur l'autre.
 *
 * Ces tests encodent ce qui fait qu'un texte capte une prosodie plutôt qu'un
 * simple timbre — question, exclamation, énumération, longueur suffisante — pour
 * qu'un ajout futur ne puisse pas les perdre en silence.
 */

import {
  PROMPT_LANGUAGES,
  VOICE_PROFILE_PROMPTS,
  voicePromptsFor,
  voicePromptAt,
} from '@/lib/voice-profile-prompts';
import { READING_TEXTS } from '@/lib/voice-profile-utils';

/** `؟` est le point d'interrogation arabe ; `¿` / `¡` sont des OUVRANTS. */
const TERMINATORS = /[.!?؟]/g;

const sentenceCount = (text: string) => (text.match(TERMINATORS) ?? []).length;
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('Couverture des langues', () => {
  it('couvre chaque langue d\'interface de l\'application', () => {
    expect(new Set(PROMPT_LANGUAGES)).toEqual(
      new Set(['en', 'es', 'fr', 'pt', 'de', 'it', 'ar'])
    );
  });

  it('donne à chaque langue autant de textes qu\'au français', () => {
    const reference = VOICE_PROFILE_PROMPTS.fr.length;
    expect(reference).toBeGreaterThanOrEqual(5);

    for (const code of PROMPT_LANGUAGES) {
      expect(VOICE_PROFILE_PROMPTS[code]).toHaveLength(reference);
    }
  });

  it('ne retire aucune langue déjà couverte par le texte unique', () => {
    // `READING_TEXTS` couvre 18 langues, dont des langues africaines et
    // asiatiques. Les remplacer par les 7 langues d'interface serait une
    // régression silencieuse pour tous leurs locuteurs.
    for (const code of ['sw', 'am', 'ha', 'yo', 'zu', 'ln', 'ru', 'zh', 'ja', 'ko', 'nl']) {
      expect(typeof READING_TEXTS[code]).toBe('string');
      expect(READING_TEXTS[code].length).toBeGreaterThan(50);
    }
  });
});

describe('Assez de matière pour la durée minimale', () => {
  it('donne à chaque texte de quoi tenir dix secondes', () => {
    for (const code of PROMPT_LANGUAGES) {
      for (const text of VOICE_PROFILE_PROMPTS[code]) {
        expect(wordCount(text)).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('donne au moins deux phrases par texte', () => {
    for (const code of PROMPT_LANGUAGES) {
      for (const text of VOICE_PROFILE_PROMPTS[code]) {
        expect(sentenceCount(text)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('ne transforme aucun texte en mur de phrases', () => {
    for (const code of PROMPT_LANGUAGES) {
      for (const text of VOICE_PROFILE_PROMPTS[code]) {
        expect(sentenceCount(text)).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('Variété prosodique', () => {
  it('fait poser au moins une question dans chaque langue', () => {
    // Sans question, aucun contour montant n'est jamais enregistré.
    for (const code of PROMPT_LANGUAGES) {
      const hasQuestion = VOICE_PROFILE_PROMPTS[code].some(
        t => t.includes('?') || t.includes('؟')
      );
      expect(hasQuestion).toBe(true);
    }
  });

  it('fait prononcer au moins une exclamation dans chaque langue', () => {
    for (const code of PROMPT_LANGUAGES) {
      expect(VOICE_PROFILE_PROMPTS[code].some(t => t.includes('!'))).toBe(true);
    }
  });

  it('fait lire au moins une énumération dans chaque langue', () => {
    for (const code of PROMPT_LANGUAGES) {
      expect(VOICE_PROFILE_PROMPTS[code].some(t => t.includes(':'))).toBe(true);
    }
  });

  it('n\'a aucun doublon à l\'intérieur d\'une langue', () => {
    for (const code of PROMPT_LANGUAGES) {
      const texts = VOICE_PROFILE_PROMPTS[code];
      expect(new Set(texts).size).toBe(texts.length);
    }
  });
});

describe('Résolution de la langue', () => {
  it('normalise une locale complète', () => {
    expect(voicePromptsFor('fr-FR').map(p => p.text)).toEqual(
      voicePromptsFor('fr').map(p => p.text)
    );
    expect(voicePromptsFor('pt_BR').map(p => p.text)).toEqual(
      voicePromptsFor('pt').map(p => p.text)
    );
  });

  it('rend une série vide pour une langue sans série, jamais un repli trompeur', () => {
    // L'appelant doit pouvoir retomber sur `READING_TEXTS`, qui couvre le
    // swahili. Servir de l'anglais ici masquerait cette possibilité.
    expect(voicePromptsFor('sw')).toEqual([]);
    expect(voicePromptsFor(null)).toEqual([]);
    expect(voicePromptsFor('')).toEqual([]);
  });

  it('porte la langue résolue sur chaque texte', () => {
    expect(voicePromptsFor('fr-FR')[0].language).toBe('fr');
  });
});

describe('Sens de lecture', () => {
  it('marque l\'arabe comme droite-à-gauche', () => {
    expect(voicePromptsFor('ar').every(p => p.isRightToLeft)).toBe(true);
  });

  it('ne marque aucune écriture latine comme droite-à-gauche', () => {
    for (const code of ['fr', 'en', 'es', 'pt', 'de', 'it']) {
      expect(voicePromptsFor(code).every(p => !p.isRightToLeft)).toBe(true);
    }
  });
});

describe('Rotation', () => {
  it('décale le texte de départ', () => {
    expect(voicePromptAt('fr', 0, 0)?.text).not.toBe(voicePromptAt('fr', 0, 1)?.text);
  });

  it('boucle au lieu de buter sur le dernier texte', () => {
    const count = VOICE_PROFILE_PROMPTS.fr.length;
    expect(voicePromptAt('fr', count)?.text).toBe(voicePromptAt('fr', 0)?.text);
    expect(voicePromptAt('fr', 0, count)?.text).toBe(voicePromptAt('fr', 0, 0)?.text);
  });

  it('tolère un index négatif', () => {
    expect(voicePromptAt('fr', -1)).not.toBeNull();
  });

  it('rend null pour une langue sans série', () => {
    expect(voicePromptAt('sw', 0)).toBeNull();
  });
});
