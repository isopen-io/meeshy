import type { Conversation } from '@/lib/api/model';
import { served } from '@/lib/api/prism';
import { withAccent } from '@/lib/accent';
import { time } from '@/lib/grouping';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { Glyph } from './glyph';

/**
 * LA LIGNE DE LA LENTILLE — plate, et c'est tout le sujet.
 *
 * Elle remplace la peau CARTE, retirée avec elle : plus de fond, plus de
 * liséré, plus de rayon. iOS ne dessine pas des cartes dans la Lentille, il
 * dessine un FLUX ; et un flux qui se lit à la perspective ne peut pas être
 * découpé en boîtes, parce que les boîtes rendent visible ce que la
 * perspective déplace.
 *
 * LA COTE QUI GOUVERNE TOUT : la hauteur de MISE EN PAGE est 84, TOUJOURS.
 *
 * C'est le critère binaire du porteur — « le flux ne bouge jamais au
 * défilement, ou on garde les cartes ». La magnification n'agrandit donc pas la
 * ligne : elle révèle un contenu qui était DÉJÀ là, transparent. Le conteneur
 * visuel mesure 100 en permanence, débordant de 8 au-dessus et de 8 en dessous
 * de sa case de 84 ; au repos son supplément est à `opacity: 0`, donc invisible
 * et non cliquable.
 *
 * Ce que cela achète : AUCUNE propriété de mise en page n'est jamais animée.
 * Ni `height`, ni `margin`, ni `padding`. Seuls `transform` et `opacity`
 * bougent — les deux que le compositeur sait animer sans repasser par la mise
 * en page. Une ligne qui grandirait vraiment pousserait ses voisines, et la
 * liste entière se recalculerait à chaque image de défilement.
 *
 * L'alternative — animer la hauteur et laisser le flux s'ouvrir — a un nom :
 * c'est ce que fait une liste ordinaire, et c'est ce que les cartes rendaient
 * acceptable. Le porteur a tranché l'inverse.
 */

/** La case de mise en page. Elle ne change JAMAIS. */
export const ROW_HEIGHT = 84;

/** Le conteneur visuel, qui déborde de 8 de chaque côté. */
export const VISUAL_HEIGHT = 100;
const OVERHANG = (VISUAL_HEIGHT - ROW_HEIGHT) / 2;

export type RowState = {
  /** Élue par la bande de focus : elle montre son supplément. */
  readonly magnified: boolean;
  /** De la courbe de perspective — jamais calculée ici. */
  readonly alpha: number;
  readonly scale: number;
  /**
   * La RESPIRATION : les voisines immédiates de la magnifiée s'écartent de 8,
   * par translation. C'est ce qui donne à la magnifiée la place que sa case ne
   * lui donne pas — et c'est une translation, donc toujours pas de mise en page.
   */
  readonly breathing: number;
};

const AT_REST: RowState = { magnified: false, alpha: 1, scale: 1, breathing: 0 };

