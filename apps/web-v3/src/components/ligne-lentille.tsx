import type { Conversation } from '@/lib/api/modele';
import { servi } from '@/lib/api/prisme';
import { avecAccent } from '@/lib/accent';
import { heure } from '@/lib/groupage';
import { Lien } from '@/routes/table';

import { Avatar } from './avatar';
import { Glyphe } from './glyphe';

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
export const HAUTEUR_DE_CASE = 84;

/** Le conteneur visuel, qui déborde de 8 de chaque côté. */
export const HAUTEUR_VISUELLE = 100;
const DEBORDEMENT = (HAUTEUR_VISUELLE - HAUTEUR_DE_CASE) / 2;

export type EtatDeLigne = {
  /** Élue par la bande de focus : elle montre son supplément. */
  readonly magnifiee: boolean;
  /** De la courbe de perspective — jamais calculée ici. */
  readonly alpha: number;
  readonly echelle: number;
  /**
   * La RESPIRATION : les voisines immédiates de la magnifiée s'écartent de 8,
   * par translation. C'est ce qui donne à la magnifiée la place que sa case ne
   * lui donne pas — et c'est une translation, donc toujours pas de mise en page.
   */
  readonly respiration: number;
};

const AU_REPOS: EtatDeLigne = { magnifiee: false, alpha: 1, echelle: 1, respiration: 0 };

export function LigneLentille({
  conversation,
  langues,
  etat = AU_REPOS,
}: {
  conversation: Conversation;
  langues: readonly string[];
  etat?: EtatDeLigne;
}) {
  const nonLus = conversation.nonLus > 0;
  const apercu = servi(
    langues,
    conversation.dernierMessage.langueOriginale,
    conversation.dernierMessage.traductions,
    conversation.dernierMessage.contenu,
  );

  return (
    <li
      data-ligne={conversation.id}
      /**
       * `flexShrink: 0` n'est pas une précaution : la liste est un conteneur
       * flex, et un élément flex de hauteur fixe est COMPRIMÉ dès que la somme
       * dépasse la place. Mesuré sans lui : des cases de 31 px au lieu de 84 —
       * et comme la compression est uniforme, la perspective continuait de
       * s'appliquer, donc rien n'avait l'air cassé à l'œil. C'est le témoin de
       * mise en page qui l'a vu.
       */
      style={{ height: HAUTEUR_DE_CASE, flexShrink: 0, position: 'relative' }}
    >
      <Lien
        vers="fil"
        params={{ conversation: conversation.id }}
        className="lentille-ligne absolute inset-x-0 flex items-center gap-3 px-3"
        style={avecAccent(conversation.teinte, {
          top: -DEBORDEMENT,
          height: HAUTEUR_VISUELLE,
          /**
           * L'ORIGINE DE LA TRANSFORMATION est à 16 % de la largeur, sur
           * l'avatar — pas au centre. Une échelle centrée ferait glisser les
           * titres horizontalement au défilement ; ancrée sur l'avatar, la
           * colonne de texte reste alignée d'une ligne à l'autre.
           */
          transformOrigin: '16% 50%',
          transform: `translateY(${etat.respiration}px) scale(${etat.echelle})`,
          opacity: etat.alpha,
        })}
      >
        <Avatar
          initiales={conversation.initiales}
          teinte={conversation.teinte}
          taille={44}
          nom={conversation.titre}
          {...(conversation.estGroupe ? {} : { presence: conversation.presence })}
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
            className="lentille-supplement flex items-center gap-1.5 overflow-hidden"
            aria-hidden={!etat.magnifiee}
            style={{
              height: etat.magnifiee ? 16 : 0,
              opacity: etat.magnifiee ? 1 : 0,
              pointerEvents: etat.magnifiee ? undefined : 'none',
            }}
          >
            <span
              className="rounded-pastille px-1.5 text-coche font-semibold whitespace-nowrap"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
            >
              {conversation.estGroupe ? 'Groupe' : 'Direct'}
            </span>
            {conversation.enSourdine ? (
              <Glyphe nom="x" taille={11} titre="En sourdine" style={{ color: 'var(--color-ios-encre-3)' }} />
            ) : null}
          </span>

          <span className="flex items-baseline gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-titre ${nonLus ? 'font-black' : 'font-bold'}`}
              style={{ color: 'var(--color-ios-encre)' }}
            >
              {conversation.titre}
            </span>
            <span
              className="shrink-0 text-coche font-bold tabular-nums"
              style={{ color: nonLus ? 'var(--accent)' : 'var(--color-ios-encre-3)' }}
            >
              {heure(conversation.dernierMessage.a)}
            </span>
          </span>

          {/*
            L'APERÇU. Au repos une ligne, magnifié deux — et c'est `line-clamp`
            qui change, pas la hauteur du conteneur : la deuxième ligne occupe
            une place déjà réservée par le conteneur visuel de 100.
          */}
          <span
            className={`text-corps ${etat.magnifiee ? 'line-clamp-2' : 'truncate'}`}
            style={{ color: 'var(--color-ios-encre-2)' }}
          >
            {conversation.estGroupe ? `${conversation.dernierMessage.auteur} : ` : ''}
            {/* `lang` porte la langue SERVIE par le Prisme, pas celle du
                document : un lecteur d'écran doit prononcer un aperçu traduit
                avec la voix de sa langue, jamais avec celle de l'expéditeur. */}
            <span lang={apercu.langue}>{apercu.texte}</span>
          </span>

          {/* Le supplément, second volet : la date pleine et le compte de membres. */}
          <span
            className="lentille-supplement flex items-center gap-2 overflow-hidden text-coche"
            aria-hidden={!etat.magnifiee}
            style={{
              height: etat.magnifiee ? 14 : 0,
              opacity: etat.magnifiee ? 1 : 0,
              pointerEvents: etat.magnifiee ? undefined : 'none',
              color: 'var(--color-ios-encre-3)',
            }}
          >
            <span>{conversation.dernierMessage.a.slice(0, 10)}</span>
            {conversation.estGroupe ? <span>· {conversation.participants} membres</span> : null}
          </span>
        </span>

        {nonLus ? (
          <span
            className="grid min-w-[20px] shrink-0 place-items-center rounded-pastille px-1.5 text-coche font-bold text-white"
            style={{ backgroundColor: 'var(--accent)', height: 20 }}
          >
            {conversation.nonLus}
          </span>
        ) : null}
      </Lien>
    </li>
  );
}
