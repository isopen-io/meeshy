import { Flame, GameBird, LeagueGem, LevelRing, MeeshCoin, RankBlason, Signature, Trophy } from '@/components/game';
import { flameForm } from '@meeshy/shared/utils/game/flame';

import { useMemo } from 'react';

import { PHOTO_FORMATS, photoLayout, type BannerLayout, type PhotoFormat, type Rect, type TextLine } from '@/lib/game-photo/layout';
import type { PhotoEmblem, PhotoMoment } from '@/lib/game-photo/moments';
import { fitBannerLine, type PhotoReferral } from '@/lib/game-photo/referral';
import { QR_DARK, QR_LIGHT, qrPath, referralQr } from '@/lib/game-photo/referral-qr';
import { interfaceDirection } from '@/lib/inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { formatCount, gameText, rankName } from '@/lib/view/game-copy';
import { trophyView } from '@/lib/view/game-copy-v2';

import '@/styles/game-photo.css';

/**
 * LE CADRE EN SURIMPRESSION (#9382) — conception, partie VI : « emblème en
 * haut, titre et date, Mee et Meo en bas ». Le MÊME cadre se pose sur l'aperçu
 * de la caméra et sert de SOURCE aux dessins de l'image finale : la composition
 * relit les quatre emplacements `data-photo-art` (`lib/game-photo/art.ts`), si
 * bien que « le cadre est le même dessin partout ».
 *
 * La mise en page est celle de `layout.ts`, en fractions de la largeur : le
 * cadre qu'on voit au moment de déclencher est celui qu'on obtient. L'emblème
 * est sa propre pièce (`data-game-coin-flip` et son revers), pour que Mee et
 * Meo le « frappent en place » avec la chorégraphie de la frappe.
 *
 * Le BANDEAU DE PARRAINAGE (#7742) se pose au pied du cadre quand l'utilisateur
 * a un lien : la Signature, « Rejoins-moi sur Meeshy », la Flamme et le lien en
 * CARRÉ QR (#9554) — la même mise en page que l'image finale (`layout.banner`),
 * et le MÊME carré (`referralQr` : une matrice, deux peintres). Le lien ne
 * s'écrit plus. Sans jeton, le carré est un emplacement VIDE en pointillé. Sans
 * lien, le cadre est celui d'avant.
 *
 * DÉCORATIF : tout le dessin vit sous UNE couche `aria-hidden`, le dialogue qui
 * l'héberge dit le moment en toutes lettres. Le carré QR est la seule pièce qui
 * s'annonce — il est donc posé HORS de cette couche. Aucune couleur écrite ici,
 * sauf les deux du carré : un QR se lit sombre sur clair dans les deux thèmes.
 */

const percent = (value: number, of: number): string => `${((value / of) * 100).toFixed(2)}%`;

function PhotoEmblemDrawing({ emblem }: { readonly emblem: PhotoEmblem }) {
  switch (emblem.kind) {
    case 'start':
      return <Signature size={512} color="var(--ios-on-brand)" mode="struck" />;
    case 'rank':
      return <RankBlason rank={emblem.rank} division={emblem.division} mythic={emblem.mythic} size={512} label={rankName(emblem.rank)} />;
    case 'tier':
      return <LevelRing level={emblem.level} tier={emblem.tier} progress={1} size={512} showTier />;
    case 'level-hundred':
      return <LevelRing level={100} tier="galaxie" progress={1} size={512} showTier />;
    case 'meesh':
      return <MeeshCoin side="reverse" size={512} edition={emblem.edition} number={emblem.number} numberLabel={gameText('game.mint.number_label', { number: formatCount(emblem.number) })} />;
    case 'treasury':
      return <MeeshCoin side="obverse" size={512} edition="silver" />;
    case 'flame':
      return <Flame form={emblem.form} size={512} />;
    case 'achievement':
      return <Trophy kind="league" material="gold" size={512} />;
    case 'trophy': {
      const view = trophyView(emblem.trophyKey);
      return <Trophy kind={view?.kind ?? 'league'} size={512} {...(view?.material === undefined ? {} : { material: view.material })} {...(view === null ? {} : { label: view.plate })} />;
    }
    case 'league-up':
      return <LeagueGem league={emblem.league} size={512} />;
    case 'season':
      return <Trophy kind="season" size={512} label={gameText('game.trophy.plate.season', { number: formatCount(emblem.season) })} />;
    case 'prestige':
      return <Trophy kind="prestige" size={512} label={gameText('game.trophy.plate.prestige', { number: formatCount(emblem.number) })} />;
  }
}

