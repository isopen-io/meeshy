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
 * OÙ NOTRE ÉCRAN DIFFÈRE D'iOS, ASSUMÉ POUR LE GESTE, JAMAIS POUR LA
 * STABILITÉ DE LA LISTE (révisé #6070) : là-bas le trail vit DANS la vue
 * défilante, sort du champ, et une bande épinglée (`PinnedStoryTrailBand`)
 * le remplace en miniature DANS L'EN-TÊTE replié. Ici le rail est `shrink-0`
 * au-dessus d'une liste qui défile dans son propre conteneur — il ne sort
 * jamais, et cette différence reste : le trail est atteignable en
 * permanence, là où iOS le perd et doit le réintroduire.
 *
 * Ce qui NE reste PAS assumé : la première version compactait « sur place »
 * en réduisant la hauteur réelle de la région du rail — exactement ce
 * qu'iOS n'accepte jamais, puisque `PinnedStoryTrailBand` occupe une bande
 * d'en-tête à hauteur FIXE. Réduire la région faisait varier la hauteur du
 * conteneur défilant lui-même à chaque bascule, provoquant un saut mesuré
 * par `check-lens.mjs` (9 rangées déplacées en MISE EN PAGE). Le montage
 * (`routes/conversations.tsx`) réserve donc la hauteur GRANDE en flux, par
 * une tuile fantôme TOUJOURS présente, et peint le rail RÉEL — celui qui
 * compacte — par-dessus, hors flux, dans la même boîte : sa hauteur peut
 * varier librement, elle ne pousse plus jamais rien.
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
 * classique de saccade. L'hystérésis du montage (48 px pour compacter, 24 pour
 * rouvrir) fait que la bascule survient UNE fois, franchement, hors du geste
 * continu — un basculement net vaut mieux qu'une interpolation qui rame.
 */
export function RailTile({ conversationId, title, accent, unread, size }: RailTileProps) {
  const porteLibelle = size >= SEUIL_LIBELLE;
  /* Toutes les cotes DÉRIVENT de `size`. Une épaisseur figée borderait
     discrètement un avatar de 72 px et mangerait la moitié d'un de 30. */
  const anneau = Math.max(1, Math.round(size * 0.035 * 10) / 10);
  const cellule = Math.round(size * 1.222);

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
        className="flex flex-col items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--color-ios-brand)' }}
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
