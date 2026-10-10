import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { openSendSheet } from '@/lib/send/send-sheet-store';
import { enterSharedContent, type ShareEntryDeps } from '@/lib/share-incoming/web-entry';
import { takeWebShare } from '@/lib/share-incoming/web-inbox';
import { navigate } from '@/routes/route-table';

/**
 * LA PAGE OÙ ATTERRIT UN PARTAGE VENU D'UNE AUTRE APPLICATION (#8884) —
 * `/share`, l'adresse du `share_target` de la PWA (`lib/share-incoming/share-target.ts`).
 * Le service worker a reçu le `POST`, rangé le contenu et redirigé ici ; la page
 * ouvre la feuille d'envoi sur ce contenu (`enterSharedContent`) et s'efface
 * vers l'accueil. Elle ne montre rien d'autre : l'écran, c'est la feuille.
 *
 * PUBLIQUE pour la garde de session, exprès : c'est elle qui sait mettre le
 * partage en attente derrière la connexion. Privée, la garde enverrait à
 * `/login` sans `next` — et le partage, rangé mais jamais retrouvé, serait perdu.
 */
export default function ShareIncomingScreen({ deps }: { readonly deps?: Pick<ShareEntryDeps, 'source' | 'take' | 'open' | 'navigate'> }) {
  const sessionStatus = useStore(sessionStore, (state) => state.session.status);

  useEffect(() => {
    void enterSharedContent({
      sessionStatus,
      source: apiDeps.source,
      take: takeWebShare,
      open: openSendSheet,
      navigate: (path, replace) => navigate(path, replace),
      ...deps,
    });
  }, [sessionStatus, deps]);

  return <div className="h-dvh pt-safe" aria-busy="true" />;
}
