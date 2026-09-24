import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { Glyph, GlyphSvg, type GlyphShape } from '@/components/glyph';
import { DISCOVER_GLYPHS } from '@/components/glyphs-discover';
import { PROGRESSION_GLYPHS } from '@/components/glyphs-progression';
import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import { translateOnboarding } from '@/lib/i18n-onboarding-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **LES PIÈCES VISUELLES DE L'ACCUEIL** (#7729) — le miroir web de
 * `OnboardingVisuals.swift` et `OnboardingIllustrations.swift` : la pastille
 * de points, la barre de progression, la jauge du premier niveau, les puces,
 * les deux boutons et les six illustrations. Aucune ne porte d'état : l'écran
 * (`onboarding.tsx`) les nourrit.
 *
 * Les animations vivent dans `styles/onboarding.css`, chacune neutralisée
 * sous `prefers-reduced-motion` (un fondu la remplace) ; les illustrations
 * sont décoratives (`aria-hidden`) — le sens est porté par le titre et la
 * phrase de la carte.
 */

/** Le drapeau d'une langue, lu dans la table PARTAGÉE (76 langues) — jamais
 * un drapeau inventé : une langue sans drapeau n'en affiche aucun. */
export const flagOf = (code: string): string => SUPPORTED_LANGUAGES.find((language) => language.code === code)?.flag ?? '';

export function PointsPill({ points, bump, label }: { readonly points: number; readonly bump: boolean; readonly label: string }) {
  return (
    <span data-onb-pill className={bump ? 'onb-pill onb-pill-bump' : 'onb-pill'} aria-label={label} role="img">
      <GlyphSvg glyph={PROGRESSION_GLYPHS.star} size={16} />
      <span className="onb-pill-value" aria-hidden="true">
        {points}
      </span>
    </span>
  );
}

export function ProgressSegments({ position, count, label }: { readonly position: number; readonly count: number; readonly label: string }) {
  return (
    <div className="onb-progress" role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={count} aria-valuenow={position}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={index < position ? 'onb-progress-seg onb-progress-seg-on' : 'onb-progress-seg'}
          data-current={index === position - 1 ? 'true' : undefined}
        />
      ))}
    </div>
  );
}

/**
 * « 0 / 10 pts pour ton niveau 1 » — elle se remplit dans le SENS DE LECTURE :
 * de droite à gauche en arabe (`transform-origin` suit `dir`, `onboarding.css`).
 */
export function LevelGauge({ points, target, lang }: { readonly points: number; readonly target: number; readonly lang: InterfaceLanguage }) {
  const reached = points >= target;
  const fraction = target > 0 ? Math.min(1, points / target) : 1;
  const label = reached
    ? translateOnboarding(lang, 'onboarding.points.level')
    : translateOnboarding(lang, 'onboarding.points.gauge', { points: String(points), target: String(target) });
  return (
    <div data-onb-gauge className="onb-gauge" role="img" aria-label={label}>
      <span className="onb-gauge-label" aria-hidden="true">
        <GlyphSvg glyph={PROGRESSION_GLYPHS.star} size={16} className={reached ? 'onb-gauge-star onb-gauge-star-on' : 'onb-gauge-star'} />
        {label}
      </span>
      <span className="onb-gauge-track" aria-hidden="true">
        <span className="onb-gauge-fill" data-empty={points === 0 ? 'true' : undefined} style={{ transform: `scaleX(${Math.max(0.06, fraction)})` }} />
      </span>
    </div>
  );
}

