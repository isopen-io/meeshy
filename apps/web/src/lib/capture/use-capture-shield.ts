import { useEffect, useMemo, useState } from 'react';

import { contentExitLaw } from '@meeshy/shared/utils/content-exit-law';

import type { Message } from '@/lib/api/types';
import { isMineOf } from '@/lib/view/message';

import { surfaceCapture, type CaptureHost } from './capture-policy';
import { captureShield, type CaptureShield, type CaptureShieldState } from './capture-shield';

export type { CaptureShieldState } from './capture-shield';

/**
 * L'AFFICHAGE D'UNE VUE UNIQUE, SOUS BOUCLIER (#9574).
 *
 * - `open` : le contenu peut se peindre — `FLAG_SECURE` est posé (coque), ou
 *   l'hôte est un navigateur ;
 * - `pending` : la coque n'a pas encore confirmé `FLAG_SECURE` — rien ne se
 *   peint avant, pas même une image ;
 * - `closed` : coque sans pont, ou pont qui a refusé (le bouclier réessaie,
 *   et le contenu se peint dès qu'il a confirmé) — rien ne se peint.
 *
 * `active` : la vue unique est AFFICHÉE (texte ouvert, plein écran, visionneuse).
 * Une puce scellée n'affiche rien et ne tient pas le bouclier.
 */
export const VIEW_ONCE_AWAY_ATTRIBUTE = 'data-view-once-away';

/**
 * LE NAVIGATEUR NE NOIRCIT RIEN (spec § 4, limite acceptée par le porteur) :
 * le contenu d'une vue unique se masque quand le document perd le focus ou
 * devient caché — l'attribut posé sur la racine, `styles/thread-protection.css`
 * retire la peinture du texte ouvert, du plein écran et de la visionneuse.
 * L'état initial suit la seule visibilité : la vue unique vient d'être ouverte
 * par un geste dans cette fenêtre.
 */
export function maskViewOnceWhenAway(doc: Document, win: Window): () => void {
  const root = doc.documentElement;
  const set = (away: boolean) => root.toggleAttribute(VIEW_ONCE_AWAY_ATTRIBUTE, away);
  const onVisibility = () => set(doc.visibilityState === 'hidden');
  const onBlur = () => set(true);
  const onFocus = () => set(doc.visibilityState === 'hidden');
  onVisibility();
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('blur', onBlur);
    win.removeEventListener('focus', onFocus);
    root.removeAttribute(VIEW_ONCE_AWAY_ATTRIBUTE);
  };
}

export function useCaptureShield(messageId: string, active: boolean, shield: CaptureShield = captureShield): CaptureShieldState {
  const mode = shield.mode();
  const [secured, setSecured] = useState<CaptureShieldState>('pending');

  useEffect(() => {
    if (!active) return undefined;
    const lease = shield.hold(messageId);
    const read = () => setSecured(lease.state());
    read();
    const stop = lease.watch(read);
    return () => {
      stop();
      lease.release();
      setSecured('pending');
    };
  }, [messageId, active, shield]);

  useEffect(() => {
    if (!active || mode !== 'browser' || typeof document === 'undefined') return undefined;
    return maskViewOnceWhenAway(document, window);
  }, [active, mode]);

  if (!active || mode === 'browser') return 'open';
  if (mode === 'unguarded') return 'closed';
  return secured;
}

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
  conversationId,
  verdict,
  declared,
}: {
  readonly messageId: string;
  /** La conversation dont la passerelle annoncerait la capture — son budget décide (`capture-ledger.ts`). */
  readonly conversationId: string;
  readonly verdict: 'announced' | 'blocked';
  readonly declared: boolean;
}) {
  useSurfaceShield(messageId, conversationId, verdict, declared);
  return null;
}

/**
 * Noire ⇒ la surface tient le bouclier. Annoncée ⇒ elle se déclare CANDIDATE :
 * le bouclier la noircit encore si son annonce ne peut pas partir (hors
 * ligne, enregistrement, budget de la passerelle épuisé).
 */
function useSurfaceShield(messageId: string | null, conversationId: string, verdict: 'announced' | 'blocked', declared: boolean): void {
  const host = useCaptureHost();
  const capture = messageId === null || host.kind !== 'shell' ? 'free' : surfaceCapture({ verdict, host, declared });
  useEffect(() => {
    if (messageId === null || capture === 'free') return undefined;
    return capture === 'blocked' ? captureShield.hold(messageId, 'row').release : captureShield.candidate(messageId, conversationId);
  }, [capture, messageId, conversationId]);
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
  useSurfaceShield(sensitive?.id ?? null, sensitive?.conversationId ?? '', 'blocked', false);
  return null;
}
