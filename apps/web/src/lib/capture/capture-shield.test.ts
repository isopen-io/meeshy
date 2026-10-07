import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { CAPTURE_SHIELD_PLUGIN, SECURE_RETRY_MS, createCaptureShield, type CaptureShieldEnv } from './capture-shield';

/* LE BOUCLIER DE CAPTURE (#9574, #9617). `FLAG_SECURE` se pose tant qu'AU
   MOINS une surface le demande : un COMPTE, jamais un booléen qu'un démontage
   remettrait à faux. L'état appliqué ne change qu'après le SUCCÈS de l'appel
   natif : un échec ferme et se réessaie ; la dernière demande gagne. */

type Call = { readonly method: string; readonly options: object };

function shellWith(params: { readonly platform: string; readonly methods?: readonly string[]; readonly failures?: number }) {
  const calls: Call[] = [];
  const failing = { left: params.failures ?? 0 };
  const coque: CoqueNative = {
    getPlatform: () => params.platform,
    PluginHeaders:
      params.methods === undefined ? [] : [{ name: CAPTURE_SHIELD_PLUGIN, methods: params.methods.map((name) => ({ name })) }],
    nativePromise: (_plugin, method, options) => {
      calls.push({ method, options });
      if (method === 'setSecure' && failing.left > 0) {
        failing.left -= 1;
        return Promise.reject(new Error('refusé'));
      }
      return Promise.resolve({});
    },
  };
  return { coque, calls };
}

const guarded = (failures = 0) => shellWith({ platform: 'android', methods: ['setSecure', 'getState'], failures });

function testEnv(state: { online: boolean; now: number } = { online: true, now: 0 }) {
  let onlineListener: ((online: boolean) => void) | null = null;
  const timers: (() => void)[] = [];
  const env: CaptureShieldEnv = {
    now: () => state.now,
    online: () => state.online,
    watchOnline: (listener) => {
      onlineListener = listener;
      return () => {
        onlineListener = null;
      };
    },
    schedule: (run, ms) => {
      expect(ms).toBe(SECURE_RETRY_MS);
      timers.push(run);
    },
  };
  return { env, goOnline: (online: boolean) => onlineListener?.(online), fireTimers: () => timers.splice(0).forEach((run) => run()), timers };
}

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const secureCalls = (calls: readonly Call[]) => calls.filter((call) => call.method === 'setSecure').map((call) => call.options);

describe('le bouclier de capture de la vue unique (#9574)', () => {
  test('hors coque, aucun appel natif et la vue unique s’affiche', () => {
    const shield = createCaptureShield(() => undefined, testEnv().env);
    expect(shield.mode()).toBe('browser');
    const lease = shield.hold('m1');
    expect(lease.state()).toBe('open');
    lease.release();
  });

  test('une page web ordinaire qui déclare un Capacitor « web » n’est pas une coque', () => {
    const { coque, calls } = shellWith({ platform: 'web' });
    const shield = createCaptureShield(() => coque, testEnv().env);
    expect(shield.mode()).toBe('browser');
    shield.hold('m1').release();
    expect(calls).toEqual([]);
  });

  test('la première vue unique pose FLAG_SECURE, ouverte seulement une fois confirmé ; la dernière le retire', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, testEnv().env);
    expect(shield.mode()).toBe('guarded');
    const first = shield.hold('m1');
    const second = shield.hold('m2');
    expect(first.state()).toBe('pending');
    expect(shield.secured()).toBe(false);
    await settle();
    expect(first.state()).toBe('open');
    expect(second.state()).toBe('open');
    expect(shield.secured()).toBe(true);
    expect(secureCalls(calls)).toEqual([{ secure: true }]);
    first.release();
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }]);
    second.release();
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }, { secure: false }]);
    expect(shield.secured()).toBe(false);
  });

  test('un démontage rejoué ne retire pas la protection d’une autre surface', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, testEnv().env);
    const first = shield.hold('m1');
    const second = shield.hold('m1');
    await settle();
    first.release();
    first.release();
    await settle();
    expect(secureCalls(calls)).toHaveLength(1);
    expect(shield.shown()).toEqual(['m1']);
    second.release();
    await settle();
    expect(secureCalls(calls)).toHaveLength(2);
    expect(shield.shown()).toEqual([]);
  });

  test('un appel en vol ne croise pas le suivant : la dernière demande gagne', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, testEnv().env);
    shield.hold('m1').release();
    shield.hold('m2').release();
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }, { secure: false }]);
    expect(shield.secured()).toBe(false);
  });

  test('la liste des vues uniques affichées est celle qu’une capture déclare', () => {
    const shield = createCaptureShield(() => undefined, testEnv().env);
    const a = shield.hold('m1');
    shield.hold('m2');
    a.release();
    expect(shield.shown()).toEqual(['m2']);
  });

  test('une rangée de nature illisible noircit sans être déclarée comme vue unique affichée', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, testEnv().env);
    const row = shield.hold('m-row', 'row');
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }]);
    expect(shield.shown()).toEqual([]);
    row.release();
    await settle();
    expect(secureCalls(calls)).toHaveLength(2);
  });

  test('coque sans pont : fermé — la vue unique ne s’affiche pas en clair, rien n’est appelé', () => {
    const { coque, calls } = shellWith({ platform: 'android', methods: [] });
    const shield = createCaptureShield(() => coque, testEnv().env);
    expect(shield.mode()).toBe('unguarded');
    expect(shield.hold('m1').state()).toBe('closed');
    expect(calls).toEqual([]);
  });
});

