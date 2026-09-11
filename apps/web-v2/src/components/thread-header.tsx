import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Avatar } from './avatar';
import { ChromeActionDisc, CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { Glyph } from './glyph';
import { ReadingModeChip } from './reading-mode-chip';
import { UnreadCornerBadge } from './unread-badge';
import type { Conversation } from '@/lib/api/types';
import type { MenuRow } from '@/lib/reading-mode/catalog';
import { apiConfig } from '@/lib/api/config';
import { initialsOf, peerOf, presenceOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * L'EN-TÊTE DU FIL — extrait de `routes/thread.tsx` (revue #5814, défaut
 * majeur 2) : au-delà de 1000 lignes le budget du dépôt (CLAUDE.md § Code
 * Style) demande un découpage « sans se discuter », et le lot #5814
 * (menu du message) a fait franchir ce seuil (964 → 1092) sans le faire —
 * l'étape 0 de sa propre spécification prévoyait pourtant cette extraction.
 * AUCUNE règle nouvelle ici : chaque prop est la valeur déjà calculée par
 * l'écran (retour + non-lus ailleurs, puce de mode de lecture, appel,
 * recherche, avatar, bandeau hors ligne) — cette coquille ne fait que
 * PORTER le JSX, motif `Sheet`/`FocusStrip` (composant SANS état propre).
 */
