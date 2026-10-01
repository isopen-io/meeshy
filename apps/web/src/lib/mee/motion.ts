/**
 * LES MOUVEMENTS DE MEE ET MEO (#9034).
 *
 * Un sticker animé est une CHORÉGRAPHIE : plusieurs parties (le corps, une
 * aile, les yeux, un accessoire) jouent chacune un geste élémentaire, sur la
 * même boucle, avec un décalage. C'est ce qui fait qu'un câlin se LIT comme
 * un câlin (l'un s'approche, son aile s'enroule, un cœur monte) au lieu d'un
 * simple battement qui gonfle et dégonfle.
 *
 * Les gestes se divisent en deux familles, et la différence est mesurée par
 * le catalogue (`catalog.test.ts`) :
 * - `AMBIENT` : une respiration, un flottement, un clignement. Ça donne vie,
 *   ça ne raconte rien ;
 * - tout le reste est une ACTION : on s'approche, on pousse, on pleure, on
 *   s'évanouit, on lance un cœur, on claque une porte.
 *
 * Les valeurs sont en unités de la scène (200 × 200) : en SVG, `px` vaut une
 * unité utilisateur. Le CSS est porté PAR le sticker (une balise `<style>`
 * dans son SVG) et ciblé par la classe de sa racine : le même SVG s'anime
 * dans une bulle, dans la feuille et dans une page statique, sans feuille
 * externe. Les règles ne s'appliquent que sous `prefers-reduced-motion:
 * no-preference`. Une pièce répétée (des gouttes, des confettis) décale sa
 * propre boucle par la variable `--d` posée sur elle.
 */

export type Prim = keyof typeof PRIMS;

type PrimDef = { readonly kf: string; readonly ease?: string; readonly origin?: string; readonly ambient?: true };

const T = (v: string) => `transform:${v}`;

