import { useId, type ReactNode } from 'react';

import type { MascotMood, MascotMoment } from '@meeshy/shared/utils/mascot';

import { mascotSay } from '@/lib/view/mascot-copy';

import '@/styles/mascot.css';

/**
 * MEE, LE COLIBRI MESSAGER (#8907, personnage tranché par le porteur dans
 * #8908) — il porte les messages d'une langue à l'autre et célèbre en vol
 * stationnaire. La loi (`@meeshy/shared/utils/mascot`) décide QUAND il compte,
 * invite ou célèbre ; ce fichier ne fait que le dessiner.
 *
 * Trois déclinaisons d'UN même dessin, qui partagent la géométrie ci-dessous :
 *  - `aquarelle` (défaut) : aplats doux, bords qui bavent, grain de papier —
 *    le coach dans l'app ;
 *  - `glyph` : un seul trait épais à `currentColor`, lisible jusqu'à 16 px —
 *    notifications, pastilles, conseils en ligne ;
 *  - `realiste` : plumage irisé indigo vers émeraude, gorge rubis, ailes
 *    floutées — accueil et grandes célébrations.
 *
 * Le dessin est `aria-hidden` : c'est la bulle de `MascotCoach` qui parle au
 * lecteur d'écran. Filtres et dégradés portent un identifiant PAR INSTANCE
 * (`useId`) : deux mascottes sur une page ne se volent pas leurs définitions.
 * Le mouvement (`data-mascot-motion`, `styles/mascot.css`) n'existe que sous
 * `prefers-reduced-motion: no-preference`, et il est fini.
 */

export type MascotVariant = 'aquarelle' | 'glyph' | 'realiste';

const GEOMETRY = {
  body: 'M62 31 C46 36 34 52 34 65 C34 74 42 77 50 71 C62 63 74 55 80 47 C85 40 77 29 62 31 Z',
  back: 'M62 31 C50 35 40 46 37 58 C46 48 58 40 76 36 C74 32 68 30 62 31 Z',
  beak: 'M85 35.5 L117 32 L85.5 41.5 Z',
  gorget: 'M66 46 C71 57 82 55 86.5 44 C80 47.5 72 47.5 66 46 Z',
  belly: 'M40 66 C44 58 54 52 64 50 C58 58 50 66 42 71 Z',
  tail: 'M41 68 L21 91 L32 86 L27 99 L47 74 Z',
  wing: 'M58 40 C44 23 43 7 55 2 C64 12 66 28 62 42 Z',
  wingBack: 'M54 42 C37 31 30 17 36 10 C46 18 54 30 58 42 Z',
  sparkle: 'M20 18 l2.6 6 6 2.6 -6 2.6 -2.6 6 -2.6 -6 -6 -2.6 6 -2.6 z',
  flame: 'M74 2 q-8 9 -4.5 14.5 q-5.5 -2 -5.5 -7 q-7 11 3.5 18 h12.5 q9 -9 -6 -25.5 z',
  happyEye: 'M74.5 38 q4 -5 8 0',
} as const;

const HEAD = { cx: 74, cy: 39, r: 13 } as const;
const EYE = { cx: 78.5, cy: 37 } as const;

const INK = 'var(--ios-indigo-950)';
const COIN = 'var(--ios-meesh-silver)';
const GOLD = 'var(--ios-warning)';
const ON_INK = 'var(--ios-on-brand)';

const CELEBRATES: ReadonlySet<MascotMood> = new Set(['cheer', 'minting']);

type Parts = { readonly mood: MascotMood; readonly uid: string };

const happy = (mood: MascotMood): boolean => CELEBRATES.has(mood);

function Coin({ filter }: { readonly filter?: string }) {
  return (
    <g data-mascot-coin data-mascot-motion="coin" {...(filter !== undefined ? { filter } : {})}>
      <circle cx="112" cy="20" r="9" fill={COIN} />
      <circle cx="112" cy="20" r="6" fill="none" stroke={ON_INK} strokeWidth="1.6" opacity="0.75" />
      <text x="112" y="23.5" textAnchor="middle" fontSize="9" fontWeight="800" fill={INK}>
        M
      </text>
    </g>
  );
}

