/**
 * `readDevice` — l'appareil sur lequel un membre a lu — ne concerne que LUI
 * (#7358). Les portes nominatives « qui a lu » le servaient pour chaque ligne,
 * à tout membre qui les ouvrait. Une seule règle, pour toutes les portes :
 * la ligne du lecteur garde son appareil, les autres le perdent. Sans lecteur
 * identifié, personne ne le garde.
 */
export function readDeviceServedTo(
  row: { readonly participantId: string; readonly readDevice?: string | null },
  viewerParticipantId: string | null
): string | null {
  return viewerParticipantId !== null && row.participantId === viewerParticipantId
    ? row.readDevice ?? null
    : null;
}

/**
 * Le VIEWER d'un accusé nominatif, dérivé d'un contexte d'authentification —
 * `User.id` pour un inscrit, `null` pour un invité de lien (#19385).
 *
 * Il vit ICI, à côté de `readDeviceServedTo`, parce que les deux répondent aux
 * deux moitiés d'une même question : celle-là dit QUI regarde, celle-ci dit ce
 * que son regard mérite. La loi de cercle (`socketio/readReceiptCircleGate`) et
 * les trois portes REST nominatives le partagent.
 *
 * Nommé plutôt que retapé : le `gateway/CLAUDE.md` avertit qu'`authContext.userId`
 * porte un `Participant.id` pour un invité de lien, et que le recopier dans un
 * champ qui déclare un `User.id` est une faute. L'idiome
 * `isAnonymous ? null : userId` est retapé une douzaine de fois dans le dépôt.
 *
 * Paramètre STRUCTUREL, pas le type du middleware : cette unité reste testable
 * sans construire une requête Fastify. `userId` y est OPTIONNEL parce qu'il
 * l'est sur `UnifiedAuthContext` — le déclarer requis aurait demandé un cast au
 * site d'appel, c'est-à-dire exactement la porte que ce lot ferme ailleurs.
 */
export const receiptViewerOf = (
  context: { readonly userId?: string; readonly isAnonymous?: boolean } | null | undefined,
): string | null => (!context || context.isAnonymous ? null : context.userId || null);