describe('un appel natif qui échoue ferme, puis se réessaie', () => {
  test('échec à poser le drapeau : rien n’est montré, secured() faux, réessai ; le succès suivant montre', async () => {
    const { coque, calls } = guarded(1);
    const { env, fireTimers, timers } = testEnv();
    const shield = createCaptureShield(() => coque, env);
    const lease = shield.hold('m1');
    let told = 0;
    lease.watch(() => {
      told += 1;
    });
    await settle();
    expect(lease.state()).toBe('closed');
    expect(shield.secured()).toBe(false);
    expect(timers).toHaveLength(1);
    fireTimers();
    await settle();
    expect(lease.state()).toBe('open');
    expect(shield.secured()).toBe(true);
    expect(secureCalls(calls)).toEqual([{ secure: true }, { secure: true }]);
    expect(told).toBe(2);
  });

  test('une autre coque que celle qui a confirmé (activité recréée) : état inconnu, réappliqué', async () => {
    const first = guarded();
    const second = guarded();
    const current = { coque: first.coque };
    const shield = createCaptureShield(() => current.coque, testEnv().env);
    const lease = shield.hold('m1');
    await settle();
    expect(lease.state()).toBe('open');
    current.coque = second.coque;
    expect(lease.state()).toBe('pending');
    expect(shield.secured()).toBe(false);
    shield.noteOnline(true);
    await settle();
    expect(secureCalls(second.calls)).toEqual([{ secure: true }]);
    expect(lease.state()).toBe('open');
  });
});

describe('ce que la coque détecte', () => {
  test('tant qu’elle n’a pas répondu, la détection est inconnue ; sa réponse prévient les abonnés', async () => {
    const coque: CoqueNative = {
      getPlatform: () => 'android',
      PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: [{ name: 'setSecure' }, { name: 'getState' }] }],
      nativePromise: async () => ({ screenshotDetection: true, recordingDetection: false, recording: false }),
    };
    const shield = createCaptureShield(() => coque, testEnv().env);
    expect(shield.host()).toEqual({ kind: 'shell', detection: null });
    let told = 0;
    const stop = shield.watchHost(() => {
      told += 1;
    });
    await settle();
    expect(told).toBe(1);
    expect(shield.host()).toEqual({ kind: 'shell', detection: { screenshot: true, recording: false } });
    stop();
    expect(createCaptureShield(() => undefined, testEnv().env).host()).toEqual({ kind: 'browser' });
  });
});

describe('« annoncé ou noir » pour les éphémères à l’écran', () => {
  test('un éphémère annonçable, en ligne, laisse la fenêtre en clair', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, testEnv().env);
    shield.candidate('m1', 'c1');
    await settle();
    expect(secureCalls(calls)).toEqual([]);
  });

  test('hors ligne, la fenêtre est noire ; le réseau revenu, elle repart en clair', async () => {
    const { coque, calls } = guarded();
    const { env, goOnline } = testEnv({ online: false, now: 0 });
    const shield = createCaptureShield(() => coque, env);
    shield.candidate('m1', 'c1');
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }]);
    goOnline(true);
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }, { secure: false }]);
  });

  test('pendant un enregistrement, la fenêtre est noire', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, testEnv().env);
    shield.candidate('m1', 'c1');
    shield.noteRecording(true);
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }]);
    shield.noteRecording(false);
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }, { secure: false }]);
  });

  test('plus d’éphémères non annoncés que la passerelle n’en peut annoncer : noire', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, testEnv({ online: true, now: 1_000 }).env);
    shield.noteNotices('c1', 'screenshot', Array.from({ length: 25 }, (_, i) => `old${i}`));
    Array.from({ length: 5 }, (_, i) => shield.candidate(`m${i}`, 'c1'));
    await settle();
    expect(secureCalls(calls)).toEqual([]);
    const sixth = shield.candidate('m5', 'c1');
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }]);
    sixth();
    await settle();
    expect(secureCalls(calls)).toEqual([{ secure: true }, { secure: false }]);
  });

  test('un éphémère déjà annoncé ne consomme plus rien', async () => {
    const { coque, calls } = guarded();
    const shield = createCaptureShield(() => coque, testEnv({ online: true, now: 1_000 }).env);
    shield.noteNotices('c1', 'screenshot', Array.from({ length: 30 }, (_, i) => `m${i}`));
    shield.candidate('m3', 'c1');
    await settle();
    expect(secureCalls(calls)).toEqual([]);
  });
});

describe('un appel resté sans réponse', () => {
  test('ne bloque pas la coque qui la remplace', async () => {
    const stuck: CoqueNative = {
      getPlatform: () => 'android',
      PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: [{ name: 'setSecure' }] }],
      nativePromise: () => new Promise<unknown>(() => {}),
    };
    const fresh = guarded();
    const current = { coque: stuck };
    const shield = createCaptureShield(() => current.coque, testEnv().env);
    const lease = shield.hold('m1');
    await settle();
    expect(lease.state()).toBe('pending');
    current.coque = fresh.coque;
    shield.noteOnline(true);
    await settle();
    expect(secureCalls(fresh.calls)).toEqual([{ secure: true }]);
    expect(lease.state()).toBe('open');
  });
});
