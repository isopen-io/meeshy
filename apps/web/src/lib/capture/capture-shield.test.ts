import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { CAPTURE_SHIELD_PLUGIN, createCaptureShield } from './capture-shield';

/* LA VUE UNIQUE EST NOIRE À LA CAPTURE DANS LA COQUE ANDROID (#9574, décision
   porteur du 2026-10-07). `FLAG_SECURE` se pose tant qu'AU MOINS une vue
   unique est affichée : un COMPTEUR, jamais un booléen qu'un démontage
   remettrait à faux pendant qu'une autre surface montre encore la sienne. */

type Call = { readonly method: string; readonly options: object };

function shellWith(params: { readonly platform: string; readonly methods?: readonly string[]; readonly fail?: boolean }) {
  const calls: Call[] = [];
  const coque: CoqueNative = {
    getPlatform: () => params.platform,
    PluginHeaders:
      params.methods === undefined ? [] : [{ name: CAPTURE_SHIELD_PLUGIN, methods: params.methods.map((name) => ({ name })) }],
    nativePromise: (_plugin, method, options) => {
      calls.push({ method, options });
      return params.fail === true ? Promise.reject(new Error('refusé')) : Promise.resolve({});
    },
  };
  return { coque, calls };
}

const guarded = (fail = false) => shellWith({ platform: 'android', methods: ['setSecure', 'getState'], fail });

describe('le bouclier de capture de la vue unique (#9574)', () => {
  test('hors coque, aucun appel natif et la vue unique s’affiche', async () => {
    const shield = createCaptureShield(() => undefined);
    expect(shield.mode()).toBe('browser');
    const lease = shield.hold('m1');
    expect(await lease.ready).toBe(true);
    lease.release();
  });

  test('une page web ordinaire qui déclare un Capacitor « web » n’est pas une coque', () => {
    const { coque, calls } = shellWith({ platform: 'web' });
    const shield = createCaptureShield(() => coque);
    expect(shield.mode()).toBe('browser');
    shield.hold('m1').release();
    expect(calls).toEqual([]);
  });

  test('la première vue unique pose FLAG_SECURE, la dernière le retire', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque);
    expect(shield.mode()).toBe('guarded');
    const first = shield.hold('m1');
    const second = shield.hold('m2');
    expect(await first.ready).toBe(true);
    expect(await second.ready).toBe(true);
    expect(calls).toEqual([{ method: 'setSecure', options: { secure: true } }]);
    first.release();
    expect(calls).toHaveLength(1);
    second.release();
    expect(calls).toEqual([
      { method: 'setSecure', options: { secure: true } },
      { method: 'setSecure', options: { secure: false } },
    ]);
  });

  test('un démontage rejoué ne retire pas la protection d’une autre surface', () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque);
    const first = shield.hold('m1');
    const second = shield.hold('m1');
    first.release();
    first.release();
    expect(calls).toHaveLength(1);
    expect(shield.shown()).toEqual(['m1']);
    second.release();
    expect(calls).toHaveLength(2);
    expect(shield.shown()).toEqual([]);
  });

  test('la liste des vues uniques affichées est celle qu’une capture déclare', () => {
    const shield = createCaptureShield(() => undefined);
    const a = shield.hold('m1');
    shield.hold('m2');
    a.release();
    expect(shield.shown()).toEqual(['m2']);
  });

  test('une rangée de nature illisible noircit sans être déclarée comme vue unique affichée', () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque);
    const row = shield.hold('m-row', 'row');
    expect(calls).toEqual([{ method: 'setSecure', options: { secure: true } }]);
    expect(shield.shown()).toEqual([]);
    row.release();
    expect(calls).toHaveLength(2);
  });

  test('coque sans pont : fermé — la vue unique ne s’affiche pas en clair, rien n’est appelé', async () => {
    const { coque, calls } = shellWith({ platform: 'android', methods: [] });
    const shield = createCaptureShield(() => coque);
    expect(shield.mode()).toBe('unguarded');
    expect(await shield.hold('m1').ready).toBe(false);
    expect(calls).toEqual([]);
  });

  test('un pont qui refuse ferme aussi', async () => {
    const { coque } = guarded(true);
    const shield = createCaptureShield(() => coque);
    expect(await shield.hold('m1').ready).toBe(false);
  });

  test('reprise après retrait : un nouvel affichage repose FLAG_SECURE', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque);
    shield.hold('m1').release();
    expect(await shield.hold('m2').ready).toBe(true);
    expect(calls.map((call) => call.options)).toEqual([{ secure: true }, { secure: false }, { secure: true }]);
  });
});

