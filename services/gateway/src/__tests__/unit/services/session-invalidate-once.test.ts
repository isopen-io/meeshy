/**
 * Audit A2-5 — **invalider une session déjà close ne la réécrit pas** : ni le
 * motif d'origine, ni `invalidatedAt` (qui prolongerait sa conservation).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { updateManyIn } from '../../helpers/mongo-where';
import { initSessionService, invalidateSession } from '../../../services/SessionService';

describe('invalidateSession', () => {
  it('ferme une session vivante', async () => {
    const live = { id: 's-1', userId: 'u-1', isValid: true };
    const { updateMany, touched } = updateManyIn([live]);
    initSessionService({ userSession: { updateMany } } as never);

    expect(await invalidateSession('s-1', 'admin_revoke')).toBe(true);
    expect(touched).toEqual([live]);
  });

  it('ne touche pas une session déjà close, et le dit', async () => {
    const closed = { id: 's-1', userId: 'u-1', isValid: false, invalidatedAt: new Date('2026-09-01'), invalidatedReason: 'logout' };
    const { updateMany, touched } = updateManyIn([closed]);
    initSessionService({ userSession: { updateMany } } as never);

    expect(await invalidateSession('s-1', 'admin_revoke')).toBe(false);
    expect(touched).toEqual([]);
  });
});
