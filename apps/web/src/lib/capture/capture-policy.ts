/**
 * UN CONTENU QUI DISPARAÎT EST SOIT ANNONCÉ, SOIT NOIR — JAMAIS CAPTURÉ EN
 * SILENCE (#9617, #9574 ; règle de la revue de sécurité du lot iOS jumeau).
 *
 * La fonction UNIQUE qui dit, pour une surface qui affiche un contenu, si la
 * coque doit noircir la fenêtre (`blocked` ⇒ `FLAG_SECURE`) :
 * - `blocked` (vue unique, nature illisible) : noir ;
 * - `announced` (les deux flammes) : n'échappe à `FLAG_SECURE` que si sa
 *   capture produira l'annonce — la coque détecte la capture (Android 14+)
 *   ET l'enregistrement (Android 15+), et la surface est déclarée par la
 *   collecte du fil (`declared`). Partout ailleurs, noir. Détection inconnue
 *   (la coque n'a pas encore répondu) : noir.
 *
 * Dans le navigateur, rien ne se détecte ni ne se noircit : un éphémère y
 * reste capturable EN SILENCE. C'est la limite acceptée par le porteur pour
 * le web (spec § 4) ; il n'y garde que le sceau des sorties natives, et la
 * vue unique s'y masque à la perte du focus.
 */

export type CaptureVerdict = 'free' | 'announced' | 'blocked';

export type CaptureDetection = { readonly screenshot: boolean; readonly recording: boolean };

export type CaptureHost = { readonly kind: 'browser' } | { readonly kind: 'shell'; readonly detection: CaptureDetection | null };

export function surfaceCapture(params: {
  readonly verdict: CaptureVerdict;
  readonly host: CaptureHost;
  readonly declared: boolean;
}): CaptureVerdict {
  const { verdict, host, declared } = params;
  if (verdict !== 'announced' || host.kind === 'browser') return verdict;
  const detection = host.detection;
  return detection !== null && detection.screenshot && detection.recording && declared ? 'announced' : 'blocked';
}

/** Lit `MeeshyScreenGuard.getState` ; une forme illisible ⇒ `null` (fermé). */
export function detectionOf(state: unknown): CaptureDetection | null {
  if (state === null || typeof state !== 'object') return null;
  const { screenshotDetection, recordingDetection } = state as { readonly screenshotDetection?: unknown; readonly recordingDetection?: unknown };
  if (typeof screenshotDetection !== 'boolean' || typeof recordingDetection !== 'boolean') return null;
  return { screenshot: screenshotDetection, recording: recordingDetection };
}
