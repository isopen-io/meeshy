import { Flame, GameBird, LeagueGem, LevelRing, MeeshCoin, RankBlason, Signature, Trophy } from '@/components/game';
import { flameForm } from '@meeshy/shared/utils/game/flame';

import { PHOTO_FORMATS, photoLayout, type BannerLayout, type PhotoFormat, type Rect, type TextLine } from '@/lib/game-photo/layout';
import type { PhotoEmblem, PhotoMoment } from '@/lib/game-photo/moments';
import { fitBannerLine, type PhotoReferral } from '@/lib/game-photo/referral';
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
 * a un lien : la Signature, « Rejoins-moi sur Meeshy », le lien court et la
 * Flamme — la même mise en page que l'image finale (`layout.banner`). Sans lien,
 * le cadre est celui d'avant.
 *
 * DÉCORATIF (`aria-hidden`) : le dialogue qui l'héberge dit le moment en toutes
 * lettres. Aucune couleur écrite ici : les dessins lisent les jetons du jeu.
 */

const percent = (value: number, of: number): string => `${((value / of) * 100).toFixed(2)}%`;

function PhotoEmblemDrawing({ emblem }: { readonly emblem: PhotoEmblem }) {
  switch (emblem.kind) {
    case 'start':
      return <Signature size={512} color="var(--ios-on-brand)" mode="struck" />;
    case 'rank':
      return <RankBlason rank={emblem.rank} division={emblem.division} size={512} label={rankName(emblem.rank)} />;
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
const MONO_ADVANCE = 0.62;

/** Une ligne du bandeau, alignée à gauche (`center` : centrée sur `x`), à la taille de la mise en page. */
function BannerLine({ line, width, height, text, size, weight, tone, center = false, mono = false, dashed = false }: { readonly line: TextLine; readonly width: number; readonly height: number; readonly text: string; readonly size: number; readonly weight: number; readonly tone: string; readonly center?: boolean; readonly mono?: boolean; readonly dashed?: boolean }) {
  return (
    <p
      {...(dashed ? { 'data-photo-banner-placeholder': '' } : {})}
      className="game-photo-text"
      style={{
        insetInline: 'auto',
        left: percent(line.x, width),
        top: percent(line.y - line.size, height),
        transform: center ? 'translateX(-50%)' : undefined,
        textAlign: center ? 'center' : 'start',
        fontSize: `${((size / width) * 100).toFixed(2)}cqw`,
        fontWeight: weight,
        fontFamily: mono ? 'ui-monospace, monospace' : undefined,
        ...(dashed ? { outline: '1px dashed currentColor', outlineOffset: '0.3em', borderRadius: '0.2em' } : {}),
        color: tone,
      }}
    >
      {text}
    </p>
  );
}

function ReferralBanner({ banner, referral, width, height }: { readonly banner: BannerLayout; readonly referral: PhotoReferral; readonly width: number; readonly height: number }) {
  const headline = fitBannerLine({ text: gameText('game.photo.referral.headline'), size: banner.headline.size, maxWidth: banner.maxTextWidth, minSize: banner.headline.size * 0.6, advance: SANS_ADVANCE });
  const link = fitBannerLine({ text: referral.display, size: banner.link.size, maxWidth: banner.maxTextWidth, minSize: banner.link.size * 0.7, advance: MONO_ADVANCE });
  const form = referral.flameDays === null ? null : flameForm(referral.flameDays);
  const radius = `${(((banner.frame.h * 0.2) / width) * 100).toFixed(2)}cqw`;
  return (
    <>
      <span
        data-photo-banner=""
        style={{
          position: 'absolute',
          left: percent(banner.frame.x, width),
          top: percent(banner.frame.y, height),
          width: percent(banner.frame.w, width),
          height: percent(banner.frame.h, height),
          borderRadius: radius,
          backgroundColor: 'color-mix(in srgb, var(--ios-indigo-950) 86%, transparent)',
        }}
      />
      <BannerLine line={banner.headline} width={width} height={height} text={headline.text} size={headline.size} weight={800} tone="var(--ios-on-brand)" />
      <BannerLine line={banner.link} width={width} height={height} text={link.text} size={link.size} weight={500} tone="var(--ios-indigo-200)" mono dashed={referral.placeholder === true} />
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
            center
          />
        </>
      )}
    </>
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
  const layout = photoLayout(format, { banner: referral !== null });
  const { width, height } = PHOTO_FORMATS[format];
  return (
    <div
      aria-hidden="true"
      data-photo-frame={format}
      className="game-photo-frame"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', aspectRatio: `${width} / ${height}` }}
    >
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
  );
}