export const PRIMS = {
  float: { kf: `0%,100%{${T('translateY(0)')}}50%{${T('translateY(-6px)')}}`, ambient: true },
  beat: { kf: `0%,50%,100%{${T('scale(1)')}}12%{${T('scale(1.2)')}}24%{${T('scale(1)')}}36%{${T('scale(1.14)')}}`, ambient: true },
  blink: { kf: `0%,90%,100%{${T('scaleY(1)')}}94%{${T('scaleY(.1)')}}`, ambient: true },
  twinkle: { kf: `0%,100%{${T('scale(.5) rotate(0deg)')};opacity:.3}50%{${T('scale(1.1) rotate(45deg)')};opacity:1}`, ambient: true },
  sway: { kf: `0%,100%{${T('rotate(-7deg)')}}50%{${T('rotate(7deg)')}}`, ambient: true, origin: '50% 0%' },
  breathe: { kf: `0%,100%{${T('scale(1)')}}50%{${T('scale(1.05)')}}`, ambient: true },
  glow: { kf: `0%,100%{opacity:.45}50%{opacity:1}`, ambient: true },
  drift: { kf: `0%,100%{${T('translateX(-8px)')}}50%{${T('translateX(8px)')}}`, ambient: true },
  rays: { kf: `from{${T('rotate(0deg)')}}to{${T('rotate(360deg)')}}`, ambient: true, ease: 'linear' },
  flicker: { kf: `0%,100%{${T('scaleY(1)')}}30%{${T('scaleY(1.2) scaleX(.9)')}}60%{${T('scaleY(.9) scaleX(1.1)')}}`, ambient: true, origin: '50% 100%' },

  hop: { kf: `0%,80%,100%{${T('translateY(0) scale(1)')}}15%{${T('translateY(0) scale(1.08,.9)')}}40%{${T('translateY(-30px) scale(.95,1.06)')}}65%{${T('translateY(0) scale(1.06,.94)')}}` },
  hops: { kf: `0%,100%{${T('translateY(0)')}}20%,60%{${T('translateY(-22px) rotate(-6deg)')}}40%,80%{${T('translateY(0) rotate(0)')}}` },
  shake: { kf: `0%,40%,100%{${T('translateX(0)')}}5%,15%,25%,35%{${T('translateX(-6px)')}}10%,20%,30%{${T('translateX(6px)')}}` },
  tremble: { kf: `0%,100%{${T('translate(0,0)')}}25%{${T('translate(-1.5px,1px)')}}50%{${T('translate(1.5px,-1px)')}}75%{${T('translate(-1px,-1px)')}}`, ease: 'linear' },
  faint: { kf: `0%,12%,100%{${T('rotate(0deg) translateY(0)')}}30%{${T('rotate(-10deg)')}}50%,82%{${T('rotate(84deg) translateY(12px)')}}`, origin: '50% 100%' },
  topple: { kf: `0%,15%,100%{${T('rotate(0deg)')}}40%,85%{${T('rotate(-88deg) translateX(-10px)')}}`, origin: '30% 100%' },
  spin: { kf: `0%,20%{${T('rotate(0deg)')}}70%,100%{${T('rotate(360deg)')}}`, origin: '50% 50%' },
  pirouette: { kf: `0%,100%{${T('scaleX(1) translateY(0)')}}25%{${T('scaleX(0) translateY(-10px)')}}50%{${T('scaleX(-1) translateY(-16px)')}}75%{${T('scaleX(0) translateY(-10px)')}}` },
  leanIn: { kf: `0%,100%{${T('rotate(0deg) translateX(0)')}}35%,70%{${T('rotate(12deg) translateX(12px)')}}` },
  approach: { kf: `0%,100%{${T('translateX(-24px)')}}35%,75%{${T('translateX(6px)')}}` },
  recoil: { kf: `0%,38%,100%{${T('translateX(0) rotate(0deg)')}}48%{${T('translateX(-26px) rotate(-16deg)')}}70%{${T('translateX(-16px) rotate(-6deg)')}}` },
  flyOff: { kf: `0%{${T('translate(0,0)')};opacity:1}55%{${T('translate(50px,-90px) rotate(10deg)')};opacity:0}56%{${T('translate(0,40px)')};opacity:0}80%,100%{${T('translate(0,0)')};opacity:1}` },
  peek: { kf: `0%,100%{${T('translateY(70px)')}}30%,70%{${T('translateY(0)')}}` },
  dash: { kf: `from{${T('translateX(-260px)')}}to{${T('translateX(260px)')}}`, ease: 'linear' },
  stomp: { kf: `0%,50%,100%{${T('translateY(0) scale(1)')}}25%,75%{${T('translateY(5px) scale(1.07,.9)')}}` },
  dance: { kf: `0%,100%{${T('rotate(-10deg) translateX(-5px)')}}25%,75%{${T('translateY(-10px)')}}50%{${T('rotate(10deg) translateX(5px)')}}` },
  nod: { kf: `0%,60%,100%{${T('rotate(0deg)')}}15%,45%{${T('rotate(9deg)')}}30%{${T('rotate(0deg)')}}` },
  headshake: { kf: `0%,60%,100%{${T('rotate(0deg)')}}10%,30%,50%{${T('rotate(-9deg)')}}20%,40%{${T('rotate(9deg)')}}` },
  melt: { kf: `0%,100%{${T('scale(1)')}}45%,80%{${T('scale(1.18,.55)')}}`, origin: '50% 100%' },
  shiver: { kf: `0%,100%{${T('translateX(0) scale(1)')}}10%,30%,50%,70%,90%{${T('translateX(-2px) scale(.98)')}}20%,40%,60%,80%{${T('translateX(2px) scale(.98)')}}`, ease: 'linear' },
  sulk: { kf: `0%,100%{${T('rotate(0deg) translateX(0)')}}30%,80%{${T('rotate(-14deg) translateX(-8px)')}}`, origin: '50% 100%' },
  bow: { kf: `0%,25%,100%{${T('rotate(0deg)')}}45%,70%{${T('rotate(24deg)')}}`, origin: '50% 100%' },
  sneak: { kf: `0%{${T('translateX(-60px)')}}40%,60%{${T('translateX(0)')}}100%{${T('translateX(60px)')}}` },
  grow: { kf: `0%{${T('scale(0)')}}30%,85%{${T('scale(1)')}}100%{${T('scale(0)')}}`, origin: '50% 100%' },

  waveR: { kf: `0%,85%,100%{${T('rotate(0deg)')}}15%,45%{${T('rotate(-55deg)')}}30%,60%{${T('rotate(-20deg)')}}`, origin: '0% 80%' },
  flapL: { kf: `0%,100%{${T('rotate(0deg)')}}50%{${T('rotate(26deg)')}}`, origin: '100% 80%', ease: 'linear' },
  flapR: { kf: `0%,100%{${T('rotate(0deg)')}}50%{${T('rotate(-26deg)')}}`, origin: '0% 80%', ease: 'linear' },
  hugR: { kf: `0%,100%{${T('rotate(0deg)')}}35%,75%{${T('rotate(58deg) translateX(6px)')}}`, origin: '0% 80%' },
  patR: { kf: `0%,80%,100%{${T('rotate(0deg)')}}15%,35%,55%{${T('rotate(62deg)')}}25%,45%,65%{${T('rotate(44deg)')}}`, origin: '0% 80%' },
  pushR: { kf: `0%,30%,100%{${T('rotate(0deg) translateX(0)')}}42%,60%{${T('rotate(72deg) translateX(14px)')}}`, origin: '0% 80%' },
  offerR: { kf: `0%,100%{${T('rotate(0deg)')}}30%,80%{${T('rotate(50deg)')}}`, origin: '0% 80%' },
  facepalmR: { kf: `0%,15%,100%{${T('rotate(0deg) translateX(0)')}}35%,80%{${T('rotate(-72deg) translateX(-22px)')}}`, origin: '0% 80%' },
  coverL: { kf: `0%,15%,100%{${T('rotate(0deg) translateX(0)')}}35%,80%{${T('rotate(62deg) translateX(16px)')}}`, origin: '100% 80%' },
  coverR: { kf: `0%,15%,100%{${T('rotate(0deg) translateX(0)')}}35%,80%{${T('rotate(-62deg) translateX(-16px)')}}`, origin: '0% 80%' },
  clapL: { kf: `0%,100%{${T('rotate(0deg)')}}25%,75%{${T('rotate(40deg) translateX(10px)')}}50%{${T('rotate(5deg)')}}`, origin: '100% 80%' },
  clapR: { kf: `0%,100%{${T('rotate(0deg)')}}25%,75%{${T('rotate(-40deg) translateX(-10px)')}}50%{${T('rotate(-5deg)')}}`, origin: '0% 80%' },
  raiseL: { kf: `0%,100%{${T('rotate(0deg)')}}30%,70%{${T('rotate(45deg) translateY(-6px)')}}`, origin: '100% 80%' },
  raiseR: { kf: `0%,100%{${T('rotate(0deg)')}}30%,70%{${T('rotate(-45deg) translateY(-6px)')}}`, origin: '0% 80%' },
  shrugL: { kf: `0%,100%{${T('rotate(0deg) translateY(0)')}}35%,65%{${T('rotate(-30deg) translateY(-8px)')}}`, origin: '100% 80%' },
  shrugR: { kf: `0%,100%{${T('rotate(0deg) translateY(0)')}}35%,65%{${T('rotate(30deg) translateY(-8px)')}}`, origin: '0% 80%' },
  tapR: { kf: `0%,100%{${T('rotate(10deg)')}}25%,75%{${T('rotate(22deg)')}}50%{${T('rotate(10deg)')}}`, origin: '0% 80%', ease: 'linear' },
  pointR: { kf: `0%,100%{${T('rotate(0deg)')}}30%,80%{${T('rotate(60deg)')}}40%,60%{${T('rotate(66deg) translateX(4px)')}}`, origin: '0% 80%' },
  scoopR: { kf: `0%,100%{${T('rotate(20deg)')}}50%{${T('rotate(-30deg) translateY(-6px)')}}`, origin: '0% 80%' },
  lookSide: { kf: `0%,100%{${T('translateX(0)')}}25%,45%{${T('translateX(4px)')}}60%,80%{${T('translateX(-3px)')}}` },
  widen: { kf: `0%,40%,100%{${T('scale(1)')}}55%,85%{${T('scale(1.3)')}}` },

  tearFall: { kf: `0%{${T('translateY(0)')};opacity:0}10%{opacity:1}80%{${T('translateY(36px)')};opacity:1}100%{${T('translateY(42px)')};opacity:0}`, ease: 'ease-in' },
  steam: { kf: `0%{${T('translate(0,0) scale(.4)')};opacity:0}25%{opacity:1}100%{${T('translate(0,-32px) scale(1.4)')};opacity:0}`, ease: 'ease-out' },
  zzz: { kf: `0%{${T('translate(0,0) scale(.5)')};opacity:0}30%{opacity:1}100%{${T('translate(20px,-36px) scale(1.2)')};opacity:0}`, ease: 'ease-out' },
  rise: { kf: `0%{${T('translateY(12px) scale(.6)')};opacity:0}20%{opacity:1}100%{${T('translateY(-56px) scale(1.1)')};opacity:0}`, ease: 'ease-out' },
  arcR: { kf: `0%,10%{${T('translate(0,0) scale(.5)')};opacity:0}18%{opacity:1}50%{${T('translate(42px,-38px) scale(1)')}}85%{${T('translate(84px,0) scale(1.15)')};opacity:1}100%{${T('translate(84px,0) scale(1.15)')};opacity:0}` },
  arcL: { kf: `0%,10%{${T('translate(0,0) scale(.5)')};opacity:0}18%{opacity:1}50%{${T('translate(-42px,-38px) scale(1)')}}85%{${T('translate(-84px,0) scale(1.15)')};opacity:1}100%{${T('translate(-84px,0) scale(1.15)')};opacity:0}` },
  flyR: { kf: `0%{${T('translateX(-30px)')};opacity:0}15%{opacity:1}80%{opacity:1}100%{${T('translateX(110px)')};opacity:0}`, ease: 'linear' },
  fall: { kf: `0%{${T('translateY(-40px)')};opacity:0}15%{opacity:1}100%{${T('translateY(70px)')};opacity:0}`, ease: 'ease-in' },
  snow: { kf: `0%{${T('translate(0,-40px) rotate(0deg)')};opacity:0}15%{opacity:1}50%{${T('translate(10px,10px) rotate(90deg)')}}100%{${T('translate(-4px,64px) rotate(180deg)')};opacity:0}`, ease: 'linear' },
  breakL: { kf: `0%,30%,100%{${T('translate(0,0) rotate(0deg)')}}55%,88%{${T('translate(-9px,7px) rotate(-20deg)')}}`, origin: '100% 100%' },
  breakR: { kf: `0%,30%,100%{${T('translate(0,0) rotate(0deg)')}}55%,88%{${T('translate(9px,7px) rotate(20deg)')}}`, origin: '0% 100%' },
  pop: { kf: `0%{${T('scale(0)')};opacity:1}18%{${T('scale(1.25)')}}28%,80%{${T('scale(1)')};opacity:1}100%{${T('scale(.8)')};opacity:0}` },
  burst: { kf: `0%,10%{${T('translate(0,0) scale(.2) rotate(0deg)')};opacity:0}15%{opacity:1}100%{${T('translate(var(--dx),var(--dy)) scale(1) rotate(var(--r))')};opacity:0}`, ease: 'ease-out' },
  ring: { kf: `0%{${T('scale(.1)')};opacity:1}70%{opacity:.8}100%{${T('scale(1.6)')};opacity:0}`, ease: 'ease-out' },
  orbit: { kf: `from{${T('rotate(0deg)')}}to{${T('rotate(360deg)')}}`, ease: 'linear' },
  shut: { kf: `0%,30%{${T('scaleX(.06)')}}42%{${T('scaleX(1.04)')}}48%,100%{${T('scaleX(1)')}}`, origin: '0% 50%', ease: 'ease-in' },
  slam: { kf: `0%,25%{${T('scaleX(1)')}}40%,100%{${T('scaleX(.06)')}}`, origin: '0% 50%', ease: 'ease-in' },
  lid: { kf: `0%,30%,100%{${T('translate(0,0) rotate(0deg)')}}45%,85%{${T('translate(-12px,-26px) rotate(-28deg)')}}` },
  sip: { kf: `0%,100%{${T('rotate(0deg) translate(0,0)')}}35%,65%{${T('rotate(-38deg) translate(-10px,-12px)')}}`, origin: '50% 100%' },
  nibble: { kf: `0%{${T('scale(1)')}}25%{${T('scale(.86)')}}50%{${T('scale(.7)')}}75%{${T('scale(.55)')}}90%{${T('scale(.5)')};opacity:1}95%{opacity:0}100%{${T('scale(1)')};opacity:1}` },
  flash: { kf: `0%,100%{opacity:0}10%,30%{opacity:1}20%,40%{opacity:.1}` },
  ghost: { kf: `0%{${T('translate(0,18px) scale(.6)')};opacity:0}30%{opacity:.95}100%{${T('translate(12px,-54px) scale(1)')};opacity:0}`, ease: 'ease-out' },
  shovel: { kf: `0%,100%{${T('rotate(-30deg) translateY(0)')}}50%{${T('rotate(18deg) translateY(6px)')}}`, origin: '50% 0%' },
  unroll: { kf: `0%,10%{${T('scaleX(0)')}}40%,90%{${T('scaleX(1)')}}100%{${T('scaleX(0)')}}`, origin: '0% 50%' },
  tow: { kf: `from{${T('translateX(240px)')}}to{${T('translateX(-300px)')}}`, ease: 'linear' },
  write: { kf: `0%,100%{${T('translate(0,0)')}}20%{${T('translate(8px,2px)')}}40%{${T('translate(16px,-1px)')}}60%{${T('translate(24px,2px)')}}80%{${T('translate(32px,0)')}}` },
  bounceBall: { kf: `0%,100%{${T('translateY(0) scale(1.15,.85)')}}10%{${T('translateY(-6px) scale(1)')}}50%{${T('translateY(-50px)')}}`, ease: 'cubic-bezier(.3,0,.7,1)' },
  flip: { kf: `0%,100%{${T('scaleX(1)')}}25%,75%{${T('scaleX(.05)')}}50%{${T('scaleX(-1)')}}`, ease: 'linear' },
  toss: { kf: `0%,100%{${T('translateY(0)')}}45%{${T('translateY(-58px)')}}` , ease: 'cubic-bezier(.3,0,.7,1)' },
  reveal: { kf: `0%,15%{opacity:0;${T('translateY(8px)')}}35%,90%{opacity:1;${T('translateY(0)')}}100%{opacity:0}` },
  type: { kf: `0%,100%{opacity:.2}50%{opacity:1}` },
  shoot: { kf: `0%,20%{${T('translateX(0)')};opacity:1}55%{${T('translateX(92px)')};opacity:1}60%,100%{${T('translateX(92px)')};opacity:0}`, ease: 'ease-in' },
  drawBow: { kf: `0%,100%{${T('translateX(0)')}}15%,20%{${T('translateX(-8px)')}}25%{${T('translateX(2px)')}}` },
  stretchBow: { kf: `0%,100%{${T('scaleX(1)')}}15%,20%{${T('scaleX(1.25)')}}25%{${T('scaleX(.95)')}}`, origin: '100% 50%' },
  kick: { kf: `0%,40%,100%{${T('translate(0,0) rotate(0deg)')}}55%{${T('translate(60px,-40px) rotate(220deg)')}}75%{${T('translate(110px,10px) rotate(400deg)')};opacity:1}80%{opacity:0}` },
  chomp: { kf: `0%,100%{${T('rotate(0deg)')}}50%{${T('rotate(-14deg)')}}`, origin: '0% 50%' },
  wiggle: { kf: `0%,100%{${T('rotate(0deg)')}}20%{${T('rotate(-14deg)')}}40%{${T('rotate(12deg)')}}60%{${T('rotate(-8deg)')}}80%{${T('rotate(5deg)')}}` },
  dangle: { kf: `0%,100%{${T('translateY(0) rotate(-4deg)')}}50%{${T('translateY(8px) rotate(4deg)')}}`, origin: '50% 0%' },
  sink: { kf: `0%,15%,100%{${T('translateY(0)')}}50%,85%{${T('translateY(46px)')}}` },
  launch: { kf: `0%,10%{${T('translate(0,0)')};opacity:1}70%{${T('translate(60px,-120px)')};opacity:1}71%,100%{${T('translate(60px,-120px)')};opacity:0}`, ease: 'ease-in' },
  ticktock: { kf: `0%,100%{${T('rotate(0deg)')}}50%{${T('rotate(360deg)')}}`, ease: 'steps(12)', origin: '50% 100%' },
  sand: { kf: `0%{${T('scaleY(1)')}}100%{${T('scaleY(0)')}}`, origin: '50% 100%', ease: 'linear' },
} as const satisfies Record<string, PrimDef>;

