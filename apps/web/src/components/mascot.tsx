import type { MascotMood, MascotMoment } from '@meeshy/shared/utils/mascot';

import { mascotSay } from '@/lib/view/mascot-copy';

import '@/styles/mascot.css';

/**
 * MEE, LA MASCOTTE (#8907) — une bulle de conversation vivante : elle EST
 * Meeshy, on s'y parle en bulles. Le personnage reste provisoire tant que le
 * porteur n'a pas tranché (#8908) ; seul ce dessin changerait, jamais la loi
 * (`@meeshy/shared/utils/mascot`) qui décide quand elle célèbre, compte ou
 * invite à frapper.
 *
 * - Le dessin est `aria-hidden` : c'est la bulle de `MascotCoach` qui parle
 *   au lecteur d'écran, une seule annonce polie.
 * - Couleurs par jetons uniquement : la marque pour le corps, l'argent de la
 *   Meesh pour la pièce, l'ambre de la série pour la flamme.
 * - Le mouvement (`data-mascot-motion`, `styles/mascot.css`) n'existe que
 *   sous `prefers-reduced-motion: no-preference`, et il est fini.
 */

const BODY = 'var(--color-ios-brand)';
const INK_DEEP = 'var(--ios-indigo-900)';
const COIN = 'var(--ios-meesh-silver)';
const FLAME = 'var(--ios-warning)';
const ON_BODY = 'var(--ios-on-brand)';

const CELEBRATES: ReadonlySet<MascotMood> = new Set(['cheer', 'minting']);

function Eyes({ mood }: { readonly mood: MascotMood }) {
  if (CELEBRATES.has(mood)) {
    return (
      <g fill="none" stroke={INK_DEEP} strokeWidth="3.2" strokeLinecap="round">
        <path d="M33 44 q5 -6 10 0" />
        <path d="M57 44 q5 -6 10 0" />
      </g>
    );
  }
  const look = mood === 'counting' ? 2 : 0;
  const pupil = mood === 'ready' ? 4.6 : 3.8;
  return (
    <g>
      <ellipse cx="38" cy="44" rx="7" ry="8" fill={ON_BODY} />
      <ellipse cx="62" cy="44" rx="7" ry="8" fill={ON_BODY} />
      <circle cx={38 + look} cy={45 - look} r={pupil} fill={INK_DEEP} />
      <circle cx={62 + look} cy={45 - look} r={pupil} fill={INK_DEEP} />
    </g>
  );
}

function Mouth({ mood }: { readonly mood: MascotMood }) {
  if (CELEBRATES.has(mood) || mood === 'ready') {
    return <path d="M40 58 q10 12 20 0 z" fill={INK_DEEP} />;
  }
  return <path d="M42 59 q8 6 16 0" fill="none" stroke={INK_DEEP} strokeWidth="3" strokeLinecap="round" />;
}

export function Mascot({ mood, size = 72 }: { readonly mood: MascotMood; readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-mascot-mood={mood}
      className="shrink-0 overflow-visible"
    >
      <g {...(CELEBRATES.has(mood) ? { 'data-mascot-motion': 'hop' } : {})}>
        <path d="M20 78 L14 94 L34 82 Z" fill={BODY} />
        <ellipse cx="50" cy="50" rx="40" ry="36" fill={BODY} />
        <ellipse cx="38" cy="30" rx="12" ry="6" fill={ON_BODY} opacity="0.18" />
        <circle cx="26" cy="58" r="5" fill={ON_BODY} opacity="0.2" />
        <circle cx="74" cy="58" r="5" fill={ON_BODY} opacity="0.2" />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
        {mood === 'guide' ? (
          <path d="M86 40 q10 -8 8 -20" fill="none" stroke={BODY} strokeWidth="7" strokeLinecap="round" />
        ) : null}
        {mood === 'streak' ? <path d="M50 2 q-9 10 -5 16 q-6 -2 -6 -8 q-8 12 4 20 h14 q10 -10 -7 -28 z" fill={FLAME} /> : null}
        {mood === 'ready' ? <path d="M84 12 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 z" fill={COIN} /> : null}
      </g>
      {mood === 'minting' ? (
        <g data-mascot-coin data-mascot-motion="coin">
          <circle cx="82" cy="14" r="12" fill={COIN} />
          <circle cx="82" cy="14" r="8" fill="none" stroke={ON_BODY} strokeWidth="2" opacity="0.7" />
          <text x="82" y="18.5" textAnchor="middle" fontSize="12" fontWeight="800" fill={INK_DEEP}>
            M
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/**
 * La mascotte et sa bulle. La clé rejoue le mouvement à chaque nouvelle ligne :
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
