import { useEffect, useRef } from 'react';

import { StoryRail, type StoryRailProps } from '@/components/story-rail';
import { Glyph } from '@/components/glyph';
import { HIDDEN_CHROME_EASE_OUT_MS } from '@/lib/reading-mode/metrics';
import { Link } from '@/routes/route-table';

/**
 * **L'EN-TÊTE DE LA LENTILLE — LA BANDE ÉPINGLÉE PREND LA PLACE DU TITRE**
 * (#6103, décision #6070).
 *
 * Miroir de `PinnedStoryTrailBand` (`StoryTrayView.swift:656-671`) : « it
 * cross-fades in as the full-size `StoryTrayView` scrolls up under the
 * header […] immediately left of the trailing action buttons […] It used to
 * render as a second row BELOW a title that stayed on screen for nothing. »
 * — exactement le défaut que ce composant remplace : avant lui, le rail
 * compactait SUR PLACE et laissait une réserve de hauteur vide entre
 * l'en-tête et les filtres une fois défilé (mesuré,
 * `render/list-scrolled.*.png` avant correction).
 *
 * CE QUI EST REPRIS D'iOS : une bande, la MÊME cellule que le grand rail
 * (`StoryRail`, `variant="pinned"`), qui prend la place du titre
 * dans SA fente — jamais une seconde ligne — et qui ne se matérialise
 * qu'une fois le grand rail sorti (`pinned`, calculé par l'appelant via
 * `useOutOfView`).
 *
 * CE QUI EST ADAPTÉ AU WEB : iOS anime une RAMPE continue pilotée par
 * l'offset de défilement (`CollapsibleHeaderMetrics.inlineAccessoryReveal`).
 * Cet en-tête est STATIQUE (pas de repli 64→60, écart déjà assumé,
 * `targets/lentille.md` § 3.1) : le croisement titre ↔ bande est donc un
 * simple fondu d'OPACITÉ (règle 32 de la charte — jamais la géométrie) sur
 * `HIDDEN_CHROME_EASE_OUT_MS`, la même cote que le chrome du fil escamote
 * (`reading-mode/metrics.ts`) — c'est aussi du CHROME, pas une jumelle à
 * inventer. `motion-reduce:` coupe la transition, jamais le résultat : sous
 * mouvement réduit, la bascule est instantanée au lieu d'être animée.
 *
 * L'EN-TÊTE NE CHANGE JAMAIS DE HAUTEUR (miroir `accessoryCollapsedHeight`
 * restant `< expandedHeight` — « the header only ever shrinks »). Ici plus
 * simple encore : la bande est `position: absolute; inset: 0` DANS la boîte
 * du titre, jamais un flux qui pousserait quoi que ce soit — la hauteur de
 * `<header>` reste celle du `h1` (et du bouton Progression), qu'elle soit
 * visible ou masquée par opacité.
 *
 * LE FOCUS SUIT LA BANDE QUAND ELLE SE RETIRE (#6103, T6) : un utilisateur
 * qui navigue au clavier dans la bande épinglée et fait remonter la liste
 * (le grand rail redevient visible, la bande se démonte) ne doit pas voir
 * son focus retomber sur `<body>`. `onFocusCapture` mémorise la
 * conversation focalisée PENDANT que la bande existe encore — jamais
 * `document.activeElement` APRÈS son démontage, qui a déjà été réinitialisé
 * par le navigateur à ce moment-là — et l'effet qui suit la bascule
 * `pinned: true → false` reporte ce focus sur la tuile JUMELLE du grand
 * rail, qui n'a lui, jamais quitté le DOM.
 *
 * MAIS IL NE REPREND QUE CE QUE LE DÉMONTAGE A ORPHELINÉ (revue #6103).
 * Ce souvenir dit OÙ remettre le focus ; il ne dit pas S'IL FAUT le
 * remettre, et rien ne l'effaçait quand le focus partait ailleurs de
 * lui-même. Un utilisateur qui parcourait la bande au clavier, allait
 * ensuite écrire dans la barre de recherche, puis faisait remonter la liste,
 * se voyait ARRACHER le curseur du champ pour le poser sur une tuile du
 * rail. Le seul fait qui autorise la reprise est donc celui qui la motive :
 * que le retrait ait laissé le focus sur `<body>`.
 */
export function ListHeader({
  pinned,
  railProps,
}: {
  readonly pinned: boolean;
  readonly railProps: StoryRailProps;
}) {
  const lastFocusedIdRef = useRef<string | null>(null);
  const wasPinnedRef = useRef(pinned);

  useEffect(() => {
    const id = lastFocusedIdRef.current;
    if (wasPinnedRef.current && !pinned && id !== null) {
      lastFocusedIdRef.current = null;
      const orphelin = document.activeElement === null || document.activeElement === document.body;
      if (orphelin) {
        const jumelle = document.querySelector<HTMLElement>(
          `[data-rail="grande"] [data-story-author="${CSS.escape(id)}"]`,
        );
        jumelle?.focus();
      }
    }
    wasPinnedRef.current = pinned;
  }, [pinned]);

  return (
    <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
      {/*
        `min-h-11` (44 px) — LA FENTE DU TITRE DOIT CONTENIR LA CIBLE TACTILE
        QU'ELLE ACCUEILLE (revue #6103). Le `h1` seul mesure 42 px ; la bande
        y monte des liens à `min-height: 44` (`RailTile`, charte dimension 5),
        donc son `<ul>` — que `overflow-x-auto` rend scrollable sur les DEUX
        axes en CSS — débordait d'un pixel et devenait une région défilante
        verticale (mesuré : `scrollHeight` 43 pour `clientHeight` 42). Le
        plancher est SANS EFFET sur la hauteur de l'en-tête, déjà fixée à 44
        par le bouton Progression (`size-11`) qui lui fait face : mesuré 64 px
        avant comme après.
      */}
      <div className="relative flex min-h-11 min-w-0 flex-1 items-center">
        <h1
          aria-hidden={pinned ? 'true' : undefined}
          className="min-w-0 flex-1 truncate text-large-title font-bold transition-opacity motion-reduce:transition-none"
          style={{
            opacity: pinned ? 0 : 1,
            transitionDuration: `${HIDDEN_CHROME_EASE_OUT_MS}ms`,
            background: 'linear-gradient(90deg, var(--color-ios-brand), var(--color-ios-brand-deep))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Meeshy Chats
        </h1>
        {pinned ? (
          <div
            className="absolute inset-0 flex items-center"
            onFocusCapture={(e) => {
              const target = e.target as HTMLElement;
              lastFocusedIdRef.current = target.closest('[data-story-author]')?.getAttribute('data-story-author') ?? null;
            }}
          >
            <StoryRail variant="pinned" {...railProps} />
          </div>
        ) : null}
      </div>
      {/*
        L'ENTRÉE DU TABLEAU DE BORD « PROGRESSION » (#5547, déplacée ici
        depuis `routes/conversations.tsx` — #6103). Sur iOS elle vit dans le
        profil et les réglages (#5698) ; la v3.1 n'a pas encore de `/me`
        (inventaire de parité, V4.0.0) — l'en-tête de la liste est donc sa
        porte jusque-là.
      */}
      <Link
        to="progression"
        aria-label="Progression — badges, niveau et série"
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span
          className="grid size-8 place-items-center rounded-chip"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 14%, transparent)' }}
        >
          <Glyph name="trophy" size={16} />
        </span>
      </Link>
    </header>
  );
}
