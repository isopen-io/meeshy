import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Glyph } from '@/components/glyph';
import type { AdminDeps } from '@/lib/api/admin';
import { adminUserMediaQueryKey, loadAdminUserMedia } from '@/lib/api/admin-user-media';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import { gallerySlidesOf, stepSlide, type GallerySlide } from '@/lib/admin/user-gallery';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { AdminSection, AdminSkeleton } from './admin-parts';

/**
 * **LE CARROUSEL D'IMAGES D'UN MEMBRE** (#7845) — sa photo, sa bannière et
 * les images qu'il a publiées ou envoyées, sur l'onglet Profil.
 *
 * Il lit la PREMIÈRE page de `GET /admin/users/:userId/media`, sous la même
 * clé que l'onglet Médias : ouvrir l'un après l'autre ne refait pas la
 * requête. Une image protégée reste une diapositive sans image, qui dit
 * qu'elle existe et ne se montre pas.
 *
 * Clavier : les flèches gauche/droite changent d'image (inversées en RTL),
 * les vignettes sont des boutons, et la position se lit « 2 / 7 ».
 */
const INK2 = 'var(--color-ios-ink-2)';

const libelleDe = (diapo: GallerySlide, language: InterfaceLanguage): string => {
  if (diapo.kind !== 'media') return translateAdmin(language, diapo.kind === 'avatar' ? 'admin.gallery.avatar' : 'admin.gallery.banner');
  const source = translateAdmin(language, diapo.media.source === 'message' ? 'admin.media.fromMessage' : 'admin.media.fromPost');
  return diapo.media.originalName === '' ? source : `${diapo.media.originalName} · ${source}`;
};

export function AdminUserGallery({
  membre,
  language,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
}) {
  const [index, setIndex] = useState(0);
  const medias = useQuery({
    queryKey: adminUserMediaQueryKey(membre.id, 0),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserMedia({ ...deps, userId: membre.id, offset: 0, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  const diapos = gallerySlidesOf({ avatar: membre.avatar, banner: membre.banner, medias: medias.data?.medias ?? [] });
  const titre = translateAdmin(language, 'admin.gallery.title');

  if (medias.isPending && diapos.length === 0) {
    return (
      <AdminSection titre={titre}>
        <AdminSkeleton rows={2} />
      </AdminSection>
    );
  }

  if (diapos.length === 0) {
    return (
      <AdminSection titre={titre}>
        <p className="text-caption" style={{ color: INK2 }} data-admin-gallery-empty="">
          {translateAdmin(language, 'admin.gallery.empty')}
        </p>
      </AdminSection>
    );
  }

  const actuel = Math.min(index, diapos.length - 1);
  const diapo = diapos[actuel] ?? diapos[0];
  if (diapo === undefined) return null;
  const aller = (pas: number) => setIndex(stepSlide(actuel, pas, diapos.length));

  return (
    <AdminSection titre={titre}>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={titre}
        data-admin-gallery=""
        tabIndex={0}
        className="grid gap-3 focus-visible:outline-2"
        style={{ outlineColor: 'var(--color-ios-brand)' }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') aller(document.dir === 'rtl' ? -1 : 1);
          if (event.key === 'ArrowLeft') aller(document.dir === 'rtl' ? 1 : -1);
        }}
      >
        <figure
          className="relative m-0 grid aspect-video place-items-center overflow-hidden rounded-card"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }}
          aria-roledescription="slide"
          aria-label={translateAdmin(language, 'admin.gallery.position', { n: String(actuel + 1), total: String(diapos.length) })}
          data-admin-gallery-slide={diapo.id}
        >
          {diapo.url === null ? (
            <span className="text-caption" style={{ color: 'var(--color-danger)' }}>
              {translateAdmin(language, 'admin.media.protected')}
            </span>
          ) : (
            <img src={attachmentSrc(diapo.url)} alt={libelleDe(diapo, language)} decoding="async" className="block size-full object-contain" />
          )}
          {diapos.length > 1 ? (
            <>
              <BoutonPas libelle={translateAdmin(language, 'admin.gallery.previous')} cote="start" onClick={() => aller(-1)} />
              <BoutonPas libelle={translateAdmin(language, 'admin.gallery.next')} cote="end" onClick={() => aller(1)} />
            </>
          ) : null}
          <figcaption
            className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 py-2 text-caption"
            style={{ backgroundColor: 'color-mix(in srgb, black 45%, transparent)', color: 'white' }}
          >
            <span className="truncate">{libelleDe(diapo, language)}</span>
            <span className="shrink-0 tabular-nums" aria-live="polite">
              {actuel + 1} / {diapos.length}
            </span>
          </figcaption>
        </figure>

        {diapos.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {diapos.map((vignette, rang) => (
              <button
                key={vignette.id}
                type="button"
                aria-label={libelleDe(vignette, language)}
                aria-current={rang === actuel ? 'true' : undefined}
                data-admin-gallery-thumb={vignette.id}
                onClick={() => setIndex(rang)}
                className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-chip"
                style={{
                  outline: rang === actuel ? '2px solid var(--color-ios-brand)' : 'none',
                  outlineOffset: 2,
                  backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)',
                }}
              >
                {vignette.url === null ? (
                  <span aria-hidden="true">🔒</span>
                ) : (
                  <img src={attachmentSrc(vignette.url)} alt="" loading="lazy" decoding="async" className="block size-full object-cover" />
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </AdminSection>
  );
}

function BoutonPas({ libelle, cote, onClick }: { readonly libelle: string; readonly cote: 'start' | 'end'; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={libelle}
      data-admin-gallery-step={cote === 'start' ? 'previous' : 'next'}
      onClick={onClick}
      className={`absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full ${cote === 'start' ? 'start-2' : 'end-2'}`}
      style={{ backgroundColor: 'color-mix(in srgb, black 45%, transparent)', color: 'white' }}
    >
      <span className="grid place-items-center rtl:-scale-x-100">
        <span className="grid place-items-center" style={cote === 'end' ? { transform: 'scaleX(-1)' } : {}}>
          <Glyph name="caretLeft" size={18} />
        </span>
      </span>
    </button>
  );
}