describe('ce que la coque détecte', () => {
  test('tant qu’elle n’a pas répondu, la détection est inconnue ; sa réponse prévient les abonnés', async () => {
    const coque: CoqueNative = {
      getPlatform: () => 'android',
      PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: [{ name: 'setSecure' }, { name: 'getState' }] }],
      nativePromise: async () => ({ screenshotDetection: true, recordingDetection: false, recording: false }),
    };
    const shield = createCaptureShield(() => coque);
    expect(shield.host()).toEqual({ kind: 'shell', detection: null });
    let told = 0;
    const stop = shield.watchHost(() => {
      told += 1;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(told).toBe(1);
    expect(shield.host()).toEqual({ kind: 'shell', detection: { screenshot: true, recording: false } });
    stop();
  });

  test('FLAG_SECURE demandé ⇔ au moins un affichage tenu dans une coque gardée', () => {
    const { coque } = guarded();
    const shield = createCaptureShield(() => coque);
    expect(shield.secured()).toBe(false);
    const lease = shield.hold('m1', 'row');
    expect(shield.secured()).toBe(true);
    lease.release();
    expect(shield.secured()).toBe(false);
    expect(createCaptureShield(() => undefined).host()).toEqual({ kind: 'browser' });
  });
});

describe('« annoncé ou noir » pour les éphémères à l’écran', () => {
  const envAt = (state: { online: boolean; now: number }) => {
    let listener: ((online: boolean) => void) | null = null;
    return {
      env: {
        now: () => state.now,
        online: () => state.online,
        watchOnline: (next: (online: boolean) => void) => {
          listener = next;
          return () => {
            listener = null;
          };
        },
      },
      goOnline: (online: boolean) => listener?.(online),
    };
  };

  test('un éphémère annonçable, en ligne, laisse la fenêtre en clair', () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, envAt({ online: true, now: 0 }).env);
    shield.candidate('m1', 'c1');
    expect(calls).toEqual([]);
  });

  test('hors ligne, la fenêtre est noire ; le réseau revenu, elle repart en clair', () => {
    const { coque, calls } = guarded();
    const { env, goOnline } = envAt({ online: false, now: 0 });
    const shield = createCaptureShield(() => coque, env);
    shield.candidate('m1', 'c1');
    expect(calls.map((call) => call.options)).toEqual([{ secure: true }]);
    goOnline(true);
    expect(calls.map((call) => call.options)).toEqual([{ secure: true }, { secure: false }]);
  });

  test('pendant un enregistrement, la fenêtre est noire', () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, envAt({ online: true, now: 0 }).env);
    shield.candidate('m1', 'c1');
    shield.noteRecording(true);
    expect(calls.map((call) => call.options)).toEqual([{ secure: true }]);
    shield.noteRecording(false);
    expect(calls.map((call) => call.options)).toEqual([{ secure: true }, { secure: false }]);
  });

  test('plus d’éphémères non annoncés que la passerelle n’en peut annoncer : noire', () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, envAt({ online: true, now: 1_000 }).env);
    shield.noteNotices('c1', 'screenshot', Array.from({ length: 25 }, (_, i) => `old${i}`));
    Array.from({ length: 5 }, (_, i) => shield.candidate(`m${i}`, 'c1'));
    expect(calls).toEqual([]);
    const sixth = shield.candidate('m5', 'c1');
    expect(calls.map((call) => call.options)).toEqual([{ secure: true }]);
    sixth();
    expect(calls.map((call) => call.options)).toEqual([{ secure: true }, { secure: false }]);
  });

  test('un éphémère déjà annoncé ne consomme plus rien', () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, envAt({ online: true, now: 1_000 }).env);
    shield.noteNotices('c1', 'screenshot', Array.from({ length: 30 }, (_, i) => `m${i}`));
    shield.candidate('m3', 'c1');
    expect(calls).toEqual([]);
  });
});
