import { useEffect, useRef } from 'react';

/**
 * LE FEU D'ARTIFICE DE L'ARRIVÉE (#8088) — chargé À LA DEMANDE par
 * `arrival-celebration.tsx` (jamais sous `prefers-reduced-motion`), donc hors
 * de la première peinture ET hors du chunk de la page d'arrivée.
 *
 * Un seul `<canvas>`, une seule boucle `requestAnimationFrame` pilotée par le
 * TEMPS écoulé (jamais par le nombre d'images : un écran 120 Hz ne double pas
 * la vitesse), quelques centaines de particules au plus, puis la boucle
 * s'ARRÊTE d'elle-même quand la dernière s'éteint — rien ne tourne après.
 * Une première gerbe éclate AU MONTAGE, sans fusée : la joie arrive avec la
 * session, pas une demi-seconde après.
 * Les couleurs sont les jetons de la marque (`--ios-*`), lus au montage.
 */

const PALETTE_TOKENS = ['--ios-indigo-400', '--ios-purple-500', '--ios-success', '--ios-warning', '--ios-info', '--ios-indigo-600'] as const;
const FALLBACK_COLOR = '#6366F1';
const BURSTS = 7;
const BURST_INTERVAL_MS = 380;
const PARTICLES_PER_BURST = 54;
const ROCKET_MS = 520;
const GRAVITY = 260;
const DRAG = 1.35;
const MAX_DPR = 2;

type Rocket = { x: number; fromY: number; toY: number; age: number; color: string };
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; color: string; size: number };

function palette(host: Element): readonly string[] {
  const style = globalThis.getComputedStyle?.(host);
  const colors = PALETTE_TOKENS.map((token) => style?.getPropertyValue(token).trim() ?? '').filter((c) => c !== '');
  return colors.length > 0 ? colors : [FALLBACK_COLOR];
}

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;

export function ArrivalFireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null || typeof globalThis.requestAnimationFrame !== 'function') return;

    const colors = palette(canvas);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    globalThis.addEventListener('resize', resize);

    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];
    let launched = 0;
    let elapsed = 0;
    let last: number | null = null;
    let frame = 0;

    const launch = () => {
      launched += 1;
      rockets.push({
        x: width * (0.18 + Math.random() * 0.64),
        fromY: height + 8,
        toY: height * (0.16 + Math.random() * 0.3),
        age: 0,
        color: pick(colors),
      });
    };

    const burst = (x: number, y: number, color: string) => {
      const reach = Math.min(width, height) * (0.32 + Math.random() * 0.14);
      for (let i = 0; i < PARTICLES_PER_BURST; i += 1) {
        const angle = (i / PARTICLES_PER_BURST) * Math.PI * 2 + Math.random() * 0.2;
        const speed = reach * (0.55 + Math.random() * 0.6);
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          life: 0.9 + Math.random() * 0.7,
          color: Math.random() < 0.8 ? color : pick(colors),
          size: 1.4 + Math.random() * 1.6,
        });
      }
    };

    const step = (now: number) => {
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt * 1000;
      while (launched < BURSTS && elapsed >= launched * BURST_INTERVAL_MS) launch();

      context.clearRect(0, 0, width, height);

      for (let i = rockets.length - 1; i >= 0; i -= 1) {
        const rocket = rockets[i] as Rocket;
        rocket.age += dt * 1000;
        const t = Math.min(rocket.age / ROCKET_MS, 1);
        const eased = 1 - (1 - t) * (1 - t);
        const y = rocket.fromY + (rocket.toY - rocket.fromY) * eased;
        context.globalAlpha = 0.9;
        context.fillStyle = rocket.color;
        context.fillRect(rocket.x - 1, y, 2, 10);
        if (t >= 1) {
          burst(rocket.x, rocket.toY, rocket.color);
          rockets.splice(i, 1);
        }
      }

      const drag = Math.exp(-DRAG * dt);
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i] as Spark;
        spark.age += dt;
        if (spark.age >= spark.life) {
          sparks.splice(i, 1);
          continue;
        }
        spark.vx *= drag;
        spark.vy = spark.vy * drag + GRAVITY * dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        context.globalAlpha = 1 - spark.age / spark.life;
        context.fillStyle = spark.color;
        context.beginPath();
        context.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;

      if (launched < BURSTS || rockets.length > 0 || sparks.length > 0) {
        frame = globalThis.requestAnimationFrame(step);
      }
    };
    burst(width * 0.5, height * 0.26, pick(colors));
    frame = globalThis.requestAnimationFrame(step);

    return () => {
      globalThis.cancelAnimationFrame(frame);
      globalThis.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-arrival-fireworks
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
