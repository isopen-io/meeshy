import { AuthorPlate } from '@/components/game';
import { LottieLayer } from '@/components/lottie-layer';
import type { AuthorPlate as AuthorPlateData } from '@/lib/game-photo/author-plate';
import { plateMotionBytes } from '@/lib/game-photo/author-plate-motion';
import type { PhotoMoment } from '@/lib/game-photo/moments';

import { PhotoEmblemDrawing } from './game-photo-frame';

/**
 * LA CARTE POSÉE (#10816) — constat porteur : « le cadre du premier
 * achievement est moche, prend tout l'écran et ne dit rien sur l'auteur ».
 * La célébration est une CARTE posée au centre du dialogue : bornée
 * (300 px), inclinée d'un degré et demi, une ombre de table ; l'emblème au
 * métal de l'étape, le moment, la date, et la plaque gravée au pseudo de
 * l'auteur, sa photo de profil dans le médaillon.
 *
 * L'animation est la couche Lottie du fini (`plateMotion`), générée, posée SUR
 * la plaque fixe : sous « Réduire les animations », ou si le moteur échoue,
 * rien ne monte et la plaque reste l'état final — jamais un nom caché.
 *
 * Elle se dit en UNE phrase (`role="img"`) : le moment et son auteur ; les
 * dessins dessous sont décoratifs.
 */

const BACKDROP = 'linear-gradient(to bottom, var(--ios-indigo-950), var(--ios-indigo-500))';

export function GameAuthorCard({ moment, plate, dateLabel }: { readonly moment: PhotoMoment; readonly plate: AuthorPlateData; readonly dateLabel: string }) {
  const motion = `author-plate:${plate.finish}`;
  return (
    <div
      role="img"
      aria-label={`${moment.kicker} : ${moment.title} — ${plate.label}`}
      data-author-card={plate.family}
      className="mx-auto flex w-full flex-col items-center gap-2 overflow-hidden rounded-card px-4 pt-5 pb-4"
      style={{
        maxWidth: '300px',
        background: BACKDROP,
        transform: 'rotate(-1.5deg)',
        boxShadow: '0 24px 40px -20px color-mix(in srgb, var(--ios-indigo-950) 80%, transparent)',
      }}
    >
      <span aria-hidden="true" className="game-photo-art" style={{ width: '34%', aspectRatio: '1 / 1' }}>
        <PhotoEmblemDrawing emblem={moment.emblem} />
      </span>
      <span aria-hidden="true" className="text-check font-semibold uppercase tracking-wide" style={{ color: 'var(--ios-indigo-200)' }}>
        {moment.kicker}
      </span>
      <span aria-hidden="true" className="text-center text-title font-bold" style={{ color: 'var(--ios-on-brand)' }}>
        {moment.title}
      </span>
      <span aria-hidden="true" className="text-caption" style={{ color: 'var(--ios-indigo-200)' }}>
        {dateLabel}
      </span>
      <span aria-hidden="true" className="relative mt-1 block w-full" style={{ aspectRatio: '360 / 100' }}>
        <span className="game-photo-art">
          <AuthorPlate plate={plate} width={360} showAvatar />
        </span>
        <LottieLayer key={motion} sourceKey={motion} loop={false} load={async () => plateMotionBytes(plate.finish)} />
      </span>
    </div>
  );
}
