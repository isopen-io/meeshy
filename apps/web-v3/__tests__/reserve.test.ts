/**
 * @jest-environment node
 */
import { clesDeLaReserve, purgeLesAutres, reserve } from '../lib/realtime/reserve';

/**
 * LA RÉSERVE PORTE L'IDENTITÉ DU LECTEUR. Un appareil partagé — le cas nominal
 * en zone rurale — voyait un lecteur B rejouer, sous SA créance, la file hors
 * ligne et le brouillon que le lecteur A avait laissés dans le même
 * navigateur pour la même conversation. La clé dit donc QUI avant de dire
 * QUOI, et l'ouverture purge ce qui n'est pas au lecteur.
 *
 * Sans `indexedDB` (l'environnement `node` de ce témoin), la réserve retombe
 * en mémoire — le MÊME contrat, celui que ces témoins gardent.
 */

describe('les clés de la réserve', () => {
  it('portent l’identité du lecteur avant la conversation', () => {
    expect(clesDeLaReserve({ moi: 'u1', conversation: 'c1' })).toEqual({ file: 'file:u1:c1:', brouillon: 'brouillon:u1:c1' });
    expect(clesDeLaReserve({ moi: 'p-tolu', conversation: 'c1' })).toEqual({ file: 'file:p-tolu:c1:', brouillon: 'brouillon:p-tolu:c1' });
  });

  it('refusent d’écrire sans identité — une file sans propriétaire est ce que l’indexation interdit', () => {
    expect(clesDeLaReserve({ moi: null, conversation: 'c1' })).toBeNull();
  });

  it('distinguent deux lecteurs sur la même conversation', () => {
    expect(clesDeLaReserve({ moi: 'u1', conversation: 'c1' })?.file).not.toBe(clesDeLaReserve({ moi: 'u2', conversation: 'c1' })?.file);
  });
});

describe('la purge à l’ouverture', () => {
  it('efface la file et le brouillon d’une AUTRE identité, et garde les miens', async () => {
    const r = await reserve();
    await r.ecris('file:u1:c1:2026-09-01T12:00:00.000Z:cid_a', { clientMessageId: 'cid_a', texte: 'de A' });
    await r.ecris('brouillon:u1:c1', 'brouillon de A');
    await r.ecris('file:u2:c1:2026-09-01T12:00:00.000Z:cid_b', { clientMessageId: 'cid_b', texte: 'de B' });
    await r.ecris('brouillon:u2:c9', 'brouillon de B');

    await purgeLesAutres(r, 'u2');

    expect(await r.cles('file:')).toEqual(['file:u2:c1:2026-09-01T12:00:00.000Z:cid_b']);
    expect(await r.cles('brouillon:')).toEqual(['brouillon:u2:c9']);
    expect(await r.lis('brouillon:u1:c1')).toBeUndefined();
  });

  it('ne touche à rien d’autre que les deux familles de la réserve', async () => {
    const r = await reserve();
    await r.ecris('autre:u1', 'x');
    await purgeLesAutres(r, 'u2');
    expect(await r.lis('autre:u1')).toBe('x');
  });
});
