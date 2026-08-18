/**
 * `FocalRow` — la rangée plate du fil (WF-110, WF-111, WF-112 — contrat
 * Focal §WS-4, lentille-implementation-contract §4.3 colonne Fil).
 *
 * Cotes EXCLUSIVEMENT par les tokens `--lentille-thread-*`
 * (`apps/web/styles/lentille-tokens.css`, RE-PREUVE faite — §0, la section
 * `thread` y existe) — garde R15 : aucun `29`/`22`/`13`/`15`/`1.42` littéral
 * dans ce fichier.
 *
 * DEUX DENSITÉS (§3.6 `FocalRowInput.Density`) :
 *   - `focal`  — en-tête d'identité SEULEMENT en tête de groupe
 *     (`isFirstInGroup`), rangée ENREGISTRÉE dans la perspective
 *     (`registerRow`/`setAlphaCeiling`), typographie 15→16 à l'arrêt
 *     (`isFocused`, commis par `useFocalPerspective`, jamais pendant le
 *     défilement — §4.6, écart #3).
 *   - `script` — « MÊME rangée, densité UNIFORME, ZÉRO perspective » (mission
 *     WF-110) : en-tête TOUJOURS visible, AUCUN enregistrement dans la
 *     perspective (la boucle rAF ne connaît même pas cette rangée),
 *     typographie TOUJOURS 15 (jamais de bump — la densité Script n'anime
 *     rien, elle scanne).
 *
 * Prisme : `resolveFocalMessageDisplay` (`focal-row-utils.ts`) EXCLUSIVEMENT —
 * UN SEUL appel à `resolveLastMessagePreview`, aucune seconde loi de langue
 * (mission WF-110). La langue SERVIE est LUE de ce même appel, pas recalculée.
 *
 * Optimiste (§4.4) : la rangée NE POSE PAS `opacity` elle-même (« deux
 * écrivains sur `opacity` est le bug n°1 documenté du contrat ») — elle
 * publie le plafond au PASS via `setAlphaCeiling`, dans un effet réagissant
 * à `isOptimistic` (jamais pendant le rendu).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PARITÉ DE DONNÉES — DIRECTIVE PRODUIT DU 2026-08-17
 * ═══════════════════════════════════════════════════════════════════════════
 * « Certains messages de Script et Focal ont le contenu VIDE, pourtant en mode
 * Bulles on y voit quelque chose. » La rangée ne savait rendre que DEUX
 * choses : le texte du Prisme et les pièces jointes IMAGE. Tout message dont
 * le contenu ne vit pas dans le champ texte rendait une rangée littéralement
 * vide. Trois branches manquaient, dans l'ordre où la vue Bulles les prend :
 *
 *   1. RÉSUMÉ D'APPEL — `messageSource: 'system'` + `metadata.kind` ∈
 *      {`call`, `call-live`}. `BubbleMessage` court-circuite tout son rendu
 *      pour monter `CallSystemMessage` ; le fil ne regardait pas `metadata`.
 *      Le `content` d'un résumé d'appel est vide PAR CONSTRUCTION : la rangée
 *      était donc toujours vide. → `CallSystemMessage` RÉUTILISÉ.
 *   2. PIÈCES JOINTES NON-IMAGE — vocal, audio, vidéo, PDF, document, code,
 *      fichier. → `MessageAttachments` RÉUTILISÉ (voir `FocalMediaBlock`).
 *   3. AUCUN CONTENU AFFICHABLE — un repli descriptif, jamais du vide.
 *      « Au pire un repli, jamais une rangée vide » est le critère dur.
 *
 * S'y ajoute le chrome de DONNÉES que la vue Bulles montrait et que le fil
 * taisait — mentions cliquables, liens, « voir plus », traduction affichée,
 * réactions, accusés de livraison/lecture, transfert, édition : tout part
 * dans `FocalMetaRow` et `ExpandableMessageText`, composants RÉUTILISÉS.
 *
 * HORS PÉRIMÈTRE, NOMMÉ : la BARRE D'ACTIONS (`MessageActionsBar`) et la
 * feuille d'accusés (`MessageReadStatusDetails`) ne sont PAS montées. Ce
 * n'est pas de la DONNÉE portée par le message, c'est de l'interaction, et
 * elle exige des rappels (édition, suppression, signalement, permissions)
 * que `FocalThread` ne reçoit pas aujourd'hui. C'est un lot distinct.
 */
'use client';

