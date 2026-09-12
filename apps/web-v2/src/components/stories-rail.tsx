import { forwardRef, useState } from 'react';

import lentilleTokens from '@meeshy/shared/design/lentille-tokens.json';

import { Avatar } from '@/components/avatar';
import {
  ringIsAccented,
  shouldRenderRail,
  visibleEntries,
  type RailEntry,
  type RailSelfEntry,
} from '@/lib/lens/rail-policy';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **LE RAIL DE STORIES DE LA LENTILLE** (#5652) — remplace `ConversationRail`
 * dans les DEUX géographies (`variant="grande"` en tête de liste,
 * `variant="pinned"` dans la bande épinglée de `ListHeader`). Miroir
 * `StoriesVivantsRail` (`apps/ios/Meeshy/Features/Main/Lentille/Chrome/
 * StoriesVivantsRail.swift:170-231`) : `ScrollView` horizontal sans
 * indicateur, « moi » en PREMIÈRE pastille hors de la borne des `≤ 6`
 * (`rail-policy.ts`), masqué si rien à montrer.
 *
 * TOUTES LES COTES VIENNENT DU JSON (D-4) — `list.rail.size` (48, grande),
 * `list.rail.ring` (3.5), `list.rail.paddingVertical` (8),
 * `list.tags.emojiSize` (11). AUCUN littéral de loi ici (grep `48\|3.5` sur ce
 * fichier doit rendre 0, issue critère 2).
 *
 * LA COTE COMPACTE (36, `.storyTrayCompact`) N'EST PAS DANS
 * `lentille-tokens.json` — c'est une cote d'un AUTRE composant iOS
 * (`PinnedStoryTrailBand`/`MeeshyAvatar.storyTrayCompact`, jamais muxé par le
 * drapeau, § 1.2 de la spécification) : `RAIL_TILE_COMPACT` la porte en
 * constante LOCALE, gardée par extraction Swift (`check-curve.mjs`, à
 * étendre — issue compagnon).
 *
 * **CE QUE CE LOT NE PEINT PAS ENCORE, ET POURQUOI (règle #5765).** Tap sur
 * une pastille (viewer `/story/:postId`), tap sur « moi » (listing « Mes
 * stories »), badge (+) et badge de mood COMME BOUTONS (composeurs
 * story/statut) n'ont AUCUNE porte sur web-v2 aujourd'hui — les peindre
 * produirait un bouton mort. Les pastilles restent donc NUES (aucun
 * `onClick`), exactement la forme qu'iOS rend lui-même quand
 * `onSelect == nil` (`StoriesVivantsRail.swift:372-381`) :
 * `check-list-actions.mjs` ne trouve alors aucun contrôle à défaut de
 * gestionnaire, puisqu'il n'y a pas de contrôle du tout. Une issue compagnon
 * porte ces trois portes.
 *
 * CE QU'IL PEINT, PARCE QUE LA DONNÉE EST DÉJÀ LÀ (revue #5652) : la
 * COUVERTURE de la dernière story (`RailFace`, miroir `avatarContent`) et le
 * badge d'HUMEUR **décoratif** (`MoodBadge`, miroir `moodBadge` —
 * `aria-hidden`, `pointer-events: none`). Les deux ports (`?scope=stories`,
 * `?scope=statuses`) descendaient leur cascade pour un rail qui n'en rendait
 * RIEN : un résolveur dont la valeur n'atteint aucun pixel n'a corrigé
 * personne (cycle 122 du `CLAUDE.md`).
 */

const RAIL_SIZE_GRANDE: number = lentilleTokens.list.rail.size;
const RAIL_RING_WIDTH: number = lentilleTokens.list.rail.ring;
const RAIL_PADDING_VERTICAL: number = lentilleTokens.list.rail.paddingVertical;
const MOOD_EMOJI_SIZE: number = lentilleTokens.list.tags.emojiSize;

/** `.storyTrayCompact` — voir le doc-comment du module. */
export const RAIL_SIZE_COMPACT = 36;

/** Le seuil sous lequel le libellé n'a plus sa place (miroir de l'ancien
 * `RailTile`, § 1.4 tableau de la spécification : la bande compacte ne porte
 * jamais de nom, exactement `PinnedStoryTrailBand`). */
const SEUIL_LIBELLE = 44;

/** Cible tactile de la charte (dimension 5, « cibles ≥ 44 pt »). */
const MIN_TOUCH_TARGET = 44;

/** Dérivé du RATIO iOS `ring/size` (3.5/48) — jamais une cote nouvelle : la
 * bande compacte n'a pas son propre jeton, elle hérite du même rapport. */
function ringWidthFor(size: number): number {
  return size === RAIL_SIZE_GRANDE ? RAIL_RING_WIDTH : Math.round(size * (RAIL_RING_WIDTH / RAIL_SIZE_GRANDE) * 10) / 10;
}

export type StoriesRailVariant = 'grande' | 'pinned';

export type StoriesRailProps = {
  readonly variant: StoriesRailVariant;
  readonly selfEntry?: RailSelfEntry;
  readonly entries: readonly RailEntry[];
  /** Cache VIDE, requête en vol — jamais « une requête est en cours ». */
  readonly loading: boolean;
  /** Voir le doc-comment du module — `undefined` tant que la porte n'existe pas. */
  readonly onSelect?: (id: string) => void;
  readonly onSelectSelf?: () => void;
};

/**
 * LA COUVERTURE EST SERVIE, PAS SEULEMENT RÉSOLUE (revue #5652) — miroir
 * `avatarContent` (`StoriesVivantsRail.swift:446-459`) : `previewURL ??
 * avatarURL`, repli INITIALES teintées. Le port (`api/stories.ts`) descendait
 * la cascade `thumbnailUrl > fileUrl > avatar` et la peau la JETAIT : un rail
 * de stories sans aucune image, pendant qu'iOS montre la photo. C'est la
 * question du cycle 122 du dépôt — « qui AFFICHE ce que le résolveur élit ? ».
 *
 * Les INITIALES restent peintes SOUS l'image, jamais remplacées par elle : le
 * premier pixel est immédiat (aucun cercle vide pendant le téléchargement,
 * Cache-First), et une URL cassée retombe dessus sans laisser de trou —
 * `onError` est le SEUL chemin qui retire l'image.
 */
function RailFace({
  initials,
  color,
  url,
  size,
  name,
}: {
  readonly initials: string;
  readonly color: string;
  readonly url: string | undefined;
  readonly size: number;
  /**
   * LE NOM QUAND LE LIBELLÉ N'EST PAS ÉCRIT (revue #5652) — la bande compacte
   * ne rend pas le nom (§ `SEUIL_LIBELLE`) et les pastilles n'y sont pas des
   * contrôles : sans ce nom, un lecteur d'écran annonçait « Stories, liste, 2
   * éléments » puis DEUX ÉLÉMENTS VIDES. La cellule supprimée tenait déjà
   * cette propriété (« le nom ne DISPARAÎT pas pour autant : il reste sur
   * l'`aria-label` du lien, donc un lecteur d'écran l'annonce à l'identique
   * aux deux tailles ») — elle n'avait plus de porteur depuis que le lien a
   * disparu. `Avatar` le sert en `role="img"`.
   */
  readonly name?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showsCover = url !== undefined && url !== '' && !broken;

  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <Avatar initials={initials} color={color} size={size} {...(name === undefined ? {} : { name })} />
      {showsCover ? (
        <img
          src={url}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="lazy"
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full rounded-chip object-cover"
        />
      ) : null}
    </span>
  );
}

/**
 * LE BADGE D'HUMEUR — DÉCORATIF (miroir `moodBadge`,
 * `StoriesVivantsRail.swift:413-423` : `allowsHitTesting(false)`,
 * `accessibilityHidden(true)`). Diamètre DÉRIVÉ comme sur iOS
 * (`ringWidth × 2 + Tags.emojiSize`, `:426-430`), fond
 * `backgroundSecondary` (`--color-ios-card`, la table dérivée — D-4).
 *
 * Rendu dans la seule géographie `grande` : la bande compacte est du CHROME
 * (elle ne porte déjà pas le nom, § `SEUIL_LIBELLE`), et `PinnedStoryTrailBand`
 * n'en montre aucun côté iOS — inventer une géométrie compacte pour ce badge
 * serait une cote de plus que rien ne dérive.
 *
 * SANS mood, RIEN : iOS y met la bulle 💭 parce que c'est un BOUTON (« changer
 * mon mood »). Sans cette porte sur web-v2, un 💭 serait une figure qui
 * invite un geste sans effet — règle #5765.
 */
function MoodBadge({ emoji, ring }: { readonly emoji: string; readonly ring: number }) {
  const diameter = ring * 2 + MOOD_EMOJI_SIZE;
  return (
    <span
      data-mood={emoji}
      aria-hidden="true"
      className="absolute grid place-items-center rounded-chip"
      style={{
        right: 0,
        bottom: 0,
        width: diameter,
        height: diameter,
        fontSize: MOOD_EMOJI_SIZE,
        lineHeight: 1,
        backgroundColor: 'var(--color-ios-card)',
        pointerEvents: 'none',
      }}
    >
      {emoji}
    </span>
  );
}

function RailGhostTile({ size }: { readonly size: number }) {
  return (
    <li aria-hidden="true" className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: size, visibility: 'hidden' }}>
      <Avatar initials="" color="var(--color-ios-card)" size={size} />
    </li>
  );
}

