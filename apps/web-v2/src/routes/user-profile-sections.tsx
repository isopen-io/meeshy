import { memo, type ReactNode } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { Link } from '@/routes/route-table';
import { GroupedSection, SECTION_CARD_STYLE } from '@/components/grouped-section';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import type {  PublicProfileStats } from '@/lib/api/public-profile';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { ProfileActionKind, ProfileRelation } from '@/lib/profile/relation';
import type { ProfilePostsFilter, ProfilePostsFilterTap } from '@/lib/profile/posts-filter';
import { BRAND, BRAND_FILL, FOCUS, INK, INK_2 } from './user-profile-style';
import { ActionButton, ContextBanner } from './user-profile-header';

/**
 * **LES PIÈCES DU PROFIL PUBLIC** (#7083) — l'écran ORCHESTRE (requêtes, états,
 * gestes), ces sections PEIGNENT. C'est exactement la coupe de `/me`
 * (`profile.tsx` / `profile-sections.tsx`), et c'est la forme que les surfaces
 * suivantes copieront : celle qui garde l'écran lisible quand la quatrième
 * section arrive — Conversations, Voix, Signaler, toutes différées.
 *
 * **LA CIBLE EST `UserProfileSheet`** (`packages/MeeshySDK/Sources/MeeshyUI/Profile/`),
 * PAS `ProfileView.swift` : celui-là rend le profil de SOI, en ÉDITION, et son
 * miroir web est déjà `/me`.
 *
 * **TROIS ONGLETS iOS → SECTIONS EMPILÉES**, et c'est une décision, pas un
 * raccourci : l'onglet « Conversations » est hors périmètre, et une barre à
 * trois onglets dont un ne mène nulle part est un contrôle qui ment (loi 4).
 * `/me` a par ailleurs déjà posé l'idiome `<section aria-labelledby>` dans la
 * v3.1, et deux profils qui se feuilletteraient différemment feraient sentir un
 * changement d'application (dimension 6). iOS porte des onglets parce que sa
 * fiche est une `sheet` sans place ; la route web est une page pleine. La barre
 * d'onglets revient AVEC l'onglet Conversations — issue compagnon.
 *
 * **`ConnectionAction` de `discover-parts.tsx` N'EST PAS IMPORTÉ**, et ce n'est
 * pas un oubli : il rend une pastille de LIGNE DE LISTE (30 px de haut dans une
 * cible de 44). Le profil rend des boutons PLEINE LARGEUR
 * (`profileActionButton`, `UserProfileSheet+DetailsTab.swift:266-289`). Ce qui
 * est partagé est la LOI (`Relationship`, `actionsFor`) et les CLÉS de
 * catalogue — pas le pixel.
 */

/* L'IDENTITÉ ET LES ÉTATS ONT QUITTÉ CE FICHIER (#7152) — voir
   `user-profile-header.tsx` et `user-profile-states.tsx`. Ce qui reste ici rend
   des DONNÉES : la relation et les statistiques. */

export const ProfileRelationSection = memo(function ProfileRelationSection({
  language,
  relation,
  actions,
  name,
  signedIn,
  online,
  busy,
  onAction,
  onSignIn,
}: {
  readonly language: InterfaceLanguage;
  readonly relation: ProfileRelation;
  readonly actions: readonly ProfileActionKind[];
  readonly name: string;
  readonly signedIn: boolean;
  readonly online: boolean;
  readonly busy: boolean;
  readonly onAction: (kind: ProfileActionKind) => void;
  readonly onSignIn: () => void;
}) {
  return (
    <GroupedSection
      id="user-profile-relation"
      title={translate(language, 'userProfile.section.relation')}
      icon={<GlyphSvg glyph={PROFILE_GLYPHS.userPlus} size={12} />}
      card={false}
    >
      <div data-profile-relation={relation.kind} className="grid gap-2">
        {signedIn ? (
          <>
            <ContextBanner language={language} relation={relation} name={name} />
            {actions.map((kind) => (
              <ActionButton
                key={kind}
                language={language}
                kind={kind}
                name={name}
                disabled={busy || !online}
                onAction={onAction}
              />
            ))}
          </>
        ) : (
          <div data-profile-signin className="grid gap-2 rounded-card px-3.5 py-3.5" style={SECTION_CARD_STYLE}>
            <p className="text-body font-semibold" style={{ color: INK }}>
              {translate(language, 'userProfile.signin.title')}
            </p>
            <p className="text-caption" style={{ color: INK_2 }}>
              {translate(language, 'userProfile.signin.body')}
            </p>
            <button
              type="button"
              data-profile-signin-cta
              onClick={onSignIn}
              className={`mt-1 grid w-full place-items-center rounded-card px-4 text-body font-semibold ${FOCUS}`}
              style={{ minHeight: 48, color: '#fff', backgroundColor: BRAND_FILL, outlineColor: BRAND }}
            >
              {translate(language, 'userProfile.signin.cta')}
            </button>
          </div>
        )}
      </div>
    </GroupedSection>
  );
});

