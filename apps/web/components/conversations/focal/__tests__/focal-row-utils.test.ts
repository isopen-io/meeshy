/**
 * WF-110 — `focal-row-utils.ts`.
 *
 * behaviour-matrix:F06 — « la résolution Prisme reste inchangée » : preuve
 * que `resolveFocalMessageText` délègue STRICTEMENT à la même loi partagée
 * que le préview de liste (`resolveLastMessagePreview`), jamais une seconde
 * résolution de langue. Portée PARTIELLE assumée (documentée, WF-113) : le
 * cross-fade 150 ms + chip 🌐 à l'arrivée tardive d'une traduction (partie
 * visuelle/animée de F06) n'est PAS construit par ce lot — seule la LOI de
 * résolution (le texte affiché) est prouvée identique.
 */
import {
  buildFocalTranslationsRecord,
  resolveFocalMessageText,
  resolveFocalMessageDisplay,
  resolveFocalAuthorAccent,
  isFirstInFocalGroup,
  formatDayTimePillLabel,
  formatFocalDateCapsuleLabel,
  isNewCalendarDay,
} from '../focal-row-utils';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import type { MessageTranslation } from '@meeshy/shared/types';

function makeTranslation(targetLanguage: string, translatedContent: string): MessageTranslation {
  return {
    id: `t-${targetLanguage}`,
    messageId: 'm1',
    targetLanguage,
    translatedContent,
    translationModel: 'basic',
    createdAt: new Date(),
  } as MessageTranslation;
}

describe('buildFocalTranslationsRecord', () => {
  it('rend undefined pour un tableau vide/absent', () => {
    expect(buildFocalTranslationsRecord(undefined)).toBeUndefined();
    expect(buildFocalTranslationsRecord([])).toBeUndefined();
  });

  it('transforme le tableau Message.translations en dictionnaire {langue: texte}', () => {
    const record = buildFocalTranslationsRecord([
      makeTranslation('fr', 'Bonjour'),
      makeTranslation('es', 'Hola'),
    ]);
    expect(record).toEqual({ fr: 'Bonjour', es: 'Hola' });
  });

  it('ignore les entrées sans texte traduit', () => {
    const record = buildFocalTranslationsRecord([
      makeTranslation('fr', ''),
      makeTranslation('es', 'Hola'),
    ]);
    expect(record).toEqual({ es: 'Hola' });
  });
});

describe('resolveFocalMessageText — Prisme EXCLUSIVEMENT par resolveLastMessagePreview', () => {
  it('délègue à resolveLastMessagePreview, jamais une seconde loi de langue', () => {
    const message = {
      content: 'Hello',
      originalLanguage: 'en',
      translations: [makeTranslation('fr', 'Bonjour')],
    };
    const preferredLanguages = ['fr'];

    const viaUtil = resolveFocalMessageText(message, preferredLanguages);
    const viaSharedLawDirectly = resolveLastMessagePreview({
      preview: message.content,
      translations: { fr: 'Bonjour' },
      originalLanguage: message.originalLanguage,
      preferredLanguages,
    });

    expect(viaUtil).toBe(viaSharedLawDirectly);
    expect(viaUtil).toBe('Bonjour');
  });

  it('sans traduction préférée disponible, rend le contenu original', () => {
    const message = { content: 'Hello', originalLanguage: 'en', translations: [] };
    expect(resolveFocalMessageText(message, ['fr'])).toBe('Hello');
  });

  it('la langue originale demandée ne déclenche jamais une traduction', () => {
    const message = {
      content: 'Hello',
      originalLanguage: 'en',
      translations: [makeTranslation('en', 'SHOULD NOT WIN')],
    };
    expect(resolveFocalMessageText(message, ['en'])).toBe('Hello');
  });
});

