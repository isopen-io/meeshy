import type { ShareDestination } from '@/lib/api/social-events-v2-types';
import type { PublishFormat } from './send-sheet-plan';

/**
 * PAR OÙ UN ENVOI DE LA FEUILLE EST PARTI (#10502) — une conversation l'emporte
 * (le partage à une personne), sinon la publication choisie : une story, ou
 * un repost (post ou réel).
 */
export function shareDestinationOf(sent: { readonly conversations: number; readonly publish: readonly PublishFormat[] }): ShareDestination {
  if (sent.conversations > 0) return 'conversation';
  if (sent.publish.includes('STORY')) return 'story';
  return sent.publish.length > 0 ? 'repost' : 'other';
}
