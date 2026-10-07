import { useEffect, useMemo, useState } from 'react';

import { contentExitLaw } from '@meeshy/shared/utils/content-exit-law';

import type { Message } from '@/lib/api/types';
import { surfaceCapture, type CaptureHost } from './capture-policy';
import { captureShield } from './capture-shield';
import { isMineOf } from '@/lib/view/message';

/** L'hôte, relu quand la coque répond sur ce qu'elle détecte. */
function useCaptureHost(): CaptureHost {
  const [host, setHost] = useState<CaptureHost>(() => captureShield.host());
  useEffect(() => captureShield.watchHost(() => setHost(captureShield.host())), []);
  return host;
}

/**
 * UNE SURFACE QUI AFFICHE UN CONTENU QUI DISPARAÎT, SOUS LA RÈGLE « ANNONCÉ OU
 * NOIR » (#9617, #9574) — `surfaceCapture` (`capture-policy.ts`) décide ; si
 * c'est noir, la surface tient le bouclier tant qu'elle est montée (le fil est
 * virtualisé : montée ≈ à l'écran). `declared` : la collecte du fil déclare
 * cette surface à une capture (rangée du fil) — sinon (visionneuse, citation)
 * un éphémère y est noir. Hors coque, ne tient rien.
 */
export function CaptureShieldHold({
  messageId,
  verdict,
  declared,
}: {
  readonly messageId: string;
  readonly verdict: 'announced' | 'blocked';
  readonly declared: boolean;
}) {
  useSurfaceShield(messageId, verdict, declared);
  return null;
}

function useSurfaceShield(messageId: string | null, verdict: 'announced' | 'blocked', declared: boolean): void {
  const host = useCaptureHost();
  const black = messageId !== null && host.kind === 'shell' && surfaceCapture({ verdict, host, declared }) === 'blocked';
  useEffect(() => (black && messageId !== null ? captureShield.hold(messageId, 'row').release : undefined), [black, messageId]);
}

/**
 * UNE VISIONNEUSE QUI FEUILLETTE DES MESSAGES — aucune de ses pages n'est
 * déclarée par la collecte du fil : dès que l'un des messages qu'elle peut
 * montrer n'est pas libre, elle est noire tant qu'elle est ouverte. Un
 * message d'autrui est sensible si la loi ne le dit pas libre (flamme, vue
 * unique) ou si sa nature ne se lit pas ; une citation l'est dès que sa
 * nature n'est pas déclarée, même citée par moi.
 */
export function viewerPageIsSensitive(message: Message, mine: boolean, quoted: boolean): boolean {
  if (typeof message.effectFlags !== 'number') return quoted || !mine;
  return !mine && contentExitLaw(message).capture !== 'free';
}

export function CaptureShieldOver({
  messages,
  viewerId,
  quoted = false,
}: {
  readonly messages: readonly Message[];
  readonly viewerId: string;
  /** Les messages sont des CITATIONS : leur nature n'est pas déclarée tant qu'aucun champ ne la porte. */
  readonly quoted?: boolean;
}) {
  const sensitive = useMemo(
    () => messages.find((message) => viewerPageIsSensitive(message, !quoted && isMineOf(message, viewerId), quoted)),
    [messages, viewerId, quoted],
  );
  useSurfaceShield(sensitive?.id ?? null, 'blocked', false);
  return null;
}