export type Role =
  | 'b1'
  | 'b2'
  | 'wl1'
  | 'wr1'
  | 'wl2'
  | 'wr2'
  | 'e1'
  | 'e2'
  | 'p1'
  | 'p2'
  | 'p3'
  | 'p4'
  | 'p5'
  | 'p6'
  | 'p7'
  | 'p8';

/** Un geste : primitive, durée de la boucle (s), décalage (s). */
export type Beat = readonly [prim: Prim, duration: number, delay?: number];

export type Motion = {
  /** `action` : la chorégraphie RACONTE quelque chose. `ambient` : elle donne seulement vie. */
  readonly kind: 'action' | 'ambient';
  readonly roles: Partial<Readonly<Record<Role, Beat>>>;
};

const ROLE_ORIGIN = (role: Role): string => {
  if (role.startsWith('wl')) return '100% 80%';
  if (role.startsWith('wr')) return '0% 80%';
  if (role.startsWith('b')) return '50% 100%';
  return '50% 50%';
};

export const isAmbientPrim = (prim: Prim): boolean => (PRIMS[prim] as PrimDef).ambient === true;

/** Une chorégraphie RACONTE si elle se déclare action ET porte au moins un geste qui n'est pas d'ambiance. */
export function tellsAnAction(motion: Motion): boolean {
  return motion.kind === 'action' && Object.values(motion.roles).some((beat) => beat !== undefined && !isAmbientPrim(beat[0]));
}

