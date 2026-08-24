'use client';

import {
  memo,
  useMemo,
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import {
  resolveMessageEffectPlan,
  messageEffectClassNames,
  messageEffectOverlays,
} from '@/lib/message-effects';
import { rainbowCometStyle } from '@/lib/rainbow-sweep';

/**
 * Applique les effets d'un message sur le web.
 *
 * Avant ce composant, `effectFlags` était persisté par le gateway, transporté
 * par REST et par socket, exposé dans `@meeshy/shared/types` — et rendu par
 * personne : le web était le seul client à ignorer complètement les effets. Un
 * message envoyé avec des confettis depuis iOS arrivait inerte dans le
 * navigateur.
 *
 * **Un effet d'apparition joue une fois par AFFICHAGE À L'ÉCRAN**, pas une fois
 * par message — l'horloge du flou qui se déclenche à l'ouverture, pas celle du
 * compteur éphémère qui part à la réception. Une animation CSS ne rejouant
 * qu'au montage, un `IntersectionObserver` fournit ici l'équivalent du
 * `onAppear` d'iOS : quand la bulle ressort puis revient dans le viewport, les
 * classes d'apparition sont retirées puis reposées à la frame suivante, ce qui
 * relance l'animation sans jamais remonter `children` (un remontage
 * réinitialiserait le DOM de la bulle — lecture vidéo, sélection de texte).
 */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Réarme les animations d'apparition à chaque retour dans le viewport.
 *
 * `armed` passe à `false` le temps d'une frame : c'est ce trou qui permet au
 * navigateur de repartir de zéro. Sans lui, retirer et reposer la classe dans
 * le même commit React ne relancerait rien.
 */
function useReplayOnVisible(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [run, setRun] = useState(0);
  const [armed, setArmed] = useState(true);
  const isVisible = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (!entry.isIntersecting) {
          isVisible.current = false;
          return;
        }
        if (isVisible.current) return;
        isVisible.current = true;
        setArmed(false);
        requestAnimationFrame(() => {
          setArmed(true);
          setRun((r) => r + 1);
        });
      },
      { threshold: 0.01 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, run, armed };
}

const CONFETTI_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316', '#EC4899'];
const FIREWORK_COLORS = ['#6366F1', '#818CF8', '#EAB308', '#F97316', '#FFFFFF'];
const OVERLAY_WRAPPER = 'pointer-events-none absolute inset-0 overflow-visible z-[2]';

const ConfettiOverlay = memo(function ConfettiOverlay() {
  // Tirées une seule fois par montage : un re-render ne doit pas relancer une
  // gerbe différente au milieu de l'animation.
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        key: i,
        left: `${Math.random() * 100}%`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: `${Math.random() * 0.3}s`,
        drift: `${(Math.random() - 0.5) * 60}px`,
        spin: `${Math.random() * 720 - 360}deg`,
      })),
    [],
  );

  return (
    <div className={OVERLAY_WRAPPER} aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.key}
          className="msg-fx-confetti-particle"
          style={
            {
              left: p.left,
              backgroundColor: p.color,
              animationDelay: p.delay,
              '--msg-fx-drift': p.drift,
              '--msg-fx-spin': p.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});

const FireworksOverlay = memo(function FireworksOverlay() {
  const sparks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const distance = 40 + Math.random() * 40;
        return {
          key: i,
          color: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
          dx: `${Math.cos(angle) * distance}px`,
          dy: `${Math.sin(angle) * distance}px`,
        };
      }),
    [],
  );

  return (
    <div className={OVERLAY_WRAPPER} aria-hidden="true">
      {sparks.map((s) => (
        <span
          key={s.key}
          className="msg-fx-firework-spark"
          style={
            {
              backgroundColor: s.color,
              '--msg-fx-dx': s.dx,
              '--msg-fx-dy': s.dy,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});

/**
 * Le point chaud qui court le long du contour d'une bulle `rainbow`.
 *
 * Un SVG plutôt qu'un `conic-gradient` étroit, pour la même raison que le
 * pendant iOS trace sa comète avec `Shape.trim` plutôt qu'avec un
 * `AngularGradient` : un balayage angulaire file vite sur les côtés courts
 * d'une bulle et lentement sur les longs, donc sa vitesse apparente
 * dépendrait de la longueur du message.
 *
 * `pathLength={1}` est la clé : il renormalise le périmètre du tracé à 1, ce
 * qui rend `stroke-dasharray` et `stroke-dashoffset` directement exprimés en
 * FRACTIONS du contour — les mêmes que celles de `RainbowSweep` côté Swift. Le
 * raccord se reboucle tout seul, sans le découpage en deux segments que
 * `Shape.trim` impose là-bas.
 *
 * `overflow: visible` laisse le halo déborder du cadre, comme le halo flouté
 * d'iOS déborde de la bulle.
 */
function RainbowComet() {
  return (
    <svg
      className="msg-fx-rainbow-comet"
      style={rainbowCometStyle() as CSSProperties}
      aria-hidden="true"
      focusable="false"
    >
      <rect className="msg-fx-comet-halo" x="0" y="0" width="100%" height="100%" rx="16" pathLength={1} />
      <rect className="msg-fx-comet-core" x="0" y="0" width="100%" height="100%" rx="16" pathLength={1} />
    </svg>
  );
}

export interface MessageEffectsProps {
  /** Bitfield persisté par le gateway (`Message.effectFlags`). */
  effectFlags?: number | null;
  className?: string;
  children: ReactNode;
}

export const MessageEffects = memo(function MessageEffects({
  effectFlags,
  className,
  children,
}: MessageEffectsProps) {
  const reduceMotion = usePrefersReducedMotion();
  const plan = useMemo(
    () => resolveMessageEffectPlan(effectFlags, { reduceMotion }),
    [effectFlags, reduceMotion],
  );

  const hasAppearance = plan.appearance.length > 0;
  const { ref, run, armed } = useReplayOnVisible(hasAppearance);

  // L'écrasante majorité des messages n'a aucun effet : pas de wrapper du tout.
  if (plan.isEmpty) return <>{children}</>;

  const persistentClasses = messageEffectClassNames({ ...plan, appearance: [] });
  const appearanceClasses = messageEffectClassNames({ ...plan, persistent: [] });
  const overlays = messageEffectOverlays(plan);
  // La comète est un effet PERSISTANT, pas une apparition : elle ne passe donc
  // pas par `messageEffectOverlays`, qui ne sert que les particules one-shot,
  // et elle n'est pas armée par l'IntersectionObserver. Sous `reduceMotion` le
  // plan retire `animatesPersistent` : le spectre posé reste, la comète ne naît
  // pas — le message perd son mouvement, pas son intention.
  const hasComet = plan.persistent.includes('rainbow') && plan.animatesPersistent;

  return (
    <div
      ref={ref}
      className={cn('relative', persistentClasses, armed && appearanceClasses, className)}
    >
      {children}
      {hasComet && <RainbowComet />}
      {armed &&
        overlays.map((kind) =>
          kind === 'confetti' ? (
            <ConfettiOverlay key={`confetti-${run}`} />
          ) : (
            <FireworksOverlay key={`fireworks-${run}`} />
          ),
        )}
    </div>
  );
});
