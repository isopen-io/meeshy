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
  resolveFocalAuthorAccent,
  isFirstInFocalGroup,
  formatDayTimePillLabel,
  formatFocalDateCapsuleLabel,
  isNewCalendarDay,
} from '../focal-row-utils';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';
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

describe('resolveFocalAuthorAccent — déterministe, MÊME loi que l\'accent de conversation', () => {
  it('rend le même accent que conversationAccentPalette pour le même nom', () => {
    const expected = conversationAccentPalette({ name: 'Alice', type: 'direct' }).accent;
    expect(resolveFocalAuthorAccent('Alice')).toBe(expected);
  });

  it('est stable (même entrée → même sortie)', () => {
    expect(resolveFocalAuthorAccent('Bob')).toBe(resolveFocalAuthorAccent('Bob'));
  });

  it('rend toujours un hex #RRGGBB valide', () => {
    expect(resolveFocalAuthorAccent('Alice')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('isFirstInFocalGroup', () => {
  it('vrai quand il n\'y a pas de message précédent', () => {
    expect(isFirstInFocalGroup({ senderId: 'u1' }, null)).toBe(true);
    expect(isFirstInFocalGroup({ senderId: 'u1' }, undefined)).toBe(true);
  });

  it('vrai quand l\'expéditeur change', () => {
    expect(isFirstInFocalGroup({ senderId: 'u2' }, { senderId: 'u1' })).toBe(true);
  });

  it('faux quand le même expéditeur enchaîne', () => {
    expect(isFirstInFocalGroup({ senderId: 'u1' }, { senderId: 'u1' })).toBe(false);
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