function RailTile({
  entry,
  size,
  onSelect,
}: {
  readonly entry: RailEntry;
  readonly size: number;
  readonly onSelect?: (id: string) => void;
}) {
  const ring = ringWidthFor(size);
  const avatarSize = size - 2 * ring;
  const accented = ringIsAccented(entry);
  const porteLibelle = size >= SEUIL_LIBELLE;
  const hitPad = Math.max(0, (MIN_TOUCH_TARGET - size) / 2);

  const pastille = (
    <span className="relative block">
      <span
        data-anneau
        data-accented={accented}
        className="grid place-items-center rounded-chip"
        style={{
          padding: ring,
          backgroundColor: accented ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
        }}
      >
        <RailFace
          initials={initialsOf(entry.displayName)}
          color={entry.accentColor}
          url={entry.previewUrl ?? entry.avatarUrl}
          size={avatarSize}
          {...(porteLibelle ? {} : { name: entry.displayName })}
        />
      </span>
      {porteLibelle && entry.moodEmoji !== undefined ? <MoodBadge emoji={entry.moodEmoji} ring={ring} /> : null}
    </span>
  );

  const label = porteLibelle ? (
    <span data-libelle className="w-full truncate text-center text-check" style={{ color: 'var(--color-ios-ink-2)', width: size }}>
      {entry.displayName}
    </span>
  ) : null;

  return (
    <li data-rail-tile={size} className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: size }}>
      {onSelect === undefined ? (
        <span className="flex flex-col items-center gap-1.5" aria-hidden={false}>
          {pastille}
          {label}
        </span>
      ) : (
        <button
          type="button"
          data-story={entry.id}
          onClick={() => onSelect(entry.id)}
          aria-label={entry.displayName}
          className="flex flex-col items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            outlineColor: 'var(--color-ios-brand)',
            minWidth: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            marginLeft: `-${hitPad}px`,
            marginRight: `-${hitPad}px`,
            marginTop: `-${hitPad}px`,
            marginBottom: `-${hitPad}px`,
            justifyContent: 'center',
          }}
        >
          {pastille}
          {label}
        </button>
      )}
    </li>
  );
}

