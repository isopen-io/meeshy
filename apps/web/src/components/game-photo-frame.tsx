import { Flame, GameBird, LevelRing, MeeshCoin, RankBlason, Signature } from '@/components/game';
import { PHOTO_FORMATS, photoLayout, type PhotoFormat, type Rect, type TextLine } from '@/lib/game-photo/layout';
import type { PhotoEmblem, PhotoMoment } from '@/lib/game-photo/moments';
import { RANK_NAMES } from '@/lib/view/game-copy';

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
 * DÉCORATIF (`aria-hidden`) : le dialogue qui l'héberge dit le moment en toutes
 * lettres. Aucune couleur écrite ici : les dessins lisent les jetons du jeu.
 */

const percent = (value: number, of: number): string => `${((value / of) * 100).toFixed(2)}%`;

function PhotoEmblemDrawing({ emblem }: { readonly emblem: PhotoEmblem }) {
  switch (emblem.kind) {
    case 'start':
      return <Signature size={512} color="var(--ios-on-brand)" mode="struck" />;
    case 'rank':
      return <RankBlason rank={emblem.rank} division={emblem.division} size={512} label={RANK_NAMES[emblem.rank]} />;
    case 'tier':
      return <LevelRing level={emblem.level} tier={emblem.tier} progress={1} size={512} showTier />;
    case 'level-hundred':
      return <LevelRing level={100} tier="galaxie" progress={1} size={512} showTier />;
    case 'meesh':
      return <MeeshCoin side="reverse" size={512} edition={emblem.edition} number={emblem.number} numberLabel={`N° ${emblem.number}`} />;
    case 'treasury':
      return <MeeshCoin side="obverse" size={512} edition="silver" />;
    case 'flame':
      return <Flame form={emblem.form} size={512} />;
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

export function GamePhotoFrame({ moment, dateLabel, format }: { readonly moment: PhotoMoment; readonly dateLabel: string; readonly format: PhotoFormat }) {
  const layout = photoLayout(format);
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
      <Placed rect={layout.signature} width={width} height={height}>
        <span data-photo-art="signature" className="game-photo-art">
          <Signature size={256} color="var(--ios-on-brand)" />
        </span>
      </Placed>
    </div>
  );
}