/** Bloqué par le lecteur : identité, une carte, « Débloquer » — ni
 * publications ni statistiques (miroir `blockedLayout`,
 * `UserProfileSheet.swift:132`, `:165-177`). */
export function ProfileBlockedCard({
  language,
  name,
  online,
  busy,
  onAction,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly online: boolean;
  readonly busy: boolean;
  readonly onAction: (kind: ProfileActionKind) => void;
}) {
  return (
    <div data-profile-blocked className="grid gap-2 rounded-card px-3.5 py-3.5" style={SECTION_CARD_STYLE}>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'userProfile.blocked.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'userProfile.blocked.body')}
      </p>
      <ActionButton language={language} kind="unblock" name={name} disabled={busy || !online} onAction={onAction} />
    </div>
  );
}

/**
 * **SA PROPRE FICHE MÈNE À SON ÉDITION** (#7188).
 *
 * Masquer les gestes relationnels sur soi est juste — on ne s'ajoute pas en
 * ami, miroir d'iOS (`UserProfileSheet+DetailsTab.swift:23`) — mais rien
 * n'était mis à la place : `/u/<mon-pseudo>` n'offrait AUCUN geste, et aucun
 * chemin vers `/me`. Un écran qui montre son propre profil sans mener à son
 * édition est un cul-de-sac.
 *
 * Un `<Link>` et non un bouton : la destination est une ADRESSE, et le lecteur
 * doit pouvoir l'ouvrir dans un onglet, la copier, y revenir.
 */
export function ProfileSelfSection({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-profile-self className="grid gap-2 rounded-card px-3.5 py-3.5" style={SECTION_CARD_STYLE}>
      <Link
        to="profile"
        className="grid place-items-center rounded-chip text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        {translate(language, 'userProfile.self.edit')}
      </Link>
    </div>
  );
}

// -------------------------------------------------------------- les compteurs

/**
 * **UN COMPTEUR ABSENT N'EST PAS UN COMPTEUR À ZÉRO** (#7083) — `servedUserStats`
 * RETIRE `totalMessages`, `totalConversations`, `totalTranslations` et
 * `friendRequestsReceived` pour un lecteur tiers (`routes/user-stats.ts:220-225`,
 * `:245-251`). iOS les décode en `Int` et la fiche d'autrui annonce « 0
 * Messages, 0 Traductions » — une valeur FAUSSE présentée comme mesurée.
 *
 * Ici le port les décode en `number | null`, et cette liste ne peint QUE ce qui
 * est servi : un compteur `null` ne fabrique aucune tuile. Écart ASSUMÉ avec
 * iOS ; une issue compagnon le signale côté iOS.
 */
const STAT_CHIPS = [
  { key: 'languagesUsed', label: 'profile.stats.languages', glyph: <GlyphSvg glyph={PROFILE_GLYPHS.globe} size={14} /> },
  { key: 'memberDays', label: 'profile.stats.days', glyph: <GlyphSvg glyph={PROFILE_GLYPHS.calendarBlank} size={14} /> },
  { key: 'totalMessages', label: 'profile.stats.messages', glyph: <GlyphSvg glyph={PROFILE_GLYPHS.chatCircle} size={14} /> },
  { key: 'totalTranslations', label: 'profile.stats.translations', glyph: <Glyph name="translate" size={14} /> },
] as const satisfies ReadonlyArray<{ readonly key: keyof PublicProfileStats; readonly label: InterfaceCatalogKey; readonly glyph: ReactNode }>;

