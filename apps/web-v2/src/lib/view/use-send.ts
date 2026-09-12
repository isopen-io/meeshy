import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand/react';

import { isPermanentFailure } from '@/lib/api/outcome';
import { retrySendAction, sendAction } from '@/lib/api/query';
import type { Message, Participant } from '@/lib/api/types';
import { useOnline } from '@/lib/net/online';
import type { PendingAttachment } from '@/lib/send/attachments';
import { confirmedCountOf, entriesOf, outboxStore } from '@/lib/send/outbox-store';
import { sendFailureReason } from '@/lib/send/failure-reason';

import type { LocalDelivery } from './message';

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
  ) => void;
  readonly retry: (messageId: string) => void;
} {
  const { conversationId, viewerId, sender, announce } = params;
  const online = useOnline();
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
      sendFailureReason(entries.find((entry) => entry.message.id === messageId)?.lastError),
    [entries],
  );

  const permanentOf = useCallback(
    (messageId: string): boolean =>
      isPermanentFailure(entries.find((entry) => entry.message.id === messageId)?.lastError),
    [entries],
  );

  const send = useCallback(
    (text: string, attachments: readonly PendingAttachment[], replyTo: Message | null, language: string) => {
      void sendAction({
        conversationId,
        draft: {
          content: text,
          originalLanguage: language,
          ...(replyTo === null ? {} : { replyToId: replyTo.id, replyTo }),
          ...(attachments.length === 0 ? {} : { attachments }),
        },
        viewerId,
        ...(sender === undefined ? {} : { sender }),
        online,
      });
    },
    [conversationId, viewerId, sender, online],
  );

  const retry = useCallback(
    (messageId: string) => {
      void retrySendAction({ conversationId, clientMessageId: messageId, online });
    },
    [conversationId, online],
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
      const reason = sendFailureReason(
        [...entries].reverse().find((entry) => entry.delivery === 'failed')?.lastError,
      );
      announce(reason === undefined ? 'Message non envoyé' : `Message non envoyé — ${reason}`);
    }
    else if (confirmedCount > previousConfirmedCount.current) announce('Message envoyé');
    previousFailedCount.current = failedCount;
    previousConfirmedCount.current = confirmedCount;
  }, [failedCount, confirmedCount, entries, announce]);

  return { pending, deliveryOf, startedAtOf, reasonOf, permanentOf, send, retry };
}
