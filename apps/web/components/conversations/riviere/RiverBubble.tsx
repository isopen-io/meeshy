/**
 * `RiverBubble` — la bulle Rivière (R-134, miroir web de `RiverBubbleView.swift`,
 * §7ter A).
 *
 * Anatomie GELÉE de la rangée plate du Fil (`thread.*`,
 * `apps/web/styles/lentille-tokens.css`, RE-PREUVE faite — §0, la section
 * `thread` y existe) posée SUR la ligne de son auteur : contour = trait de la
 * branche (même couleur, `--lentille-river-line-width`), rayon =
 * `--lentille-river-bubble-detour-radius` (« le bord de la bulle EST un
 * segment de sa ligne », amendement R). Garde R15 : aucun `29`/`22`/`13`/`15`/
 * `1.42` littéral dans ce fichier — les cotes viennent des tokens.
 *
 * **« Le message en ENTIER »** (§7ter A1) : AUCUNE troncature sur le texte
 * principal — c'est ce qui rend la hauteur du rang MESURÉE plutôt que
 * supposée (`RiverThread` mesure ce DOM réel via `registerRef`). La citation
 * d'une réponse, elle, reste UNE ligne tronquée (`replyPreview`, A4 — même
 * règle que `FocalQuotedReply`).
 *
 * **`isFirstInGroup`** vient de la LOI (`RiverBubble.isFirstInGroup`,
 * `river-lanes.ts`) — cette peau ne recalcule RIEN, elle affiche
 * (pastille + nom AU-DESSUS seulement en tête de groupe, heure en base de
 * bulle sinon — amendement R).
 *
 * **Ne mesure pas sa propre position.** Elle expose `registerRef`, un simple
 * ref-setter — `RiverThread` (l'hôte) mesure le `getBoundingClientRect()` de
 * cet élément après montage/redimensionnement pour tracer les branches
 * (`RiverLaneOverlay`) ; cette vue ne trace rien, elle pose du texte (garde
 * R15 : aucune géométrie recalculée ici).
 */
'use client';

import type { CSSProperties } from 'react';
import { getInitials } from '@/utils/initials';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { cn } from '@/lib/utils';
import type { RiverBubbleContent } from './river-bubble-types';

export interface RiverBubbleProps {
  readonly content: RiverBubbleContent;
  /** Résolu par l'appelant (`t('focal.row.you')`) — même patron que `FocalRow`, aucune clé i18n propre à la Rivière n'est nécessaire. */
  readonly youLabel: string;
  /** Placement dans la grille rang-majeur (`gridColumn`/`gridRow`) — posé par `RiverThread`. */
  readonly style?: CSSProperties;
  readonly registerRef?: (el: HTMLDivElement | null) => void;
  readonly onSelect?: (messageId: string) => void;
}

export function RiverBubble({ content, youLabel, style, registerRef, onSelect }: RiverBubbleProps) {
  const { bubble, senderDisplayName, colorSeed, timeString, text, replyPreview } = content;
  const laneColor = colorForName(colorSeed);
  const displayName = bubble.isViewer ? youLabel : senderDisplayName;

  return (
    <div
      ref={registerRef}
      data-testid="river-bubble"
      data-message-id={bubble.messageId}
      data-rank={bubble.rank}
      data-lane-index={bubble.laneIndex}
      data-first-in-group={bubble.isFirstInGroup}
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(bubble.messageId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(bubble.messageId);
        }
      }}
      className={cn('flex flex-col bg-background')}
      style={{
        ...style,
        gap: 'var(--lentille-river-bubble-base-gap)',
        borderStyle: 'solid',
        borderColor: laneColor,
        borderWidth: 'var(--lentille-river-line-width)',
        borderRadius: 'var(--lentille-river-bubble-detour-radius)',
        padding: 'var(--lentille-river-bubble-base-gap)',
      }}
    >
      {bubble.isFirstInGroup && (
        <div className="flex items-center gap-2" data-testid="river-bubble-identity">
          <div
            className="flex flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{
              width: 'var(--lentille-thread-avatar-size)',
              height: 'var(--lentille-thread-avatar-size)',
              backgroundColor: laneColor,
            }}
          >
            {getInitials(senderDisplayName)}
          </div>

          <span
            className="truncate"
            data-testid="river-bubble-name"
            style={{
              fontSize: 'var(--lentille-thread-name-size)',
              fontWeight: 'var(--lentille-thread-name-weight)',
              color: laneColor,
            }}
          >
            {displayName}
          </span>

          <span
            className="ml-auto flex-shrink-0 text-muted-foreground"
            data-testid="river-bubble-time"
            style={{
              fontSize: 'var(--lentille-thread-time-size)',
              fontWeight: 'var(--lentille-thread-time-weight)',
            }}
          >
            {timeString}
          </span>
        </div>
      )}

      {replyPreview && (
        <p
          data-testid="river-bubble-quote"
          className="truncate text-muted-foreground"
          style={{
            borderLeft: `var(--lentille-thread-quote-border-size) solid ${laneColor}`,
            paddingLeft: '8px',
          }}
        >
          <span className="mr-1 font-medium">{replyPreview.authorDisplayName}</span>
          {replyPreview.text}
        </p>
      )}

      {/* « Le message en entier » (§7ter A1) — jamais de troncature ici. */}
      <p
        data-testid="river-bubble-text"
        className="whitespace-pre-wrap break-words"
        style={{
          fontSize: 'var(--lentille-thread-line2-size)',
          lineHeight: 'var(--lentille-thread-line2-line-height)',
        }}
      >
        {text}
      </p>

      {!bubble.isFirstInGroup && (
        <div className="flex justify-end">
          <span
            className="text-muted-foreground"
            data-testid="river-bubble-time"
            style={{
              fontSize: 'var(--lentille-thread-time-size)',
              fontWeight: 'var(--lentille-thread-time-weight)',
            }}
          >
            {timeString}
          </span>
        </div>
      )}
    </div>
  );
}

export default RiverBubble;
