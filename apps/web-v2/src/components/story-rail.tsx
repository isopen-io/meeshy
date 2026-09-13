import { forwardRef } from 'react';

import { Avatar } from '@/components/avatar';
import { ChromeActionDisc, CHROME_ACTION_HIT, CHROME_ACTION_HIT_CLASS } from '@/components/chrome-action';
import { Glyph } from '@/components/glyph';
import { RAIL_TILE_COMPACT, RAIL_TILE_GRANDE, railCellWidth, railRingWidth } from '@/components/rail-tile';
import { initialsOf } from '@/lib/view/conversation';
import { storyAuthorLabel, type StoryTrayGroup } from '@/lib/view/story-tray';
import { Link } from '@/routes/route-table';

/**
 * **LE RAIL DES STORIES** (#6080) — de VRAIES stories, un cercle par AUTEUR,
 * **dans les deux géographies d'iOS** (#6103).
 *
 * Il remplace le rail d'« accès rapide » qui montrait des CONVERSATIONS sous
 * un anneau promettant une story. Le doc-comment de l'écran l'avouait :
 * « en l'absence d'une route stories, la seule destination RÉELLE de chaque
 * avatar aujourd'hui est SON FIL ». Un anneau qui promet un contenu que rien
 * n'ouvre est un contrôle qui ment — loi 4, un contrôle existe s'il a un effet.
 *
 * **LA TUILE OUVRE DÉSORMAIS LE LECTEUR PLEIN ÉCRAN** (#5817) — `/story/$post`,
 * jamais `/stories?author=`. Le rail nomme une PERSONNE (intention
 * `openingGroup`, `StoryViewerRequestOrigin.swift`) : c'est donc LUI qui
 * calcule quelle story de cette personne ouvrir — `group.entryStoryId`,
 * posé par `groupStoriesByAuthor` (`lib/view/story-tray.ts`) : la première
 * NON VUE en ordre de lecture, sinon la plus ancienne du groupe. Le lecteur recalculera SA propre entrée (`entryIndexFor`,
 * `lib/stories/playback.ts`) depuis le corpus complet ; l'id posé ici n'est
 * qu'une ADRESSE, jamais un ordre de lecture.
 *
 * ## CE FICHIER EST UNE FUSION, ET IL FAUT DIRE LAQUELLE (2026-09-12)
 *
 * Deux lots ont corrigé ce rail la même nuit, sans se voir, et chacun n'a
 * corrigé qu'une moitié :
 *
 * - **#6080 (cette branche) a corrigé le CONTENU** — de vraies stories, une
 *   destination réelle (`routes/stories.tsx`, `routes/story-compose.tsx`), le
 *   regroupement par auteur, le plafond de six entrées ;
 * - **#6103 (livré sur `dev` à 04:58) a corrigé la GÉOGRAPHIE** — le grand
 *   rail vit DANS la vue défilante et en sort normalement, une BANDE compacte
 *   prend la place du titre dans l'en-tête (`components/list-header.tsx`), avec
 *   son observateur de visibilité (`useOutOfView`, `lib/lens/pinned-rail.ts`)
 *   et sa garde d'accessibilité.
 *
 * Ce composant porte les deux. Ce qui a été PORTÉ depuis `conversation-rail.tsx`
 * (supprimé, sa valeur étant ici) :
 *
 * | capacité | où elle vit maintenant |
 * |---|---|
 * | `variant: 'grande' | 'pinned'` et la cote qui en dérive | `size` ci-dessous |
 * | `forwardRef` sur le `<ul>` (cible de `useOutOfView`) | la signature |
 * | `inert` + `aria-label` retiré quand inerte | le `<ul>` |
 * | `data-rail={variant}` et `data-rail-tile` (prises du gate) | `<ul>` et `<li>` |
 * | « au repos, `pinned` ne matérialise rien » | `rienÀMontrer` |
 * | le squelette ne vit que sur `grande` | le rendu |
 * | les cotes DÉRIVENT, jamais recopiées | `railCellWidth` / `railRingWidth` |
 *
 * ## LA COTE — DEUX CONSTANTES iOS, ET LA BRANCHE AVAIT CITÉ L'AUTRE
 *
 * Cette branche portait `RAIL = { tile: 48 }`, justifié par
 * `LentilleMetrics.Rail.size`. La constante est réelle, la citation était de
 * bonne foi — mais elle décrit `list.rail`, le rail des **LIVES** : « pastille
 * 48, anneau 3.5 (pulsé si live), ≤ 6 entrées », et son propre commentaire
 * renvoie à `LivesRail.tsx`. Le plateau des **STORIES** est un autre objet, et
 * ses deux cotes sont ailleurs : `MeeshyAvatar.storyTray` = **88**
 * (« doubled 2026-05-27 — story trail = primary CTA ») et `.storyTrayCompact`
 * = **36** (`StoryTrayView.swift:226`, « `context` drives the size », partagé
 * par le grand plateau ET la bande épinglée).
 *
 * Le grief qui motivait la réduction reste JUSTE, et il est mesuré : à
 * 390 × 844, trois visages à 72 occupaient 232 × 100 px — un huitième de
 * l'écran pour trois entrées, et la liste commençait sous la ligne de
 * flottaison. **C'est exactement ce que la bande épinglée résout chez iOS** :
 * le plateau est grand PARCE QU'il est l'appel à l'action principal, et il sort
 * du champ au défilement au lieu de rétrécir. Les deux moitiés répondaient à la
 * même question — l'une par la cote, l'autre par la géographie — et c'est la
 * géographie qui gagne, parce que c'est celle de la cible.
 *
 * Les cotes servies ici sont donc celles de `rail-tile.tsx` (`RAIL_TILE_GRANDE`
 * = 72 → cellule 88, `RAIL_TILE_COMPACT` = 30 → cellule 37), un seul domicile
 * partagé avec la tuile de conversation. **L'écart qui reste** — l'avatar iOS
 * du grand plateau est à 88 quand le web est à 72 — n'est pas tranché par cette
 * fusion : le monter change la cote d'un composant partagé et se mesure à la
 * capture, pas dans une résolution de conflit.
 *
 * **AUCUN INDICATEUR DE DÉFILEMENT** — `ScrollView(.horizontal, showsIndicators:
 * false)`, la cible iOS à la lettre. Le plateau défile, barre masquée :
 * l'affordance est portée par les tuiles, qui débordent visiblement du cadre.
 */