import { useEffect, useMemo, memo } from 'react';
import { cn } from '@/lib/utils';
import type { Message } from '@meeshy/shared/types';
import { mentionsToLinks } from '@meeshy/shared/types/mention';
import { useI18n } from '@/hooks/use-i18n';
import { getUserDisplayName } from '@/utils/user-display-name';
import { ExpandableMessageText } from '@/components/common/bubble-message/ExpandableMessageText';
import { CallSystemMessage } from '@/components/common/bubble-message/CallSystemMessage';
import { JoinNoticeMessage } from '@/components/common/bubble-message/JoinNoticeMessage';
import { parseJoinNotice } from '@meeshy/shared/utils/join-notice';
import { FocalIdentityHeader } from './FocalIdentityHeader';
import { FocalQuotedReply } from './FocalQuotedReply';
import { FocalMediaBlock } from './FocalMediaBlock';
import { FocalMetaRow } from './FocalMetaRow';
import {
  resolveFocalMessageDisplay,
  resolveFocalCallMetadata,
  splitFocalAttachments,
  isFirstInFocalGroup,
} from './focal-row-utils';
import { FOCAL_OPTIMISTIC_ALPHA_CEILING, FOCAL_CONFIRMED_ALPHA } from './focal-metrics';

export type FocalDensity = 'focal' | 'script';

/** Bump de typographie « à l'arrêt seulement » (§4.6, écart #3) — 15 → 16. */
const FOCUSED_TEXT_SIZE_PX = '16px';

export interface FocalRowProps {
  readonly message: Message;
  readonly previousMessage: Message | null;
  /** Duck-typée à dessein (`.id` seul est lu) — même patron que `LentilleRow`, pas de dépendance à un alias `User` particulier. */
  readonly currentUser: { readonly id: string };
  readonly density: FocalDensity;
  readonly preferredLanguages: readonly string[];
  readonly time: string;
  readonly youLabel: string;
  /** Optimiste (`_localStatus === 'sending'`) — voir en-tête, §4.4. */
  readonly isOptimistic?: boolean;
  /** Rang élu, COMMIS par `useFocalPerspective` — bump de typo, densité `focal` seulement. */
  readonly isFocused?: boolean;
  /** `useFocalPerspective().registerRow` — non appelé en densité `script` (« zéro perspective »). */
  readonly registerRow?: (id: string) => (el: HTMLElement | null) => void;
  readonly setAlphaCeiling?: (id: string, ceiling: number) => void;
  readonly onQuoteJump?: (messageId: string) => void;
  /**
   * Identité de la conversation — exigée par les composants de DONNÉES
   * réutilisés (réactions, accusés, rappel d'appel). Repli sur
   * `message.conversationId`, comme le fait déjà `MessageContent`.
   */
  readonly conversationId?: string;
  readonly conversationType?: React.ComponentProps<typeof CallSystemMessage>['conversationType'];
  readonly isAnonymous?: boolean;
  readonly currentAnonymousUserId?: string;
  /** Jeton porté jusqu'à `MessageAttachments` (suppression de pièce jointe), comme la vue Bulles. */
  readonly token?: string;
  readonly onImageClick?: (attachmentId: string) => void;
  /**
   * Directive produit 2026-08-17 — remonté tel quel jusqu'à
   * `FocalIdentityHeader`. Callback STABLE fourni par `FocalThread` (une
   * seule `UserProfileModal` par fil, jamais une par rangée) ; `FocalRow`
   * n'y ajoute aucune fermeture littérale, sous peine de rendre son `memo`
   * décoratif (même invariant que `LentilleRow.onSelect`).
   */
  readonly onOpenProfile?: (username: string) => void;
}

