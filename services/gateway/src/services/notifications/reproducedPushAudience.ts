import { respectsConversationMute } from './mutedRecipients';

/**
 * Qui reçoit un PUSH quand une notification est réécrite par l'édition de son
 * contenu (#18910, serveur-notifications-4).
 *
 * Le socket garde tout : `notification:deleted` + `notification:new` et les
 * compteurs partent pour chaque ligne, les clients recalent leur liste. Seul
 * l'appareil se retient, parce qu'un push de remplacement SONNE (titre, corps,
 * son) et que les NSE iOS/Android l'affichent dans tous les cas :
 *
 *  - `replace` : bannière non consommée, bien poussée, conversation audible. Le
 *    remplacement part et annule lui-même la bannière d'avant ;
 *  - `revoke`  : une bannière a été posée mais ne doit pas re-sonner (ligne
 *    lue, conversation mise en sourdine depuis — pour les seuls types que la
 *    sourdine fait taire à la création, `respectsConversationMute`). Elle porte
 *    un texte périmé : elle est retirée en silence ;
 *  - `none`    : aucune bannière n'a jamais été posée, il n'y a rien à
 *    remplacer ni à retirer.
 *
 * Jugée DEUX fois : à l'annonce, pour ne rien enfiler d'inutile, puis sur la
 * ligne RELUE juste avant l'envoi — une lecture entre les deux transforme le
 * remplacement en révocation.
 */
export type ReproducedPushAudience = 'replace' | 'revoke' | 'none';

export async function reproducedPushAudience(
  row: Readonly<Record<string, unknown>>,
  isConversationMuted: (conversationId: string) => Promise<boolean>
): Promise<ReproducedPushAudience> {
  const delivery = row.delivery;
  const pushed = delivery !== null && typeof delivery === 'object'
    && (delivery as { readonly pushSent?: unknown }).pushSent === true;
  if (!pushed) return 'none';
  if (row.isRead !== false) return 'revoke';

  const context = row.context !== null && typeof row.context === 'object' ? (row.context as Record<string, unknown>) : {};
  const conversationId = typeof context.conversationId === 'string' && context.conversationId !== '' ? context.conversationId : null;
  if (conversationId === null || !respectsConversationMute(String(row.type ?? ''))) return 'replace';
  return (await isConversationMuted(conversationId)) ? 'revoke' : 'replace';
}
