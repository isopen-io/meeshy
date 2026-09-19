import { memo, type ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { GroupedSection, SECTION_CARD_STYLE } from '@/components/grouped-section';
import { DISCOVER_GLYPHS } from '@/components/glyphs-discover';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import { attachmentSrc } from '@/lib/api/media-url';
import type { PublicProfile, PublicProfileStats } from '@/lib/api/public-profile';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { ProfileActionKind, ProfileRelation } from '@/lib/profile/relation';
import type { ProfilePostsFilter, ProfilePostsFilterTap } from '@/lib/profile/posts-filter';
import { initialsOf } from '@/lib/view/conversation';

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

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';
/**
 * LE REMPLISSAGE DE MARQUE EST `--ios-indigo-600`, pas `--color-ios-brand`
 * (#7083) — et c'est une MESURE : l'indigo de marque bascule avec le schéma et
 * rend 4,47 contre le blanc (sous AA, dans les deux schémas), là où l'indigo
 * 600 rend au-delà de 4,5. Même jeton que la pastille de « Découvrir »
 * (`discover-parts.tsx` § `BRAND_FILL`) : un bouton PLEIN se peint avec lui,
 * un bouton de CONTOUR garde l'encre de marque.
 */
const BRAND_FILL = 'var(--ios-indigo-600)';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
/** MÊME encre de marque que « Découvrir » et les titres de section : elle
 * bascule avec le schéma, et c'est elle qui tient AA dans les deux. */
const BRAND_INK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';

// ------------------------------------------------------------------ l'identité

/**
 * LA BANNIÈRE, L'AVATAR CHEVAUCHANT, LE NOM, LE PSEUDO — `bigCollapsibleHeader`
 * (`UserProfileSheet+Header.swift:24-151`). Sans image, iOS peint un DÉGRADÉ DE
 * L'ACCENT (`defaultBannerGradient`, `:78-112`) : la fiche d'un compte sans
 * bannière reste une fiche, pas un rectangle vide.
 *
 * **LA PRÉSENCE N'Y EST PAS** (`+Header.swift:139-143`), et c'est mesuré : le
 * port ne décode ni `isOnline` ni `lastActiveAt`, et la requête ne demande
 * jamais `expand=presence`. La loi du 2026-08-25 masque la présence hors amitié
 * acceptée ; un client qui ne décode rien ne peut pas fabriquer un point vert.
 *
 * **LA BANNIÈRE EST À LIRE, PAS À TOUCHER** dans ce lot : iOS l'ouvre en plein
 * écran, mais brancher le visualiseur ici tirerait un chunk de plus sur un
 * écran dont le poids se mesure pour la première fois. Issue compagnon — et
 * c'est déjà ce que `/me` fait.
 */
export const ProfileHero = memo(function ProfileHero({
  profile,
  name,
  accent,
}: {
  readonly profile: PublicProfile;
  readonly name: string;
  readonly accent: string;
}) {
  return (
    <section data-user-hero aria-label={name} className="grid justify-items-center">
      <div data-user-banner className="relative w-full overflow-hidden rounded-card" style={{ height: 120 }}>
        {profile.banner === null ? (
          <span
            aria-hidden="true"
            className="block size-full"
            style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 42%, transparent), color-mix(in srgb, ${accent} 12%, transparent))` }}
          />
        ) : (
          <img src={attachmentSrc(profile.banner)} alt="" className="block size-full object-cover" />
        )}
      </div>
      <span className="block rounded-chip" style={{ marginTop: -45, padding: 4, backgroundColor: 'var(--color-ios-surface)' }}>
        <Avatar initials={initialsOf(name)} color={accent} size={90} name={name} {...(profile.avatar === null ? {} : { src: profile.avatar })} />
      </span>
      <div className="grid max-w-full justify-items-center gap-0.5 pt-2 text-center">
        <p className="max-w-full break-words text-screen font-bold" style={{ color: INK }}>
          {name}
        </p>
        {/* LE PSEUDO EST TEINTÉ PAR LA MARQUE, PAS PAR L'ACCENT — et c'est un
            écart ASSUMÉ avec iOS (`+Header.swift:134-137`). L'accent est
            DÉRIVÉ de l'identifiant (`authorAccentColor`) : il prend n'importe
            quelle teinte, et il en existe qui tombent sous AA sur fond de
            carte (mesuré : 4,22 en sombre). Un texte que le lecteur ne lit pas
            n'est pas une identité, c'est un défaut. L'accent reste peint là où
            il ne porte aucun texte — le dégradé de bannière et l'avatar. */}
        <p className={`text-body font-medium ${BRAND_INK}`}>{`@${profile.username}`}</p>
        {profile.bio === null ? null : (
          <p className="max-w-prose whitespace-pre-wrap pt-1.5 text-body" style={{ color: INK }}>
            {profile.bio}
          </p>
        )}
      </div>
    </section>
  );
});

// ----------------------------------------------------------- l'action relationnelle

type ActionTone = 'brand' | 'success' | 'muted' | 'danger' | 'warning';

const ACTIONS = {
  add: { label: 'discover.connection.add', aria: 'discover.connection.addLabel', tone: 'brand' },
  accept: { label: 'discover.connection.contact', aria: 'discover.connection.acceptLabel', tone: 'success' },
  reject: { label: 'discover.connection.blocked', aria: 'discover.connection.rejectLabel', tone: 'muted' },
  cancel: { label: 'discover.connection.pending', aria: 'discover.connection.cancelLabel', tone: 'muted' },
  write: { label: 'userProfile.action.write', aria: 'userProfile.action.writeLabel', tone: 'brand' },
  block: { label: 'userProfile.action.block', aria: 'userProfile.action.blockLabel', tone: 'danger' },
  unblock: { label: 'discover.blocked.unblock', aria: 'discover.blocked.unblockLabel', tone: 'warning' },
} as const satisfies Readonly<Record<ProfileActionKind, { readonly label: InterfaceCatalogKey; readonly aria: InterfaceCatalogKey; readonly tone: ActionTone }>>;

/* Accepter et refuser portent leur PROPRE libellé — « Contact » et « Bloqué »
   sont les états, pas les gestes. iOS les nomme « Accepter la connexion » /
   « Refuser la connexion » ; la v3.1 réutilise les libellés d'aria de
   « Découvrir », déjà traduits, et peint le VERBE court sur le bouton. */
const ACTION_LABELS = {
  accept: 'discover.connection.acceptLabel',
  reject: 'discover.connection.rejectLabel',
  cancel: 'discover.connection.cancelLabel',
} as const satisfies Partial<Readonly<Record<ProfileActionKind, InterfaceCatalogKey>>>;

const TONE_COLOR: Readonly<Record<ActionTone, string>> = {
  brand: BRAND,
  success: 'var(--color-success)',
  muted: INK_2,
  danger: 'var(--color-error)',
  warning: 'var(--color-warning)',
};

const ACTION_GLYPH: Readonly<Record<ProfileActionKind, ReactNode>> = {
  add: <GlyphSvg glyph={DISCOVER_GLYPHS.userPlus} size={14} />,
  accept: <Glyph name="check" size={14} />,
  reject: <Glyph name="x" size={14} />,
  cancel: <Glyph name="x" size={14} />,
  write: <GlyphSvg glyph={PROFILE_GLYPHS.envelopeSimple} size={14} />,
  block: <GlyphSvg glyph={DISCOVER_GLYPHS.handPalm} size={14} />,
  unblock: <GlyphSvg glyph={DISCOVER_GLYPHS.handPalm} size={14} />,
};

/**
 * Le VERBE court du bouton : iOS peint une phrase (« Demande de connexion »),
 * la v3.1 garde les libellés déjà traduits de « Découvrir » — même mot, même
 * icône, même couleur de contexte sur les deux surfaces (dimension 6).
 */
const actionText = (language: InterfaceLanguage, kind: ProfileActionKind, name: string): string => {
  if (kind === 'accept' || kind === 'reject' || kind === 'cancel') return translate(language, ACTION_LABELS[kind], { name });
  return translate(language, ACTIONS[kind].label);
};

function ActionButton({
  language,
  kind,
  name,
  disabled,
  onAction,
}: {
  readonly language: InterfaceLanguage;
  readonly kind: ProfileActionKind;
  readonly name: string;
  readonly disabled: boolean;
  readonly onAction: (kind: ProfileActionKind) => void;
}) {
  const tone = TONE_COLOR[ACTIONS[kind].tone];
  const filled = kind === 'add' || kind === 'accept';
  return (
    <button
      type="button"
      data-profile-action={kind}
      disabled={disabled}
      aria-label={translate(language, ACTIONS[kind].aria, { name })}
      onClick={() => onAction(kind)}
      className={`flex w-full items-center justify-center gap-2 rounded-card px-4 text-body font-semibold disabled:opacity-45 ${FOCUS}`}
      style={{
        minHeight: 48,
        outlineColor: tone,
        /* BLANC, jamais la surface : un bouton PLEIN se lit sur sa teinte,
           et `--color-ios-surface` suit le schéma — en sombre il tombait à
           4,45 contre l'indigo de marque (mesuré). Même choix que la pastille
           de « Découvrir » (`discover-parts.tsx`, `text-white`). */
        color: filled ? '#fff' : tone,
        backgroundColor: filled ? (ACTIONS[kind].tone === 'brand' ? BRAND_FILL : tone) : `color-mix(in srgb, ${tone} 12%, transparent)`,
      }}
    >
      <span aria-hidden="true" className="grid place-items-center">
        {ACTION_GLYPH[kind]}
      </span>
      {actionText(language, kind, name)}
    </button>
  );
}

const CONTEXT_KEY = {
  pendingReceived: 'userProfile.context.received',
  pendingSent: 'userProfile.context.sent',
} as const satisfies Partial<Readonly<Record<ProfileRelation['kind'], InterfaceCatalogKey>>>;

function ContextBanner({ language, relation, name }: { readonly language: InterfaceLanguage; readonly relation: ProfileRelation; readonly name: string }) {
  if (relation.kind !== 'pendingReceived' && relation.kind !== 'pendingSent') return null;
  const key = CONTEXT_KEY[relation.kind];
  const waiting = relation.request === null;
  return (
    <p data-profile-context className="flex items-start gap-2 rounded-card px-3.5 py-3 text-caption" style={{ ...SECTION_CARD_STYLE, color: INK_2 }}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: BRAND }}>
        <GlyphSvg glyph={PROFILE_GLYPHS.userPlus} size={14} />
      </span>
      {waiting ? translate(language, 'userProfile.context.pending') : translate(language, key, { name })}
    </p>
  );
}

/**
 * **LES GESTES RELATIONNELS** — `actionButtons` (`+DetailsTab.swift:139-216`),
 * précédés de la bannière de contexte qui répond « connexion de quoi ? » quand
 * la notification d'origine a disparu (`:218-220`).
 *
 * **Elle n'est PAS rendue sur son propre profil** (`+DetailsTab.swift:23`), et
 * **un lecteur sans session y voit une INVITATION à se connecter**, jamais un
 * bouton désactivé : un contrôle inerte est un contrôle qui ment.
 *
 * **Tant que l'identifiant de la demande manque**, les gestes d'une relation en
 * attente sont DÉSACTIVÉS et la bannière le dit — le panier est en vol, et un
 * bouton qui n'aurait rien à envoyer mentirait de la même façon.
 */
export const ProfileRelationSection = memo(function ProfileRelationSection({
  language,
  relation,
  actions,
  name,
  signedIn,
  online,
  awaitingRequest,
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
  readonly awaitingRequest: boolean;
  readonly busy: boolean;
  readonly onAction: (kind: ProfileActionKind) => void;
  readonly onSignIn: () => void;
}) {
  const needsRequest = (kind: ProfileActionKind): boolean => kind === 'accept' || kind === 'reject' || kind === 'cancel';
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
                disabled={busy || !online || (awaitingRequest && needsRequest(kind))}
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
        const active = tile.tap !== null && filter === tile.tap;
        return (
          <li key={tile.key} data-profile-tile={tile.key}>
            {tile.tap === null ? (
              <span className={`${TILE_CLASS} block`} style={{ ...SECTION_CARD_STYLE, minHeight: 64 }} aria-label={`${value} ${label}`} role="img">
                {body}
              </span>
            ) : (
              <button
                type="button"
                data-profile-filter={tile.tap}
                aria-pressed={active}
                aria-label={translate(language, active ? 'userProfile.stat.filterClear' : 'userProfile.stat.filterLabel', { name: label })}
                onClick={() => onFilter(tile.tap === null ? 'posts' : tile.tap)}
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

export function ProfileNotice({
  glyph,
  tone,
  title,
  detail,
  alert,
  action,
}: {
  readonly glyph: 'lock' | 'warningCircle';
  readonly tone: string;
  readonly title: string;
  readonly detail: string;
  readonly alert: boolean;
  readonly action?: { readonly label: string; readonly onAction: () => void };
}) {
  return (
    <div {...(alert ? { role: 'alert' } : {})} className="grid flex-1 content-center justify-items-center gap-3 px-8 text-center">
      <span style={{ color: tone }}>
        <Glyph name={glyph} size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {title}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {detail}
      </p>
      {action === undefined ? null : (
        <button
          type="button"
          data-profile-retry
          onClick={action.onAction}
          className={`grid place-items-center rounded-chip px-5 text-body font-semibold ${FOCUS}`}
          style={{ minHeight: 44, color: '#fff', backgroundColor: BRAND_FILL, outlineColor: BRAND }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ProfileOfflineBanner({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="status" data-profile-offline className="flex items-start gap-3 rounded-card px-3.5 py-3" style={SECTION_CARD_STYLE}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: 'var(--color-warning)' }}>
        <Glyph name="warningCircle" size={18} />
      </span>
      <span className="grid gap-0.5">
        <span className="text-body font-semibold" style={{ color: INK }}>
          {translate(language, 'profile.offline.title')}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {translate(language, 'userProfile.offline.body')}
        </span>
      </span>
    </div>
  );
}

/** Le squelette du CACHE FROID — bannière, avatar, deux lignes d'identité,
 * trois tuiles, deux cartes. Jamais un écran blanc, et jamais peint sur un
 * cache non vide (Cache-First : l'écran ne le monte pas quand il a la donnée). */
export function ProfileSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-profile-skeleton aria-busy="true" aria-label={translate(language, 'userProfile.loading')} className="grid gap-6">
      <div className="grid justify-items-center">
        <span className="block w-full rounded-card" style={{ ...SECTION_CARD_STYLE, height: 120 }} />
        <span className="block rounded-chip" style={{ marginTop: -45, width: 98, height: 98, backgroundColor: 'var(--color-ios-card)' }} />
        <span className="mt-3 block h-4 w-32 rounded-chip" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)' }} />
        <span className="mt-2 block h-3 w-24 rounded-chip" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)' }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((slot) => (
          <span key={slot} className="block rounded-card" style={{ ...SECTION_CARD_STYLE, height: 64 }} />
        ))}
      </div>
      {[0, 1].map((slot) => (
        <span key={slot} className="block rounded-card" style={{ ...SECTION_CARD_STYLE, height: 140 }} />
      ))}
    </div>
  );
}

export function ProfilePostsEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-profile-posts-empty className="grid justify-items-center gap-2 rounded-card px-6 py-8 text-center" style={SECTION_CARD_STYLE}>
      <span aria-hidden="true" style={{ color: INK_2 }}>
        <GlyphSvg glyph={PROFILE_GLYPHS.quotes} size={22} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'userProfile.posts.empty')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, 'userProfile.posts.emptyBody')}
      </p>
    </div>
  );
}

/** UNE PANNE PARTIELLE NE BLANCHIT PAS L'ÉCRAN : le profil et les statistiques
 * restent peints, seul ce bloc porte son erreur et son « Réessayer ». */
export function ProfilePostsError({ language, onRetry }: { readonly language: InterfaceLanguage; readonly onRetry: () => void }) {
  return (
    <div role="alert" className="grid justify-items-center gap-3 rounded-card px-6 py-6 text-center" style={SECTION_CARD_STYLE}>
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={24} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'userProfile.posts.error')}
      </p>
      <button
        type="button"
        data-profile-posts-retry
        onClick={onRetry}
        className={`grid place-items-center rounded-chip px-5 text-body font-semibold ${FOCUS}`}
        style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
      >
        {translate(language, 'profile.retry')}
      </button>
    </div>
  );
}
