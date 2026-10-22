import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import type { GloryFrameBirdLayout } from '@meeshy/shared/types/glory-frame-format';
import type { FrameRef } from '@meeshy/shared/utils/game/glory-frames';

import { sameRef, tileOf, type GloryChoice, type GloryOffer, type GloryOfferTile, type TilePresence } from '@/lib/game-photo/glory-choice';
import type { GameCatalogKey } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText } from '@/lib/view/game-copy';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * LA BANDE DES CADRES ET LA POSE (#10164, L11, § 1.1 et § 5.12 du prompt des
 * Cadres de gloire) — sous l'aperçu de la caméra, puis sous l'image du résultat :
 * les cadres que la loi partagée propose pour l'étape (jamais un cadre qu'elle
 * refuse : `gloryFramesFor` a déjà passé `canUseFrame`), chacun par sa vignette,
 * son nom et son libellé d'usage (`describeFrameUsage`, #10146), sa PRÉSENCE
 * (prêt, « … à télécharger », « Chargement… », échec avec « Réessayer ») et,
 * quand son carré n'est pas dessiné, « Carré : carte simple » (D1, #10180), et
 * quand il a un support de message, « Avec un mot » (#10165). La carte simple
 * reste un choix : aucun pack n'est obligatoire. Les poses sont
 * celles que le cadre choisi déclare, la sienne cochée par défaut ; un cadre à
 * une seule pose n'en propose pas.
 *
 * Deux groupes radio, tout au clavier ; chaque cible fait 44 pt ; aucun
 * spinner : une tuile absente se charge en silence, la carte simple en
 * attendant.
 */
export type GamePhotoFramePickerProps = {
  readonly offer: GloryOffer;
  readonly choice: GloryChoice;
  readonly presence: (ref: FrameRef) => TilePresence;
  readonly thumb?: ((thumb: PackAssetRef) => Promise<Blob | null>) | undefined;
  readonly onChooseFrame: (ref: FrameRef | null) => void;
  readonly onChoosePose: (pose: GloryFrameBirdLayout | null) => void;
  readonly onRetry: (ref: FrameRef) => void;
};

const POSE_KEYS = {
  pied: 'game.photo.pose.pied',
  perches: 'game.photo.pose.perches',
  cotes: 'game.photo.pose.cotes',
  ruban: 'game.photo.pose.ruban',
  duo: 'game.photo.pose.duo',
  libre: 'game.photo.pose.libre',
  selfie: 'game.photo.pose.selfie',
} as const satisfies Readonly<Record<GloryFrameBirdLayout, GameCatalogKey>>;

const TILE: CSSProperties = { width: 54, aspectRatio: '9 / 16', backgroundColor: 'var(--color-ios-fill)' };

const weightOf = (bytes: number): string => {
  const mega = bytes >= 1_000_000;
  return new Intl.NumberFormat(currentInterfaceLanguage(), { style: 'unit', unit: mega ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(bytes / (mega ? 1_000_000 : 1_000));
};

const presenceText = (tile: GloryOfferTile, presence: TilePresence): string | null => {
  switch (presence) {
    case 'ready':
      return null;
    case 'missing':
      return gameText('game.photo.frame.to_download', { size: weightOf(tile.missingBytes) });
    case 'loading':
      return gameText('game.photo.frame.loading');
    case 'failed':
      return gameText('game.photo.frame.failed');
  }
};

/** La vignette d'une tuile : octets vérifiés par le magasin, URL d'objet révoquée au démontage ; sans image, la tuile reste nommée. */
function Thumb({ thumb, load }: { readonly thumb: PackAssetRef; readonly load: GamePhotoFramePickerProps['thumb'] }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (load === undefined) return;
    let live = true;
    let url: string | null = null;
    void load(thumb)
      .then((blob) => {
        if (!live || blob === null) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [thumb.sha256, load]);
  return src === null ? (
    <span aria-hidden className="block shrink-0 rounded-xl" style={TILE} />
  ) : (
    <img src={src} alt="" decoding="async" className="block shrink-0 rounded-xl object-cover" style={TILE} />
  );
}

function Radio({ attr, checked, onClick, children }: { readonly attr: Readonly<Record<string, string>>; readonly checked: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      {...attr}
      onClick={onClick}
      className="flex shrink-0 flex-col items-center gap-1 rounded-tile p-1 text-center"
      style={{ minHeight: 44, minWidth: 44, outline: checked ? `2px solid ${GAME_BRAND}` : 'none', outlineOffset: -2 }}
    >
      {children}
    </button>
  );
}

export function GamePhotoFramePicker({ offer, choice, presence, thumb, onChooseFrame, onChoosePose, onRetry }: GamePhotoFramePickerProps) {
  const chosen = tileOf(offer, choice.frame);
  const poses = chosen === undefined || chosen.poses.length < 2 ? null : chosen.poses;
  const effectivePose = choice.pose ?? chosen?.defaultPose ?? null;
  return (
    <div data-photo-frame-picker="" className="flex flex-col gap-2">
      {/* Les tuiles s'enroulent : rien ne défile de côté dans Progression (garde `progression-sideways`). */}
      <div role="radiogroup" aria-label={gameText('game.photo.frame.group')} className="flex flex-wrap justify-center gap-2 py-1">
        {offer.tiles.map((tile) => {
          const state = presence(tile.ref);
          const text = presenceText(tile, state);
          return (
            <div key={tile.ref.frameId} className="flex shrink-0 flex-col items-center gap-1">
              <Radio attr={{ 'data-photo-frame-option': tile.ref.frameId }} checked={sameRef(choice.frame, tile.ref)} onClick={() => onChooseFrame(tile.ref)}>
                <Thumb thumb={tile.thumb} load={thumb} />
                <span className="line-clamp-2 text-check font-semibold" style={{ color: GAME_INK, maxWidth: 72 }}>
                  {tile.name}
                </span>
                <span data-photo-frame-usage="" className="line-clamp-2 text-check" style={{ color: GAME_INK_2, maxWidth: 72 }}>
                  {tile.usage}
                </span>
                {tile.squareSimple ? (
                  <span className="text-check" style={{ color: GAME_INK_2 }}>
                    {gameText('game.photo.frame.square_simple')}
                  </span>
                ) : null}
                {tile.message ? (
                  <span data-photo-frame-message="" className="text-check" style={{ color: GAME_INK_2 }}>
                    {gameText('game.photo.frame.with_message')}
                  </span>
                ) : null}
                {text === null ? null : (
                  <span data-photo-frame-presence={tile.ref.frameId} role={state === 'failed' ? 'alert' : undefined} className="text-check font-semibold tabular-nums" style={{ color: state === 'failed' ? GAME_ERROR : GAME_INK_2, maxWidth: 72 }}>
                    {text}
                  </span>
                )}
              </Radio>
              {state === 'failed' ? (
                <button type="button" data-photo-frame-retry={tile.ref.frameId} onClick={() => onRetry(tile.ref)} className="rounded-chip px-2 text-check font-semibold" style={{ minHeight: 44, color: GAME_BRAND }}>
                  {gameText('game.photo.frame.retry')}
                </button>
              ) : null}
            </div>
          );
        })}
        <Radio attr={{ 'data-photo-frame-option': 'simple' }} checked={choice.frame === null} onClick={() => onChooseFrame(null)}>
          <span aria-hidden className="block shrink-0 rounded-xl" style={{ ...TILE, backgroundColor: 'var(--ios-indigo-950)' }} />
          <span className="text-check font-semibold" style={{ color: GAME_INK, maxWidth: 72 }}>
            {gameText('game.photo.frame.simple')}
          </span>
        </Radio>
      </div>
      {poses === null ? null : (
        <div data-photo-pose-picker="" role="radiogroup" aria-label={gameText('game.photo.pose.group')} className="flex flex-wrap gap-2">
          {poses.map((pose) => {
            const checked = pose === effectivePose;
            return (
              <button
                key={pose}
                type="button"
                role="radio"
                aria-checked={checked}
                data-photo-pose-option={pose}
                onClick={() => onChoosePose(pose === chosen?.defaultPose ? null : pose)}
                className="rounded-chip px-3 text-caption font-semibold"
                style={{ minHeight: 44, backgroundColor: checked ? GAME_BRAND : 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)', color: checked ? 'var(--color-ios-surface)' : GAME_BRAND }}
              >
                {gameText(POSE_KEYS[pose])}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
