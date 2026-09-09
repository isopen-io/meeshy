import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { isPermanentFailure } from '@/lib/api/outcome';
import { retrySendAction, sendAction } from '@/lib/api/query';
import type { Message, Participant } from '@/lib/api/types';
import { useOnline } from '@/lib/net/online';
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
  readonly originalLanguage: string;
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
   */
  readonly send: (text: string, replyTo: Message | null) => void;
  readonly retry: (messageId: string) => void;
  /**
   * Annonce lecteur d'écran — « Message non envoyé » / « Message envoyé »,
   * PROJETÉE de l'outbox (§ 6.3 de la spécification #5813), jamais un état
   * parallèle. Les DEUX signaux sont distincts et le doivent : l'échec se lit
   * sur le compte d'entrées `failed`, la confirmation sur le compteur
   * MONOTONE `confirmed` (`outbox-store.ts`). Les dériver tous deux du seul
   * compte de `failed` — sa BAISSE valant « envoyé » — annonçait « Message
   * envoyé » au DÉBUT d'une reprise, avant tout appel réseau, puis « Message
   * non envoyé » quand elle échouait ; et un envoi réussi du premier coup,
   * qui ne fait jamais varier ce compte, n'annonçait RIEN.
   */
  readonly announcement: string;
} {
  const { conversationId, viewerId, sender, originalLanguage } = params;
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
    (text: string, replyTo: Message | null) => {
      void sendAction({
        conversationId,
        draft: {
          content: text,
          originalLanguage,
          ...(replyTo === null ? {} : { replyToId: replyTo.id, replyTo }),
        },
        viewerId,
        ...(sender === undefined ? {} : { sender }),
        online,
      });
    },
    [conversationId, originalLanguage, viewerId, sender, online],
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
  const [announcement, setAnnouncement] = useState('');
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
      setAnnouncement(reason === undefined ? 'Message non envoyé' : `Message non envoyé — ${reason}`);
    }
    else if (confirmedCount > previousConfirmedCount.current) setAnnouncement('Message envoyé');
    previousFailedCount.current = failedCount;
    previousConfirmedCount.current = confirmedCount;
  }, [failedCount, confirmedCount, entries]);

  return { pending, deliveryOf, startedAtOf, reasonOf, permanentOf, send, retry, announcement };
}
