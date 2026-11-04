/**
 * Les capacités du LECTEUR sur une conversation (#14690). `canMakeObsolete` :
 * `DELETE /conversations/:id/obsolete` l'accepterait pour lui (administrateur,
 * membre d'un tête-à-tête, destinataire — jamais expéditeur — d'une demande non
 * acceptée). Source : `obsoleteVerdict` (gateway, `obsoleteCapability.ts`).
 */
export type ConversationViewerCapabilities = {
  readonly canMakeObsolete: boolean;
};
