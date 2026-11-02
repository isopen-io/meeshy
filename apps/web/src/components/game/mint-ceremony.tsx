import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { meeshDisplayEdition, type MeeshEdition } from '@meeshy/shared/utils/game/mint';
import { mintCeremonyPlan, mintRefusalReason, MINT_CEREMONY_STRIKE_READY_MS, type MintCeremonyPlan, type MintRefusalReason } from '@meeshy/shared/utils/game/mint-ceremony';

import { browserDeviceHost, deviceTierOf, tierRank, type DeviceNavigator } from '@/lib/device/capability-tier';
import type { GameBirdKey } from '@/lib/game/birds';
import {
  DEFAULT_TARGET,
  SCENE,
  SCENE_MARKS,
  buildCeremonyParticles,
  ceremonyFrame,
  drawCeremonyParticles,
  type CeremonyCanvas,
  type CeremonyFrame,
  type CeremonyPalette,
  type CeremonyTarget,
} from '@/lib/game/choreography-mint-ceremony';
import { prefersReducedMotion, vibrate, type HapticName } from '@/lib/game/haptics';
import type { StrikeGate } from '@/lib/game/strike-gate';
import { formatGameNumber, loadGameCatalogParts, translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { GameBird } from './game-bird';
import { MeeshCoin } from './meesh-coin';

import '@/styles/game-ceremony.css';

/**
 * LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — la scène plein écran qui part AU TOUCHER : des milliers
 * d'étincelles quittent ta lumière et tissent un cercle en tresse, Mee et Meo y sèment la poussière (argent et un
 * peu d'or ; or pur ; or et diamant), le flan se fige et descend sur l'enclume, Mee pose le coin, Meo lève le
 * marteau — et le garde levé tant que la passerelle n'a pas répondu —, puis la frappe arrive EN DERNIER : la gravure
 * apparaît sous le marteau, la pièce se lève et montre son revers, Mee et Meo la fêtent et elle file dans l'Héritage.
 * Au refus, une Ombre voile le cercle et les étincelles reviennent à ta lumière ; Mee dit ce qui bloque.
 *
 * QUAND : la loi partagée (`mintCeremonyPlan`), que iOS rejoue sur les mêmes vecteurs. COMMENT : l'image de chaque
 * instant (`lib/game/choreography-mint-ceremony.ts`). Cette scène ne fait qu'appliquer : les particules sur un
 * canevas 2D (densité de pixels plafonnée à 2, moitié moins sur un appareil modeste), le reste en `transform` et
 * `opacity`, écrits à chaque image sans rendu React.
 *
 * LA PORTE (`StrikeGate`) apporte la réponse de la passerelle ; la scène l'ouvre quand la pièce arrive dans
 * l'Héritage (le compte se met à jour à son arrivée), ou dès qu'on la passe. Toucher (ou Échap, Entrée, Espace)
 * passe la scène ; « réduire les animations » la réduit à un fondu, une seule vibration.
 *
 * LA LOI ET LE DESSIN (#11483) : la nuit du prisme, les coups, les aïeux et la fête suivent la LOI de la pièce
 * (`edition`) ; sa matière, l'oiseau du revers et les poussières suivent son DESSIN (`meeshDisplayEdition`, lu sur son
 * numéro) — le n° 247 se frappe d'un seul coup, en or. Le toucher qui passe la scène avale le clic qui le suit : il
 * ne retombe pas sur le bouton de frappe resté dessous.
 *
 * DÉCORATIVE (`aria-hidden`) : l'écran qui frappe dit « Meesh n° … frappée, … ».
 */

export type CeremonyClock = {
  readonly now: () => number;
  readonly frame: (run: () => void) => number;
  readonly cancel: (id: number) => void;
};

const browserClock: CeremonyClock = {
  now: () => performance.now(),
  frame: (run) => requestAnimationFrame(run),
  cancel: (id) => cancelAnimationFrame(id),
};

export type MintCeremonyProps = {
  /** La LOI de la pièce (`meeshEdition`) : la nuit, les coups, les aïeux, la fête. Le DESSIN (matière, revers, poussières) se lit sur son numéro (#11483). */
  readonly edition: MeeshEdition;
  /** Le numéro de la pièce en train d'être frappée (l'aperçu) ; la confirmation de la passerelle le remplace. */
  readonly number: number;
  readonly gate: StrikeGate;
  /** Le contenant où la pièce file à la fin (la scène de frappe de l'écran). Absent : vers le haut. */
  readonly target?: () => Element | null;
  readonly onDone: () => void;
  readonly reducedMotion?: boolean;
  readonly modest?: boolean;
  readonly clock?: CeremonyClock;
  readonly haptic?: (name: HapticName) => void;
};

/** Un appareil modeste : un tier de capacité bas ou moyen (W10, `device/capability-tier.ts`). Moitié moins de particules (épopée § 7). */
export const isModestDevice = (host: DeviceNavigator | undefined = browserDeviceHost().navigator): boolean => tierRank(deviceTierOf({ navigator: host })) <= tierRank('mid');

const PARTY: Readonly<Record<MeeshEdition, readonly [GameBirdKey, GameBirdKey]>> = {
  silver: ['meeJoy', 'meoOpen'],
  gold: ['meeCoin', 'meoStar'],
  prism: ['meeCrown', 'meoCrown'],
};

const REFUSAL_KEY = {
  shadow: 'game.frappe.refused.shadow',
  locked: 'game.frappe.refused.locked',
  light: 'game.frappe.refused.light',
  offline: 'game.frappe.refused.offline',
  other: 'game.frappe.refused.unknown',
} as const satisfies Readonly<Record<MintRefusalReason, string>>;

const SAY_KEY = { silver: 'game.frappe.say.silver', gold: 'game.frappe.say.gold', prism: 'game.frappe.say.prism' } as const;

const PARTS = [
  'backdrop',
  'scene',
  'fade',
  'canvas',
  'orb',
  'mee',
  'meeRest',
  'meeParty',
  'meo',
  'meoRest',
  'meoParty',
  'die',
  'hammerMeo',
  'hammerMee',
  'coin',
  'coin3d',
  'blank',
  'obverse',
  'glow',
  'flash',
  'ring',
  'tchak',
  'tchakLight',
  'tchakFinal',
  'rays',
  'sign',
  'say',
  'ombre',
  'glory',
] as const;
type Part = (typeof PARTS)[number];
type Parts = Partial<Record<Part, HTMLElement | null>>;

const readPalette = (root: Element): CeremonyPalette => {
  const style = getComputedStyle(root);
  const token = (name: string): string => style.getPropertyValue(`--ceremony-${name}`).trim();
  const list = (name: string, count: number): readonly string[] => Array.from({ length: count }, (_, i) => token(`${name}-${i}`));
  return { weave: list('weave', 3), iris: list('iris', 7), silver: list('silver', 4), gold: list('gold', 3), diamond: list('diamond', 2), spark: list('spark', 2), ash: token('ash') };
};

const px = (value: number): string => value.toFixed(2);

/** Des images qui tardent (au-delà d'une image à 60 Hz et demie) plusieurs fois de suite : la scène ne peint plus qu'un fil sur deux. */
const SLOW_FRAME_MS = 24;
const SLOW_FRAMES = 4;

const place = (el: HTMLElement | null | undefined, transform: string, opacity?: number): void => {
  if (el === null || el === undefined) return;
  el.style.transform = transform;
  if (opacity !== undefined) el.style.opacity = opacity.toFixed(3);
};

type Live = {
  mode: 'normal' | 'reduced' | 'refused';
  answeredAt: number | null;
  done: boolean;
};

/** Le plan de l'instant : tant que la passerelle n'a pas répondu, les coups restent devant (le marteau reste levé). */
const planOf = (edition: MeeshEdition, look: MeeshEdition, live: Live, nowMs: number, modest: boolean): MintCeremonyPlan => {
  const pending = Math.max(nowMs + 1000, live.mode === 'reduced' ? 0 : MINT_CEREMONY_STRIKE_READY_MS + 1000);
  return mintCeremonyPlan({ edition, look, mode: live.mode, answeredAtMs: live.answeredAt ?? pending, modest });
};

/** Le toucher qui passe la scène la referme aussitôt : le clic qui le suit ne doit pas tomber sur ce qui était dessous (le bouton de frappe). */
const SWALLOW_CLICK_MS = 600;

const swallowNextClick = (): void => {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const timer = setTimeout(() => stop(), SWALLOW_CLICK_MS);
  const stop = (): void => {
    clearTimeout(timer);
    window.removeEventListener('click', swallow, true);
  };
  window.addEventListener('click', swallow, true);
};

export function MintCeremony({ edition, number: shownNumber, gate, target, onDone, reducedMotion, modest: modestProp, clock = browserClock, haptic = (name) => void vibrate(name) }: MintCeremonyProps) {
  const reduced = reducedMotion ?? prefersReducedMotion();
  const modest = modestProp ?? isModestDevice();
  const language = currentInterfaceLanguage();
  const [readyLanguage, setReadyLanguage] = useState<string | null>(null);
  const ready = readyLanguage === language;
  const [number, setNumber] = useState(shownNumber);
  const [refusal, setRefusal] = useState<MintRefusalReason | null>(null);
  const parts = useRef<Parts>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;
  const targetRef = useRef(target);
  targetRef.current = target;
  const firstNumber = useRef(shownNumber).current;
  const look = meeshDisplayEdition(number);
  const year = useRef(new Date().getFullYear()).current;

  useEffect(() => {
    let alive = true;
    loadGameCatalogParts(language, ['frappe']).then(
      () => alive && setReadyLanguage(language),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [language]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    const t0 = clock.now();
    const live: Live = { mode: reduced ? 'reduced' : 'normal', answeredAt: null, done: false };
    const firstLook = meeshDisplayEdition(firstNumber);
    const particles = buildCeremonyParticles(mintCeremonyPlan({ edition, look: firstLook, mode: live.mode, modest }), firstNumber);
    const palette = readPalette(root);
    const canvas = parts.current.canvas instanceof HTMLCanvasElement ? parts.current.canvas : null;
    const ctx = canvas === null ? null : (canvas.getContext('2d') as CeremonyCanvas | null);
    const dpr = Math.min(2, typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
    const view = { k: 1, offX: 0, offY: 0, target: DEFAULT_TARGET as CeremonyTarget };
    const buzzed = new Set<number>();
    let settled = false;
    let raf = 0;
    let lastFinal = false;
    let lastTick = 0;
    let slow = 0;
    let stride: 1 | 2 = 1;

    const layout = (): void => {
      const width = root.clientWidth || window.innerWidth;
      const height = root.clientHeight || window.innerHeight;
      const k = Math.min(width / SCENE.width, height / SCENE.height);
      view.k = k > 0 ? k : 1;
      view.offX = (width - SCENE.width * view.k) / 2;
      view.offY = (height - SCENE.height * view.k) / 2;
      if (canvas !== null) {
        canvas.width = Math.round(SCENE.width * view.k * dpr);
        canvas.height = Math.round(SCENE.height * view.k * dpr);
      }
      const box = targetRef.current?.()?.getBoundingClientRect();
      view.target =
        box === undefined || box.width === 0
          ? DEFAULT_TARGET
          : { x: (box.left + box.width / 2 - view.offX) / view.k, y: (box.top + box.height / 2 - view.offY) / view.k, scale: box.width / view.k / SCENE_MARKS.coinBox };
    };

    const settle = (): void => {
      if (settled) return;
      settled = true;
      gate.settle();
    };
    const finish = (): void => {
      if (live.done) return;
      live.done = true;
      clock.cancel(raf);
      settle();
      doneRef.current();
    };

    const apply = (frame: CeremonyFrame): void => {
      const p = parts.current;
      const k = view.k;
      if (p.backdrop) p.backdrop.style.opacity = frame.backdrop.toFixed(3);
      place(p.scene, `translate(${px(view.offX + frame.shake.x * k)}px,${px(view.offY + frame.shake.y * k)}px) scale(${k.toFixed(4)})`);
      if (p.fade) p.fade.style.opacity = frame.backdrop.toFixed(3);
      place(p.orb, `scale(${frame.orb.toFixed(3)})`);
      place(p.mee, `translate(${px(frame.mee.x)}px,${px(frame.mee.y)}px) rotate(${px(frame.mee.rotate)}deg) scale(${frame.mee.scale.toFixed(3)})`);
      place(p.meo, `translate(${px(frame.meo.x)}px,${px(frame.meo.y)}px) rotate(${px(frame.meo.rotate)}deg) scale(${frame.meo.scale.toFixed(3)})`);
      if (p.meeParty) p.meeParty.style.opacity = frame.mee.pose === 'party' ? '1' : '0';
      if (p.meeRest) p.meeRest.style.opacity = frame.mee.pose === 'party' ? '0' : '1';
      if (p.meoParty) p.meoParty.style.opacity = frame.meo.pose === 'party' ? '1' : '0';
      if (p.meoRest) p.meoRest.style.opacity = frame.meo.pose === 'party' ? '0' : '1';
      place(p.die, `translate(${px(frame.die.x)}px,${px(frame.die.y)}px) scale(1,${frame.die.squash.toFixed(3)})`, frame.die.opacity);
      place(p.hammerMeo, `translate(${px(frame.hammerMeo.x)}px,${px(frame.hammerMeo.y)}px) rotate(${px(frame.hammerMeo.angle)}deg)`, frame.hammerMeo.opacity);
      place(p.hammerMee, `translate(${px(frame.hammerMee.x)}px,${px(frame.hammerMee.y)}px) rotate(${px(frame.hammerMee.angle)}deg)`, frame.hammerMee.opacity);
      const c = frame.coin;
      place(p.coin, `translate(${px(c.x - 75)}px,${px(c.y - 75)}px) scale(${c.scale.toFixed(4)},${(c.scale * c.squash).toFixed(4)})`, c.opacity);
      place(p.coin3d, `rotateY(${c.rotateY.toFixed(1)}deg)`);
      if (p.blank) p.blank.style.opacity = (1 - c.engraved).toFixed(3);
      if (p.obverse) p.obverse.style.opacity = c.engraved.toFixed(3);
      place(p.glow, `translate(${px(frame.glow.x - 120)}px,${px(frame.glow.y - 120)}px) scale(${frame.glow.scale.toFixed(3)})`, frame.glow.opacity);
      if (p.flash) p.flash.style.opacity = frame.flash.toFixed(3);
      place(p.ring, `translate(150px,${px(SCENE_MARKS.anvil.y - 70)}px) scale(${frame.ring.scale.toFixed(3)})`, frame.ring.opacity);
      place(p.tchak, `translate(0px,318px) scale(${frame.tchak.scale.toFixed(3)})`, frame.tchak.opacity);
      if (frame.tchak.final !== lastFinal && p.tchakFinal && p.tchakLight) {
        lastFinal = frame.tchak.final;
        p.tchakFinal.style.display = lastFinal ? '' : 'none';
        p.tchakLight.style.display = lastFinal ? 'none' : '';
      }
      place(p.rays, `translate(${px(c.x - 165)}px,${px(c.y - 165)}px) rotate(${px(frame.rays.rotate)}deg) scale(${frame.rays.scale.toFixed(3)})`, frame.rays.opacity);
      if (p.sign) p.sign.style.opacity = frame.sign.toFixed(3);
      if (p.say) p.say.style.opacity = frame.say.toFixed(3);
      place(p.ombre, `translate(${px(SCENE_MARKS.circle.x - 115)}px,${px(SCENE_MARKS.circle.y - 115)}px) scale(${frame.shadow.scale.toFixed(3)})`, frame.shadow.opacity);
      place(p.glory, `translate(${px(view.target.x - 180)}px,${px(view.target.y - 24 - 40 * frame.glory.rise)}px)`, frame.glory.opacity);
    };

    const tick = (): void => {
      if (live.done) return;
      const nowMs = clock.now() - t0;
      slow = nowMs - lastTick > SLOW_FRAME_MS ? slow + 1 : Math.max(0, slow - 1);
      lastTick = nowMs;
      if (slow >= SLOW_FRAMES) stride = 2;
      const plan = planOf(edition, firstLook, live, nowMs, modest);
      const t = nowMs / 1000;
      if (ctx !== null && plan.mode !== 'reduced') drawCeremonyParticles(ctx, plan, particles, palette, t, view.k * dpr, stride);
      apply(ceremonyFrame(plan, t, view.target));
      plan.strikes.forEach((strike, index) => {
        if (buzzed.has(index) || nowMs < strike.impactMs) return;
        buzzed.add(index);
        if (nowMs - strike.impactMs < 250) hapticRef.current(strike.final ? 'shock' : 'tap');
      });
      const arrived = plan.phases.flight?.toMs ?? (plan.mode === 'reduced' ? plan.phases.reveal?.toMs : undefined);
      if (arrived !== undefined && live.answeredAt !== null && nowMs >= arrived) settle();
      if (nowMs >= plan.endMs && (live.answeredAt !== null || plan.mode === 'refused')) {
        finish();
        return;
      }
      raf = clock.frame(tick);
    };

    const leave = gate.onAnswer((answer) => {
      if (live.done || answer.kind === 'idle' || answer.kind === 'pending') return;
      const at = clock.now() - t0;
      if (answer.kind === 'confirmed') {
        live.answeredAt ??= at;
        if (answer.coin !== undefined) setNumber(answer.coin.number);
        return;
      }
      setRefusal(mintRefusalReason(answer.code));
      if (live.mode === 'reduced') {
        finish();
        return;
      }
      live.mode = 'refused';
      live.answeredAt = at;
    });

    const skipKeys = new Set(['Escape', 'Enter', ' ']);
    const onKey = (event: KeyboardEvent): void => {
      if (!skipKeys.has(event.key)) return;
      event.preventDefault();
      finish();
    };
    const onTap = (): void => {
      if (live.done) return;
      swallowNextClick();
      finish();
    };
    layout();
    root.addEventListener('pointerdown', onTap);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', layout);
    raf = clock.frame(tick);
    return () => {
      root.removeEventListener('pointerdown', onTap);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', layout);
      leave();
      clock.cancel(raf);
      settle();
    };
  }, [clock, edition, firstNumber, gate, modest, reduced]);

  const bind =
    (part: Part) =>
    (el: HTMLElement | null): void => {
      parts.current[part] = el;
    };
  const text = (render: () => string): string => (ready ? render() : '');
  const [meeParty, meoParty] = PARTY[edition];
  const say = text(() => (refusal !== null ? translateGame(language, REFUSAL_KEY[refusal]) : translateGame(language, SAY_KEY[edition], { number: formatGameNumber(language, number) })));

  const scene = (
    <div ref={rootRef} data-game-ceremony="" data-edition={edition} data-look={look} data-mode={refusal !== null ? 'refused' : reduced ? 'reduced' : 'normal'} aria-hidden="true">
      <div ref={bind('backdrop')} data-ceremony-backdrop="" style={{ opacity: 0 }} />
      <div ref={bind('scene')} data-ceremony-scene="">
        <div ref={bind('fade')} data-ceremony-layer="" style={{ opacity: 0 }}>
          <div ref={bind('rays')} data-ceremony-rays="" />
          <div data-ceremony-sign="" ref={bind('sign')}>
            {text(() => translateGame(language, 'game.frappe.ancestors.title'))}
            <small>{text(() => (edition === 'prism' ? translateGame(language, 'game.frappe.ancestors.prism') : translateGame(language, 'game.frappe.ancestors.gold')))}</small>
          </div>
          {reduced ? null : (
            <>
              <div ref={bind('orb')} data-ceremony-orb="" />
              <div data-ceremony-orb-label="">{text(() => translateGame(language, 'game.frappe.light'))}</div>
              <div data-ceremony-anvil-top="" />
              <div data-ceremony-anvil="" />
              <canvas ref={bind('canvas')} data-ceremony-canvas="" />
              <div ref={bind('ombre')} data-ceremony-ombre="" />
            </>
          )}
          <div ref={bind('mee')} data-ceremony-actor="mee">
            <span ref={bind('meeRest')} data-ceremony-pose="rest">
              <GameBird bird="meeGuide" size={SCENE_MARKS.bird} />
            </span>
            <span ref={bind('meeParty')} data-ceremony-pose="party" style={{ opacity: 0 }}>
              <GameBird bird={meeParty} size={SCENE_MARKS.bird} />
            </span>
          </div>
          <div ref={bind('meo')} data-ceremony-actor="meo">
            <span ref={bind('meoRest')} data-ceremony-pose="rest">
              <GameBird bird="meoGuide" size={SCENE_MARKS.bird} flip />
            </span>
            <span ref={bind('meoParty')} data-ceremony-pose="party" style={{ opacity: 0 }}>
              <GameBird bird={meoParty} size={SCENE_MARKS.bird} flip />
            </span>
          </div>
          <div ref={bind('die')} data-ceremony-die="" />
          <div ref={bind('hammerMeo')} data-ceremony-hammer="meo">
            <span />
          </div>
          <div ref={bind('hammerMee')} data-ceremony-hammer="mee">
            <span />
          </div>
          <div ref={bind('ring')} data-ceremony-ring="" />
          <div ref={bind('tchak')} data-ceremony-tchak="">
            <span ref={bind('tchakLight')}>{text(() => translateGame(language, 'game.frappe.tchak'))}</span>
            <span ref={bind('tchakFinal')} style={{ display: 'none' }}>
              {text(() => translateGame(language, 'game.frappe.tchak_final'))}
            </span>
          </div>
          <div ref={bind('flash')} data-ceremony-flash="" />
          <div ref={bind('say')} data-ceremony-say="">
            {say}
          </div>
        </div>
        <div ref={bind('glow')} data-ceremony-glow="" />
        <div ref={bind('coin')} data-ceremony-coin="">
          <div ref={bind('coin3d')} data-ceremony-coin-3d="">
            <div ref={bind('blank')} data-ceremony-face="blank">
              <MeeshCoin side="obverse" blank size={SCENE_MARKS.coinBox} edition={look} />
            </div>
            <div ref={bind('obverse')} data-ceremony-face="obverse" style={{ opacity: 0 }}>
              <MeeshCoin side="obverse" size={SCENE_MARKS.coinBox} edition={look} />
            </div>
            <div data-ceremony-face="reverse">
              <MeeshCoin side="reverse" size={SCENE_MARKS.coinBox} edition={look} number={number} year={year} />
            </div>
          </div>
        </div>
        <div ref={bind('glory')} data-ceremony-glory="">
          {text(() => translateGame(language, 'game.frappe.glory', { glory: formatGameNumber(language, GLORY_POINTS.mint) }))}
        </div>
      </div>
      <div data-ceremony-hint="">{text(() => translateGame(language, 'game.frappe.skip'))}</div>
    </div>
  );
  return typeof document === 'undefined' ? scene : createPortal(scene, document.body);
}

export default MintCeremony;