/** La signature d'une chorégraphie — deux stickers qui la partagent BOUGENT pareil. */
export function motionSignature(motion: Motion): string {
  return Object.entries(motion.roles)
    .filter((entry): entry is [string, Beat] => entry[1] !== undefined)
    .map(([role, [prim]]) => `${role}:${prim}`)
    .sort()
    .join('|');
}

/** Le CSS d'un sticker : ses keyframes, puis une règle par partie animée, sous sa classe racine. */
export function motionCss(rootClass: string, motion: Motion): string {
  const beats = Object.entries(motion.roles).filter((entry): entry is [Role, Beat] => entry[1] !== undefined);
  const prims = [...new Set(beats.map(([, [prim]]) => prim))];
  const keyframes = prims.map((prim) => `@keyframes mee-${prim}{${PRIMS[prim].kf}}`).join('');
  const rules = beats
    .map(([role, [prim, duration, delay = 0]]) => {
      const def = PRIMS[prim] as PrimDef;
      return `.${rootClass} .${role}{animation:mee-${prim} ${duration}s ${def.ease ?? 'ease-in-out'} 0s infinite both;animation-delay:calc(${delay}s + var(--d, 0s));transform-box:fill-box;transform-origin:${def.origin ?? ROLE_ORIGIN(role)}}`;
    })
    .join('');
  return `${keyframes}@media (prefers-reduced-motion:no-preference){${rules}}`;
}