function PaintedEyes({ mood, stroke }: { readonly mood: MascotMood; readonly stroke: number }) {
  return happy(mood) ? (
    <path data-mascot-eyes="happy" d={GEOMETRY.happyEye} fill="none" stroke={INK} strokeWidth={stroke} strokeLinecap="round" />
  ) : (
    <g data-mascot-eyes="open">
      <circle cx={EYE.cx} cy={EYE.cy} r="3.8" fill={INK} />
      <circle cx={EYE.cx + 1.2} cy={EYE.cy - 1.3} r="1.2" fill={ON_INK} />
    </g>
  );
}

function PaintedExtras({ mood, filter }: { readonly mood: MascotMood; readonly filter?: string }) {
  const filtered = filter !== undefined ? { filter } : {};
  return (
    <>
      {mood === 'cheer' || mood === 'ready' ? <path d={GEOMETRY.sparkle} fill={GOLD} {...filtered} /> : null}
      {mood === 'streak' ? <path data-mascot-flame d={GEOMETRY.flame} fill={GOLD} {...filtered} /> : null}
      {mood === 'minting' ? <Coin {...(filter !== undefined ? { filter } : {})} /> : null}
    </>
  );
}

function Aquarelle({ mood, uid }: Parts) {
  const wash = `${uid}-lavis`;
  const filter = `url(#${wash})`;
  return (
    <>
      <defs>
        <filter id={wash} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={3} seed={7} result="bruit" />
          <feDisplacementMap in="SourceGraphic" in2="bruit" scale={3.5} xChannelSelector="R" yChannelSelector="G" result="bave" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={3} result="papier" />
          <feColorMatrix in="papier" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -0.9 1.05" result="grain" />
          <feComposite in="bave" in2="grain" operator="arithmetic" k1={0.35} k2={0.7} k3={0} k4={0} result="teinte" />
          <feComposite in="teinte" in2="bave" operator="in" />
        </filter>
      </defs>
      <g filter={filter}>
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <path d={GEOMETRY.wingBack} fill="#99f6e4" opacity="0.55" />
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <path d={GEOMETRY.tail} fill="#2dd4bf" opacity="0.85" />
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <path d={GEOMETRY.body} fill="#5eead4" opacity="0.9" />
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <path d={GEOMETRY.back} fill="#818cf8" opacity="0.75" />
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <path d={GEOMETRY.belly} fill="#f0fdfa" opacity="0.8" />
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <circle {...HEAD} fill="#818cf8" opacity="0.9" />
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <path d={GEOMETRY.gorget} fill="#fb7185" opacity="0.9" />
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <path d={GEOMETRY.beak} fill="#3f3d63" />
        {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
        <path d={GEOMETRY.wing} fill="#a7f3d0" opacity="0.85" />
      </g>
      <PaintedEyes mood={mood} stroke={2.6} />
      <PaintedExtras mood={mood} filter={filter} />
    </>
  );
}

function Realiste({ mood, uid }: Parts) {
  const plume = `${uid}-plume`;
  const crown = `${uid}-tete`;
  const ruby = `${uid}-gorge`;
  const feather = `${uid}-aile`;
  const blur = `${uid}-battement`;
  return (
    <>
      <defs>
        <linearGradient id={plume} x1="0" y1="0" x2="1" y2="1">
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="0" stopColor="#4f46e5" />
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="0.45" stopColor="#0ea5a4" />
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id={crown} x1="0" y1="0" x2="1" y2="1">
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="0" stopColor="#6366f1" />
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
        <radialGradient id={ruby} cx="0.6" cy="0.3" r="0.8">
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="0" stopColor="#fb7185" />
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="0.6" stopColor="#e11d48" />
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="1" stopColor="#881337" />
        </radialGradient>
        <linearGradient id={feather} x1="0" y1="1" x2="0" y2="0">
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="0" stopColor="#115e59" />
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="0.6" stopColor="#5eead4" />
          {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
          <stop offset="1" stopColor="#ccfbf1" />
        </linearGradient>
        <filter id={blur} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={1.6} />
        </filter>
      </defs>
      <path d={GEOMETRY.wingBack} fill={`url(#${feather})`} opacity="0.45" filter={`url(#${blur})`} />
      {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
      <path d={GEOMETRY.tail} fill="#115e59" />
      <path d={GEOMETRY.body} fill={`url(#${plume})`} />
      {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
      <path d={GEOMETRY.belly} fill="#e0f2f1" opacity="0.75" />
      {/* harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome */}
      <path d="M48 52 q6 -2 10 0 M44 58 q6 -2 10 0 M52 46 q5 -2 9 0" fill="none" stroke="#99f6e4" strokeWidth="0.8" opacity="0.55" />
      <circle {...HEAD} fill={`url(#${crown})`} />
      <path d={GEOMETRY.gorget} fill={`url(#${ruby})`} />
      <path d={GEOMETRY.beak} fill={INK} />
      <path d={GEOMETRY.wing} fill={`url(#${feather})`} opacity="0.92" />
      <path
        d="M60 40 C52 28 50 16 54 6 M61 38 C57 28 57 18 58 9 M59 39 C49 30 46 20 48 11"
        fill="none"
        // harmony-exempt: plumage peint du colibri, une teinte d'illustration et non du chrome
        stroke="#0f766e"
        strokeWidth="0.7"
        opacity="0.6"
      />
      <PaintedEyes mood={mood} stroke={2.4} />
      <PaintedExtras mood={mood} />
    </>
  );
}

function Glyph({ mood }: Parts) {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g strokeWidth="6">
        <path d="M86 36 L114 33" />
        <path d="M85 42 C82 52 72 56 62 60 C52 64 44 72 38 70 C33 68 35 56 44 46 C50 38 58 32 66 29 C76 26 86 30 86 38" />
        <path d="M40 70 L25 88 M40 70 L33 94" />
        <path d="M58 38 C48 26 47 12 55 5 C62 13 64 26 62 38" />
      </g>
      {happy(mood) ? (
        <path data-mascot-eyes="happy" d="M73.5 38.5 q3.5 -4.5 7 0" strokeWidth="3.6" />
      ) : (
        <circle data-mascot-eyes="open" cx="77" cy="37" r="2" strokeWidth="3.2" />
      )}
      {mood === 'cheer' || mood === 'ready' ? <path d="M20 14 v14 M13 21 h14" strokeWidth="5" /> : null}
      {mood === 'streak' ? (
        <path data-mascot-flame d="M76 4 q-8 9 -3 16 q-4 -1 -5 -5 q-5 9 4 13 h9 q7 -8 -5 -24 z" strokeWidth="4.5" />
      ) : null}
      {mood === 'minting' ? (
        <g data-mascot-coin data-mascot-motion="coin">
          <circle cx="112" cy="19" r="8" strokeWidth="5" />
        </g>
      ) : null}
    </g>
  );
}

const DRAWINGS: Record<MascotVariant, (parts: Parts) => ReactNode> = {
  aquarelle: Aquarelle,
  glyph: Glyph,
  realiste: Realiste,
};

export function Mascot({
  mood,
  variant = 'aquarelle',
  size = 72,
}: {
  readonly mood: MascotMood;
  readonly variant?: MascotVariant;
  readonly size?: number;
}) {
  const uid = `mee${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const Drawing = DRAWINGS[variant];
  return (
    <svg
      width={size}
      height={Math.round((size * 100) / 120)}
      viewBox="0 0 120 100"
      aria-hidden="true"
      focusable="false"
      data-mascot-mood={mood}
      data-mascot-variant={variant}
      className="shrink-0 overflow-visible"
    >
      <g {...(happy(mood) ? { 'data-mascot-motion': 'hop' } : {})}>
        <Drawing mood={mood} uid={uid} />
      </g>
    </svg>
  );
}

/**
 * Le colibri et sa bulle. La clé rejoue le mouvement à chaque nouvelle ligne :
 * une célébration qui succède à une autre saute à nouveau, au lieu de rester
 * figée sur la dernière image de la précédente.
 */
export function MascotCoach({ moment }: { readonly moment: MascotMoment }) {
  return (
    <section data-mascot-coach className="flex items-center gap-3 px-1">
      <Mascot key={JSON.stringify(moment.line)} mood={moment.mood} />
      <p
        role="status"
        aria-live="polite"
        className="flex-1 rounded-card px-3 py-2.5 text-body"
        style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)' }}
      >
        {mascotSay(moment.line)}
      </p>
    </section>
  );
}
