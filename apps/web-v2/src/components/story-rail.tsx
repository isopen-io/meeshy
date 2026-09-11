import { useMemo } from 'react';

import { Avatar } from '@/components/avatar';
import { ChromeActionDisc, CHROME_ACTION_HIT, CHROME_ACTION_HIT_CLASS } from '@/components/chrome-action';
import { Glyph } from '@/components/glyph';
import { useStoryTray } from '@/lib/api/query';
import { initialsOf } from '@/lib/view/conversation';
import { groupStoriesByAuthor, storyAuthorLabel, type StoryTrayGroup } from '@/lib/view/story-tray';
import { Link } from '@/routes/route-table';

/**
 * **LE RAIL DES STORIES** (#6080) — de VRAIES stories, un cercle par AUTEUR.
 *
 * Il remplace le rail d'« accès rapide » qui montrait des CONVERSATIONS sous
 * un anneau promettant une story. Le doc-comment de l'écran l'avouait :
 * « en l'absence d'une route stories, la seule destination RÉELLE de chaque
 * avatar aujourd'hui est SON FIL ». Un anneau qui promet un contenu que rien
 * n'ouvre est un contrôle qui ment — loi 4, un contrôle existe s'il a un effet.
 *
 * **AUCUN INDICATEUR DE DÉFILEMENT** — `ScrollView(.horizontal, showsIndicators:
 * false)`, la cible iOS à la lettre. Le plateau défile, barre masquée :
 * l'affordance est portée par les tuiles, qui débordent visiblement du cadre.
 *
 * **LA HAUTEUR NE VARIE JAMAIS.** Le rail précédent se compactait au
 * défilement (72 → 30 px), poussait les neuf cases du dessous et faisait
 * rougir le gate de la Lentille (#6070). La cible iOS tranche : là-bas le
 * grand plateau vit DANS la zone défilante et sort du champ, tandis qu'une
 * bande compacte le remplace DANS LE CHROME épinglé — le flux ne bouge jamais.
 */

/**
 * **LA COTE VIENT D'iOS, ELLE NE S'INVENTE PAS** — `LentilleMetrics.Rail`
 * (`apps/ios/.../Lentille/Core/LentilleMetrics.swift:267-279`) :
 * `size = 48`, `ringWidth = 3.5`, `paddingVertical = 8`, `maxEntries = 6`,
 * espacement `MeeshySpacing.sm` (8) et respiration horizontale `lg` (16).
 *
 * La première version de ce rail portait `72`, repris de `RailTile` — la
 * tuile de l'ancien rail d'accès rapide, qui n'avait rien à voir. Mesuré à la
 * capture 390 × 844 : les trois premiers visages occupaient 232 px de large et
 * 100 px de haut, soit un huitième de l'écran pour trois entrées, et la liste
 * de conversations commençait sous la ligne de flottaison. Une cote reprise
 * d'un composant voisin n'est pas une cote dérivée : c'est une cote inventée
 * qui ressemble à une autre.
 */
const RAIL = {
  tile: 48,
  ring: 3.5,
  gap: 8,
  padding: 16,
  /** `LentilleRailPolicy.visibleEntries` — au-delà, la porte « tout voir ». */
  maxEntries: 6,
} as const;

const AVATAR = RAIL.tile - RAIL.ring * 2;

function StoryTile({ group }: { readonly group: StoryTrayGroup }) {
  const label = storyAuthorLabel(group);
  const combien = group.stories.length;

  return (
    /* `data-story-tile` porte la COTE, pour que le gate de la Lentille puisse
       la mesurer : un composant sans prise mesurable ne peut être gardé par
       rien, et la cote redérive en silence (leçon 575). */
    <li
      data-story-tile={RAIL.tile}
      className="flex shrink-0 flex-col items-center gap-1"
      style={{ width: RAIL.tile }}
    >
      <Link
        to="stories"
        search={{ author: group.authorId }}
        aria-label={
          combien > 1
            ? `${label}, ${combien} stories${group.hasUnseen ? ', non vues' : ''}`
            : `${label}${group.hasUnseen ? ', non vue' : ''}`
        }
        /* LA LARGEUR EST PORTÉE PAR LE LIEN, pas seulement par le `<li>`
           (#6080, revue à la capture) : `truncate` ne peut couper que dans une
           boîte CONTRAINTE, et ce lien n'en avait aucune — le libellé prenait
           sa largeur naturelle et DÉBORDAIT sur la tuile voisine, « Camille
           Roy » et « Inès Baraka » se chevauchant en « Camille RoyInès
           Baraka ». iOS contraint le sien à la même cote
           (`.frame(width: LentilleMetrics.Rail.size)`). */
        className="flex flex-col items-center gap-1 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ width: RAIL.tile, outlineColor: 'var(--color-ios-brand)' }}
      >
        <span
          data-anneau
          className="grid place-items-center rounded-chip"
          style={{
            padding: RAIL.ring,
            background: group.hasUnseen
              ? 'var(--color-ios-brand)'
              : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
          }}
        >
          <Avatar initials={initialsOf(label)} color={'var(--color-ios-brand)'} size={AVATAR} />
        </span>
        <span
          data-libelle
          className="w-full truncate text-center text-check"
          style={{ color: 'var(--color-ios-ink-2)' }}
        >
          {label}
        </span>
      </Link>
    </li>
  );
}

