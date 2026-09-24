import { useState, type ReactNode } from 'react';

import { Glyph } from './glyph';
import { SECTION_BRAND_INK, SECTION_CARD_STYLE } from './grouped-section';

/**
 * **LA SECTION REPLIABLE** (#6862, lot C) — la jumelle de `GroupedSection`
 * dont le titre est un GESTE.
 *
 * Le chantier n'en avait aucune : la seule surface repliable du dépôt était un
 * `<details>` local à `chat-join.tsx`, qui porte sa propre grammaire (marqueur
 * natif, typographie du navigateur, aucun accord avec la carte de section) et
 * ne se pilote pas depuis l'extérieur. Ce composant reprend l'anatomie de
 * `GroupedSection` — même encre de titre, même carte — et n'ajoute qu'une
 * chose : le titre devient un bouton qui ouvre et ferme.
 *
 * ## CE QUI EST REPLIÉ EST DÉMONTÉ, pas seulement caché
 *
 * `hidden` seul laisserait les enfants montés : leurs requêtes continueraient
 * de se rafraîchir, leurs images de se charger, leurs minuteurs de tourner —
 * pour un contenu que personne ne regarde. Les enfants ne sont donc rendus que
 * pliés ouverts. Rouvrir ne coûte pas un aller-retour : le cache TanStack tient
 * la réponse pendant son `gcTime`, et l'écran se repeint depuis lui.
 *
 * Le PANNEAU, lui, reste dans le DOM (`hidden` quand replié) : `aria-controls`
 * doit désigner un élément qui existe, sans quoi l'attribut ne relie rien et
 * le lecteur d'écran annonce un bouton qui ne contrôle rien.
 *
 * ## DÉPLIÉ PAR DÉFAUT, et c'est un choix de produit
 *
 * Ces sections SONT le contenu de la fiche : on ouvre la fiche d'un membre
 * pour voir ce qu'il a publié et où il parle. Les replier par défaut ferait
 * payer un geste au chemin NOMINAL (dimension 7 : « chemin nominal ≤ 2
 * gestes ») pour cacher précisément ce qu'on vient chercher. Le repli sert à
 * RANGER ce qu'on a fini de lire, pas à masquer ce qu'on est venu voir.
 * `defaultOpen={false}` reste disponible pour une section accessoire.
 *
 * ## ACCESSIBILITÉ
 *
 * Un `<button>` réel, jamais un `<div onClick>` : il vient avec le focus, la
 * touche Entrée, la barre d'espace et le rôle, gratuitement et correctement.
 * `aria-expanded` porte l'état, `aria-controls` le lien vers le panneau, et la
 * cible fait 44 px de haut (dimension 5). Le chevron est DÉCORATIF
 * (`aria-hidden` par défaut chez `Glyph`) : `aria-expanded` dit déjà l'état, et
 * le nommer deux fois le ferait lire deux fois.
 *
 * Il tourne de 180° (vers le HAUT) quand la section est repliée, jamais de 90°
 * vers un côté : un chevron latéral a un sens en écriture latine et l'inverse
 * en arabe, et cette interface sert les deux (`catalog-ar`). Haut/bas n'a pas
 * de direction à retourner.
 */
export function CollapsibleSection({
  id,
  title,
  icon,
  defaultOpen = true,
  card = true,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly card?: boolean;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const titleId = `${id}-title`;
  const panelId = `${id}-panel`;

  return (
    <section aria-labelledby={titleId} className="grid gap-2" data-collapsible-section={id}>
      <h2 id={titleId} className="ps-1">
        <button
          type="button"
          data-collapsible-toggle={id}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((ouvert) => !ouvert)}
          className={`flex w-full items-center gap-1.5 text-check font-bold tracking-wide ${SECTION_BRAND_INK}`}
          style={{ minHeight: 44 }}
        >
          <Glyph
            name="caretDown"
            size={12}
            style={{ transform: open ? undefined : 'rotate(180deg)', transition: 'transform 140ms ease' }}
          />
          {icon}
          <span className="min-w-0 flex-1 truncate text-start">{title}</span>
        </button>
      </h2>
      <div id={panelId} hidden={!open}>
        {open ? (
          card ? (
            <div className="grid overflow-hidden rounded-card" style={SECTION_CARD_STYLE}>
              {children}
            </div>
          ) : (
            children
          )
        ) : null}
      </div>
    </section>
  );
}
