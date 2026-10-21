import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ADMIN_PERMISSIONS_QUERY_KEY } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import {
  isWorldParticipantCardCatalogLoaded,
  loadWorldParticipantCardCatalog,
  translateWorldParticipantCard,
} from '@/lib/i18n-world-participant-card-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useServedGlobalRole, type AdminAccessOptions } from '@/lib/view/use-admin-access';
import { opensWorldParticipantCards } from '@/lib/view/world-participant-card-access';
import { WorldParticipantCardContext, type WorldParticipantCardOpener } from '@/lib/view/world-participant-card-context';

const LazyWorldParticipantCardSheet = lazy(() =>
  import('@/components/world-participant-card-sheet').then(async (m) => {
    await m.prepareWorldParticipantCardSheet();
    return { default: m.WorldParticipantCardSheet };
  }),
);

/**
 * **L'HÔTE DES FICHES DE WORLD WIDE** (#10102) — posé par le fil autour de ses
 * rangées. Il ne pose la porte (`WorldParticipantCardContext`) que si la
 * conversation EST World Wide et que le rôle de PLATEFORME du lecteur, lu sur
 * la matrice servie (`useServedGlobalRole`, jamais deviné), est au-delà de
 * USER. Sinon il ne pose rien : un anonyme reste muet, un compte mène à son
 * profil — le comportement d'avant, gardé par un témoin.
 *
 * Rien ne se charge pour qui n'ouvre rien : le catalogue des libellés se lit
 * quand la porte s'ouvre (pour nommer le geste au lecteur d'écran), la feuille
 * au premier toucher. Une porte qui se referme (rôle retiré, changement
 * d'identité) referme la feuille.
 */
export function WorldParticipantCardHost({
  conversationIdentifier,
  access,
  children,
}: {
  readonly conversationIdentifier: string | null | undefined;
  /** Injectable pour les témoins ; l'application passe par les défauts. */
  readonly access?: AdminAccessOptions;
  readonly children: ReactNode;
}) {
  const role = useServedGlobalRole(access);
  const allowed = opensWorldParticipantCards({ conversationIdentifier, role });
  const language = currentInterfaceLanguage();
  const [catalogReady, setCatalogReady] = useState(() => isWorldParticipantCardCatalogLoaded(language));
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed || catalogReady) return undefined;
    let live = true;
    loadWorldParticipantCardCatalog(language).then(
      () => {
        if (live) setCatalogReady(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [allowed, catalogReady, language]);

  useEffect(() => {
    if (!allowed) setOpenId(null);
  }, [allowed]);

  const opener = useMemo<WorldParticipantCardOpener | null>(
    () =>
      allowed
        ? {
            open: setOpenId,
            labelFor: (name) => (catalogReady ? translateWorldParticipantCard(language, 'worldCard.open', { name }) : name),
          }
        : null,
    [allowed, catalogReady, language],
  );
  const close = useCallback(() => setOpenId(null), []);
  const client = access?.client ?? appQueryClient;
  const refused = useCallback(() => {
    setOpenId(null);
    void client.invalidateQueries({ queryKey: ADMIN_PERMISSIONS_QUERY_KEY });
  }, [client]);

  return (
    <WorldParticipantCardContext.Provider value={opener}>
      {children}
      {allowed && openId !== null ? (
        <Suspense fallback={null}>
          <LazyWorldParticipantCardSheet
            key={openId}
            participantId={openId}
            deps={access?.deps ?? apiDeps}
            client={client}
            onClose={close}
            onRefused={refused}
          />
        </Suspense>
      ) : null}
    </WorldParticipantCardContext.Provider>
  );
}