function RailSelfTile({
  entry,
  size,
  onSelect,
}: {
  readonly entry: RailSelfEntry;
  readonly size: number;
  readonly onSelect?: () => void;
}) {
  const ring = ringWidthFor(size);
  const avatarSize = size - 2 * ring;
  const porteLibelle = size >= SEUIL_LIBELLE;
  const hitPad = Math.max(0, (MIN_TOUCH_TARGET - size) / 2);

  const pastille = (
    <span className="relative block">
      <span
        data-anneau
        data-accented={entry.hasActiveStory}
        className="grid place-items-center rounded-chip"
        style={{
          padding: ring,
          backgroundColor: entry.hasActiveStory ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
        }}
      >
        <RailFace
          initials={initialsOf(entry.displayName)}
          color={entry.accentColor}
          url={entry.previewUrl ?? entry.avatarUrl}
          size={avatarSize}
          {...(porteLibelle ? {} : { name: entry.displayName })}
        />
      </span>
      {porteLibelle && entry.moodEmoji !== undefined ? <MoodBadge emoji={entry.moodEmoji} ring={ring} /> : null}
    </span>
  );

  const label = porteLibelle ? (
    <span className="w-full truncate text-center text-check" style={{ color: 'var(--color-ios-ink-2)', width: size }}>
      {entry.displayName}
    </span>
  ) : null;

  return (
    <li data-rail-tile={size} data-rail-self className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: size }}>
      {onSelect === undefined ? (
        <span className="flex flex-col items-center gap-1.5">
          {pastille}
          {label}
        </span>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-label={entry.actionLabel ?? entry.displayName}
          className="flex flex-col items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            outlineColor: 'var(--color-ios-brand)',
            minWidth: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            marginLeft: `-${hitPad}px`,
            marginRight: `-${hitPad}px`,
            marginTop: `-${hitPad}px`,
            marginBottom: `-${hitPad}px`,
            justifyContent: 'center',
          }}
        >
          {pastille}
          {label}
        </button>
      )}
    </li>
  );
}

export const StoriesRail = forwardRef<
  HTMLUListElement,
  StoriesRailProps & { readonly inert?: boolean }
>(function StoriesRail({ variant, selfEntry, entries, loading, onSelect, onSelectSelf, inert = false }, ref) {
  const size = variant === 'grande' ? RAIL_SIZE_GRANDE : RAIL_SIZE_COMPACT;
  const visible = visibleEntries(entries);

  const nothingToShow = variant === 'pinned' ? !shouldRenderRail(selfEntry, entries) : !loading && !shouldRenderRail(selfEntry, entries);
  if (nothingToShow) return null;

  return (
    <ul
      ref={ref}
      data-rail={variant}
      inert={inert}
      aria-label={inert ? undefined : 'Stories'}
      className={variant === 'grande' ? 'flex gap-2 overflow-x-auto px-4' : 'flex h-full items-center gap-2 overflow-x-auto'}
      style={{ scrollbarWidth: 'none', paddingBlock: variant === 'grande' ? RAIL_PADDING_VERTICAL : 0 }}
    >
      {loading && selfEntry === undefined && visible.length === 0 && variant === 'grande' ? <RailGhostTile size={size} /> : null}
      {selfEntry === undefined ? null : (
        <RailSelfTile entry={selfEntry} size={size} {...(onSelectSelf === undefined ? {} : { onSelect: onSelectSelf })} />
      )}
      {visible.map((entry) => (
        <RailTile key={entry.id} entry={entry} size={size} {...(onSelect === undefined ? {} : { onSelect })} />
      ))}
    </ul>
  );
});
