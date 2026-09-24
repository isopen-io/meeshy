import { Glyph } from './glyph';
import { TypingDots } from './typing-dots';
import type { ListPaginationState } from '@/lib/lens/pagination';
import { lastMessageLine, scrollToBottomLabel, unreadHeadline } from '@/lib/view/thread-chrome';

/**
 * LA PILULE DE JOUR COLLANTE — miroir `MessageDayStickyOverlay.swift` /
 * `MessageDaySeparator.swift` : hors flux, ancrée sous l'en-tête
 * (`--day-pill-top`, `reading-mode/metrics.ts::chromeStyleVars`), RESTE
 * pendant le geste (`MessageListViewController.swift:597-605`, « le
 * sticker de date RESTE »), masquée seulement quand l'en-tête est DÉPLIÉ.
 * S'EFFACE AU REPOS (#6101) : posée sous la bande, elle recouvrait le nom
 * d'auteur de la première rangée lisible d'un fil immobile — sa visibilité
 * suit le défilement utilisateur (`lib/view/day-pill-reveal.ts`,
 * `thread-scene.css`), son montage reste décidé ici.
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
        className="glass glass-card rounded-chip px-3 py-1.5 text-time font-semibold"
        style={{
          color: 'var(--color-day-ink)',
          border: '0.5px solid var(--color-day-hairline)',
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
      /* `bottom` VARIABLE, jamais `bottom-2` (#6213) — le défileur couvrant
         désormais l'écran entier, ce bouton est un frère du composeur et non
         plus un enfant d'une enveloppe qui s'arrêtait au-dessus de lui : posé
         à 8 px du bord physique, il se retrouvait DERRIÈRE la barre de
         composition. `--thread-scroll-button-bottom` l'ancre au bord bas
         MESURÉ, miroir `.padding(.bottom, composerScrollButtonAnchor +
         MeeshySpacing.sm)` (`ConversationView.swift:1957`). */
      className="thread-scroll-to-bottom glass glass-accent absolute end-4 z-20 grid min-h-11 min-w-11 place-items-center rounded-chip"
      style={{
        bottom: 'var(--thread-scroll-button-bottom)',
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

/**
 * LE RETOUR VISIBLE DE LA PAGINATION VERS LE PASSÉ (#6972, extrait de
 * `routes/thread.tsx` au lot #7429, découpage sans changer un pixel) —
 * FLOTTANT, frère absolu de `<main>`, exactement comme la pilule de jour et
 * le bouton « revenir en bas » ci-dessus : posé DANS le défileur il
 * grandirait le contenu par le HAUT, poussant tout le fil de quarante pixels
 * à l'instant où la page part et le ramenant quand elle arrive — deux sauts
 * pour une page qui s'est chargée correctement (voir le doc-comment
 * d'`OlderHead`, `routes/thread-modes.tsx`). La PRISE reste dans le flux, à
 * un pixel ; seul le DESSIN flotte.
 *
 * Sous la bande, au même repère que la pilule de jour — la pilule de jour ne
 * colle rien au sommet du fil (`stickyDayOf`, `use-thread-chrome-signals.ts`),
 * et c'est au sommet, et là seulement, que l'historique se charge : les deux
 * ne se disputent jamais la place.
 */
export function OlderLoadIndicator({
  state,
  onRetry,
}: {
  readonly state: ListPaginationState;
  readonly onRetry: () => void;
}) {
  if (state !== 'loading-more' && state !== 'error') return null;
  return (
    <div
      className="absolute inset-x-0 z-20 flex justify-center px-4"
      style={{ top: 'calc(var(--safe-top, 0px) + 60px)' }}
    >
      {state === 'loading-more' ? (
        /* `role="status"` avec un TEXTE visuellement masqué : une région
           live annonce son CONTENU qui change, jamais son nom calculé
           (revue-correction #6195, motif `LensPaginationFooter`). */
        <span
          role="status"
          className="glass-prominent glass-card rounded-chip inline-flex items-center px-3 py-1.5"
          style={{ color: 'var(--color-ios-ink-2)', border: '0.5px solid var(--color-edge)' }}
        >
          <TypingDots color="currentColor" />
          <span className="sr-only">Chargement des messages plus anciens</span>
        </span>
      ) : (
        /* UN REFUS OFFRE SON REJEU — un échec silencieux laisserait le haut
           du fil muet et l'historique inatteignable sans que rien ne le dise
           (loi 4 : un contrôle existe s'il a un effet). Cible de 44 px,
           comme le « Réessayer » de la Lentille. */
        <button
          type="button"
          onClick={onRetry}
          className="glass-prominent glass-card rounded-chip inline-flex items-center gap-2 px-3 text-mini font-semibold"
          style={{ color: 'var(--color-ios-ink)', border: '0.5px solid var(--color-edge)', minHeight: 44 }}
        >
          Historique indisponible <span aria-hidden>·</span> Réessayer
        </button>
      )}
    </div>
  );
}

/**
 * LA PILULE VISIBLE (revue #5814, défaut majeur 10 ; extrait de
 * `routes/thread.tsx` au lot #7429, découpage sans changer un pixel) — le
 * refus d'une réaction (plafond de 5), « Message copié », « Message protégé »
 * n'avaient AUCUN retour à l'œil : leur seul canal était la région
 * `role="status"` de l'écran hôte, `className="offscreen"` — visuellement
 * masquée. `aria-hidden` ICI : le MÊME texte est déjà lu par cette
 * région-là, l'annoncer deux fois doublerait la lecture au lecteur d'écran.
 *
 * FLOTTANTE, et ancrée au bord bas MESURÉ (#6213) — jamais dans le flux : en
 * frère de flux elle poussait tout l'écran d'une trentaine de pixels à
 * chaque annonce, et le fil sautait sous les yeux du lecteur pour dire
 * « Message copié ».
 */
export function NoticePill({ text }: { readonly text: string }) {
  if (text === '') return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4"
      style={{ bottom: 'var(--thread-notice-bottom)' }}
      aria-hidden
    >
      <span
        className="glass-prominent glass-card rounded-chip px-3 py-1.5 text-mini font-semibold"
        style={{
          color: 'var(--color-ios-ink)',
          border: '0.5px solid var(--color-edge)',
        }}
      >
        {text}
      </span>
    </div>
  );
}
