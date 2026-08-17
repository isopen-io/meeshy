/**
 * Q-143 — banc de MESURE (pas de déduction) du pass de perspective web
 * (`useLentillePerspective`, WL-104/108). Jumeau du critère contrat R2
 * (`lentille-implementation-contract.md` §5, table de recette) :
 *
 *   « R2 | Perspective compositor, hauteur constante, < 1 ms/frame, zéro
 *     allocation | Instruments / profiler, 60 et 120 Hz »
 *
 * Ce que jsdom + Node PEUVENT mesurer ici, et prouvent RÉELLEMENT (pas relu
 * de mémoire) :
 *
 *   1. ÉCRITURES DE STYLE PAR FRAME — un `Proxy` posé sur `el.style` de
 *      chaque rang enregistré intercepte TOUTE écriture de propriété CSS
 *      (`set` trap générique, pas une liste blanche qu'on pourrait contourner
 *      en silence). Sous charge (150 rangs, au-delà de toute fenêtre de
 *      virtualisation réaliste), on prouve que SEULES `opacity` et
 *      `transform` sont jamais écrites — jamais `height`, `margin`,
 *      `padding`, `top`, `left`, `width` : c'est la preuve Layout Shift 0
 *      pour tout ce qui est instrumentable sous jsdom (§4.1 du contrat :
 *      « transform et opacity SEULS »).
 *   2. ALLOCATIONS PAR FRAME — jsdom/Node n'exposent pas de compteur de
 *      créations d'objets (pas de `--expose-gc` dans le harnais Jest de ce
 *      dépôt, pas de hook V8 câblé ici). Le proxy retenu, propre et sans
 *      faux-positif : `Array.prototype.push` est monkey-patché pour la durée
 *      d'une frame — chaque appel à `candidates.push({ id, midY })` (source :
 *      `use-lentille-perspective.ts`, boucle `rowsRef.current.forEach`) est
 *      À LA FOIS (a) la preuve qu'un objet candidat est alloué par rang
 *      MESURÉE (le nombre d'appels = N, jamais 1) et (b) la preuve, par
 *      identité d'objet, qu'un NOUVEAU tableau `candidates` est alloué
 *      CHAQUE frame (jamais réutilisé/mis en pool). Cette mesure réfute
 *      littéralement l'énoncé « zéro allocation » du contrat §4.1 pour
 *      l'implémentation WEB : LIMITE DOCUMENTÉE plus bas (allocation O(N),
 *      pas O(1)) — voir `tasks/lentille-recette-q143-perf.md` pour le
 *      chiffrage et l'arbitrage.
 *   3. 1 rAF / SURFACE SOUS CHARGE — deux instances du hook (deux
 *      "surfaces", même patron que Lentille-liste ⊥ Focal-fil, cf.
 *      `FocalThread.perspective-lifecycle.test.tsx`) tournent en parallèle,
 *      chacune avec 150 rangs enregistrés : à tout instant, EXACTEMENT une
 *      frame en vol par surface — jamais 0, jamais 2.
 *
 * Ce que jsdom NE PEUT PAS mesurer, nommé pour ne pas être tu : le temps réel
 * (< 1 ms/frame) — jsdom n'exécute aucun style/layout engine, `performance.now()`
 * autour de la boucle ne mesurerait que le coût JS pur d'un moteur qui ne fait
 * ni layout ni paint, un nombre sans rapport avec un vrai compositor. Voir
 * §2 du rapport pour le report device/profiler.
 */
import { renderHook, act } from '@testing-library/react';
import { FOCUS_BAND_OFFSET } from '@meeshy/shared/utils/focus-curve';

let mockReducedMotion = false;
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

import { useLentillePerspective } from '../use-lentille-perspective';

// =============================================================================
// rAF déterministe — un Map par surface possible (pas une file globale), pour
// que deux instances concurrentes ne se marchent jamais dessus dans le double.
// =============================================================================
function installDeterministicRaf() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let scheduled = 0;

  const originalRaf = global.requestAnimationFrame;
  const originalCaf = global.cancelAnimationFrame;

  global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    scheduled += 1;
    const id = nextId++;
    frames.set(id, cb);
    return id;
  }) as unknown as typeof requestAnimationFrame;

  global.cancelAnimationFrame = ((id: number) => {
    frames.delete(id);
  }) as unknown as typeof cancelAnimationFrame;

  return {
    get inFlight() {
      return frames.size;
    },
    get scheduled() {
      return scheduled;
    },
    /** Exécute toutes les frames en vol ; rend combien il y en avait. */
    flush() {
      const pending = [...frames.entries()];
      frames.clear();
      act(() => {
        pending.forEach(([, cb]) => cb(0));
      });
      return pending.length;
    },
    restore() {
      global.requestAnimationFrame = originalRaf;
      global.cancelAnimationFrame = originalCaf;
    },
  };
}

