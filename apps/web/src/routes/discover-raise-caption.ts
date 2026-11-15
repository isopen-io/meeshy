import type { FriendRequestRecord } from '@/lib/api/friend-requests';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { requestedLevelOf } from '@/lib/relations/circles';
import { relationLevelLabel } from '@/lib/relations/level-labels';

/**
 * Le cran d'une demande de montée, dit sur sa ligne de « Demandes » (#13938,
 * iso `RequestsTab.levelCaption`) : « Demande le niveau Proche », « En attente ·
 * Sang ». Une demande d'Ami (le sens historique) ne dit rien de plus. Chargé à
 * la demande par Découvrir, seulement quand une demande porte un cran.
 */
export function raiseCaption(language: InterfaceLanguage, request: FriendRequestRecord, direction: 'incoming' | 'outgoing'): string | null {
  const level = requestedLevelOf(request);
  if (level === 'FRIEND') return null;
  return translateCircles(language, direction === 'incoming' ? 'circles.requests.incoming' : 'circles.requests.outgoing', { level: relationLevelLabel(language, level) });
}
