'use client';

import { memo, useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  resolveMessageEffectPlan,
  messageEffectClassNames,
  messageEffectOverlays,
  type AppearanceEffect,
} from '@/lib/message-effects';

/**
 * Applique les effets d'un message, une seule fois, sur le web.
 *
 * Avant ce composant, `effectFlags` était persisté par le gateway, transporté
 * par REST et par socket, exposé dans `@meeshy/shared/types` — et rendu par
 * personne : le web était le seul client à ignorer complètement les effets. Un
 * message envoyé avec des confettis depuis iOS arrivait inerte dans le
 * navigateur.
 *
 * Le « une seule fois » est porté par un `Set` de `messageId` au niveau du
 * module, et non par un `useState` local : React démonte et remonte librement
 * les lignes d'une liste virtualisée, et un état local rejouerait l'effet à
 * chaque retour à l'écran. Le `Set` est borné en FIFO — un message assez vieux
 * pour en sortir est hors écran depuis longtemps.
 */

const PLAYED_LIMIT = 500;
const playedIds = new Set<string>();
const playedOrder: string[] = [];

function hasPlayed(messageId: string): boolean {
  return playedIds.has(messageId);
}

function markPlayed(messageId: string): void {
  if (!messageId || playedIds.has(messageId)) return;
  playedIds.add(messageId);
  playedOrder.push(messageId);
  while (playedOrder.length > PLAYED_LIMIT) {
    const evicted = playedOrder.shift();
    if (evicted !== undefined) playedIds.delete(evicted);
  }
}

/** Exposé pour les tests — remet la mémoire « déjà joué » à zéro. */
export function __resetMessageEffectPlayback(): void {
  playedIds.clear();
  playedOrder.length = 0;
}

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

const CONFETTI_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316', '#EC4899'];
const FIREWORK_COLORS = ['#6366F1', '#818CF8', '#EAB308', '#F97316', '#FFFFFF'];

const OVERLAY_WRAPPER = 'pointer-events-none absolute inset-0 overflow-visible z-[2]';

const ConfettiOverlay = memo(function ConfettiOverlay() {
  // Les particules sont tirées une seule fois : un re-render ne doit pas
  // relancer une gerbe différente au milieu de l'animation.
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

function ParticleOverlay({ kind }: { kind: AppearanceEffect }) {
  if (kind === 'confetti') return <ConfettiOverlay />;
  if (kind === 'fireworks') return <FireworksOverlay />;
  return null;
}

export interface MessageEffectsProps {
  /** Bitfield persisté par le gateway (`Message.effectFlags`). */
  effectFlags?: number | null;
  /** Identifiant du message — c'est lui qui porte le « une seule fois ». */
  messageId: string;
  className?: string;
  children: ReactNode;
}

export const MessageEffects = memo(function MessageEffects({
  effectFlags,
  messageId,
  className,
  children,
}: MessageEffectsProps) {
  const reduceMotion = usePrefersReducedMotion();

  // Lu UNE fois par montage : marquer le message comme joué ne doit pas
  // re-rendre le composant et couper l'animation en cours.
  const alreadyPlayedRef = useRef<boolean | null>(null);
  if (alreadyPlayedRef.current === null) {
    alreadyPlayedRef.current = hasPlayed(messageId);
  }

  const plan = useMemo(
    () =>
      resolveMessageEffectPlan(effectFlags, {
        hasPlayedAppearance: alreadyPlayedRef.current ?? false,
        reduceMotion,
      }),
    [effectFlags, reduceMotion],
  );

  useEffect(() => {
    if (!plan.isEmpty) markPlayed(messageId);
  }, [plan.isEmpty, messageId]);

  // L'écrasante majorité des messages n'a aucun effet : pas de wrapper du tout.
  if (plan.isEmpty) return <>{children}</>;

  const overlays = messageEffectOverlays(plan);

  return (
    <div className={cn('relative', messageEffectClassNames(plan), className)}>
      {children}
      {overlays.map((kind) => (
        <ParticleOverlay key={kind} kind={kind} />
      ))}
    </div>
  );
});