export function LensRow({
  conversation,
  languages,
  status = AT_REST,
}: {
  conversation: Conversation;
  languages: readonly string[];
  status?: RowState;
}) {
  const unread = conversation.unread > 0;
  const preview = served(
    languages,
    conversation.lastMessage.originalLanguage,
    conversation.lastMessage.translations,
    conversation.lastMessage.content,
  );

  return (
    <li
      data-row={conversation.id}
      /**
       * `flexShrink: 0` n'est pas une précaution : la liste est un conteneur
       * flex, et un élément flex de hauteur fixe est COMPRIMÉ dès que la somme
       * dépasse la place. Mesuré sans lui : des cases de 31 px au lieu de 84 —
       * et comme la compression est uniforme, la perspective continuait de
       * s'appliquer, donc rien n'avait l'air cassé à l'œil. C'est le témoin de
       * mise en page qui l'a vu.
       */
      style={{ height: ROW_HEIGHT, flexShrink: 0, position: 'relative' }}
    >
      <Link
        to="thread"
        params={{ conversation: conversation.id }}
        className="lens-row absolute inset-x-0 flex items-center gap-3 px-3"
        style={withAccent(conversation.tint, {
          top: -OVERHANG,
          height: VISUAL_HEIGHT,
          /**
           * L'ORIGINE DE LA TRANSFORMATION est à 16 % de la largeur, sur
           * l'avatar — pas au centre. Une échelle centrée ferait glisser les
           * titres horizontalement au défilement ; ancrée sur l'avatar, la
           * colonne de texte reste alignée d'une ligne à l'autre.
           */
          transformOrigin: '16% 50%',
          transform: `translateY(${status.breathing}px) scale(${status.scale})`,
          opacity: status.alpha,
        })}
      >
        <Avatar
          initials={conversation.initials}
          tint={conversation.tint}
          size={44}
          name={conversation.title}
          {...(conversation.isGrouped ? {} : { presence: conversation.presence })}
        />

        <span className="flex min-w-0 flex-1 flex-col justify-center">
          {/*
            LE SUPPLÉMENT, premier volet : la catégorie et les étiquettes. Il est
            RENDU en permanence et masqué par l'opacité — le monter et le
            démonter ferait entrer et sortir des nœuds du document, donc une
            mise en page, donc exactement ce que la case de 84 protège.
            `aria-hidden` et `pointer-events` suivent l'opacité : un contenu
            invisible ne doit être ni lu ni cliquable.
          */}
          <span
            className="lens-extra flex items-center gap-1.5 overflow-hidden"
            aria-hidden={!status.magnified}
            style={{
              height: status.magnified ? 16 : 0,
              opacity: status.magnified ? 1 : 0,
              pointerEvents: status.magnified ? undefined : 'none',
            }}
          >
            <span
              className="rounded-chip px-1.5 text-check font-semibold whitespace-nowrap"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
            >
              {conversation.isGrouped ? 'Groupe' : 'Direct'}
            </span>
            {conversation.muted ? (
              <Glyph name="x" size={11} title="En sourdine" style={{ color: 'var(--color-ios-ink-3)' }} />
            ) : null}
          </span>

          <span className="flex items-baseline gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-title ${unread ? 'font-black' : 'font-bold'}`}
              style={{ color: 'var(--color-ios-ink)' }}
            >
              {conversation.title}
            </span>
            <span
              className="shrink-0 text-check font-bold tabular-nums"
              style={{ color: unread ? 'var(--accent)' : 'var(--color-ios-ink-3)' }}
            >
              {time(conversation.lastMessage.at)}
            </span>
          </span>

          {/*
            L'APERÇU. Au repos une ligne, magnifié deux — et c'est `line-clamp`
            qui change, pas la hauteur du conteneur : la deuxième ligne occupe
            une place déjà réservée par le conteneur visuel de 100.
          */}
          <span
            className={`text-body ${status.magnified ? 'line-clamp-2' : 'truncate'}`}
            style={{ color: 'var(--color-ios-ink-2)' }}
          >
            {conversation.isGrouped ? `${conversation.lastMessage.author} : ` : ''}
            {/* `lang` porte la langue SERVIE par le Prisme, pas celle du
                document : un lecteur d'écran doit prononcer un aperçu traduit
                avec la voix de sa langue, jamais avec celle de l'expéditeur. */}
            <span lang={preview.language}>{preview.text}</span>
          </span>

          {/* Le supplément, second volet : la date pleine et le compte de membres. */}
          <span
            className="lens-extra flex items-center gap-2 overflow-hidden text-check"
            aria-hidden={!status.magnified}
            style={{
              height: status.magnified ? 14 : 0,
              opacity: status.magnified ? 1 : 0,
              pointerEvents: status.magnified ? undefined : 'none',
              color: 'var(--color-ios-ink-3)',
            }}
          >
            <span>{conversation.lastMessage.at.slice(0, 10)}</span>
            {conversation.isGrouped ? <span>· {conversation.participants} members</span> : null}
          </span>
        </span>

        {unread ? (
          <span
            className="grid min-w-[20px] shrink-0 place-items-center rounded-chip px-1.5 text-check font-bold text-white"
            style={{ backgroundColor: 'var(--accent)', height: 20 }}
          >
            {conversation.unread}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