const memberSince = (language: InterfaceLanguage, createdAt: string | null): string | null => {
  if (createdAt === null) return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

export const ProfileStatsSection = memo(function ProfileStatsSection({
  language,
  stats,
  createdAt,
  loading,
}: {
  readonly language: InterfaceLanguage;
  readonly stats: PublicProfileStats | null;
  readonly createdAt: string | null;
  readonly loading: boolean;
}) {
  const since = memberSince(language, createdAt);
  const chips = stats === null ? [] : STAT_CHIPS.filter((chip) => stats[chip.key] !== null);
  return (
    <GroupedSection
      id="user-profile-stats"
      title={translate(language, 'profile.section.stats')}
      icon={<GlyphSvg glyph={PROFILE_GLYPHS.chartBar} size={12} />}
      card={false}
    >
      <div data-profile-stats className="grid gap-2">
        {since === null ? null : (
          <p data-profile-member-since className="rounded-card px-3.5 py-3 text-body font-medium" style={{ ...SECTION_CARD_STYLE, color: INK }}>
            {`${translate(language, 'profile.section.member_since')} · ${since}`}
          </p>
        )}
        {loading && stats === null ? (
          <div aria-busy="true" aria-label={translate(language, 'userProfile.loading')} className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
            {[0, 1, 2, 3].map((slot) => (
              <span key={slot} className="block rounded-card" style={{ ...SECTION_CARD_STYLE, height: 64 }} />
            ))}
          </div>
        ) : chips.length === 0 ? null : (
          <ul className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
            {chips.map((chip) => (
              <li key={chip.key} data-profile-stat={chip.key} className="grid justify-items-center gap-1 rounded-card px-1 py-2.5 text-center" style={SECTION_CARD_STYLE}>
                <span aria-hidden="true" style={{ color: BRAND }}>
                  {chip.glyph}
                </span>
                <strong className="text-body font-bold" style={{ color: INK }}>
                  {String(stats?.[chip.key] ?? '')}
                </strong>
                <span className="text-chip font-medium" style={{ color: INK_2 }}>
                  {translate(language, chip.label)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GroupedSection>
  );
});

// ------------------------------------------------------- le bandeau du listing

/**
 * LES TROIS TUILES, EN TÊTE DU BLOC PUBLICATIONS — `ProfilePostsStatsBand`
 * (`ProfileUserPostsList.swift:40-130`). Elles sont posées SUR ce qu'elles
 * filtrent : les mettre dans « Statistiques » couperait le geste de son effet.
 *
 * **« Stories » N'EST PAS UN BOUTON** : iOS l'ouvre parce qu'il a l'écran ; la
 * v3.1 ne l'a pas. Une tuile muette qui informe ne ment pas ; un bouton sans
 * effet, si (loi 4). Son `tap` est donc `null`, et le rendu s'en déduit — pas
 * une exception écrite à côté.
 */
const BAND_TILES = [
  { key: 'postsCount', label: 'userProfile.stat.posts', glyph: <GlyphSvg glyph={PROFILE_GLYPHS.quotes} size={14} />, tap: 'posts' },
  { key: 'reelsCount', label: 'userProfile.stat.reels', glyph: <GlyphSvg glyph={FEED_GLYPHS.monitorPlay} size={14} />, tap: 'reels' },
  { key: 'storiesCount', label: 'userProfile.stat.stories', glyph: <Glyph name="image" size={14} />, tap: null },
] as const satisfies ReadonlyArray<{
  readonly key: 'postsCount' | 'reelsCount' | 'storiesCount';
  readonly label: InterfaceCatalogKey;
  readonly glyph: ReactNode;
  readonly tap: ProfilePostsFilterTap | null;
}>;

const TILE_CLASS = 'grid justify-items-center gap-1 rounded-card px-1 py-2.5 text-center';

export const ProfileStatsBand = memo(function ProfileStatsBand({
  language,
  stats,
  filter,
  onFilter,
}: {
  readonly language: InterfaceLanguage;
  readonly stats: PublicProfileStats | null;
  readonly filter: ProfilePostsFilter;
  readonly onFilter: (tap: ProfilePostsFilterTap) => void;
}) {
  const tiles = stats === null ? [] : BAND_TILES.filter((tile) => stats[tile.key] !== null);
  if (tiles.length === 0) return null;
  return (
    <ul data-profile-band className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => {
        const value = String(stats?.[tile.key] ?? '');
        const label = translate(language, tile.label);
        const body = (
          <>
            <span aria-hidden="true" style={{ color: BRAND }}>
              {tile.glyph}
            </span>
            <strong className="text-body font-bold" style={{ color: INK }}>
              {value}
            </strong>
            <span className="text-chip font-medium" style={{ color: INK_2 }}>
              {label}
            </span>
          </>
        );
        const { tap } = tile;
        const active = tap !== null && filter === tap;
        return (
          <li key={tile.key} data-profile-tile={tile.key}>
            {tap === null ? (
              <span className={`${TILE_CLASS} block`} style={{ ...SECTION_CARD_STYLE, minHeight: 64 }} aria-label={`${value} ${label}`} role="img">
                {body}
              </span>
            ) : (
              <button
                type="button"
                data-profile-filter={tap}
                aria-pressed={active}
                aria-label={translate(language, active ? 'userProfile.stat.filterClear' : 'userProfile.stat.filterLabel', { name: label })}
                onClick={() => onFilter(tap)}
                className={`${TILE_CLASS} w-full ${FOCUS}`}
                style={{
                  ...SECTION_CARD_STYLE,
                  minHeight: 64,
                  outlineColor: BRAND,
                  boxShadow: active ? `inset 0 0 0 1.5px ${BRAND}` : undefined,
                }}
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
});

// ----------------------------------------------------------- états et bandeaux