export function ThreadHeader({
  title,
  accent,
  conversation,
  viewerId,
  group,
  otherUnread,
  expanded,
  onToggleExpanded,
  currentRowTitle,
  isAuto,
  readingMenuRows,
  onSelectReadingMode,
  onResetReadingModeToAuto,
}: {
  readonly title: string;
  readonly accent: string;
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly group: boolean;
  readonly otherUnread: number;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly currentRowTitle: string;
  readonly isAuto: boolean;
  readonly readingMenuRows: readonly MenuRow[];
  readonly onSelectReadingMode: (mode: ConversationReadingMode) => void;
  readonly onResetReadingModeToAuto: () => void;
}) {
  return (
    <header
      className="thread-header z-10 shrink-0 backdrop-blur-xl"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
    >
      <div className="flex items-center gap-2 px-4 py-2">
        {/*
          LE RETOUR ET SA PASTILLE (#6080) — la cible tactile vient du module
          unique (`CHROME_ACTION_HIT_CLASS`), la pastille de l'atome unique
          (`UnreadCornerBadge`, rouge sémantique, « 99+ » au-delà de 99).

          Ce qu'elle était : un `min-h-4 min-w-4` en `text-[9px]` — un littéral
          de taille écrit nulle part ailleurs (D-4), un plancher de 16 quand
          iOS pose 18, et une pose `top-0 right-0` qui la faisait TRONQUER par
          le bord haut de l'écran, mesuré à la capture 390 × 844.
        */}
        <Link
          to="list"
          className={CHROME_ACTION_HIT_CLASS}
          style={{ color: 'var(--accent)' }}
          aria-label={otherUnread > 0 ? `Retour — ${otherUnread} messages non lus ailleurs` : 'Retour'}
        >
          <Glyph name="caretLeft" size={22} />
          <UnreadCornerBadge count={otherUnread} />
        </Link>

        {expanded ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="truncate text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
              {title}
            </h1>
            <p className="flex items-center gap-1 text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
              <Glyph name="lock" size={9} style={{ color: 'var(--color-ok)' }} />
              {group ? `${conversation.memberCount} participants` : 'Chiffré de bout en bout'}
            </p>
          </div>
        ) : (
          /* GRAPPE D'ACTIONS (#5774, travail 3/3) — c'est ELLE seule qui
             s'efface en mode Bulles pendant le geste
             (`[data-chrome-header="actions"] .thread-header-actions`,
             `thread-scene.css`) ; en rangée plate, c'est l'EN-TÊTE ENTIER
             qui part (`> header`), cette classe n'y ajoute rien de plus. */
          <div className="thread-header-actions flex flex-1 items-center gap-2">
            <span className="flex-1" />
            {/* LE CHIP DE MODE — SOUS DRAPEAU UNIQUEMENT (D-20, miroir
                `ConversationView.swift:2391-2430`) : `apiConfig.readingModesEnabled`
                est un paramètre de CONSTRUCTION, figé au déploiement — quand il
                est faux, `readingDecision.mode` vaut toujours `bubbles`
                (`resolveThreadMode`), donc ce chip n'aurait jamais rien d'autre
                à proposer que le mode déjà affiché. Clic ouvre le menu
                (§1.7 : écart assumé vs iOS, voir `reading-mode-chip.tsx`).
                Dans la grappe d'action, comme prescrit par la spécification
                #5566. */}
            {apiConfig.readingModesEnabled ? (
              <ReadingModeChip
                label={currentRowTitle}
                isAuto={isAuto}
                rows={readingMenuRows}
                onSelect={onSelectReadingMode}
                onAuto={onResetReadingModeToAuto}
              />
            ) : null}
            {/* `shrink-0` (porté par `CHROME_ACTION_HIT_CLASS`) : ces deux
                cibles ne cèdent JAMAIS. Sur un écran étroit, c'est le chip qui
                tronque (voir `reading-mode-chip`). Le disque de 28 vient du
                jeton GÉNÉRÉ depuis iOS (`--size-header-circle`) — il était
                écrit ici en `size-7`, juste par accident, et en `size-8` sur
                l'écran de liste, faux du même accident. */}
            <button
              type="button"
              className={CHROME_ACTION_HIT_CLASS}
              style={{ color: 'var(--accent)' }}
              aria-label="Appeler"
            >
              <ChromeActionDisc>
                <Glyph name="phone" size={13} />
              </ChromeActionDisc>
            </button>
            <button
              type="button"
              className={CHROME_ACTION_HIT_CLASS}
              style={{ color: 'var(--accent)' }}
              aria-label="Rechercher dans la conversation"
            >
              <ChromeActionDisc>
                <Glyph name="magnifyingGlass" size={13} />
              </ChromeActionDisc>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? 'Replier l’en-tête' : 'Déplier l’en-tête'}
          className="shrink-0"
        >
          <Avatar
            initials={initialsOf(title)}
            color={accent}
            size={44}
            {...(group ? {} : { presence: presenceOf(peerOf(conversation, viewerId)) })}
          />
        </button>
      </div>
      {/*
        LE BANDEAU DE COUPURE A QUITTÉ CET EN-TÊTE (#6080) — remplacé par la
        PASTILLE de synchronisation, montée une fois pour toute l'application
        (`components/sync-pill.tsx`, `Shell`).

        Trois raisons, dans cet ordre :

        1. **Il disait MOINS.** « Vos messages ne partiront pas maintenant »
           annonce un empêchement sans dire ce qu'il retient : la pastille
           COMPTE ce qui attend (« Hors ligne — 3 en attente »), parce qu'elle
           lit l'outbox, que cet en-tête ne lisait pas.
        2. **Il ne le disait QUE DANS UN FIL.** Hors ligne sur l'écran de
           liste, l'application n'annonçait rien du tout — et c'est pourtant là
           qu'on arrive.
        3. **Il POUSSAIT la mise en page.** Un `<p>` en flux sous l'en-tête
           déplaçait tout le fil de 22 px à la coupure, puis le remontait à la
           reconnexion — une mise en page qui bouge pour annoncer un état
           transitoire, exactement ce que la case de 84 de la Lentille
           interdit ailleurs. La pastille flotte : elle ne déplace rien.

        Le raisonnement d'origine reste vrai et passe intact à la pastille :
        l'application lit parfaitement hors ligne (précache), donc annoncer la
        coupure par un voile ou une modale punirait l'utilisateur pour un état
        où tout ce qu'il veut lire est déjà là.
      */}
    </header>
  );
}
