import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand/react';
import type { StoreApi } from 'zustand/vanilla';

import { createDirectConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { isPermanentFailure } from '@/lib/api/outcome';
import { appQueryClient } from '@/lib/api/query-client';
import { discardSendAction, retrySendAction, sendAction } from '@/lib/api/query';
import type { Conversation, Message, Participant } from '@/lib/api/types';
import { peerDeviceReach, type PeerDeviceReachState } from '@/lib/e2ee/peer-device-reach';
import { translate } from '@/lib/i18n-catalog';
import { isConversationEncryptionCatalogLoaded, translateConversationEncryption } from '@/lib/i18n-conversation-encryption-catalog';
import { isMessagePiecesCatalogLoaded, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import type { PendingAttachment } from '@/lib/send/attachments';
import { NO_PROTECTION, type ComposeProtection } from '@/lib/send/compose-protection';
import type { SharedPlace } from '@/lib/send/shared-place';
import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import { confirmedCountOf, entriesOf, outboxStore } from '@/lib/send/outbox-store';
import { sendFailureReason } from '@/lib/send/failure-reason';
import { plaintextWithheld } from '@/lib/send/served-regime';
import { E2EE_PLAINTEXT_WITHHELD } from '@/lib/end-to-end-regime-ledger';
import type { Draft } from '@/lib/send/perform-send';
import { href, navigate } from '@/routes/route-table';

import { PLAINTEXT_DIRECT_KEY } from './conversation-encryption-explanation';
import type { LocalDelivery } from './message';
import { directPeerOf } from './plaintext-direct-gesture';
import { readableRedirectNotices, redirectsToReadable, sendWithheld, type ReadableRedirectPorts, type WithheldSendOutcome } from './readable-redirect';

/**
 * LE CHEMIN D'UN ENVOI RETENU (#20075) — vers le tête-à-tête lisible quand le
 * pair est su sans appareil chiffré (`readable-redirect.ts`). Injectable pour
 * les témoins ; par défaut, la passerelle, le routeur et l'outbox réels.
 */
export type ReadableRedirect = { readonly reach: StoreApi<PeerDeviceReachState>; readonly ports: ReadableRedirectPorts };

const defaultReadableRedirect = (viewerId: string, online: boolean): ReadableRedirect => ({
  reach: peerDeviceReach,
  ports: {
    online: () => online,
    open: (peerId) => createDirectConversation(apiDeps, peerId, { plaintext: true }),
    go: (conversationId) => navigate(href('thread', { conversation: conversationId })),
    send: (conversationId, draft) => void sendAction({ conversationId, draft, viewerId, online }),
    notices: readableRedirectNotices,
  },
});

/** Le refus dit : le bout en bout, ou pourquoi la conversation lisible ne s'est pas ouverte. */
function announceWithheld(announce: (message: string) => void, outcome: Exclude<WithheldSendOutcome, 'redirected'>): void {
  const language = currentInterfaceLanguage();
  const opening = outcome !== 'withheld' && isConversationEncryptionCatalogLoaded(language) ? translateConversationEncryption(language, PLAINTEXT_DIRECT_KEY[outcome]) : undefined;
  const reason = opening ?? sendFailureReason({ ok: false, status: 0, error: '', code: E2EE_PLAINTEXT_WITHHELD }, language);
  announce(reason === undefined ? translate(language, 'announce.messageNotSent') : translate(language, 'announce.messageNotSent.reason', { reason }));
}

/**
 * LE HOOK D'ENVOI (#5813, étape 7) — SANS RÈGLE : toute règle (débounce,
 * idempotence, upsert, patch de liste) vit dans `send/perform-send.ts`,
 * témoignée hors composant (§ 4.10 de la spécification #5813). Ce hook ne
 * fait que s'abonner à l'outbox et exposer des références STABLES — les
 * props que `FocalRow`/`Bubble` (`memo`) exigent (`thread.tsx:355-361`).
 */
export function useSend(params: {
  readonly conversationId: string;
  readonly viewerId: string;
  readonly sender?: Participant;
  /**
   * LA RÉGION LIVE PARTAGÉE (revue #5814, défaut majeur 9) — `useSend` ne
   * possède plus SA propre annonce : il la POSE sur `useLiveAnnouncer`, la
   * MÊME que `useMessageMenu`, pour que la dernière source à parler soit
   * toujours celle qu'un lecteur d'écran entend (voir le doc-comment de
   * `use-live-announcer.ts`).
   */
  readonly announce: (message: string) => void;
  /** La conversation servie : son pair nomme le tête-à-tête lisible d'un envoi retenu (#20075). */
  readonly conversation?: Conversation | undefined;
  readonly readableRedirect?: ReadableRedirect;
}): {
  /** Les locaux de CETTE conversation (`entries[i].message`), mémoïsés :
   * une identité STABLE tant que l'outbox de cette conversation n'a pas
   * changé — sans quoi `[...threadData.messages, ...pending]` (`thread.tsx`)
   * recalculerait à chaque rendu, y compris ceux que la scène du fil
   * provoque à chaque image de défilement. */
  readonly pending: readonly Message[];
  readonly deliveryOf: (messageId: string) => LocalDelivery | undefined;
  readonly startedAtOf: (messageId: string) => number | undefined;
  /** LA CAUSE de l'échec, en clair — `lastError` était capturé et lu par
   * PERSONNE (cycle 122 du `CLAUDE.md` racine : « qui AFFICHE ce qu'il
   * élit ? »). `undefined` hors ligne : le bandeau de coupure le dit déjà. */
  readonly reasonOf: (messageId: string) => string | undefined;
  /**
   * UN REFUS PERMANENT (revue-correction #5813, défaut majeur 2) — `true`
   * quand aucun rejeu ne peut aboutir sans action de l'utilisateur ailleurs
   * (`isPermanentFailure`, `lib/api/outcome.ts`). Les deux peaux s'en servent
   * pour retirer le geste « Réessayer », jamais la cause : la bande continue
   * de dire pourquoi, elle cesse seulement de promettre un rejeu impossible.
   */
  readonly permanentOf: (messageId: string) => boolean;
  /**
   * `replyTo` REÇOIT LE MESSAGE CITÉ ENTIER, jamais son seul identifiant
   * (revue-correction #5813, défaut majeur 6) — c'est lui que
   * `localMessageOf` pose sur la bulle optimiste pour qu'elle affiche sa
   * citation ET son saut avant tout accusé serveur ; seul `replyTo.id` part
   * dans le corps du POST (`replyToId`, `bodyOf`, `perform-send.ts`).
   *
   * `attachments` (#5668) — la sélection du composeur (`send/attachments.ts`) ;
   * liste vide pour un envoi texte pur, comportement INCHANGÉ.
   *
   * `language` (#5828) — LA LANGUE D'ORIGINE DE CE MESSAGE, décidée PAR
   * MESSAGE par `useComposeLanguage` (détection locale → choix → rang 1 du
   * Prisme du lecteur), jamais figée par écran : `thread.tsx` posait
   * auparavant `originalLanguage: readerLocale` une fois pour tout l'écran
   * (le rang 1 du LECTEUR, jamais celui de l'ÉCRIVAIN) — c'est le défaut que
   * #5828 corrige. Argument OBLIGATOIRE : aucun défaut ici ne doit pouvoir
   * remplacer un appelant qui l'aurait oublié.
   */
  readonly send: (
    text: string,
    attachments: readonly PendingAttachment[],
    replyTo: Message | null,
    language: string,
    /** LA PROTECTION CHOISIE (#6175) — `NO_PROTECTION` par défaut : les
     * appelants historiques (qui ne connaissent pas encore la rangée haute)
     * continuent d'envoyer sans rien changer. */
    protection?: ComposeProtection,
    /** LE LIEU PARTAGÉ (#7280) — `null` (le défaut) ⇒ aucune clé `location`
     * sur le corps ; les appelants historiques ne changent rien. */
    place?: SharedPlace | null,
    /** LE STICKER DE LA BIBLIOTHÈQUE (#7938) — `null` (le défaut) ⇒ aucune
     * clé `sticker` sur le corps ; son image voyage en pièce jointe. */
    sticker?: MessageSticker | null,
  ) => void;
  readonly retry: (messageId: string) => void;
  /**
   * ABANDONNER UN ENVOI EN ÉCHEC (#12632) — la règle vit dans `discardSend`
   * (`send/discard-send.ts`) : l'entrée quitte l'outbox sans compter de
   * confirmation, la bulle quitte le fil ET la ligne de liste rend sa place au
   * message qui précède. Un envoi encore EN VOL ne s'abandonne pas. L'issue se
   * dit dans la région vivante ; après un échec AMBIGU (coupure, délai, 5xx),
   * elle ne promet pas que le message n'est pas parti.
   */
  readonly discard: (messageId: string) => void;
} {
  const { conversationId, viewerId, sender, announce, conversation, readableRedirect } = params;
  const online = useOnline();
  const peer = useMemo(() => (conversation === undefined ? undefined : directPeerOf(conversation, viewerId)), [conversation, viewerId]);
  const peerId = peer?.id;
  const peerName = peer?.name ?? '';
  const entries = useStore(outboxStore, (s) => entriesOf(s, conversationId));

  const pending = useMemo(() => entries.map((entry) => entry.message), [entries]);

  const deliveryOf = useCallback(
    (messageId: string): LocalDelivery | undefined =>
      entries.find((entry) => entry.message.id === messageId)?.delivery,
    [entries],
  );
  const startedAtOf = useCallback(
    (messageId: string): number | undefined =>
      entries.find((entry) => entry.message.id === messageId)?.startedAt,
    [entries],
  );

  const reasonOf = useCallback(
    (messageId: string): string | undefined =>
      sendFailureReason(
        entries.find((entry) => entry.message.id === messageId)?.lastError,
        currentInterfaceLanguage(),
      ),
    [entries],
  );

  const permanentOf = useCallback(
    (messageId: string): boolean =>
      isPermanentFailure(entries.find((entry) => entry.message.id === messageId)?.lastError),
    [entries],
  );

  const send = useCallback(
    (
      text: string,
      attachments: readonly PendingAttachment[],
      replyTo: Message | null,
      language: string,
      protection: ComposeProtection = NO_PROTECTION,
      place: SharedPlace | null = null,
      sticker: MessageSticker | null = null,
    ) => {
      const draft: Draft = {
        content: text,
        originalLanguage: language,
        ...(replyTo === null ? {} : { replyToId: replyTo.id, replyTo }),
        ...(attachments.length === 0 ? {} : { attachments }),
        /* Une protection VIDE ne pose pas la clé — sur la VALEUR, jamais
           sur l'identité (revue-correction) : `composer.tsx` compose son
           objet par `useMemo`, donc il n'est JAMAIS `NO_PROTECTION` et le
           test d'identité laissait toujours passer `protection: {}`. Sans
           conséquence observable (`protectionFieldsOf({})` rend les mêmes
           défauts), mais un garde qui ne garde rien ment sur le brouillon
           que `outbox-store` conserve. */
        ...(Object.keys(protection).length === 0 ? {} : { protection }),
        ...(place === null ? {} : { place }),
        ...(sticker === null ? {} : { sticker }),
      };
      /* #13171 — vue chiffrée de bout en bout : rien ne naît ici. #20075 — un
         pair su sans appareil chiffré : le message part dans le tête-à-tête
         lisible de la paire ; sinon l'annonce dit où écrire. */
      if (plaintextWithheld(conversationId, appQueryClient)) {
        const redirect = readableRedirect ?? defaultReadableRedirect(viewerId, online);
        const withheldPeer = peerId === undefined ? undefined : { id: peerId, name: peerName };
        if (!redirectsToReadable(redirect.reach.getState(), withheldPeer)) return announceWithheld(announce, 'withheld');
        void sendWithheld({ fromConversationId: conversationId, peer: withheldPeer, draft, reach: redirect.reach.getState(), ports: redirect.ports }).then(
          (outcome) => {
            if (outcome !== 'redirected') announceWithheld(announce, outcome);
          },
          () => announceWithheld(announce, 'failed'),
        );
        return;
      }
      void sendAction({
        conversationId,
        draft,
        viewerId,
        ...(sender === undefined ? {} : { sender }),
        online,
      });
    },
    [conversationId, viewerId, sender, online, announce, peerId, peerName, readableRedirect],
  );

  const retry = useCallback(
    (messageId: string) => {
      void retrySendAction({ conversationId, clientMessageId: messageId, online });
    },
    [conversationId, online],
  );

  const discard = useCallback(
    (messageId: string) => {
      const outcome = discardSendAction({ conversationId, clientMessageId: messageId });
      if (outcome === null) return;
      const language = currentInterfaceLanguage();
      if (!isMessagePiecesCatalogLoaded(language)) return;
      announce(translateMessagePieces(language, outcome.uncertain ? 'message.send.discarded.uncertain' : 'message.send.discarded'));
    },
    [conversationId, announce],
  );

  const failedCount = useMemo(
    () => entries.reduce((count, entry) => (entry.delivery === 'failed' ? count + 1 : count), 0),
    [entries],
  );
  const confirmedCount = useStore(outboxStore, (s) => confirmedCountOf(s, conversationId));
  const previousFailedCount = useRef(failedCount);
  const previousConfirmedCount = useRef(confirmedCount);
  useEffect(() => {
    /* L'ÉCHEC PRIME sur la confirmation quand les deux bougent dans la même
       image : c'est lui qui appelle un geste. */
    if (failedCount > previousFailedCount.current) {
      /* LA CAUSE VOYAGE AVEC L'ANNONCE : c'est le seul canal qui atteint un
         lecteur d'écran AU MOMENT de l'échec — un `title` ne se survole pas
         au doigt. La dernière entrée en échec est celle qu'on vient de
         poser. */
      /* LA MÊME LANGUE QUE LA BANDE QU'ELLE ANNONCE (#7337) — sa jumelle
         « Message envoyé », deux lignes plus bas, lisait déjà le catalogue ;
         celle-ci était restée EN DUR, en français. La cause aussi (#7740). */
      const language = currentInterfaceLanguage();
      const reason = sendFailureReason(
        [...entries].reverse().find((entry) => entry.delivery === 'failed')?.lastError,
        language,
      );
      announce(
        reason === undefined
          ? translate(language, 'announce.messageNotSent')
          : translate(language, 'announce.messageNotSent.reason', { reason }),
      );
    }
    else if (confirmedCount > previousConfirmedCount.current)
      announce(translate(currentInterfaceLanguage(), 'announce.messageSent'));
    previousFailedCount.current = failedCount;
    previousConfirmedCount.current = confirmedCount;
  }, [failedCount, confirmedCount, entries, announce]);

  return { pending, deliveryOf, startedAtOf, reasonOf, permanentOf, send, retry, discard };
}
