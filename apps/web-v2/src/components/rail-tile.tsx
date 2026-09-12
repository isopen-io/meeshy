import { Avatar } from '@/components/avatar';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * **UNE TUILE DE TRAIL, ET SA COTE PILOTE TOUT LE RESTE** (#5946).
 *
 * L'app iOS rend le trail des stories sous DEUX formes — la grande en tête de
 * liste, et une compacte. Les deux passent par la MÊME cellule, et son
 * doc-comment dit exactement ce qu'il faut reproduire :
 *
 * > « the grande trail and the pinned mini-trail render an identical cell, only
 * > differing by `context` size »
 * > « `context` drives the size (`.storyTray` 88pt vs `.storyTrayCompact` 36pt);
 * > all proportional metrics derive from it »
 *
 * D'où ce composant unique. Écrire une seconde tuile « compacte » aurait donné
 * deux vérités pour une même cellule — et ce dépôt a mesuré ce que ça coûte :
 * les trois familles de résolveurs du Prisme ont divergé sur trois clients
 * faute d'un site UNIQUE.
 *
 * **Rien ici ne connaît le défilement.** Quand compacter est du ressort du
 * MONTAGE, jamais de la tuile — c'est la règle qu'iOS écrit noir sur blanc pour
 * son propre rail (« vue PURE : aucun `@State` de défilement, aucun
 * observateur »), et elle garde ce composant testable sans simuler un scroll.
 *
 * LA GÉOGRAPHIE iOS EST REPRISE POUR DE VRAI (#6103, décision #6070,
 * `decisions.md` D-36 — annule et remplace la note ci-dessous, gardée en
 * mémoire du premier arbitrage). Le grand rail (`ConversationRail`,
 * `variant="grande"`) vit DANS la vue défilante et en SORT normalement, comme
 * tout contenu du flux ; une bande compacte (`variant="pinned"`), la MÊME
 * cellule, prend la place du TITRE dans l'en-tête (`ListHeader`) une fois le
 * grand rail sorti (`useOutOfView`, `lib/view/use-out-of-view.ts`) — jamais
 * les deux peints en même temps, exactement `PinnedStoryTrailBand`
 * (`StoryTrayView.swift:656-671`). Le premier arbitrage (#5946) compactait le
 * rail SUR PLACE, hors flux, superposé à une tuile fantôme toujours GRANDE :
 * il tenait l'invariant « aucune rangée ne bouge » mais laissait une bande
 * VIDE (~130 px) entre l'en-tête et les filtres une fois défilé, un défaut
 * que la cible iOS n'a pas — voir `check-lens.mjs` § 7 pour l'arbitrage
 * complet entre les deux formes.
 */

/** La grande — celle de la tête de liste. Cote de l'avatar, en pixels. */
export const RAIL_TILE_GRANDE = 72;

/**
 * La compacte — celle qu'on voit en défilant. iOS descend de 88 à 36 pt, un
 * rapport de 0,41 ; appliqué à nos 72 px d'avatar, il donne 30.
 */
export const RAIL_TILE_COMPACT = 30;

/**
 * Sous ce seuil, la tuile ne porte plus son libellé : à 30 px un nom tronqué à
 * deux lettres ne dit rien que l'avatar ne dise déjà, et il vole la hauteur
 * qu'on cherche justement à rendre à la liste. Miroir de `showsUsername` /
 * `isCompact` côté iOS, dont le seuil est `context.size <= 44`.
 *
 * Le nom ne DISPARAÎT pas pour autant : il reste sur l'`aria-label` du lien,
 * donc un lecteur d'écran l'annonce à l'identique aux deux tailles.
 */
const SEUIL_LIBELLE = 44;

/**
 * LA CIBLE TACTILE (charte, dimension 5 — « cibles ≥ 44 pt ») — #6103.
 *
 * À `RAIL_TILE_COMPACT` (30 px d'avatar, sans libellé), la boîte du lien
 * mesure environ 32 px de haut : sous la cible. Le `<li data-rail-tile>`,
 * lui, DOIT garder sa largeur exacte (`cellule`) — c'est elle que
 * `check-lens.mjs` mesure pour prouver la compaction (#6070) — donc la
 * cible s'obtient en ÉTENDANT la zone cliquable du lien AU-DELÀ de sa boîte
 * visuelle, jamais en élargissant la case qui le contient. `minWidth`/
 * `minHeight` pose le plancher ; une marge NÉGATIVE, toujours écrite avec
 * son signe même quand elle vaut zéro (`-0px` à `RAIL_TILE_GRANDE`, où la
 * cellule dépasse déjà 44 px), ramène le lien à sa place sans repousser ses
 * voisins — la même technique que la charte applique déjà aux boutons ronds
 * de 32 px du dépôt.
 */
const MIN_TOUCH_TARGET = 44;

/**
 * LES DEUX COTES QUI DÉRIVENT DE LA CELLULE, exportées parce qu'une SECONDE
 * boîte doit les tenir à l'identique : la tuile FANTÔME qui réserve la
 * hauteur du rail pendant la résolution (`RailPlaceholderTile`,
 * `components/conversation-rail.tsx`). Elle n'a de valeur que si elle mesure
 * exactement ce que la vraie mesurera — recopier `88` et `2.5` en ferait une
 * jumelle qui dérive au premier changement de cote (revue #6103).
 */
export const railCellWidth = (size: number): number => Math.round(size * 1.222);
export const railRingWidth = (size: number): number => Math.max(1, Math.round(size * 0.035 * 10) / 10);

export type RailTileProps = {
  readonly conversationId: string;
  readonly title: string;
  /** Couleur d'accent de la conversation — déterministe, jamais choisie ici. */
  readonly accent: string;
  /** Non-lus SERVIS (déjà passés par les surcharges optimistes de l'hôte). */
  readonly unread: number;
  /** LA cote : tout le reste en dérive. */
  readonly size: number;
};

/**
 * **AUCUNE TRANSITION sur le changement de cote, et c'est délibéré.** La charte
 * v3 (règle 32) n'autorise à animer que `opacity` et `scale`, jamais la
 * géométrie — et la raison vaut ici plus qu'ailleurs : animer la `width` de six
 * tuiles PENDANT un défilement force un reflow par image, ce qui est la cause
 * classique de saccade.
 *
 * Depuis #6103, aucune tuile ne CHANGE d'ailleurs de cote : le grand rail
 * garde la sienne pour toujours et une bande DISTINCTE, montée ailleurs
 * (`ListHeader`), rend la cote compacte. Ce qui bascule est donc un
 * MONTAGE — franc, hors du geste continu — jamais une interpolation, et
 * l'hystérésis qui l'empêche de clignoter vit chez celui qui l'observe
 * (`PINNED_RAIL_REVEAL_RATIO` / `PINNED_RAIL_RELEASE_RATIO`,
 * `lib/lens/pinned-rail.ts`), jamais ici.
 */
export function RailTile({ conversationId, title, accent, unread, size }: RailTileProps) {
  const porteLibelle = size >= SEUIL_LIBELLE;
  /* Toutes les cotes DÉRIVENT de `size`. Une épaisseur figée borderait
     discrètement un avatar de 72 px et mangerait la moitié d'un de 30. */
  const anneau = railRingWidth(size);
  const cellule = railCellWidth(size);
  /* Négative dès que la cellule est plus étroite que la cible ; `0` sinon —
     mais TOUJOURS émise avec son signe (voir le doc-comment de
     `MIN_TOUCH_TARGET`) pour que les deux tailles rendent le même GABARIT de
     valeur, condition du témoin « même balisage » ci-dessous. */
  const hitPad = Math.max(0, (MIN_TOUCH_TARGET - cellule) / 2);

  return (
    <li
      data-rail-tile={size}
      className="flex shrink-0 flex-col items-center gap-1.5"
      style={{ width: `${cellule}px` }}
    >
      <Link
        to="thread"
        params={{ conversation: conversationId }}
        aria-label={title}
        data-conversation={conversationId}
        className="flex flex-col items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          outlineColor: 'var(--color-ios-brand)',
          minWidth: `${MIN_TOUCH_TARGET}px`,
          minHeight: `${MIN_TOUCH_TARGET}px`,
          marginLeft: `-${hitPad}px`,
          marginRight: `-${hitPad}px`,
          marginTop: `-${hitPad}px`,
          marginBottom: `-${hitPad}px`,
          justifyContent: 'center',
        }}
      >
        <span
          data-anneau
          className="grid place-items-center rounded-chip"
          style={{
            padding: `${anneau}px`,
            background:
              unread > 0
                ? 'var(--color-ios-brand)'
                : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
          }}
        >
          <Avatar initials={initialsOf(title)} color={accent} size={size} />
        </span>
        {porteLibelle ? (
          <span
            data-libelle
            className="w-full truncate text-center text-check"
            style={{ color: 'var(--color-ios-ink-2)' }}
          >
            {title}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
