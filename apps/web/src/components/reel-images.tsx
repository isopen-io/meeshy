import { useState } from 'react';
import type { UIEvent } from 'react';

import type { FeedCardMedia } from '@/lib/feed/card-model';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LA GALERIE D'UN RÉEL D'IMAGES (#6457) — chargée À LA DEMANDE par
 * `components/reel-page.tsx` (revue-correction #6484, motif D-54, comme
 * `reel-scene-stage.tsx`) : un lecteur qui ne croise que des réels vidéo ne la
 * télécharge jamais, et son affiche — la première image — tient la page le
 * temps du chunk.
 *
 * Les images se parcourent d'un balayage HORIZONTAL — le vertical reste au
 * fil. Les points disent la page lue, jamais une page supposée.
 */
export default function ReelImages({ images, language }: { readonly images: readonly FeedCardMedia[]; readonly language: InterfaceLanguage }) {
  const [page, setPage] = useState(0);
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.clientWidth > 0) setPage(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  };

  return (
    <>
      <div data-reel-images onScroll={onScroll} className="scrollbar-none absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {images.map((image, i) => (
          <img
            key={image.id}
            src={image.src}
            alt={image.altText ?? translate(language, 'reels.image', { index: String(i + 1), count: String(images.length) })}
            draggable={false}
            decoding="async"
            className="h-full w-full shrink-0 snap-start object-contain"
          />
        ))}
      </div>
      {images.length > 1 ? (
        <div aria-hidden="true" data-reel-image-dots className="pointer-events-none absolute inset-x-0 flex justify-center gap-1.5" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 28px)' }}>
          {images.map((image, i) => (
            <span key={image.id} className="rounded-full" style={{ width: 6, height: 6, backgroundColor: i === page ? 'white' : 'rgba(255,255,255,0.45)' }} />
          ))}
        </div>
      ) : null}
    </>
  );
}