function Placed({ rect, width, height, children }: { readonly rect: Rect; readonly width: number; readonly height: number; readonly children: React.ReactNode }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: percent(rect.x, width),
        top: percent(rect.y, height),
        width: percent(rect.w, width),
        height: percent(rect.h, height),
      }}
    >
      {children}
    </span>
  );
}

function Line({ line, width, height, tone, weight, children }: { readonly line: TextLine; readonly width: number; readonly height: number; readonly tone: string; readonly weight: number; readonly children: React.ReactNode }) {
  return (
    <p
      className="game-photo-text"
      style={{ top: percent(line.y - line.size, height), fontSize: `${((line.size / width) * 100).toFixed(2)}cqw`, fontWeight: weight, color: tone }}
    >
      {children}
    </p>
  );
}

const SANS_ADVANCE = 0.58;

/** Une ligne du bandeau, ancrée sur `x` par son début de ligne (`center` : centrée sur `x`), à la taille de la mise en page. */
function BannerLine({ line, width, height, text, size, weight, tone, rtl, center = false }: { readonly line: TextLine; readonly width: number; readonly height: number; readonly text: string; readonly size: number; readonly weight: number; readonly tone: string; readonly rtl: boolean; readonly center?: boolean }) {
  const anchoredRight = rtl && !center;
  return (
    <p
      className="game-photo-text"
      style={{
        insetInline: 'auto',
        ...(anchoredRight ? { right: percent(width - line.x, width) } : { left: percent(line.x, width) }),
        top: percent(line.y - line.size, height),
        transform: center ? 'translateX(-50%)' : undefined,
        textAlign: center ? 'center' : anchoredRight ? 'right' : 'left',
        fontSize: `${((size / width) * 100).toFixed(2)}cqw`,
        fontWeight: weight,
        color: tone,
      }}
    >
      {text}
    </p>
  );
}

const placed = (rect: Rect, width: number, height: number) => ({
  position: 'absolute' as const,
  left: percent(rect.x, width),
  top: percent(rect.y, height),
  width: percent(rect.w, width),
  height: percent(rect.h, height),
});

function ReferralBanner({ banner, referral, width, height }: { readonly banner: BannerLayout; readonly referral: PhotoReferral; readonly width: number; readonly height: number }) {
  const headline = fitBannerLine({ text: gameText('game.photo.referral.headline'), size: banner.headline.size, maxWidth: banner.maxTextWidth, minSize: banner.headline.size * 0.6, advance: SANS_ADVANCE });
  const form = referral.flameDays === null ? null : flameForm(referral.flameDays);
  const radius = `${(((banner.frame.h * 0.2) / width) * 100).toFixed(2)}cqw`;
  const rtl = banner.direction === 'rtl';
  return (
    <>
      <span
        data-photo-banner=""
        style={{
          ...placed(banner.frame, width, height),
          borderRadius: radius,
          backgroundColor: 'color-mix(in srgb, var(--ios-indigo-950) 86%, transparent)',
        }}
      />
      <BannerLine line={banner.headline} width={width} height={height} text={headline.text} size={headline.size} weight={800} tone="var(--ios-on-brand)" rtl={rtl} />
      {referral.placeholder !== true ? null : (
        <span
          data-photo-banner-placeholder=""
          style={{ ...placed(banner.qr, width, height), boxSizing: 'border-box', border: `${((banner.qr.w * 0.02) / width * 100).toFixed(2)}cqw dashed var(--ios-indigo-200)` }}
        />
      )}
      {form === null || referral.flameDays === null ? null : (
        <>
          <Placed rect={banner.flame} width={width} height={height}>
            <span data-photo-art="flame" className="game-photo-art">
              <Flame form={form} size={256} />
            </span>
          </Placed>
          <BannerLine
            line={banner.flameDays}
            width={width}
            height={height}
            text={gameText('game.photo.referral.flame_days', { days: formatCount(referral.flameDays) })}
            size={banner.flameDays.size}
            weight={600}
            tone="var(--ios-on-brand)"
            rtl={rtl}
            center
          />
        </>
      )}
    </>
  );
}

