import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Avatar } from './avatar';
import { ChromeActionDisc, CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { Glyph } from './glyph';
import { ReadingModeChip } from './reading-mode-chip';
import { UnreadBadge } from './unread-badge';
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
    /*
      LA BANDE FLOTTE, ELLE NE BORNE PLUS (#6213) — `absolute inset-x-0 top-0`
      au lieu d'un `shrink-0` de colonne flex. Elle était HABILLÉE en bande
      flottante (le flou et le fond à 80 % ci-dessous) mais POSÉE en frère de
      flux : rien ne passait jamais dessous, le flou n'avait rien à flouter,
      et son arête basse TRANCHAIT le contenu (capture porteur 2026-09-12).
      Miroir `floatingHeaderSection`, zIndex 100 au-dessus d'une liste qui
      court jusqu'au bord physique (`ConversationView.swift:1873, 1891`).

      `pt-safe` : la bande est le dernier bord fixe du HAUT, c'est donc elle
      qui porte l'encoche — la racine `h-dvh` ne le peut plus sans empêcher le
      contenu de transiter sous elle (voir `routes/thread.tsx`), et le
      défileur la porte de son côté en marge INTÉRIEURE (`--thread-pad-top`).
    */
    <header
      className="thread-header absolute inset-x-0 top-0 z-30 pt-safe backdrop-blur-xl"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
    >
      <div className="flex items-center gap-2 px-4 py-2">
        {/*
          LE RETOUR ET SON COMPTE — SUR LA MÊME LIGNE (#6080, retour porteur).

          **Ce site n'a pas de référence iOS** : l'app native n'affiche aucun
          compte « non lus ailleurs » sur son retour, parce qu'elle n'a pas de
          barre de navigation système à décorer. C'est une invention du web, et
          l'alignement se décide donc par la CONVENTION de la plateforme —
          celle de la barre de navigation d'iOS : « ‹ 30 », le chevron et le
          compte sur une seule ligne de base.

          **Ce qu'elle était : la mauvaise POSE de l'atome.** `UnreadCornerBadge`
          l'empilait au coin haut-droit de la cible de 44 : la pastille montait
          au ras du bord supérieur de l'en-tête pendant que le chevron restait
          centré 20 px plus bas, si bien que le couple ne s'alignait ni avec
          lui-même, ni avec la ligne médiane où vivent le chip de mode, les deux
          disques d'action et l'avatar. Une pastille de COIN annote un objet qui
          a de l'air autour de lui ; ici la cible est collée au bord d'une barre
          dense, et c'est la pose de FLUX qu'il fallait — celle qui occupe sa
          propre place, à côté du chevron, sur le même centre.

          La cible tactile GRANDIT avec le contenu (`h-11` et non `size-11`) :
          le compte fait partie du bouton, pas de sa décoration, donc il est
          cliquable comme lui.

          **Et elle ne RÉTRÉCIT jamais sous 44** (`min-w-11`). Première écriture
          sans cette borne : sans compte à afficher — le cas NOMINAL — le
          bouton retombait à 26 × 44, sous le minimum tactile d'Apple.
          `check-reading-mode.mjs` l'a mesuré à 320 px de large et refusé ; il
          avait raison, et c'est la garde qui a rattrapé ce que la capture ne
          montrait pas (une cible trop petite se VOIT très bien, elle se
          manque seulement au doigt).

          `justify-start` implicite, jamais `place-items-center` : ainsi le
          chevron reste à la MÊME abscisse selon qu'il y a un compte ou non.
          Centré dans ses 44, il aurait sauté de 11 px d'une conversation à
          l'autre — un repère de navigation qui se déplace tout seul.
        */}
        <Link
          to="list"
          className="flex h-11 min-w-11 shrink-0 items-center gap-1 rounded-chip pe-1"
          style={{ color: 'var(--accent)' }}
          aria-label={otherUnread > 0 ? `Retour — ${otherUnread} messages non lus ailleurs` : 'Retour'}
        >
          <Glyph name="caretLeft" size={22} />
          <UnreadBadge count={otherUnread} />
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
