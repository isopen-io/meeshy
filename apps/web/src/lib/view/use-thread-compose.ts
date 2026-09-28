import { useCallback, useMemo, useState } from 'react';

import type { Message } from '@/lib/api/types';
import type { PendingAttachment } from '@/lib/send/attachments';
import { withAttachmentReply } from '@/lib/send/attachment-reply';
import type { ComposeProtection } from '@/lib/send/compose-protection';
import type { ComposerDraft, DraftStore } from '@/lib/send/draft-store';
import type { StickyProtection } from '@/lib/send/protection-preference';
import type { SharedPlace } from '@/lib/send/shared-place';
import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import { imposedReplyProtection, type ImposedReplyProtection } from '@meeshy/shared/utils/reply-protection-contagion';

import { usePublishMentionSource } from './mention-source';
import { useThreadDraft } from './use-draft';
import type { ComposerDraftReport } from './use-draft';
import { useReplyToPreview, type ReplyToPreview } from './use-reply-preview';
import type { useSend } from './use-send';

export type ThreadComposeSendInput = {
  readonly text: string;
  readonly attachments: readonly PendingAttachment[];
  readonly language: string;
  readonly protection: ComposeProtection;
  readonly place: SharedPlace | null;
  readonly sticker?: MessageSticker | null;
};

export type ThreadComposeState = {
  readonly initialDraft: ComposerDraft | null;
  /** Les protections armées de la conversation (#8306), graine du composeur. */
  readonly stickyProtection: StickyProtection | null;
  readonly setReplyTarget: (id: string | null) => void;
  /** Répondre à une PIÈCE (#6303) — la citation nomme la pièce regardée en plein écran. */
  readonly setReplyToMedia: (messageId: string, attachmentId: string) => void;
  readonly replyTo: ReplyToPreview | undefined;
  /** Ce que le message cité impose à la réponse (#8557) — rien sans citation. */
  readonly imposedProtection: ImposedReplyProtection;
  readonly reportComposerDraft: (report: ComposerDraftReport) => void;
  readonly onSend: (input: ThreadComposeSendInput) => void;
  readonly onCancelReply: () => void;
};

/**
 * LA COMPOSITION DU FIL — BROUILLON, CITATION, ENVOI (#5695, #6175, extrait de
 * `routes/thread.tsx` au lot #7429, découpage sans changer un pixel) : ce qui
 * DIFFÉRAIT (`replyTarget`, `handleComposerSend`/`handleCancelReply`) vivait
 * en DEUX endroits séparés de l'écran pour une seule raison — les Rules of
 * Hooks interdisaient un hook après les trois retours anticipés de
 * `ThreadScreen`, et la citation avait besoin de `messages` (calculé plus
 * haut) tout en devant rester déclarée AVANT ces retours. Un seul hook, ici,
 * lève la contrainte : `useThreadCompose` est appelé UNE fois, sans condition,
 * il n'y a plus deux sites à garder synchronisés.
 *
 * `setReplyTarget` reste EXPOSÉ — `useMessageMenu` (« Répondre ») et les trois
 * sorties du Résumé Vivant (`lib/view/summary-exits.ts`) l'appellent
 * directement, hors du geste d'envoi.
 */