describe('resolveFocalAuthorAccent — couleur d\'IDENTITÉ par auteur (colorForName)', () => {
  it('rend la couleur d\'identité par nom (colorForName), la SSOT déjà utilisée par iOS pour les expéditeurs', () => {
    expect(resolveFocalAuthorAccent('Alice')).toBe(colorForName('Alice'));
    expect(resolveFocalAuthorAccent('Bob')).toBe(colorForName('Bob'));
  });

  it('DISTINGUE deux auteurs différents (le filet cité porte la couleur de l\'auteur cité)', () => {
    // conversationAccentPalette ignore `name` (type/langue/thème seuls) : dérivée
    // d\'un nom, elle rendait une couleur CONSTANTE pour tous les auteurs — le
    // filet de citation était uniforme, contredisant « couleur de l\'auteur cité ».
    expect(resolveFocalAuthorAccent('Alice')).not.toBe(resolveFocalAuthorAccent('Bob'));
    expect(resolveFocalAuthorAccent('Alice')).not.toBe(resolveFocalAuthorAccent('Zorro'));
  });

  it('est stable (même entrée → même sortie)', () => {
    expect(resolveFocalAuthorAccent('Bob')).toBe(resolveFocalAuthorAccent('Bob'));
  });

  it('rend toujours un hex #RRGGBB valide', () => {
    expect(resolveFocalAuthorAccent('Alice')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('resolveFocalMessageDisplay — texte + langue RÉELLEMENT servie', () => {
  it('rend le texte traduit ET la langue servie', () => {
    const message = {
      content: 'Hello',
      originalLanguage: 'en',
      translations: [makeTranslation('fr', 'Bonjour')],
    };
    expect(resolveFocalMessageDisplay(message, ['fr'])).toEqual({ text: 'Bonjour', language: 'fr' });
  });

  it('rend l\'original et sa langue quand aucune traduction préférée n\'existe', () => {
    const message = {
      content: 'Hello',
      originalLanguage: 'en',
      translations: [makeTranslation('fr', 'Bonjour')],
    };
    expect(resolveFocalMessageDisplay(message, ['de'])).toEqual({ text: 'Hello', language: 'en' });
  });

  it('la langue originale demandée ne traduit jamais (langue = originale)', () => {
    const message = {
      content: 'Hello',
      originalLanguage: 'en',
      translations: [makeTranslation('en', 'SHOULD NOT WIN')],
    };
    expect(resolveFocalMessageDisplay(message, ['en'])).toEqual({ text: 'Hello', language: 'en' });
  });

  it('nomme la langue SERVIE par priorité du Prisme, pas la 1re entrée insérée à texte identique', () => {
    // pt et gl portent le MÊME texte « Olá » ; le lecteur préfère gl. Le Prisme
    // sert bien l\'entrée gl, mais une recherche par VALEUR attribuait « pt »
    // (première entrée dont la valeur === texte), en ordre d\'insertion.
    const message = {
      content: 'Hola',
      originalLanguage: 'es',
      translations: [makeTranslation('pt', 'Olá'), makeTranslation('gl', 'Olá')],
    };
    expect(resolveFocalMessageDisplay(message, ['gl'])).toEqual({ text: 'Olá', language: 'gl' });
  });

  // Le texte a TOUJOURS été servi (resolveLastMessagePreview normalise déjà les
  // deux côtés via normalizeLanguageForDedup) : c'est le LIBELLÉ de langue qui
  // divergeait. `focalServedLanguage` rapprochait les clés par un simple
  // `.toLowerCase()` — `pt-BR` → `pt-br` ne matchait jamais la préférence `pt`,
  // et le libellé retombait sur la langue ORIGINALE alors que le texte affiché
  // était la traduction portugaise. La descente UNIQUE (resolvePrismTranslation)
  // rend la paire { langue, texte } cohérente, région-taguée comprise.
  it('nomme la langue SERVIE avec sa clé région-taguée stockée (pt-BR) pour une préférence pt', () => {
    const message = {
      content: 'Hello',
      originalLanguage: 'en',
      translations: [makeTranslation('pt-BR', 'Olá')],
    };
    expect(resolveFocalMessageDisplay(message, ['pt'])).toEqual({ text: 'Olá', language: 'pt-BR' });
  });

  // Règle 3 du Prisme, direction OPPOSÉE : une langue d'origine région-taguée
  // (`en-US`) concourt à son rang normalisé (`en`). Au rang 1, l'original gagne —
  // la traduction française d'un rang inférieur ne le supplante pas.
  it("laisse l'original gagner à son rang même quand sa langue est région-taguée (en-US)", () => {
    const message = {
      content: 'Hello',
      originalLanguage: 'en-US',
      translations: [makeTranslation('fr', 'Bonjour')],
    };
    expect(resolveFocalMessageDisplay(message, ['en', 'fr'])).toEqual({ text: 'Hello', language: 'en-US' });
  });
});

describe('isFirstInFocalGroup', () => {
  it('vrai quand il n\'y a pas de message précédent', () => {
    expect(isFirstInFocalGroup({ senderId: 'u1', messageSource: 'user' }, null)).toBe(true);
    expect(isFirstInFocalGroup({ senderId: 'u1', messageSource: 'user' }, undefined)).toBe(true);
  });

  it('vrai quand l\'expéditeur change', () => {
    expect(
      isFirstInFocalGroup(
        { senderId: 'u2', messageSource: 'user' },
        { senderId: 'u1', messageSource: 'user' }
      )
    ).toBe(true);
  });

  it('faux quand le même expéditeur enchaîne', () => {
    expect(
      isFirstInFocalGroup(
        { senderId: 'u1', messageSource: 'user' },
        { senderId: 'u1', messageSource: 'user' }
      )
    ).toBe(false);
  });

  it("ouvre un groupe après l'avis d'arrivée DU MÊME auteur — un message système n'est pas une prise de parole", () => {
    expect(
      isFirstInFocalGroup(
        { senderId: 'u1', messageSource: 'user' },
        { senderId: 'u1', messageSource: 'system' }
      )
    ).toBe(true);
  });

  it('ouvre un groupe pour un message système lui-même', () => {
    expect(
      isFirstInFocalGroup(
        { senderId: 'u1', messageSource: 'system' },
        { senderId: 'u1', messageSource: 'user' }
      )
    ).toBe(true);
  });
});

describe('formatDayTimePillLabel', () => {
  it('compose "Jour · HH:mm", jour capitalisé', () => {
    // Mercredi 12 août 2026, 17:42 UTC — fixé en UTC pour un test déterministe.
    const date = new Date('2026-08-12T17:42:00Z');
    const label = formatDayTimePillLabel(date, 'fr');
    expect(label).toMatch(/^[A-ZÀ-Ý][a-zà-ÿ]+ · \d{2}:\d{2}$/);
  });
});

describe('formatFocalDateCapsuleLabel', () => {
  it('compose "Jour J mois", jour capitalisé', () => {
    const date = new Date('2026-08-12T17:42:00Z');
    const label = formatFocalDateCapsuleLabel(date, 'fr');
    expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
    expect(label).toContain('12');
  });
});

describe('isNewCalendarDay', () => {
  it('vrai sans message précédent', () => {
    expect(isNewCalendarDay(new Date(), null)).toBe(true);
  });

  it('faux pour deux horodatages du même jour local', () => {
    const morning = new Date('2026-08-12T08:00:00');
    const evening = new Date('2026-08-12T22:00:00');
    expect(isNewCalendarDay(evening, morning)).toBe(false);
  });

  it('vrai pour deux horodatages de jours différents', () => {
    const day1 = new Date('2026-08-12T23:59:00');
    const day2 = new Date('2026-08-13T00:01:00');
    expect(isNewCalendarDay(day2, day1)).toBe(true);
  });
});
