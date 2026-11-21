import type { RelationLevel } from '@meeshy/shared/types/relation';
import { RELATION_LEVEL_LABELS, RELATION_LEVEL_PRESENTATION, type RelationLabelLanguage } from '@meeshy/shared/utils/relation-levels';

import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE NOM ET L'ICÔNE D'UN NIVEAU** (#13938, #14063) — lus dans la table que les
 * trois clients et la passerelle partagent (`RELATION_LEVEL_LABELS`,
 * `RELATION_LEVEL_PRESENTATION`, `@meeshy/shared`), la même que
 * `GET /relations/config` sert. Un niveau ne s'affiche jamais par sa clé, et son
 * nom n'est recopié dans aucun catalogue du web.
 *
 * La table nomme le portugais `pt-BR` ; la langue d'interface du web dit `pt`.
 * Cette correspondance vit ICI, une fois — « Qui est prévenu » et « Mes
 * cercles » la lisent.
 */
const LABEL_LANGUAGE: Readonly<Record<InterfaceLanguage, RelationLabelLanguage>> = {
  fr: 'fr',
  en: 'en',
  es: 'es',
  pt: 'pt-BR',
  de: 'de',
  it: 'it',
  ar: 'ar',
};

export const relationLevelLabel = (language: InterfaceLanguage, level: RelationLevel): string => RELATION_LEVEL_LABELS[LABEL_LANGUAGE[language]][level];

export const relationLevelIcon = (level: RelationLevel): string => RELATION_LEVEL_PRESENTATION[level].icon;

/**
 * **LA COULEUR D'UN NIVEAU** (#17013) — tirée des jetons, iso `CircleLevelColor` (iOS) et
 * `RelationLevel.tint()` (Android). Une seule table : la fiche d'un lien, « Mes cercles » et le
 * marqueur de la carte des positions la lisent, aucune ne la recopie.
 */
const LEVEL_TINT: Readonly<Record<RelationLevel, string>> = {
  BLOOD: 'var(--color-error)',
  CLOSE: 'var(--color-warning)',
  FRIEND: 'var(--color-success)',
  ACQUAINTANCE: 'var(--ios-info)',
  COMMUNITY: 'var(--color-ink-muted)',
  PUBLIC: 'var(--color-ink-muted)',
};

export const relationLevelTint = (level: RelationLevel): string => LEVEL_TINT[level];