/** Le lien en carré QR : les rectangles de l'image exportée, dans une vue à ses pixels. Seule pièce du cadre qui s'annonce. */
function ReferralQr({ slot, referral, width, height }: { readonly slot: Rect; readonly referral: PhotoReferral; readonly width: number; readonly height: number }) {
  const square = useMemo(() => referralQr(referral, slot.w), [referral, slot.w]);
  if (square === null) return null;
  return (
    <span data-photo-banner-qr="" role="img" aria-label={gameText('game.photo.referral.qr_label')} style={placed(slot, width, height)}>
      <svg aria-hidden="true" viewBox={`0 0 ${square.side} ${square.side}`} shapeRendering="crispEdges" style={{ display: 'block', width: '100%', height: '100%' }}>
        <rect width={square.side} height={square.side} fill={QR_LIGHT} />
        <path d={qrPath(square)} fill={QR_DARK} />
      </svg>
    </span>
  );
}

export function GamePhotoFrame({
  moment,
  dateLabel,
  format,
  referral = null,
}: {
  readonly moment: PhotoMoment;
  readonly dateLabel: string;
  readonly format: PhotoFormat;
  /** Le lien de parrainage et la Flamme (#7742) ; `null` : le cadre n'a pas de bandeau. */
  readonly referral?: PhotoReferral | null;
}) {
  const layout = photoLayout(format, { banner: referral !== null, rtl: interfaceDirection(currentInterfaceLanguage()) === 'rtl' });
  const { width, height } = PHOTO_FORMATS[format];
  return (
    <div
      data-photo-frame={format}
      className="game-photo-frame"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', aspectRatio: `${width} / ${height}` }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, color-mix(in srgb, var(--ios-indigo-950) 55%, transparent), transparent 40%, transparent 35%, color-mix(in srgb, var(--ios-indigo-950) 70%, transparent))',
          }}
        />
        <Placed rect={layout.emblem} width={width} height={height}>
          <span data-game-coin-flip="" style={{ position: 'relative', display: 'block', width: '100%', height: '100%' }}>
            <span data-game-face-wrap="reverse" style={{ display: 'block', width: '100%', height: '100%' }}>
              <span data-photo-art="emblem" className="game-photo-art">
                <PhotoEmblemDrawing emblem={moment.emblem} />
              </span>
            </span>
            <span data-game-shockwave="" style={{ position: 'absolute', inset: 0 }} />
          </span>
        </Placed>

        <Line line={layout.kicker} width={width} height={height} tone="var(--ios-indigo-200)" weight={600}>
          {moment.kicker}
        </Line>
        <Line line={layout.title} width={width} height={height} tone="var(--ios-on-brand)" weight={700}>
          {moment.title}
        </Line>
        <Line line={layout.date} width={width} height={height} tone="var(--ios-indigo-200)" weight={500}>
          {dateLabel}
        </Line>

        <Placed rect={layout.mee} width={width} height={height}>
          <span data-game-actor="mee" style={{ display: 'block', width: '100%', height: '100%' }}>
            <span data-photo-art="mee" className="game-photo-art">
              <GameBird bird="meeGuide" size={512} />
            </span>
          </span>
        </Placed>
        <Placed rect={layout.meo} width={width} height={height}>
          <span data-game-actor="meo" style={{ display: 'block', width: '100%', height: '100%' }}>
            <span data-photo-art="meo" className="game-photo-art">
              <GameBird bird="meoGuide" size={512} flip />
            </span>
          </span>
        </Placed>
        {layout.banner === undefined || referral === null ? null : <ReferralBanner banner={layout.banner} referral={referral} width={width} height={height} />}
        <Placed rect={layout.signature} width={width} height={height}>
          <span data-photo-art="signature" className="game-photo-art">
            <Signature size={256} color="var(--ios-on-brand)" />
          </span>
        </Placed>
      </div>
      {layout.banner === undefined || referral === null ? null : <ReferralQr slot={layout.banner.qr} referral={referral} width={width} height={height} />}
    </div>
  );
}