function makeElementWithRect(rect: Partial<DOMRect>): HTMLDivElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = jest.fn(() => ({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => ({}),
    ...rect,
  })) as unknown as () => DOMRect;
  return el;
}

/**
 * Pose un `Proxy` sur `el.style` — intercepte TOUTE écriture de propriété
 * (`set` générique, pas une liste de propriétés qu'on devine à l'avance).
 * `Object.defineProperty` sur l'INSTANCE masque l'accesseur `style` hérité du
 * prototype `HTMLElement` — seul cet élément est instrumenté, les autres
 * gardent leur `CSSStyleDeclaration` normale.
 */
function instrumentStyleWrites(el: HTMLElement): { writes: string[] } {
  const real = el.style;
  const writes: string[] = [];
  const proxy = new Proxy(real, {
    set(target, prop, value) {
      if (typeof prop === 'string') writes.push(prop);
      (target as unknown as Record<string, unknown>)[prop] = value;
      return true;
    },
  });
  Object.defineProperty(el, 'style', { value: proxy, configurable: true });
  return { writes };
}

/** Fenêtre de charge — largement au-dessus de ce qu'une virtualisation réelle monte à la fois. */
const LOAD_ROW_COUNT = 150;

describe('useLentillePerspective — banc de mesure Q-143 (jsdom, réellement exécuté)', () => {
  let raf: ReturnType<typeof installDeterministicRaf>;

  beforeEach(() => {
    mockReducedMotion = false;
    raf = installDeterministicRaf();
  });

  afterEach(() => {
    raf.restore();
  });

  // ===========================================================================
  // 1. Écritures de style — SEULES opacity/transform, jamais une propriété de
  //    layout, MESURÉ sous charge (150 rangs).
  // ===========================================================================
  it(`sous charge (${LOAD_ROW_COUNT} rangs) : SEULES opacity/transform sont jamais écrites — 0 écriture de layout`, () => {
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    const { result } = renderHook(() => useLentillePerspective({ container }));

    const focusY = 1000 - FOCUS_BAND_OFFSET;
    const trackers: { writes: string[] }[] = [];

    act(() => {
      for (let i = 0; i < LOAD_ROW_COUNT; i++) {
        const row = makeElementWithRect({ top: focusY - i * 4, bottom: focusY - i * 4 });
        const tracker = instrumentStyleWrites(row);
        trackers.push(tracker);
        result.current.registerRow(`row-${i}`)(row);
      }
    });

    raf.flush();

    const allWrites = trackers.flatMap((t) => t.writes);
    const distinctProperties = new Set(allWrites);

    // Chiffre nu, au rapport : 2 écritures par rang (opacity + transform),
    // jamais plus, jamais une troisième propriété.
    expect(allWrites.length).toBe(LOAD_ROW_COUNT * 2);
    expect(distinctProperties).toEqual(new Set(['opacity', 'transform']));

    // Re-preuve NÉGATIVE explicite — la liste exacte que Layout Shift interdit.
    for (const forbidden of ['height', 'margin', 'padding', 'top', 'left', 'right', 'bottom', 'width', 'font-size', 'fontSize']) {
      expect(distinctProperties.has(forbidden)).toBe(false);
    }
  });

  it('reduce-motion : sous charge, ZÉRO écriture de style (identité maintenue, jamais posée deux fois)', () => {
    mockReducedMotion = true;

    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    const { result } = renderHook(() => useLentillePerspective({ container }));
    const focusY = 1000 - FOCUS_BAND_OFFSET;
    const trackers: { writes: string[] }[] = [];

    act(() => {
      for (let i = 0; i < LOAD_ROW_COUNT; i++) {
        const row = makeElementWithRect({ top: focusY - i * 4, bottom: focusY - i * 4 });
        // L'identité (opacity:'1', transform:'none') est posée AU REGISTER,
        // avant l'instrumentation — on ne veut compter que les écritures DE
        // LA PASSE rAF elle-même, pas celle du register.
        result.current.registerRow(`row-${i}`)(row);
        trackers.push(instrumentStyleWrites(row));
      }
    });

    raf.flush();
    raf.flush();

    const total = trackers.flatMap((t) => t.writes).length;
    expect(total).toBe(0);
  });

  // ===========================================================================
  // 2. Allocations par frame — proxy MESURÉ sur `Array.prototype.push`
  //    (candidats), limite documentée pour le reste (voir docstring de tête).
  // ===========================================================================
  it(`MESURÉ : ${LOAD_ROW_COUNT} rangs ⇒ ${LOAD_ROW_COUNT} objets \`candidate\` alloués par frame (O(N), pas O(1)) — le contrat §4.1 dit "zéro allocation", ce banc le contredit pour le web`, () => {
    const container = makeElementWithRect({ top: 0, bottom: 1000 });
    const { result } = renderHook(() => useLentillePerspective({ container }));
    const focusY = 1000 - FOCUS_BAND_OFFSET;

    act(() => {
      for (let i = 0; i < LOAD_ROW_COUNT; i++) {
        result.current.registerRow(`row-${i}`)(
          makeElementWithRect({ top: focusY - i * 4, bottom: focusY - i * 4 })
        );
      }
    });

    const originalPush = Array.prototype.push;
    let pushCalls = 0;
    const arraysPushedInto = new Set<unknown[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Array.prototype as any).push = function (this: unknown[], ...items: unknown[]) {
      pushCalls += 1;
      arraysPushedInto.add(this);
      return originalPush.apply(this, items);
    };

    try {
      raf.flush(); // frame 1
      const pushCallsFrame1 = pushCalls;
      const arraysFrame1 = new Set(arraysPushedInto);

      pushCalls = 0;
      arraysPushedInto.clear();
      raf.flush(); // frame 2
      const pushCallsFrame2 = pushCalls;
      const arraysFrame2 = new Set(arraysPushedInto);

      // Chiffre nu : exactement un `push` par rang enregistré, CHAQUE frame —
      // pas 1 (qui prouverait un tableau réutilisé/rempli en une fois par lot).
      expect(pushCallsFrame1).toBe(LOAD_ROW_COUNT);
      expect(pushCallsFrame2).toBe(LOAD_ROW_COUNT);

      // Le tableau qui a reçu les push de la frame 1 n'est PAS celui de la
      // frame 2 — un `candidates: FocusRowCandidate[] = []` neuf par tick
      // (`use-lentille-perspective.ts`, corps de `tick()`), jamais un pool.
      expect(arraysFrame1.size).toBe(1);
      expect(arraysFrame2.size).toBe(1);
      const [array1] = [...arraysFrame1];
      const [array2] = [...arraysFrame2];
      expect(array1).not.toBe(array2);
    } finally {
      Array.prototype.push = originalPush;
    }
  });

  // ===========================================================================
  // 3. 1 rAF / SURFACE, sous charge, deux surfaces concurrentes.
  // ===========================================================================
  it('deux surfaces concurrentes (150 rangs chacune) : EXACTEMENT 1 frame en vol par surface, jamais 0 jamais 2', () => {
    const containerA = makeElementWithRect({ top: 0, bottom: 1000 });
    const containerB = makeElementWithRect({ top: 0, bottom: 2000 });

    const { result: resultA } = renderHook(() => useLentillePerspective({ container: containerA }));
    const { result: resultB } = renderHook(() => useLentillePerspective({ container: containerB }));

    act(() => {
      for (let i = 0; i < LOAD_ROW_COUNT; i++) {
        resultA.current.registerRow(`a-${i}`)(makeElementWithRect({ top: 100 + i, bottom: 164 + i }));
        resultB.current.registerRow(`b-${i}`)(makeElementWithRect({ top: 200 + i, bottom: 264 + i }));
      }
    });

    // 2 surfaces montées ⇒ 2 frames en vol au départ, une par surface.
    expect(raf.inFlight).toBe(2);

    expect(raf.flush()).toBe(2); // les deux tournent à chaque frame
    expect(raf.inFlight).toBe(2); // et chacune se reprogramme UNE fois, jamais deux

    expect(raf.flush()).toBe(2);
    expect(raf.inFlight).toBe(2);
  });
});
