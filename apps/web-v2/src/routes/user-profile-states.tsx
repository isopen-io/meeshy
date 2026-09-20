
import { Glyph, GlyphSvg } from '@/components/glyph';
import {   SECTION_CARD_STYLE } from '@/components/grouped-section';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { ProfilePostsFilter, ProfilePostsFilterTap } from '@/lib/profile/posts-filter';
import { BRAND, BRAND_FILL, BRAND_INK, FOCUS, INK, INK_2 } from './user-profile-style';

/**
 * **LES ÉTATS DU PROFIL PUBLIC** (#7152) — extrait de `user-profile-sections.tsx`, qui
 * atteignait 748 lignes. L'extraction s'est faite par RESPONSABILITÉ, jamais
 * par tranche, et elle PRÉCÈDE l'ajout : ajouter à un fichier déjà en route
 * vers le plafond est ce que le budget du dépôt interdit.
 *
 * Ce qui se peint QUAND IL N'Y A RIEN À PEINDRE vit ensemble.
 */

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

/**
 * **LE VIDE D'UN FILTRE N'EST PAS LE VIDE D'UN COMPTE** — miroir de
 * `filteredEmptyState` (`ProfileUserPostsList.swift:498-510`), et c'est la
 * moitié que le premier jet n'avait pas : « Aucune publication · Rien de public
 * à lire » servi à qui vient de toucher « Réels » est FAUX — la tuile voisine
 * annonce le contraire au même instant. Le texte dit donc ce qui manque
 * VRAIMENT, et il rend son geste : re-toucher la tuile.
 */
const FILTERED_EMPTY = {
  posts: 'userProfile.posts.emptyPosts',
  reels: 'userProfile.posts.emptyReels',
} as const satisfies Readonly<Record<ProfilePostsFilterTap, InterfaceCatalogKey>>;

export function ProfilePostsEmpty({ language, filter }: { readonly language: InterfaceLanguage; readonly filter: ProfilePostsFilter }) {
  const filtered = filter !== 'all';
  return (
    <div
      data-profile-posts-empty={filter}
      className="grid justify-items-center gap-2 rounded-card px-6 py-8 text-center"
      style={SECTION_CARD_STYLE}
    >
      <span aria-hidden="true" style={{ color: INK_2 }}>
        <GlyphSvg glyph={filter === 'reels' ? FEED_GLYPHS.monitorPlay : PROFILE_GLYPHS.quotes} size={22} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, filter === 'all' ? 'userProfile.posts.empty' : FILTERED_EMPTY[filter])}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, filtered ? 'userProfile.posts.emptyFilter' : 'userProfile.posts.emptyBody')}
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
        className={`grid place-items-center rounded-chip px-5 text-body font-semibold ${FOCUS} ${BRAND_INK}`}
        style={{ minHeight: 44, outlineColor: BRAND }}
      >
        {translate(language, 'profile.retry')}
      </button>
    </div>
  );
}

/**
 * **« CHARGER PLUS » VIT ICI, avec l'encre qui le rend lisible** — il portait
 * `--color-ios-brand` (4,47 clair / 4,45 sombre, sous AA dans les deux) dans
 * l'écran, hors de portée de la loi d'encre écrite dans ce fichier. Une
 * teinte de marque qui se peint à DEUX endroits finit toujours par diverger de
 * sa mesure : il n'en reste qu'un.
 *
 * Il s'affiche sous TOUS les filtres (`hasNext` seul) : le filtre est client,
 * la tuile annonce un compte serveur, et le retirer murait la suite.
 *
 * **HORS LIGNE IL SE DÉSARME, comme les trois gestes relationnels au-dessus**
 * (revue #7083, défaut majeur 4). Mesuré au navigateur : coupure réseau, les
 * trois gestes `[data-profile-action]` désactivés, le bandeau hors ligne
 * peint — et ce bouton-ci resté `ACTIF`. Le tap ne changeait alors ni la
 * liste, ni le libellé, ni l'état : TanStack met la page en PAUSE
 * (`networkMode` par défaut), donc l'écran ne passe JAMAIS par `isError`, le
 * seul chemin qui aurait peint « Réessayer ». L'utilisateur touchait un
 * contrôle et l'application se taisait — la loi 4 prise à revers.
 *
 * Le bandeau hors ligne de l'écran dit déjà POURQUOI ; un bouton qui se
 * désarme avec ses voisins, sur la même cause, est la lecture la plus simple
 * (dimension 6 : même écran, même loi pour chaque geste). Le libellé reste
 * « Charger plus » : son inertie est portée par `disabled`, pas par un mot de
 * plus à traduire en sept langues.
 */
export function ProfilePostsMore({
  language,
  loading,
  online,
  onMore,
}: {
  readonly language: InterfaceLanguage;
  readonly loading: boolean;
  readonly online: boolean;
  readonly onMore: () => void;
}) {
  return (
    <button
      type="button"
      data-profile-posts-more
      onClick={onMore}
      disabled={loading || !online}
      className={`mx-auto grid place-items-center rounded-chip px-5 text-body font-semibold disabled:opacity-45 ${FOCUS} ${BRAND_INK}`}
      style={{ minHeight: 44, outlineColor: BRAND }}
    >
      {translate(language, loading ? 'userProfile.posts.loading' : 'userProfile.posts.loadMore')}
    </button>
  );
}