export function Chip({
  children,
  selected,
  onClick,
  lang,
}: {
  readonly children: ReactNode;
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly lang?: string;
}) {
  return (
    <button type="button" className="onb-chip" aria-pressed={selected} onClick={onClick} {...(lang === undefined ? {} : { lang })}>
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  busy = false,
  id,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly id: string;
}) {
  return (
    <button type="button" data-onb-action={id} className="onb-primary" onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <span className="onb-spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function SecondaryButton({ children, onClick, id }: { readonly children: ReactNode; readonly onClick: () => void; readonly id: string }) {
  return (
    <button type="button" data-onb-action={id} className="onb-secondary" onClick={onClick}>
      {children}
    </button>
  );
}

// --- Les illustrations -------------------------------------------------------

/** 1 — le Prisme, montré en deux secondes : une bulle étrangère se retourne
 * et devient la même phrase dans la langue du lecteur. */
export function PrismIllustration({ lang }: { readonly lang: InterfaceLanguage }) {
  const fromCode = translateOnboarding(lang, 'onboarding.languages.demo.fromCode');
  return (
    <div className="onb-illu onb-prism" aria-hidden="true">
      <div className="onb-prism-flip">
        <div className="onb-prism-face onb-prism-from" lang={fromCode}>
          <span className="onb-prism-flag">{flagOf(fromCode)}</span>
          {translateOnboarding(lang, 'onboarding.languages.demo.from')}
        </div>
        <div className="onb-prism-face onb-prism-to">
          <span className="onb-prism-flag">{flagOf(lang)}</span>
          {translateOnboarding(lang, 'onboarding.languages.demo.to')}
        </div>
      </div>
      <span className="onb-prism-badge">
        <Glyph name="translate" size={16} />
      </span>
    </div>
  );
}

/** 2 — le salon : trois saluts du monde qui arrivent l'un après l'autre. */
export function GlobalIllustration() {
  const bubbles = [
    { who: 'A', color: 'var(--ios-tile-photo)', text: '🇧🇷 👋' },
    { who: 'K', color: 'var(--ios-tile-camera)', text: '🇯🇵 ✨' },
    { who: 'L', color: 'var(--ios-tile-location)', text: '🇳🇬 🎶' },
  ];
  return (
    <div className="onb-illu onb-global" aria-hidden="true">
      <span className="onb-global-orb">
        <GlyphSvg glyph={PROGRESSION_GLYPHS.globe} size={34} />
      </span>
      <div className="onb-global-bubbles">
        {bubbles.map((bubble, index) => (
          <div key={bubble.who} className="onb-global-bubble" style={{ animationDelay: `${index * 180}ms` }}>
            <span className="onb-global-avatar" style={{ background: bubble.color }}>
              {bubble.who}
            </span>
            <span className="onb-global-text">{bubble.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 3 — l'anneau de story qui se remplit autour de l'avatar du lecteur. */
export function StoryIllustration({
  name,
  avatar,
  published,
}: {
  readonly name: string;
  readonly avatar: string | undefined;
  readonly published: boolean;
}) {
  return (
    <div className="onb-illu onb-story" aria-hidden="true">
      <span className="onb-story-ring">
        <span className="onb-story-core">
          <Avatar initials={initialsOf(name)} color={colorForName(name)} size={84} {...(avatar === undefined ? {} : { src: avatar })} />
        </span>
      </span>
      <span className={published ? 'onb-story-plus onb-story-plus-done' : 'onb-story-plus'}>
        <Glyph name={published ? 'check' : 'plus'} size={16} />
      </span>
    </div>
  );
}

/** 4 — la bande : trois portraits qui se rapprochent, et la main tendue. */
export function FriendsIllustration() {
  const faces = [
    { initials: 'AÏ', color: 'var(--ios-tile-photo)' },
    { initials: 'TO', color: 'var(--ios-tile-camera)' },
    { initials: 'LE', color: 'var(--ios-tile-location)' },
  ];
  return (
    <div className="onb-illu onb-friends" aria-hidden="true">
      {faces.map((face, index) => (
        <span key={face.initials} className="onb-friends-face" style={{ background: face.color, animationDelay: `${index * 140}ms` }}>
          {face.initials}
        </span>
      ))}
      <span className="onb-friends-add">
        <GlyphSvg glyph={DISCOVER_GLYPHS.userPlus} size={20} />
      </span>
    </div>
  );
}

/** 5 — la cloche qui tinte une fois. */
export function BellIllustration() {
  return (
    <div className="onb-illu onb-bell" aria-hidden="true">
      <span className="onb-bell-disc">
        <GlyphSvg glyph={SETTINGS_GLYPHS.bellRinging} size={44} />
      </span>
      <span className="onb-bell-dot" />
    </div>
  );
}

/** Récapitulatif — le trophée et ses étincelles. */
export function TrophyIllustration() {
  return (
    <div className="onb-illu onb-trophy" aria-hidden="true">
      <span className="onb-trophy-disc">
        <Glyph name="trophy" size={48} />
      </span>
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className={`onb-spark onb-spark-${index}`} />
      ))}
    </div>
  );
}

export type RecapTile = { readonly id: string; readonly glyph: GlyphShape; readonly text: string; readonly tone?: 'warm' };

export function RecapTiles({ tiles }: { readonly tiles: readonly RecapTile[] }) {
  return (
    <ul className="onb-recap-tiles">
      {tiles.map((tile, index) => (
        <li key={tile.id} className="onb-recap-tile" data-tile={tile.id} data-tone={tile.tone} style={{ animationDelay: `${120 + index * 90}ms` }}>
          <GlyphSvg glyph={tile.glyph} size={22} className="onb-recap-glyph" />
          <span className="onb-recap-text">{tile.text}</span>
        </li>
      ))}
    </ul>
  );
}
