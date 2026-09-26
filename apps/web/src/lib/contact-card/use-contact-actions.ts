import { useCallback, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import type { PublicContactAccount } from '@meeshy/shared/types/contact-card';

import type { FriendActionOutcome } from '@/lib/api/friend-actions';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';

import { patchContactRelation } from './resolve';
import type { ContactAction } from './view';

/**
 * **SE CONNECTER, ÉCRIRE — LES GESTES EXISTANTS, RIEN DE NEUF** (#8101).
 *
 * « Se connecter » EST la demande d'amitié (`performSendRequest`,
 * `api/friend-actions.ts`) et « Écrire » EST l'ouverture du direct
 * (`createDirectConversation`, idempotente côté passerelle) : aucune route
 * jumelle. Les ports sont injectés — les défauts vivent dans
 * `contact-ports.ts`, les témoins passent les leurs.
 *
 * OPTIMISTE : « Se connecter » passe la carte en « Demande envoyée » au tap,
 * sur TOUTES les résolutions en cache (la même personne peut figurer sur
 * deux cartes), et le retour arrière restaure l'instantané si la passerelle
 * refuse. Les annonces sont celles du profil public — même geste, même mot.
 */

export type ContactActionPorts = {
  readonly sendRequest: (account: PublicContactAccount) => Promise<FriendActionOutcome>;
  readonly openDirect: (account: PublicContactAccount) => Promise<FriendActionOutcome>;
};

export function useContactActions({
  queryClient,
  language,
  ports,
}: {
  readonly queryClient: QueryClient;
  readonly language: InterfaceLanguage;
  readonly ports: ContactActionPorts;
}) {
  const { text: announcement, tone: announcementTone, announce } = useLiveAnnouncer();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    (action: ContactAction, account: PublicContactAccount) => {
      if (busy !== null) return;
      setBusy(`${action}:${account.userId}`);
      const settle = (outcome: FriendActionOutcome, failedKey: 'discover.announce.sendFailed' | 'userProfile.announce.writeFailed') => {
        setBusy(null);
        if (outcome === 'offline') return announce(translate(language, 'discover.announce.offline'), 'error');
        if (outcome === 'failed') return announce(translate(language, failedKey), 'error');
        if (action === 'connect') announce(translate(language, 'discover.announce.sent'));
      };
      if (action === 'write') {
        void ports.openDirect(account).then((outcome) => settle(outcome, 'userProfile.announce.writeFailed'));
        return;
      }
      const restore = patchContactRelation(queryClient, account.userId, 'request-sent');
      void ports.sendRequest(account).then((outcome) => {
        if (outcome !== 'done') restore();
        settle(outcome, 'discover.announce.sendFailed');
      });
    },
    [announce, busy, language, ports, queryClient],
  );

  return { busy, run, announcement, announcementTone, announce } as const;
}
