import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Avatar } from '@/components/avatar';
import { FeedCarouselChrome, FeedCarouselDots } from '@/components/feed-carousel-chrome';
import { Sheet } from '@/components/sheet';
import { userImagesOf, type AdminUserImage } from '@/lib/admin/user-images';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import { adminUserMediaQueryOptions } from '@/lib/api/admin-user-media';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import { useSnapCarousel } from '@/lib/view/use-snap-carousel';

import { AdminAbsence, AdminSkeleton } from './admin-parts';

/**
 * **LES IMAGES D'UN MEMBRE, EN CARROUSEL** (#7845 F) — sa photo, sa bannière,
 * puis ce qu'il a publié ou envoyé. La SOURCE est pure (`userImagesOf`) ; ce
 * composant ne fait que la montrer.
 *
 * ## Une bande à défilement ACCROCHÉ, pilotée de trois façons
 *
 * Le doigt fait défiler la bande (`scroll-snap-type: x mandatory`), les
 * flèches du chrome partagé avec le fil (`FeedCarouselChrome`) et les flèches
 * du CLAVIER avancent d'une diapositive. Les trois convergent sur UN index,
 * tenu par `useSnapCarousel` — le MÊME mécanisme que le carrousel de scènes
 * du fil : le défilement au doigt le recalcule AU REPOS, les deux autres le
 * posent, et les `scroll` de leur propre animation ne le recalculent pas (une
 * première rédaction locale les laissait ramener la bande à la première
 * diapositive). Un index par mode d'entrée ferait annoncer « 2 sur 5 » au
 * lecteur d'écran pendant que l'œil voit la troisième.
 *
 * Seule la diapositive COURANTE est opérable : les autres sont `inert`, hors
 * de l'ordre de tabulation — vingt images n'ajoutent pas vingt arrêts
 * invisibles au clavier.
 *
 * ## « Aucune image » est un FAIT, pas un état de chargement
 *
 * Tant que la page de médias court, un squelette ; si elle échoue, l'absence
 * dit « indisponible ». La plaque « aucune image » n'apparaît que sur une
 * réponse RÉUSSIE et vide — sinon elle affirmerait sur le membre un fait que
 * l'écran ne connaît pas.
 *
 * ## Aucune requête de plus que l'onglet Médias
 *
 * Il lit `adminUserMediaQueryOptions(…, 0)`, la MÊME clé et la MÊME fonction
 * que la première page de l'onglet : ouvrir l'onglet après le carrousel ne
 * relit rien.
 *
 * ## Jamais d'image cassée
 *
 * Un média protégé n'y entre pas (ses URL sont nulles, voir `user-images.ts`).
 * Une image dont le fichier ne répond pas — purgée, déplacée — se remplace par
 * une plaque qui porte son NOM : une icône d'image cassée dirait « bug » là où
 * la vérité est « ce fichier n'est plus là ».
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';

function libelleDe(image: AdminUserImage, language: InterfaceLanguage): string {
  if (image.kind === 'avatar') return translateAdmin(language, 'admin.carousel.avatar');
  if (image.kind === 'banner') return translateAdmin(language, 'admin.carousel.banner');
  return image.label === '' ? translateAdmin(language, 'admin.carousel.title') : image.label;
}

export function AdminUserImageCarousel({
  membre,
  language,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
}) {
  const medias = useQuery(adminUserMediaQueryOptions(deps, membre.id, 0));
  const images = userImagesOf(membre, medias.data?.medias ?? []);
  const [ouverte, setOuverte] = useState<AdminUserImage | null>(null);
  const { current: courante, trackRef: bande, step, trackHandlers } = useSnapCarousel<HTMLUListElement>(images.length);
  const titre = translateAdmin(language, 'admin.carousel.title');

  const photo = participantAvatarOf(membre);

  return (
    <section aria-labelledby="admin-carousel-title" className="grid gap-2" data-admin-carousel>
      <h2 id="admin-carousel-title" className="ps-1 text-caption font-semibold" style={{ color: INK2 }}>
        {titre}
      </h2>

      {images.length === 0 && medias.isPending ? (
        <AdminSkeleton rows={1} />
      ) : images.length === 0 && medias.isError ? (
        <AdminAbsence language={language} unavailable="admin.carousel.unavailable" />
      ) : images.length === 0 ? (
        <div
          className="flex items-center gap-3 rounded-card px-4 py-4"
          style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' }}
          data-admin-carousel-empty
        >
          <Avatar
            initials={initialsOf(membre.displayName)}
            color={BRAND}
            size={44}
            name={membre.displayName}
            {...(photo === undefined ? {} : { src: photo })}
          />
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.carousel.empty')}
          </p>
        </div>
      ) : (
        <div>
          <div
            role="region"
            aria-roledescription="carousel"
            aria-label={titre}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              step(event.key === 'ArrowRight' ? 1 : -1, event.currentTarget);
            }}
            className="relative overflow-hidden rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', outlineColor: BRAND }}
          >
            <ul
              ref={bande}
              {...trackHandlers}
              className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
            >
              {images.map((image, index) => (
                <Diapositive
                  key={image.id}
                  image={image}
                  label={`${index + 1}/${images.length} — ${libelleDe(image, language)}`}
                  plate={libelleDe(image, language)}
                  current={index === courante}
                  openLabel={translateAdmin(language, 'admin.carousel.open')}
                  onOpen={() => setOuverte(image)}
                />
              ))}
            </ul>
            <FeedCarouselChrome
              page={courante}
              count={images.length}
              labels={{
                previous: translateAdmin(language, 'admin.carousel.previous'),
                next: translateAdmin(language, 'admin.carousel.next'),
              }}
              onPrevious={() => step(-1, bande.current ?? document.documentElement)}
              onNext={() => step(1, bande.current ?? document.documentElement)}
            />
          </div>
          <FeedCarouselDots page={courante} count={images.length} accent={BRAND} />
          <p className="sr-only" aria-live="polite" data-admin-carousel-position>
            {translateAdmin(language, 'admin.carousel.position', {
              index: String(courante + 1),
              count: String(images.length),
            })}
          </p>
        </div>
      )}

      {ouverte === null ? null : (
        <Sheet
          title={libelleDe(ouverte, language)}
          bodyAs="div"
          closeLabel={translateAdmin(language, 'admin.carousel.close')}
          onClose={() => setOuverte(null)}
        >
          <div className="grid min-h-0 flex-1 place-items-center p-4" data-admin-carousel-full={ouverte.id}>
            <img
              src={ouverte.src}
              alt={libelleDe(ouverte, language)}
              className="max-h-full max-w-full object-contain"
              decoding="async"
            />
          </div>
        </Sheet>
      )}
    </section>
  );
}

function Diapositive({
  image,
  label,
  plate,
  current,
  openLabel,
  onOpen,
}: {
  readonly image: AdminUserImage;
  readonly label: string;
  /** Ce que la plaque d'une image absente affiche — jamais vide. */
  readonly plate: string;
  readonly current: boolean;
  readonly openLabel: string;
  readonly onOpen: () => void;
}) {
  const [absente, setAbsente] = useState(false);

  return (
    <li
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      data-admin-carousel-slide={image.id}
      className="relative w-full shrink-0 snap-center"
      {...(current ? { 'aria-current': 'true' } : { inert: true, 'aria-hidden': 'true' })}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${openLabel} — ${label}`}
        tabIndex={current ? 0 : -1}
        data-admin-carousel-open={image.id}
        className="block size-full focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ outlineColor: BRAND }}
      >
        {absente ? (
          <span className="grid size-full place-items-center px-6 text-center text-caption" style={{ color: INK2 }}>
            {plate}
          </span>
        ) : (
          <img
            src={image.thumb}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setAbsente(true)}
            className={`size-full ${image.kind === 'avatar' ? 'object-contain' : 'object-cover'}`}
            style={{ color: INK }}
          />
        )}
      </button>
    </li>
  );
}
