import { useEffect } from 'react';

import { href, navigate } from '@/routes/route-table';

/**
 * `/` DANS LA COQUE (#10002) — la coque Capacitor n'a pas de landing : son
 * démarrage, leurs liens profonds et leurs pushs qui visaient `/`
 * visaient la liste des conversations, qui vit désormais sur `/chats`. La
 * redirection REMPLACE l'entrée d'historique : le retour système ne ramène pas
 * sur une adresse vide.
 */
export default function HomeShellScreen() {
  useEffect(() => {
    navigate(href('list'), true);
  }, []);
  return null;
}