export function useThreadCompose(params: {
  readonly store: DraftStore;
  /** `(lecteur, conversation)` — la MÊME clé que `useThreadReadingMode`. */
  readonly scope: string;
  /** `conversation?.id`, JAMAIS un repli sur le paramètre de route
   * (revue-correction #5793) — voir le doc-comment de `useThreadDraft`. */
  readonly conversationId: string | undefined;
  /** Le domaine FUSIONNÉ (confirmé + envois optimistes, `mergeTimeline`) —
   * c'est LUI que `replyToMessage` doit retrouver, la bulle citée pouvant
   * elle-même être un envoi encore local. */
  readonly messages: readonly Message[];
  readonly readerLanguages: readonly string[];
  /** `send` de `useSend` — LA RÈGLE d'envoi (débounce, accusé, reprise) vit
   * ailleurs ; ce hook ne fait que lui remettre le message CITÉ ENTIER
   * (revue-correction #5813, défaut majeur 6), jamais son seul identifiant.
   * Type DÉRIVÉ du hook, jamais une signature recopiée. */
  readonly send: ReturnType<typeof useSend>['send'];
}): ThreadComposeState {
  const { store, scope, conversationId, messages, readerLanguages, send } = params;

  const { initial: initialDraft, initialProtection: stickyProtection, replyTarget, setReplyTarget: setDraftReplyTarget, reportComposerDraft } = useThreadDraft({
    store,
    scope,
    conversationId,
  });

  /**
   * LA CITATION DU COMPOSEUR PRÉ-ADRESSÉ (#5695, écart 8 ; revue-correction
   * #6175, défauts bloquant 1 et majeur 2) — `replyToMessage` ne dépend que
   * de `messages` (mémoïsé par l'hôte, `mergeTimeline`) et de `replyTarget`
   * (`useThreadDraft`, ci-dessus). Une cible qui a QUITTÉ le cache rend
   * `undefined` — fail-closed, jamais une citation FANTÔME (`replyTo` suit).
   */
  /* LA SOURCE DES MENTIONS (#7826) — ce hook possède déjà la conversation et
     ses messages : il les PUBLIE pour le composeur, qui ne les reçoit pas en
     props (`mention-source.ts`). */
  usePublishMentionSource({ conversationId, messages });

  /* LA PIÈCE NOMMÉE (#6303) — posée par « Répondre » de la visionneuse, retirée
     par toute autre cible (menu, Résumé Vivant, envoi, annulation) : une
     citation de message ne garde jamais la pièce d'une citation précédente.
     Elle voyage SUR le message cité (`withAttachmentReply`) : la bande, la
     bulle optimiste et le corps du POST lisent la même valeur. */
  const [replyPiece, setReplyPiece] = useState<string | null>(null);
  const setReplyTarget = useCallback(
    (id: string | null) => {
      setReplyPiece(null);
      setDraftReplyTarget(id);
    },
    [setDraftReplyTarget],
  );
  const setReplyToMedia = useCallback(
    (messageId: string, attachmentId: string) => {
      setDraftReplyTarget(messageId);
      setReplyPiece(attachmentId);
    },
    [setDraftReplyTarget],
  );

  const quotedMessage = replyTarget === null ? undefined : messages.find((m) => m.id === replyTarget);
  const replyToMessage = useMemo(
    () => (quotedMessage === undefined ? undefined : withAttachmentReply(quotedMessage, replyPiece)),
    [quotedMessage, replyPiece],
  );
  const replyTo = useReplyToPreview({ message: replyToMessage, readerLanguages });
  /* LA CONTAGION (#8557) — la loi partagée, sur le message cité ENTIER (une
     pièce nommée ne change rien : la protection est celle du message). */
  const imposedProtection = useMemo(() => imposedReplyProtection(replyToMessage), [replyToMessage]);

  const onSend = useCallback(
    ({ text, attachments, language, protection, place, sticker }: ThreadComposeSendInput) => {
      /* LE MESSAGE CITÉ ENTIER, PAS SON SEUL IDENTIFIANT (revue-correction
         #5813, défaut majeur 6) — `replyToMessage` est déjà résolu ci-dessus
         pour la bande du composeur ; le réutiliser ici évite une seconde
         recherche ET porte la citation jusqu'à la bulle optimiste.
         `language` (#5828) — décidée PAR MESSAGE par le composeur (détection
         locale → choix → rang 1 du Prisme du LECTEUR), jamais la locale du
         lecteur : c'est la langue de l'ÉCRIVAIN qui doit partir en
         `originalLanguage`. `protection` (#6175) — éphémère / flou / effets
         choisis par la rangée haute. */
      /* `place` (#7280) — le lieu que la tuile « Position » a obtenu ; il
         part dans un champ `location` DÉDIÉ du corps, que la passerelle
         valide seule (`parseSharedPlace`) avant de l'écrire dans
         `Message.metadata.location`. */
      send(text, attachments, replyToMessage ?? null, language, protection, place, sticker ?? null);
      setReplyTarget(null);
    },
    [send, replyToMessage, setReplyTarget],
  );

  const onCancelReply = useCallback(() => setReplyTarget(null), [setReplyTarget]);

  return { initialDraft, stickyProtection, setReplyTarget, setReplyToMedia, replyTo, imposedProtection, reportComposerDraft, onSend, onCancelReply };
}
