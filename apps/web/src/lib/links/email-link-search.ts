import { useMemo, useState } from 'react';

import { useSearch } from '@/lib/router';

import { emailLinkSecret, liftEmailLinkSecret, type EmailLinkSecret } from './email-link-secret';

/**
 * LES PARAMÈTRES D'UNE PAGE À JETON, SECRET COMPRIS (#10859) — `useSearch()`
 * augmenté du jeton (et de l'adresse) que `liftEmailLinkSecret` a retirés de la
 * barre d'adresse. Lu UNE fois au montage : une réécriture d'adresse ultérieure
 * (le routeur pose un état d'historique neuf) ne fait pas perdre le jeton à
 * l'écran déjà ouvert.
 *
 * Le relèvement est rejoué ici, et pas seulement au démarrage (`main.tsx`) :
 * une navigation INTERNE peut ouvrir la page — le lien `https://` ou
 * `meeshy://` relayé par la coque Android (`shell-deep-links.ts`) arrive par le
 * routeur, jamais par un chargement de document.
 */
export function useEmailLinkSearch(): URLSearchParams {
  const [search] = useSearch();
  const [secret] = useState<EmailLinkSecret>(() => {
    if (typeof window === 'undefined') return {};
    liftEmailLinkSecret(window);
    return emailLinkSecret(window);
  });
  return useMemo(() => {
    const merged = new URLSearchParams(search);
    Object.entries(secret).forEach(([key, value]) => merged.set(key, value));
    return merged;
  }, [search, secret]);
}