export const FocalRow = memo(function FocalRow({
  message,
  previousMessage,
  currentUser,
  density,
  preferredLanguages,
  time,
  youLabel,
  isOptimistic = false,
  isFocused = false,
  registerRow,
  setAlphaCeiling,
  onQuoteJump,
  conversationId,
  conversationType,
  isAnonymous = false,
  currentAnonymousUserId,
  token,
  onImageClick,
  onOpenProfile,
}: FocalRowProps) {
  const { t } = useI18n('conversations');
  const isMe = message.senderId === currentUser.id;
  const effectiveConversationId = conversationId ?? message.conversationId;

  // Densité Script = « densité uniforme » : l'en-tête d'identité est
  // TOUJOURS visible, jamais collapsé par groupe (mission WF-110).
  const showsIdentityHeader =
    density === 'script' || isFirstInFocalGroup(message, previousMessage);

  // UN SEUL appel au Prisme — texte ET langue servie viennent du même verdict.
  const { text, language: displayedLanguage } = useMemo(
    () => resolveFocalMessageDisplay(message, preferredLanguages),
    [message, preferredLanguages]
  );

  // Mentions → liens : MÊME loi partagée que `useMessageDisplay`
  // (`mentionsToLinks`, `packages/shared/types/mention.ts`), appliquée au
  // texte DÉJÀ résolu par le Prisme. Ce n'est pas une loi de langue, c'est une
  // décoration de handles — le Prisme reste unique.
  const textWithMentions = useMemo(
    () => (text ? mentionsToLinks(text, '/u/{username}', [...(message.validatedMentions ?? [])]) : ''),
    [text, message.validatedMentions]
  );

  const callMetadata = useMemo(() => resolveFocalCallMetadata(message), [message]);
  const joinNotice = useMemo(() => parseJoinNotice(message.metadata), [message.metadata]);
  const { images, others } = useMemo(
    () => splitFocalAttachments(message.attachments),
    [message.attachments]
  );

  const hasText = Boolean(text && text.trim());
  const hasAttachments = images.length > 0 || others.length > 0;
  // Le critère DUR de la directive : si rien de tout cela n'est vrai, la
  // rangée rendrait du vide — un repli descriptif prend le relais.
  const hasAnyContent = hasText || hasAttachments || !!message.replyTo || !!callMetadata || !!joinNotice;

  const hasReactions =
    (message.reactionSummary != null && Object.keys(message.reactionSummary).length > 0) ||
    (message.reactionCount ?? 0) > 0;

  const senderName = isMe ? youLabel : getUserDisplayName(message.sender, youLabel);

  /**
   * Le « {contenu} » du libellé d'assistance (maquette §4/§6) — TOUJOURS le
   * même verdict que l'œil reçoit, jamais une seconde résolution :
   *   - texte présent      → le texte du Prisme (celui qui est rendu) ;
   *   - résumé d'appel     → le mot que la rangée montre à sa place ;
   *   - pièces jointes     → le nombre de pièces, la seule chose que la
   *                          rangée puisse annoncer sans dupliquer la loi de
   *                          description de chaque bloc (les blocs réutilisés
   *                          portent déjà leurs propres textes alternatifs) ;
   *   - rien               → EXACTEMENT le repli descriptif affiché.
   * Aucune branche ne peut donc annoncer ce que l'écran ne montre pas.
   */
  const attachmentCount = images.length + others.length;
  const ariaContent = hasText
    ? (text as string)
    : callMetadata
      ? t('focal.row.callSummary', 'Résumé d’appel')
      : attachmentCount > 0
        ? `${t('focal.row.attachments', 'Pièces jointes')} (${attachmentCount})`
        : t('focal.row.emptyContent', 'Message sans contenu affichable');

  // §4.4 : le plafond d'alpha optimiste est publié au PASS, jamais posé ici.
  // Densité `script` n'a « zéro perspective » : rien à plafonner.
  useEffect(() => {
    if (density !== 'focal' || !setAlphaCeiling) return;
    setAlphaCeiling(
      message.id,
      isOptimistic ? FOCAL_OPTIMISTIC_ALPHA_CEILING : FOCAL_CONFIRMED_ALPHA
    );
  }, [density, setAlphaCeiling, message.id, isOptimistic]);

  const wrapperRef = density === 'focal' ? registerRow?.(message.id) : undefined;

  return (
    <div
      data-testid="focal-row"
      data-density={density}
      data-message-id={message.id}
      data-optimistic={isOptimistic}
      // MAQUETTE §4 (« VoiceOver → chaque cellule lit "{Pseudo}, {heure},
      // {contenu}" ») et §6 (« Rangée = un groupe aria ("{Nom}, {heure},
      // message") »). Le libellé est COMPOSÉ DES MÊMES VALEURS que le rendu :
      // `senderName` et `time` sont ceux que `FocalIdentityHeader` affiche,
      // `ariaContent` sort de l'UNIQUE résolution Prisme de la rangée (ou du
      // même repli descriptif que l'œil voit). Aucune seconde résolution,
      // donc aucune dérive possible entre le vu et le lu.
      role="group"
      aria-label={`${senderName}, ${time}, ${ariaContent}`}
      style={{
        padding: 'var(--lentille-thread-row-padding-vertical) var(--lentille-thread-row-padding-horizontal)',
      }}
    >
      <div ref={wrapperRef} data-testid="focal-row-perspective-wrapper">
        {/*
          Le résumé d'appel court-circuite le rendu standard — MÊME arbitrage
          que `BubbleMessage` (« bypasses the view-mode machine ») : ce message
          n'a ni texte, ni pièce jointe, ni réaction à montrer, et son
          `CallSystemMessage` porte déjà son identité et son heure.
        */}
        {joinNotice ? (
          /*
            L'avis d'arrivée court-circuite pour la MÊME raison que le résumé
            d'appel : ce n'est pas une prise de parole. Il n'a ni auteur à
            afficher, ni heure, ni affordance — et le rendre en rangée
            ordinaire ferait passer l'annonce d'une arrivée pour le premier
            message de l'arrivant.
          */
          <div data-testid="focal-join-notice">
            <JoinNoticeMessage metadata={joinNotice} />
          </div>
        ) : callMetadata ? (
          <div data-testid="focal-call-message">
            <CallSystemMessage
              metadata={callMetadata}
              currentUserId={currentUser.id}
              conversationId={effectiveConversationId}
              conversationType={conversationType}
              isAnonymous={isAnonymous}
            />
          </div>
        ) : (
          <>
            {showsIdentityHeader && (
              <FocalIdentityHeader
                sender={message.sender}
                isMe={isMe}
                time={time}
                youLabel={youLabel}
                messageId={message.id}
                conversationId={effectiveConversationId}
                openProfileLabel={t('focal.row.openProfile', 'Voir le profil') + ` — ${senderName}`}
                onOpenProfile={onOpenProfile}
              />
            )}

            <div style={{ paddingLeft: 'var(--lentille-thread-line2-indent)' }}>
              {message.replyTo && (
                <FocalQuotedReply
                  quoted={message.replyTo}
                  preferredLanguages={preferredLanguages}
                  onJumpToMessage={onQuoteJump}
                />
              )}

              {hasText && (
                <div
                  data-testid="focal-row-text"
                  className={cn('break-words')}
                  style={{
                    fontSize: density === 'focal' && isFocused ? FOCUSED_TEXT_SIZE_PX : 'var(--lentille-thread-line2-size)',
                    lineHeight: 'var(--lentille-thread-line2-line-height)',
                  }}
                >
                  {/*
                    `ExpandableMessageText` RÉUTILISÉ (bubble-message) : c'est
                    lui qui apporte au fil plat le Markdown, les liens, les
                    mentions cliquables et le « voir plus » au-delà du seuil —
                    tout ce qu'un `<p>{text}</p>` brut perdait silencieusement.
                    `isOwnMessage={false}` : le fil plat n'a pas de bulle
                    teintée, donc jamais la palette « sur fond indigo ».
                  */}
                  <ExpandableMessageText content={textWithMentions} isOwnMessage={false} />
                </div>
              )}

              {hasAttachments && (
                <FocalMediaBlock
                  attachments={message.attachments ?? []}
                  currentUserId={isAnonymous ? currentAnonymousUserId : currentUser.id}
                  token={token}
                  isOwnMessage={isMe}
                  onImageClick={onImageClick}
                />
              )}

              {!hasAnyContent && (
                <p
                  data-testid="focal-row-empty"
                  className="italic text-muted-foreground"
                  style={{ fontSize: 'var(--lentille-thread-line2-size)' }}
                >
                  {t('focal.row.emptyContent', 'Message sans contenu affichable')}
                </p>
              )}

              <FocalMetaRow
                messageId={message.id}
                conversationId={effectiveConversationId}
                currentUserId={currentUser.id}
                currentAnonymousUserId={currentAnonymousUserId}
                isAnonymous={isAnonymous}
                isOwnMessage={isMe}
                showsDeliveryIndicator={isMe && !showsIdentityHeader}
                hasReactions={hasReactions}
                isForwarded={!!message.forwardedFromId}
                isEdited={!!message.isEdited}
                originalLanguage={message.originalLanguage}
                displayedLanguage={displayedLanguage}
                // L'heure n'est répétée en méta que si l'en-tête ne la porte
                // pas déjà (rangée de suite de groupe) — précédent iOS
                // `FocalMetaRow`, monté pour `!isFirstInGroup` uniquement.
                time={showsIdentityHeader ? undefined : time}
                forwardedLabel={t('focal.row.forwarded', 'Transféré')}
                editedLabel={t('focal.row.edited', 'Modifié')}
                translatedLabel={t('focal.row.translated', 'Traduit')}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default FocalRow;
