import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import type { ContentTrackingLink } from '@meeshy/shared/types/post';

import { apiConfig } from '@/lib/api/config';
import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { conversationLinksIn, type ConversationLinkTarget } from '@/lib/links/conversation-link';
import { webOriginOf } from '@/lib/links/web-origin';
import { isAppPath } from '@/routes/app-paths';

import { ConversationLinkCard } from './conversation-link-card';

/**
 * **L'HÔTE DES CARTES DE CONVERSATION D'UN MESSAGE** (#8099) — posé sous le
 * texte par les deux peaux du fil (bulle et rangée plate) : même geste, même
 * effet (dimension 6).
 *
 * Le texte lu est l'ORIGINAL (`message.content`), jamais la traduction servie :
 * une URL ne se traduit pas, et une traduction automatique peut l'abîmer.
 *
 * Un message sans lien de conversation ne s'abonne à RIEN : la session n'est
 * lue que par l'hôte intérieur, monté seulement quand une carte existe.
 */
/** Les origines de l'environnement — aucune hors navigateur (rendu serveur
 * des témoins, prérendu) : les hôtes Meeshy connus restent reconnus. */
const pageOrigins = (): readonly string[] =>
  typeof window === 'undefined' ? [] : [webOriginOf(apiConfig.base, window.location.origin), window.location.origin];

export function ConversationLinkCards({
  text,
  trackingLinks,
}: {
  readonly text: string;
  readonly trackingLinks?: readonly ContentTrackingLink[] | undefined;
}) {
  const targets = useMemo(() => conversationLinksIn(text, { origins: pageOrigins(), isAppPath, trackingLinks }), [text, trackingLinks]);
  return targets.length === 0 ? null : <CardsHost targets={targets} />;
}

function CardsHost({ targets }: { readonly targets: readonly ConversationLinkTarget[] }) {
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const accountLanguage = useStore(sessionStore, (state) =>
    state.session.status === 'authenticated' ? (state.session.user.systemLanguage ?? null) : null,
  );
  const language = currentInterfaceLanguage();
  return (
    <>
      {targets.map((target) => (
        <ConversationLinkCard
          key={`${target.kind}:${target.identifier}`}
          target={target}
          deps={apiDeps}
          language={language}
          signedIn={signedIn}
          accountLanguage={accountLanguage}
        />
      ))}
    </>
  );
}
