import { isEndToEndMode } from '../conversations/encryptionRegime';

/**
 * OÙ MÈNE UNE INVITATION DANS UN APPEL (#19650, décision porteur du 2026-11-18).
 *
 * - `admit-member` : l'appel vit dans un groupe (ou une conversation publique) —
 *   inviter, c'est faire entrer l'invité dans CETTE conversation, puis le faire
 *   sonner. Les gardes d'entrée de la conversation s'appliquent (une
 *   conversation externe y est refusée).
 * - `rebranch` : l'appel vit dans un tête-à-tête lisible par le serveur — il
 *   bascule vers le groupe qui réunit exactement ses participants et l'invité,
 *   trouvé ou créé (`callConversationRebranch.ts`).
 * - `legacy-guest` : tête-à-tête chiffré de bout en bout (D3) — aucun groupe ne
 *   naît en clair d'une conversation chiffrée ; l'invité reste l'invité de CET
 *   appel (`call-guest`), comme avant.
 */
export type CallInvitationRoute = 'admit-member' | 'rebranch' | 'legacy-guest';

export function callInvitationRoute(conversation: {
  readonly type: string | null | undefined;
  readonly encryptionMode: string | null | undefined;
}): CallInvitationRoute {
  if (conversation.type !== 'direct') return 'admit-member';
  return isEndToEndMode(conversation.encryptionMode) ? 'legacy-guest' : 'rebranch';
}
