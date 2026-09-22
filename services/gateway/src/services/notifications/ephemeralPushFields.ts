/**
 * Ce qu'un push dit d'un message éphémère (#7451, point 10 du contrat du fil).
 *
 * ─── UNE DURÉE, PAS UNE ÉCHÉANCE — ET LA MÊME RAISON QUE PARTOUT ────────────
 *
 * Le push est le seul canal qui atteint un appareil ÉTEINT, donc le seul dont le
 * destinataire n'a, par construction, pas encore « reçu » le message au sens du
 * décompte. Une échéance serait donc fausse au moment même où elle part. Ce qui
 * voyage est la DURÉE ; la NSE iOS recompose le décompte depuis SA réception
 * locale, et le fil socket lui portera l'échéance serveur quand elle existera.
 *
 * `effectFlags` accompagne la durée pour que la NSE sache que la bulle est
 * éphémère sans avoir à le déduire d'un champ qui, un jour, pourrait manquer —
 * c'est ce même bitfield que les trois clients lisent déjà.
 *
 * Le CORPS de la bannière, lui, ne change pas : un éphémère protégé garde son
 * placeholder (`protectedPreview`). Ces deux champs ne portent aucun contenu,
 * donc ils voyagent aussi sous `showPreview: false` — ils n'ont rien à révéler.
 *
 * ─── CLÉS ABSENTES PLUTÔT QUE VIDES ─────────────────────────────────────────
 *
 * Un message non éphémère ne pose AUCUNE des deux clés — pas `''`. La charge
 * APNs est bornée à ~4 Ko (`boundApnsPayload`) et deux clés vides sur chaque
 * push de la plateforme se paient sur le budget de ceux qui portent du contenu.
 */

export interface EphemeralPushContext {
  readonly ephemeralDuration?: number | null;
  readonly effectFlags?: number | null;
}

export function ephemeralPushFields(
  context: EphemeralPushContext,
): { ephemeralDuration?: string; effectFlags?: string } {
  const duration = context.ephemeralDuration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return {};

  return {
    // Chaînes : APNs et FCM ne transportent que du texte dans `data`, et la NSE
    // lit déjà `createdAt` / `attachmentFileSize` sous cette forme.
    ephemeralDuration: String(Math.floor(duration)),
    effectFlags: String(context.effectFlags ?? 0),
  };
}
