import { describe, expect, test } from 'bun:test';

import { ISOLATED_LONG_TASK_CEILING_MS, glideLongTaskVerdict } from './glide-long-tasks.mjs';

/**
 * UNE TÂCHE LONGUE ISOLÉE N'EST PAS LE TRAITEMENT SUR LE FIL PRINCIPAL (#20176)
 * — voir le doc-comment de `glide-long-tasks.mjs` pour la règle et le chiffre.
 */

const glidesEvery = (count: number) => Array.from({ length: count }, (_, index) => ({ start: index * 400, end: index * 400 + 250 }));

describe('glideLongTaskVerdict', () => {
  test('aucune tâche longue pendant un glissé : vert, sans tolérance', () => {
    const verdict = glideLongTaskVerdict({ tasks: [{ start: 300, duration: 70 }], glides: glidesEvery(3) });
    expect(verdict).toEqual({ ok: true, tolerated: null, touched: [] });
  });

  test('une tâche isolée sous le plafond, dans un seul glissé : tolérée et NOMMÉE', () => {
    const verdict = glideLongTaskVerdict({ tasks: [{ start: 820, duration: 61 }], glides: glidesEvery(13) });
    expect(verdict.ok).toBe(true);
    expect(verdict.tolerated).toEqual({ glide: 2, offsetMs: 20, duration: 61 });
  });

  test('une tâche isolée AU plafond ou au-delà : rouge, un gel visible quelle que soit sa cause', () => {
    const verdict = glideLongTaskVerdict({ tasks: [{ start: 820, duration: ISOLATED_LONG_TASK_CEILING_MS }], glides: glidesEvery(13) });
    expect(verdict.ok).toBe(false);
    expect(verdict.touched).toEqual([{ glide: 2, offsetMs: 20, duration: ISOLATED_LONG_TASK_CEILING_MS }]);
  });

  test('deux glissés touchés, même par des tâches courtes : rouge — un coût par image revient à chaque glissé', () => {
    const verdict = glideLongTaskVerdict({ tasks: [{ start: 10, duration: 55 }, { start: 1210, duration: 55 }], glides: glidesEvery(13) });
    expect(verdict.ok).toBe(false);
    expect(verdict.touched.map((task) => task.glide)).toEqual([0, 3]);
  });

  test('deux tâches dans le MÊME glissé : rouge, la tolérance porte sur UNE tâche', () => {
    const verdict = glideLongTaskVerdict({ tasks: [{ start: 10, duration: 55 }, { start: 100, duration: 55 }], glides: glidesEvery(13) });
    expect(verdict.ok).toBe(false);
  });

  test('une tâche qui commence avant le glissé et le chevauche compte, décalage négatif', () => {
    const verdict = glideLongTaskVerdict({ tasks: [{ start: 370, duration: 60 }], glides: glidesEvery(3) });
    expect(verdict.tolerated).toEqual({ glide: 1, offsetMs: -30, duration: 60 });
  });

  test('un navigateur qui ne rapporte pas les tâches longues : rouge, rien à juger', () => {
    expect(glideLongTaskVerdict({ tasks: null, glides: glidesEvery(3) }).ok).toBe(false);
  });
});
