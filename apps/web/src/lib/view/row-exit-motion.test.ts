import { describe, expect, test } from 'bun:test';

import { ARRIVAL_MOTION_CURVE, ARRIVAL_MOTION_MS } from './arrival-motion';
import { ROW_EXIT_CURVE, ROW_EXIT_MS, createRowExitStore, paintedSchedule, rowExitOf, type RowExitSchedule } from './row-exit-motion';

/**
 * #12634 — UN MESSAGE MASQUÉ « POUR MOI » SORT DU FIL EN SE REPLIANT. La
 * mécanique est observée par l'état qu'elle publie (les rangées qui sortent,
 * celles qui reviennent) et par l'instant où elle rend la main : le cache ne
 * perd la rangée qu'une fois la sortie jouée. Sous « Réduire les animations »,
 * rien n'est publié et la main est rendue tout de suite.
 */

type Pending = { readonly run: () => void; readonly ms: number };

const manualClock = () => {
  const queue: Pending[] = [];
  const schedule: RowExitSchedule = (run, ms) => {
    queue.push({ run, ms });
  };
  const flush = (): readonly number[] => {
    const ran = queue.splice(0).map((pending) => {
      pending.run();
      return pending.ms;
    });
    return ran;
  };
  return { schedule, flush, pending: () => queue.length };
};

const ids = (...values: readonly string[]): ReadonlySet<string> => new Set(values);

describe('la sortie — la rangée reste montée le temps du repli', () => {
  test('les rangées visées sortent, et la main ne revient qu’après ROW_EXIT_MS', async () => {
    const store = createRowExitStore();
    const clock = manualClock();
    const exit = rowExitOf({ store, reduceMotion: () => false, schedule: clock.schedule });
    const done = exit.collapse(ids('m-1', 'm-2'));
    expect(done).not.toBeNull();
    expect([...store.getState().leaving]).toEqual(['m-1', 'm-2']);
    const settled = { value: false };
    void done?.then(() => {
      settled.value = true;
    });
    await Promise.resolve();
    expect(settled.value).toBe(false);
    expect(clock.flush()).toEqual([ROW_EXIT_MS]);
    await done;
    expect(settled.value).toBe(true);
  });

  test('une fois la rangée partie du cache, la sortie s’efface — l’état reste borné', async () => {
    const store = createRowExitStore();
    const clock = manualClock();
    const exit = rowExitOf({ store, reduceMotion: () => false, schedule: clock.schedule });
    const done = exit.collapse(ids('m-1'));
    clock.flush();
    await done;
    expect(store.getState().leaving.has('m-1')).toBe(true);
    clock.flush();
    expect(store.getState().leaving.size).toBe(0);
  });

  test('« Réduire les animations » ⇒ rien n’est publié, la main revient tout de suite', () => {
    const store = createRowExitStore();
    const clock = manualClock();
    const exit = rowExitOf({ store, reduceMotion: () => true, schedule: clock.schedule });
    expect(exit.collapse(ids('m-1'))).toBeNull();
    expect(store.getState().leaving.size).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  test('rien à faire sortir ⇒ rien n’attend', () => {
    const store = createRowExitStore();
    const exit = rowExitOf({ store, reduceMotion: () => false, schedule: manualClock().schedule });
    expect(exit.collapse(ids())).toBeNull();
  });
});

test('la courbe du repli EST celle de l’arrivée — une seule source', () => {
  expect(ROW_EXIT_CURVE).toBe(ARRIVAL_MOTION_CURVE);
});

describe('le retour — la rangée se déplie à sa place', () => {
  test('rendue, elle quitte la sortie et revient, le temps du dépliage', async () => {
    const store = createRowExitStore();
    const clock = manualClock();
    const exit = rowExitOf({ store, reduceMotion: () => false, schedule: clock.schedule });
    const done = exit.collapse(ids('m-1', 'm-2'));
    clock.flush();
    await done;
    exit.unfold(ids('m-1', 'm-2'));
    expect(store.getState().leaving.size).toBe(0);
    expect([...store.getState().returning]).toEqual(['m-1', 'm-2']);
    clock.flush();
    expect(store.getState().returning.size).toBe(0);
  });

  test('le retour est tenu au moins le temps de l’animation', () => {
    const store = createRowExitStore();
    const clock = manualClock();
    rowExitOf({ store, reduceMotion: () => false, schedule: clock.schedule }).unfold(ids('m-1'));
    expect(clock.flush().every((ms) => ms >= ROW_EXIT_MS)).toBe(true);
  });

  test('le retour couvre toute l’arrivée (#11223) : une rangée fraîche rendue en queue ne rejoue jamais son entrée', () => {
    const store = createRowExitStore();
    const clock = manualClock();
    rowExitOf({ store, reduceMotion: () => false, schedule: clock.schedule }).unfold(ids('m-1'));
    expect(clock.flush().every((ms) => ms > ARRIVAL_MOTION_MS)).toBe(true);
  });

  test('« Réduire les animations » ⇒ la rangée revient sans dépliage', () => {
    const store = createRowExitStore();
    const clock = manualClock();
    const exit = rowExitOf({ store, reduceMotion: () => true, schedule: clock.schedule });
    exit.unfold(ids('m-1'));
    expect(store.getState().returning.size).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  test('une rangée qui n’a pas fini de sortir revient sans attendre la fin du repli', () => {
    const store = createRowExitStore();
    const clock = manualClock();
    const exit = rowExitOf({ store, reduceMotion: () => false, schedule: clock.schedule });
    void exit.collapse(ids('m-1', 'm-2'));
    exit.unfold(ids('m-1'));
    expect([...store.getState().leaving]).toEqual(['m-2']);
    expect([...store.getState().returning]).toEqual(['m-1']);
  });
});

/**
 * L'HORLOGE DU REPLI PART DE LA PREMIÈRE IMAGE, PAS DU CLIC. La feuille joue
 * le fondu à partir du premier calcul de style ; sur un fil occupé (mesuré au
 * navigateur : des images de 60 ms juste après la fermeture du dialogue), un
 * minuteur parti au clic retirait la rangée alors que son fondu commençait à
 * peine — elle disparaissait d'un coup, pleinement opaque.
 */
describe('paintedSchedule — le délai se compte depuis l’image qui peint la sortie', () => {
  test('le délai ne court qu’à partir de la prochaine image', () => {
    const frames: (() => void)[] = [];
    const timers: { readonly run: () => void; readonly ms: number }[] = [];
    const schedule = paintedSchedule({
      requestFrame: (callback) => {
        frames.push(callback);
      },
      setTimer: (run, ms) => {
        timers.push({ run, ms });
      },
    });
    const ran: string[] = [];
    schedule(() => ran.push('retirée'), ROW_EXIT_MS);
    expect(timers).toEqual([]);
    frames.splice(0).forEach((frame) => frame());
    expect(timers.map((t) => t.ms)).toEqual([ROW_EXIT_MS]);
    timers.splice(0).forEach((t) => t.run());
    expect(ran).toEqual(['retirée']);
  });
});
