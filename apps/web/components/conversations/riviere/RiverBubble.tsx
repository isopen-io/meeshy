/**
 * `RiverBubble` — la bulle Rivière (R-134, miroir web de `RiverBubbleView.swift`,
 * §7ter A).
 *
 * Anatomie GELÉE de la rangée plate du Fil (`thread.*`,
 * `apps/web/styles/lentille-tokens.css`, RE-PREUVE faite — §0, la section
 * `thread` y existe) posée SUR la ligne de son auteur. Garde R15 : aucun
 * `29`/`22`/`13`/`15`/`1.42` littéral dans ce fichier — les cotes viennent
 * des tokens.
 *
 * **§7ter A.5 (amendement, 2026-08-17) — l'identité est AU-DESSUS de la
 * bulle, HORS d'elle.** `river-bubble-identity` est désormais un FRÈRE de
 * `river-bubble-box` (le rectangle bordé/rempli), pas un enfant : le nom y
 * est BORNÉ (`--lentille-river-bubble-identity-name-max-width`, ~44 %) pour
 * que la branche — qui descend à l'aplomb du CENTRE du couloir — croise
 * TOUJOURS du vide entre le nom et l'heure, jamais un mot. Aucune découpe à
 * calculer : le trait (`RiverLaneOverlay`, posé en SVG DERRIÈRE la grille)
 * passe DROIT, et c'est le fond OPAQUE de `river-bubble-box` qui l'interrompt
 * de lui-même — la rangée d'identité, sans fond, laisse le trait s'y voir.
 * L'élément mesuré par `registerRef` reste le conteneur EXTÉRIEUR (identité
 * + boîte), pour que `RiverThread`/`river-paint.ts` tracent le segment
 * depuis le HAUT de l'identité, sans aucun changement dans `river-paint.ts`.
 *
 * **§7ter A.6 — l'habillage du contour suit le VERDICT DE FORME.** En
 * couloirs (`bubble.layout === 'lanes'`), une ligne ABORDE la bulle : contour
 * complet coloré, même épaisseur que le trait (`--lentille-river-line-width`)
 * — « le bord de la bulle EST un segment de sa ligne » (amendement R). En vue
 * sérialisée, AUCUNE ligne ne l'aborde (axe horizontal retiré par la loi,
 * §7ter C) : un contour complet coloré y mimerait une branche qui n'existe
 * plus. Restent le bord GAUCHE et le bord BAS (couleur d'auteur, même
 * épaisseur que le trait), le reste neutre
 * (`--lentille-river-bubble-flat-border-width`, `hsl(var(--border))` —
 * l'équivalent établi du `var(--line)` de la maquette normative dans le
 * système de design shadcn/Tailwind de cette app).
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
  const { bubble, senderDisplayName, colorSeed, timeString, text, layout, replyPreview } = content;
  const laneColor = colorForName(colorSeed);
  const displayName = bubble.isViewer ? youLabel : senderDisplayName;
  // §7ter A.6 — l'habillage suit le VERDICT DE FORME, jamais une préférence
  // de peau (même garde que côté iOS, `RiverBubbleView.bubbleOutline`).
  const isLanesLayout = layout === 'lanes';

  return (
    <div
      ref={registerRef}
      data-testid="river-bubble"
      data-message-id={bubble.messageId}
      data-rank={bubble.rank}
      data-lane-index={bubble.laneIndex}
      data-first-in-group={bubble.isFirstInGroup}
      data-layout={layout}
      // L'interaction (clic/clavier) reste sur ce conteneur EXTÉRIEUR —
      // identité COMPRISE — pas seulement la boîte bordée : c'est tout le
      // rang qui sélectionne le message, comme avant §7ter A.5.
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(bubble.messageId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(bubble.messageId);
        }
      }}
      className="flex flex-col"
      style={{ ...style, gap: 'var(--lentille-river-bubble-base-gap)' }}
    >
      {/* §7ter A.5 — identité HORS de la boîte bordée, un frère au-dessus. */}
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
              // §7ter A.5 — borné à ~44 % : garantit que la branche, à
              // l'aplomb du centre du couloir, croise du vide ici, jamais un mot.
              maxWidth: 'var(--lentille-river-bubble-identity-name-max-width)',
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

      {/* La bulle proprement dite — purement VISUELLE (fond + contour,
          §7ter A.6) : l'interaction vit sur le conteneur extérieur. */}
      <div
        data-testid="river-bubble-box"
        className="flex flex-col bg-background"
        style={
          isLanesLayout
            ? {
                gap: 'var(--lentille-river-bubble-base-gap)',
                borderStyle: 'solid',
                borderColor: laneColor,
                borderWidth: 'var(--lentille-river-line-width)',
                borderRadius: 'var(--lentille-river-bubble-detour-radius)',
                padding: 'var(--lentille-river-bubble-base-gap)',
              }
            : {
                // Vue sérialisée : AUCUNE ligne n'aborde la bulle — contour
                // neutre partout SAUF le bord gauche et le bord bas, qui
                // restent couleur d'auteur à l'épaisseur du trait (docstring
                // de tête : `hsl(var(--border))` = l'équivalent établi du
                // `var(--line)` de la maquette normative dans cette app).
                // Quatre LONGHANDS explicites, jamais un raccourci mélangé à
                // des overrides : un raccourci CSS dont un côté diffère des
                // trois autres est fragile à sérialiser/lire de façon fiable
                // (`el.style.borderWidth` deviendrait vide côté DOM) — les
                // longhands restent la forme honnête ici.
                gap: 'var(--lentille-river-bubble-base-gap)',
                borderStyle: 'solid',
                borderTopWidth: 'var(--lentille-river-bubble-flat-border-width)',
                borderTopColor: 'hsl(var(--border))',
                borderRightWidth: 'var(--lentille-river-bubble-flat-border-width)',
                borderRightColor: 'hsl(var(--border))',
                borderLeftWidth: 'var(--lentille-river-line-width)',
                borderLeftColor: laneColor,
                borderBottomWidth: 'var(--lentille-river-line-width)',
                borderBottomColor: laneColor,
                borderRadius: 'var(--lentille-river-bubble-detour-radius)',
                padding: 'var(--lentille-river-bubble-base-gap)',
              }
        }
      >
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
    </div>
  );
}

export default RiverBubble;
