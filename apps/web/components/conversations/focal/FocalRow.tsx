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
 * Prisme : `resolveFocalMessageText` (`focal-row-utils.ts`) EXCLUSIVEMENT —
 * aucune seconde loi de langue (mission WF-110).
 *
 * Optimiste (§4.4) : la rangée NE POSE PAS `opacity` elle-même (« deux
 * écrivains sur `opacity` est le bug n°1 documenté du contrat ») — elle
 * publie le plafond au PASS via `setAlphaCeiling`, dans un effet réagissant
 * à `isOptimistic` (jamais pendant le rendu).
 */
'use client';

import { useEffect, useMemo, memo } from 'react';
import { cn } from '@/lib/utils';
import type { Message } from '@meeshy/shared/types';
import { FocalIdentityHeader } from './FocalIdentityHeader';
import { FocalQuotedReply } from './FocalQuotedReply';
import { FocalMediaBlock } from './FocalMediaBlock';
import { resolveFocalMessageText, isFirstInFocalGroup } from './focal-row-utils';
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
}: FocalRowProps) {
  const isMe = message.senderId === currentUser.id;

  // Densité Script = « densité uniforme » : l'en-tête d'identité est
  // TOUJOURS visible, jamais collapsé par groupe (mission WF-110).
  const showsIdentityHeader =
    density === 'script' || isFirstInFocalGroup(message, previousMessage);

  const text = useMemo(
    () => resolveFocalMessageText(message, preferredLanguages),
    [message, preferredLanguages]
  );

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
      style={{
        padding: 'var(--lentille-thread-row-padding-vertical) var(--lentille-thread-row-padding-horizontal)',
      }}
    >
      <div ref={wrapperRef} data-testid="focal-row-perspective-wrapper">
        {showsIdentityHeader && (
          <FocalIdentityHeader sender={message.sender} isMe={isMe} time={time} youLabel={youLabel} />
        )}

        <div style={{ paddingLeft: 'var(--lentille-thread-line2-indent)' }}>
          {message.replyTo && (
            <FocalQuotedReply
              quoted={message.replyTo}
              preferredLanguages={preferredLanguages}
              onJumpToMessage={onQuoteJump}
            />
          )}

          {text && (
            <p
              data-testid="focal-row-text"
              className={cn('whitespace-pre-wrap break-words')}
              style={{
                fontSize: density === 'focal' && isFocused ? FOCUSED_TEXT_SIZE_PX : 'var(--lentille-thread-line2-size)',
                lineHeight: 'var(--lentille-thread-line2-line-height)',
              }}
            >
              {text}
            </p>
          )}

          {message.attachments && message.attachments.length > 0 && (
            <FocalMediaBlock attachments={message.attachments} />
          )}
        </div>
      </div>
    </div>
  );
});

export default FocalRow;
