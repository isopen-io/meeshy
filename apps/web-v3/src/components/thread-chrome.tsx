import { Glyph } from './glyph';
import { lastMessageLine, scrollToBottomLabel, unreadHeadline } from '@/lib/view/thread-chrome';

/**
 * LA PILULE DE JOUR COLLANTE — miroir `MessageDayStickyOverlay.swift` /
 * `MessageDaySeparator.swift` : hors flux, ancrée sous l'en-tête
 * (`--day-pill-top`, `reading-mode/metrics.ts::chromeStyleVars`), RESTE
 * pendant le geste (`MessageListViewController.swift:597-605`, « le
 * sticker de date RESTE »), masquée seulement quand l'en-tête est DÉPLIÉ.
 * `role="heading"` porté par le NŒUD visible — même dispositif que
 * `.accessibilityAddTraits(.isHeader)` côté iOS : c'est un repère de
 * navigation, jamais un texte décoratif à masquer du lecteur d'écran.
 */
export function DayPill({ label, headerExpanded }: { readonly label: string | null; readonly headerExpanded: boolean }) {
  if (label === null || headerExpanded) return null;
  return (
    /* `pointer-events-none` sur le CONTENEUR, pas seulement sur la capsule —
       miroir `.allowsHitTesting(false)` posé sur TOUT l'overlay
       (`MessageDayStickyOverlay.swift:69`). Mesuré pendant la revue de #5774 :
       sans lui, cette bande `inset-x-0` de 32 px de haut RÉPONDAIT à
       `elementFromPoint` sur toute la largeur et volait le tap de la bulle qui
       passe dessous — un contrôle rendu inerte par un voisin invisible, le
       défaut que `check-reading-mode.mjs` §6 nomme déjà. */
    <div className="thread-day-pill pointer-events-none absolute inset-x-0 z-10 flex justify-center">
      <span
        role="heading"
        aria-level={2}
        className="rounded-chip px-3 py-1.5 text-time font-semibold backdrop-blur-md"
        style={{
          color: 'var(--color-day-ink)',
          border: '0.5px solid var(--color-day-hairline)',
          backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 70%, transparent)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * LE BOUTON « DÉFILER VERS LE BAS » — miroir
 * `ConversationView+ScrollIndicators.swift` /
 * `ConversationScrollControlsView.swift`. `visible` gouverne le MONTAGE
 * (jamais un `opacity: 0` qui laisserait une cible fantôme sous les 44 pt
 * du composeur).
 */
export function ScrollToBottomButton({
  visible,
  unreadCount,
  senderName,
  previewText,
  onClick,
}: {
  readonly visible: boolean;
  readonly unreadCount: number;
  /** Nom de l'expéditeur du dernier non-lu — GROUPE seulement (#3921), `null`/`undefined` en DM. */
  readonly senderName?: string | null;
  readonly previewText?: string | null;
  readonly onClick: () => void;
}) {
  if (!visible) return null;
  const label = scrollToBottomLabel(unreadCount);
  const preview = lastMessageLine({ senderName, text: previewText });
  const showHeadline = unreadHeadline(unreadCount);
  const rich = unreadCount > 0 && preview !== null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="thread-scroll-to-bottom absolute end-4 bottom-2 z-10 grid min-h-11 min-w-11 place-items-center rounded-chip backdrop-blur-md"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent) 85%, transparent)',
        /* L'ENCRE LISIBLE, jamais `#fff` en dur — miroir de l'INTENTION de
           `ConversationScrollControlsView.swift:150-152` (« noir ou blanc selon
           la luminance de l'accent »), servie par `--accent-ink`
           (`lib/accent.ts::inkOnAccent`, posée par `withAccent` sur l'hôte).
           Le blanc en dur valait 1,98:1 en schéma clair sur le premier accent
           du jeu — mesuré en revue de #5774. */
        color: 'var(--accent-ink, #FFFFFF)',
      }}
    >
      {rich ? (
        <span className="flex max-w-52 flex-col items-start gap-0.5 px-3 py-1.5 text-start" aria-hidden>
          {showHeadline ? <span className="text-mini font-semibold">{unreadCount} messages non lus</span> : null}
          <span className="truncate text-mini">{preview}</span>
        </span>
      ) : (
        <Glyph name="caretDown" size={16} />
      )}
    </button>
  );
}
