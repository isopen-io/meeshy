import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Conversation } from '@/lib/api/types';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { menuRows } from '@/lib/reading-mode/catalog';
import { threadCapabilities } from '@/lib/reading-mode/decision';

import type { RowReadingModeMenu } from './row-actions';

/**
 * LA LOI DU FIL, LUE POUR UNE LIGNE (#11226) — `threadCapabilities` borne les
 * modes à l'identité du lecteur et à l'effectif, exactement comme à
 * l'ouverture (`useThreadReadingMode`) : un mode offert ici est un mode que le
 * fil saura dessiner.
 *
 * UN MODULE À PART, CHARGÉ À L'OUVERTURE DU MENU : la loi et son catalogue
 * vivent avec le fil et l'aperçu, et l'écran de la liste est à son plafond
 * de poids (`measure-weight.mjs`) — la liste ne les paie qu'une fois tenue.
 */
export function rowReadingModeMenu(input: {
  readonly conversation: Pick<Conversation, 'type'> & Partial<Pick<Conversation, 'memberCount'>>;
  readonly isAnonymous: boolean;
  readonly sticky: ConversationReadingMode | null;
  readonly language: InterfaceLanguage;
  readonly readingModesEnabled?: boolean;
}): RowReadingModeMenu {
  const capabilities = threadCapabilities({
    isAnonymous: input.isAnonymous,
    conversationType: input.conversation.type,
    memberCount: input.conversation.memberCount ?? null,
    ...(input.readingModesEnabled === undefined ? {} : { readingModesEnabled: input.readingModesEnabled }),
  });
  const rows = menuRows({
    availableModes: capabilities.availableModes,
    riverEligibilityReason: capabilities.riverEligibilityReason,
    currentMode: input.sticky ?? 'focal',
    language: input.language,
  });
  return { rows, sticky: input.sticky };
}
