import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { compactCount } from '@/lib/view/compact-count';

import { useRollingNumber, type RollEnv } from './game/use-rolling-number';
import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';

/**
 * CE QUE CE POST A RAPPORTÉ AU LECTEUR (#9570, directive porteur 2026-10-07 :
 * « de manière discrète, plus discrète que les points des conversations »).
 *
 * « · +99 » dans la ligne de métadonnées, après la date : un point de
 * séparation, un très petit glyphe de points, le nombre — à l'encre tertiaire
 * et à la taille de la date (`text-check`), sans capsule, sans couleur, sans
 * flamme. Ce n'est pas un bouton : trop petit pour une cible de 44 pt, et il
 * n'ouvre rien.
 *
 * La valeur est celle que la passerelle sert (`viewerPoints`), gardée par la
 * loi monotone (`lib/feed/viewer-points.ts`) : jamais devinée ici. Quand un
 * geste la fait monter (`engagement:post-updated`), le nombre ROULE vers sa
 * nouvelle valeur (`useRollingNumber` — sauté sous `prefers-reduced-motion`) ;
 * la phrase lue au lecteur d'écran dit déjà la cible.
 *
 * L'hôte ne la monte que pour une valeur > 0 (`FeedCardModel.viewerPoints`).
 */
export function PostPointsMark({
  points,
  language,
  roll,
}: {
  readonly points: number;
  readonly language?: InterfaceLanguage;
  /** Horloge d'images injectable — un témoin pilote le défilé à la main. */
  readonly roll?: RollEnv;
}) {
  const interfaceLanguage = language ?? currentInterfaceLanguage();
  const shown = useRollingNumber(points, roll);
  const label = translate(interfaceLanguage, points === 1 ? 'engagement.post.points.one' : 'engagement.post.points.other', {
    count: String(points),
  });

  return (
    <span
      data-post-points={points}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-check tabular-nums"
      style={{ color: 'var(--color-ios-ink-3)' }}
    >
      <span aria-hidden="true">·</span>
      <span aria-hidden="true" className="inline-flex items-center gap-px">
        <GlyphSvg glyph={FEED_GLYPHS.sparkle} size={9} />
        <span data-post-points-value>{`+${compactCount(shown, interfaceLanguage)}`}</span>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
