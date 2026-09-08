/**
 * Un seul mot par badge, sur les trois surfaces qui le prononcent.
 *
 * `ENGAGEMENT_AXIS_LABELS` / `ENGAGEMENT_ACHIEVEMENT_LABELS`
 * (`utils/engagement-labels.ts`) sont la source : la passerelle y compose le
 * corps des notifications de réengagement, la v3.1 web les importe. iOS ne
 * peut pas importer du TypeScript : `Localizable.xcstrings` en porte le miroir
 * (`progression.axis.<clé>`, `progression.achievement.<clé>.title` /
 * `.condition`), et ce témoin prouve l'ÉGALITÉ des sept langues communes —
 * `pt-BR` côté Xcode pour `pt` côté catalogue de notifications. Il tombe au
 * ROUGE dès qu'un mot diverge sur un seul des deux sites : une bannière qui
 * dirait « Conversations privées » au-dessus d'un écran qui dirait
 * « Conversations directes » serait exactement la jumelle divergente que le
 * dépôt interdit (dimension 6, « même mot, même icône »).
 *
 * Le mode de panne que ce témoin ferme est celui relevé en production le
 * 2026-09-08 : une notification « Badge débloqué : conversation.private ·
 * palier 10 » — la CLÉ à la place du MOT, parce qu'aucun catalogue de libellés
 * partagé n'existait et que le producteur n'avait rien d'autre sous la main.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ENGAGEMENT_ACHIEVEMENT_KEYS, ENGAGEMENT_AXES } from '../types/engagement.js';
import { ENGAGEMENT_ACHIEVEMENT_LABELS, ENGAGEMENT_AXIS_LABELS, engagementAxisLabel } from '../utils/engagement-labels.js';
import { NOTIFICATION_LANGUAGES } from '../utils/notification-strings.js';

const XCSTRINGS = join(__dirname, '../../../apps/ios/Meeshy/Localizable.xcstrings');

/** Les sept langues du catalogue Xcode, nommées par leur code de notification. */
const XCODE_LANGUAGES: Readonly<Record<string, string>> = {
  ar: 'ar',
  de: 'de',
  en: 'en',
  es: 'es',
  fr: 'fr',
  it: 'it',
  pt: 'pt-BR',
};

type Catalog = { readonly strings: Record<string, { readonly localizations?: Record<string, { readonly stringUnit?: { readonly value: string } }> }> };

function xcodeValue(catalog: Catalog, key: string, lang: string): string {
  const value = catalog.strings[key]?.localizations?.[XCODE_LANGUAGES[lang] ?? lang]?.stringUnit?.value;
  if (value === undefined) {
    throw new Error(`Localizable.xcstrings : clé \`${key}\` sans valeur pour \`${XCODE_LANGUAGES[lang] ?? lang}\``);
  }
  return value;
}

describe('libellés des streaks & badges — le catalogue partagé et Localizable.xcstrings disent le même mot', () => {
  const catalog = JSON.parse(readFileSync(XCSTRINGS, 'utf8')) as Catalog;

  it('le catalogue partagé couvre les huit langues des notifications, sans trou', () => {
    for (const lang of NOTIFICATION_LANGUAGES) {
      for (const axis of ENGAGEMENT_AXES) expect(ENGAGEMENT_AXIS_LABELS[lang][axis].length).toBeGreaterThan(0);
      for (const key of ENGAGEMENT_ACHIEVEMENT_KEYS) {
        expect(ENGAGEMENT_ACHIEVEMENT_LABELS[lang][key].title.length).toBeGreaterThan(0);
        expect(ENGAGEMENT_ACHIEVEMENT_LABELS[lang][key].condition.length).toBeGreaterThan(0);
      }
    }
  });

  it.each(Object.keys(XCODE_LANGUAGES))('les treize axes disent le même mot en %s', (lang) => {
    for (const axis of ENGAGEMENT_AXES) {
      expect(xcodeValue(catalog, `progression.axis.${axis}`, lang)).toBe(engagementAxisLabel(lang, axis));
    }
  });

  it.each(Object.keys(XCODE_LANGUAGES))('les cinq succès portent le même titre et la même condition en %s', (lang) => {
    for (const key of ENGAGEMENT_ACHIEVEMENT_KEYS) {
      const short = key.replace('achievement.', '');
      const labels = ENGAGEMENT_ACHIEVEMENT_LABELS[lang as keyof typeof ENGAGEMENT_ACHIEVEMENT_LABELS][key];
      expect(xcodeValue(catalog, `progression.achievement.${short}.title`, lang)).toBe(labels.title);
      expect(xcodeValue(catalog, `progression.achievement.${short}.condition`, lang)).toBe(labels.condition);
    }
  });

  it('une langue hors catalogue retombe sur le français, jamais sur une clé', () => {
    expect(engagementAxisLabel('xx', 'conversation.private')).toBe('Conversations privées');
    expect(engagementAxisLabel(null, 'content.reel')).toBe('Réels');
    expect(engagementAxisLabel('en-US', 'content.reel')).toBe('Reels');
  });
});
