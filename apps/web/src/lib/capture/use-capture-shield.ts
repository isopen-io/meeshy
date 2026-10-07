import { useEffect, useState } from 'react';

import { captureShield, type CaptureShield } from './capture-shield';

/**
 * L'AFFICHAGE D'UNE VUE UNIQUE, SOUS BOUCLIER (#9574).
 *
 * - `open` : le contenu peut se peindre — `FLAG_SECURE` est posé (coque), ou
 *   l'hôte est un navigateur ;
 * - `pending` : la coque n'a pas encore confirmé `FLAG_SECURE` — rien ne se
 *   peint avant, pas même une image ;
 * - `closed` : coque sans pont, ou pont qui refuse — rien ne se peint.
 *
 * `active` : la vue unique est AFFICHÉE (texte ouvert, plein écran, visionneuse).
 * Une puce scellée n'affiche rien et ne tient pas le bouclier.
 */
export type CaptureShieldState = 'open' | 'pending' | 'closed';

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
    let live = true;
    void lease.ready.then((ok) => {
      if (live) setSecured(ok ? 'open' : 'closed');
    });
    return () => {
      live = false;
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