/**
 * **LES DEUX BOUTONS FLOTTANTS** — composer, et tout voir (directive porteur).
 *
 * **Ils flottent SANS rien couvrir.** La première version les posait
 * `inset-y-0 right-2` au-dessus du plateau : à la capture, le disque « + »
 * était assis sur le visage de la troisième tuile et le second bouton était
 * tranché par le bord droit de l'écran. Un bouton flottant qui masque le
 * contenu qu'il commande n'est pas un bouton flottant, c'est un obstacle.
 *
 * La pose juste tient en deux gestes : le plateau réserve la largeur de la
 * grappe en `padding-inline-end`, donc aucune tuile ne peut s'arrêter dessous ;
 * et un voile dégradé la borde, donc une tuile qui DÉFILE sous elle s'efface
 * au lieu de la percuter. `pointer-events-none` sur le conteneur et le voile,
 * `auto` sur chaque bouton : le rail reste défilable de bout en bout.
 *
 * Les deux portes sont RÉELLES (`routes/stories.tsx`, `routes/story-compose.tsx`)
 * et la seconde est aussi la sortie du plafond de six entrées.
 */
export const RAIL_ACTIONS_WIDTH = CHROME_ACTION_HIT * 2;

function RailActions() {
  return (
    <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center">
      <span
        aria-hidden="true"
        className="h-full"
        style={{
          width: RAIL.padding,
          background: 'linear-gradient(to right, transparent, var(--color-ios-surface))',
        }}
      />
      <span
        className="flex h-full items-center"
        style={{ width: RAIL_ACTIONS_WIDTH, backgroundColor: 'var(--color-ios-surface)' }}
      >
        <Link
          to="storyCompose"
          aria-label="Créer une story"
          className={`pointer-events-auto ${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <ChromeActionDisc>
            <Glyph name="plus" size={14} />
          </ChromeActionDisc>
        </Link>
        <Link
          to="stories"
          aria-label="Voir toutes les stories"
          className={`pointer-events-auto ${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <ChromeActionDisc>
            <Glyph name="dotsThreeVertical" size={14} />
          </ChromeActionDisc>
        </Link>
      </span>
    </div>
  );
}

export function StoryRail({ viewerId }: { readonly viewerId: string | null | undefined }) {
  const tray = useStoryTray();
  const groups = useMemo(
    () =>
      groupStoriesByAuthor(tray.data ?? [], {
        viewerId: viewerId ?? undefined,
        // « Vu par moi » n'est pas servi par la passerelle (`viewCount` est un
        // COMPTE, qui ne dit pas QUI) : issue compagnon, même forme que
        // `reaction-store.ts`. D'ici là tout est non vu — un anneau allumé à
        // tort se corrige d'un regard, un anneau éteint à tort cache une story.
        viewedIds: new Set<string>(),
      }),
    [tray.data, viewerId],
  );

  /* Rien à montrer ET rien en vol : ni bande blanche, ni région étiquetée vide
     pour le lecteur d'écran. Pendant le CHARGEMENT le rail garde sa hauteur —
     c'est ce qui tient l'`offsetTop` du contenu identique avant et après la
     résolution (gate de la Lentille). */
  const chargement = tray.data === undefined && !tray.isError;
  if (!chargement && groups.length === 0) return null;

  const visibles = groups.slice(0, RAIL.maxEntries);

  return (
    <section aria-label="Stories" className="relative shrink-0">
      <ul
        className="scrollbar-none flex items-start overflow-x-auto"
        style={{
          gap: RAIL.gap,
          paddingInline: RAIL.padding,
          paddingBlock: 8,
          paddingInlineEnd: RAIL_ACTIONS_WIDTH + RAIL.padding,
        }}
      >
        {chargement
          ? [0, 1, 2, 3].map((i) => (
              <li
                key={i}
                aria-hidden="true"
                className="shrink-0 rounded-chip"
                style={{
                  width: RAIL.tile,
                  height: RAIL.tile,
                  background: 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)',
                }}
              />
            ))
          : visibles.map((g) => <StoryTile key={g.authorId} group={g} />)}
      </ul>
      <RailActions />
    </section>
  );
}