export type StoryRailVariant = 'grande' | 'pinned';

const RAIL = {
  gap: 8,
  padding: 16,
  /** `LentilleRailPolicy.visibleEntries` — au-delà, la porte « tout voir ». */
  maxEntries: 6,
} as const;

/**
 * LA BANDE ÉPINGLÉE NE PORTE NI LÉGENDE NI BOUTONS — les trois absences sont
 * des décisions iOS explicites, pas des oublis : `PinnedStoryTrailBand` rend
 * des anneaux seuls dans une barre repliée de 60 pt, et le ＋ survit sur le
 * grand plateau. Y remettre un libellé ferait déborder la barre ; y remettre
 * les disques d'action doublerait deux contrôles déjà atteignables.
 */
function StoryTile({ group, size, showsLabel }: { readonly group: StoryTrayGroup; readonly size: number; readonly showsLabel: boolean }) {
  const label = storyAuthorLabel(group);
  const combien = group.stories.length;
  const anneau = railRingWidth(size);
  const cellule = railCellWidth(size);
  const avatar = size - anneau * 2;

  return (
    /* `data-story-tile` porte la COTE de l'avatar, pour que le gate des stories
       puisse la mesurer ; `data-rail-tile` est la prise que le gate de la
       Lentille cherche dans les DEUX géographies (`[data-rail="grande"]
       [data-rail-tile]`). Les deux coexistent parce que les deux gates mesurent
       deux propriétés différentes du même nœud — un composant sans prise
       mesurable ne peut être gardé par rien, et la cote redérive en silence
       (leçon 575). */
    <li
      data-story-tile={size}
      data-rail-tile={size}
      className="flex shrink-0 flex-col items-center gap-1"
      style={{ width: cellule }}
    >
      <Link
        to="story"
        params={{ post: group.entryStoryId }}
        /* L'IDENTITÉ DE LA TUILE EST PORTÉE PAR L'ÉLÉMENT FOCALISABLE (porté de
           #6103, où elle s'appelait `data-conversation`) : `ListHeader` retient
           celle que la bande épinglée avait sous le focus, puis rend le focus à
           sa JUMELLE du grand plateau quand la bande se retire. Sans cet
           attribut, la reprise ne trouve rien et le focus reste sur `<body>`. */
        data-story-author={group.authorId}
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
           Baraka ». iOS contraint le sien à la même cote. */
        className="flex flex-col items-center gap-1 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ width: cellule, outlineColor: 'var(--color-ios-brand)' }}
      >
        <span
          data-anneau
          data-accented={group.hasUnseen ? 'true' : undefined}
          className="relative grid place-items-center rounded-chip"
          style={{
            padding: anneau,
            background: group.hasUnseen
              ? 'var(--color-ios-brand)'
              : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
          }}
        >
          <Avatar initials={initialsOf(label)} color={'var(--color-ios-brand)'} size={avatar} />
          {/* LE BADGE D'HUMEUR (#5652) — miroir `LentilleRailEntry.moodEmoji`
              (`StoriesVivantsRail.swift`) : une pastille SECONDAIRE posée sur
              l'anneau, jamais un second anneau — l'humeur et la story sont
              deux signaux distincts sur la MÊME entrée. */}
          {group.moodEmoji ? (
            <span
              data-mood={group.moodEmoji}
              aria-hidden="true"
              className="absolute right-0 bottom-0 grid place-items-center rounded-full leading-none"
              style={{
                width: Math.max(16, Math.round(size * 0.28)),
                height: Math.max(16, Math.round(size * 0.28)),
                fontSize: Math.max(10, Math.round(size * 0.16)),
                background: 'var(--color-ios-surface)',
                boxShadow: '0 0 0 1.5px var(--color-ios-surface)',
              }}
            >
              {group.moodEmoji}
            </span>
          ) : null}
        </span>
        {showsLabel ? (
          <span
            data-libelle
            className="w-full truncate text-center text-check"
            style={{ color: 'var(--color-ios-ink-2)' }}
          >
            {label}
          </span>
        ) : null}
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

/**
 * LE RAIL EST PUR — il REÇOIT ses groupes, il ne les cherche pas (forme portée
 * de `conversation-rail.tsx`, #6103, et c'est elle qu'il fallait garder).
 *
 * Trois raisons, dont une de correction :
 *
 * 1. **Les deux géographies doivent voir le MÊME corpus.** `ListHeader` rend le
 *    focus à la tuile JUMELLE du grand plateau quand la bande se retire : deux
 *    abonnements indépendants pourraient, à l'instant de la bascule, ne pas
 *    porter les mêmes auteurs — et la jumelle n'existerait pas. Une seule prop,
 *    calculée une fois par l'écran, rend la divergence impossible.
 * 2. **Une vue pure se mesure.** Les quatorze témoins de la géographie
 *    (`story-rail.test.tsx`) montent le composant avec un corpus littéral ;
 *    aucun n'aurait pu s'écrire contre un hook de requête sans harnais de cache.
 * 3. C'est la règle qu'iOS écrit pour son propre rail — « aucun `@State` de
 *    défilement » : le rail ne sait rien de sa géographie NI de sa source.
 */
export type StoryRailProps = {
  readonly groups: readonly StoryTrayGroup[];
  /** Cache VIDE, première tentative en vol — jamais « une requête est en
   * cours » : c'est `railTientLaPlace` (`lib/view/story-tray.ts`) qui l'arbitre,
   * chez l'écran, avec ses témoins. */
  readonly loading: boolean;
};

export const StoryRail = forwardRef<
  HTMLUListElement,
  StoryRailProps & {
    readonly variant: StoryRailVariant;
    /** Porté par le GRAND rail, et seulement pendant que la bande le remplace
     * — voir la garde d'accessibilité ci-dessous. */
    readonly inert?: boolean;
  }
>(function StoryRail({ groups, loading, variant, inert = false }, ref) {
  const grande = variant === 'grande';
  const size = grande ? RAIL_TILE_GRANDE : RAIL_TILE_COMPACT;

  /* Rien à montrer ET rien en vol : ni bande blanche, ni région étiquetée vide
     pour le lecteur d'écran. La loi de la place — et la borne qui empêche le
     squelette de survivre au refus du corpus — vit dans `railTientLaPlace`
     (`lib/view/story-tray.ts`, appelée par l'écran), avec ses témoins
     (`story-tray-place.test.ts`).

     LA BANDE ÉPINGLÉE NE PORTE JAMAIS DE SQUELETTE (porté de #6103) : au repos
     elle ne matérialise rien (miroir `StoryTrayView.swift:739-747`), et elle
     n'existe de toute façon qu'une fois le grand plateau déjà résolu. */
  const chargement = grande && loading;
  const rienÀMontrer = grande ? !chargement && groups.length === 0 : groups.length === 0;
  if (rienÀMontrer) return null;

  const visibles = groups.slice(0, RAIL.maxEntries);

  /**
   * LA GARDE D'ACCESSIBILITÉ, portée de #6103 — tant que la bande épinglée le
   * remplace, le grand rail ne quitte pas le DOM (il défile simplement hors du
   * scrollport). Sans `inert`, ses liens restaient à la fois dans l'ordre de
   * TABULATION et dans l'arbre D'ACCESSIBILITÉ à côté des liens IDENTIQUES de
   * la bande : un lecteur d'écran annonçait la liste deux fois, et un `Tab`
   * depuis la bande retombait dans le grand rail hors champ — que le navigateur
   * ramène alors DANS la vue, faisant sauter le défilement pour rien.
   *
   * Miroir d'iOS, où c'est la copie inatteignable qui cède
   * (`.allowsHitTesting(reveal > 0.6)`) ; ici c'est le GRAND rail, puisque
   * c'est lui qui reste hors champ. `inert` retire le sous-arbre des DEUX
   * arbres en un geste — jamais un couple `aria-hidden` + `tabindex="-1"` à
   * tenir par lien, qui se désynchroniserait au premier ajout de tuile.
   *
   * Une région INERTE n'a rien à annoncer : son libellé tombe avec elle, sinon
   * c'est lui qui porte le doublon.
   */
  const rail = (
    <ul
      ref={ref}
      data-rail={variant}
      inert={inert}
      aria-label={inert ? undefined : 'Stories'}
      className={
        grande
          ? 'scrollbar-none flex items-start overflow-x-auto'
          : 'scrollbar-none flex h-full items-center overflow-x-auto'
      }
      style={{
        gap: RAIL.gap,
        ...(grande
          ? {
              paddingInline: RAIL.padding,
              paddingBlock: 8,
              paddingInlineEnd: RAIL_ACTIONS_WIDTH + RAIL.padding,
            }
          : {}),
      }}
    >
      {chargement
        ? [0, 1, 2, 3].map((i) => (
            <li
              key={i}
              aria-hidden="true"
              className="shrink-0 rounded-chip"
              style={{
                width: railCellWidth(size),
                height: size,
                background: 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)',
              }}
            />
          ))
        : visibles.map((g) => <StoryTile key={g.authorId} group={g} size={size} showsLabel={grande} />)}
    </ul>
  );

  /* La bande épinglée est montée DANS l'en-tête, qui porte déjà sa région :
     l'envelopper d'un second conteneur étiqueté ajouterait un repère de
     navigation en double. Le grand plateau, lui, a besoin du sien — pour
     POSITIONNER ses deux boutons flottants (`position: relative`). */
  if (!grande) return rail;

  /**
   * L'ENVELOPPE EST UN POSITIONNEMENT, PAS UN REPÈRE — et elle porte `inert`
   * avec le rail (revue du 2026-09-12, rouge « Peaux web-v2 » sur #6100).
   *
   * Deux défauts vivaient ici, et le second explique le premier :
   *
   *  1. `<section aria-label="Stories">` faisait de cette enveloppe un
   *     LANDMARK nommé, en plus du `<ul aria-label="Stories">` qu'elle
   *     contient — une région « Stories » enveloppant une liste « Stories ».
   *     Pendant que la bande épinglée est active, `inert` retirait bien le
   *     `<ul>` des deux arbres, mais PAS son enveloppe : le doublon que la
   *     garde de #6103 existe pour empêcher se reconstituait un cran plus
   *     haut, sur le nœud que `inert` ne couvrait pas. L'étiquette tombe donc
   *     ici : le `<ul>` nomme déjà la liste, et il le fait dans les DEUX
   *     géographies.
   *
   *  2. `RailActions` — « Créer une story » et « Voir toutes les stories » —
   *     restait TABULABLE hors champ. Un `Tab` depuis la bande y atterrissait,
   *     et le navigateur ramenait le plateau DANS la vue pour honorer le
   *     focus, faisant sauter le défilement : exactement le symptôme que
   *     #6103 a corrigé pour les tuiles, laissé intact pour les deux portes
   *     parce que `inert` vivait sur le `<ul>`, leur voisin, jamais sur leur
   *     parent commun.
   *
   * `inert` reste AUSSI sur le `<ul>` : il y est la prise que `check-lens.mjs`
   * mesure (`[data-rail="grande"]` porte-t-il l'attribut ?), et l'inertie
   * s'hérite — les deux déclarations disent la même chose sans se contredire.
   */
  return (
    <section inert={inert} className="relative shrink-0">
      {rail}
      <RailActions />
    </section>
  );
});
