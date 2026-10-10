/**
 * Audit A2-4 — **l'adresse et le lieu de connexion d'un membre ne se servent
 * qu'à qui le SURCLASSE, ou à lui-même** — ligne par ligne, sur la fiche comme
 * sur la liste. Un ADMIN ne lit pas ceux d'un BIGBOSS, ni d'un autre ADMIN.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { UserRoleEnum } from '@meeshy/shared/types';
import { sanitizationService } from '../../../../services/admin/user-sanitization.service';

const recent = new Date();
const member = (id: string, role: string) => ({
  id, username: id, role, isActive: true, createdAt: recent, lastLoginAt: recent,
  lastLoginIp: '203.0.113.8', lastLoginLocation: 'Lyon, France', lastLoginDevice: 'UA',
  registrationIp: '203.0.113.7', registrationLocation: 'Paris, France', registrationDevice: 'UA',
});

const traces = (served: unknown) => {
  const row = served as Record<string, unknown>;
  return [row.lastLoginIp, row.lastLoginLocation, row.lastLoginDevice, row.registrationIp, row.registrationLocation, row.registrationDevice];
};

describe('sanitizeUser — la hiérarchie décide des traces de connexion', () => {
  it('un ADMIN lit celles d’un USER', () => {
    const served = sanitizationService.sanitizeUser(member('u-1', 'USER') as never, UserRoleEnum.ADMIN, { viewerId: 'admin-1' });
    expect(traces(served)).toEqual(['203.0.113.8', 'Lyon, France', 'UA', '203.0.113.7', 'Paris, France', 'UA']);
  });

  it.each(['BIGBOSS', 'ADMIN'])('un ADMIN ne lit pas celles d’un %s', (role) => {
    const served = sanitizationService.sanitizeUser(member('u-2', role) as never, UserRoleEnum.ADMIN, { viewerId: 'admin-1' });
    expect(traces(served)).toEqual([null, null, null, null, null, null]);
  });

  it('chacun lit les siennes', () => {
    const served = sanitizationService.sanitizeUser(member('admin-1', 'ADMIN') as never, UserRoleEnum.ADMIN, { viewerId: 'admin-1' });
    expect(traces(served)).toEqual(['203.0.113.8', 'Lyon, France', 'UA', '203.0.113.7', 'Paris, France', 'UA']);
  });

  it('la liste applique la règle LIGNE PAR LIGNE', () => {
    const rows = sanitizationService.sanitizeUsers([member('u-1', 'USER'), member('u-2', 'BIGBOSS')] as never, UserRoleEnum.ADMIN, 'admin-1');
    expect(traces(rows[0])[0]).toBe('203.0.113.8');
    expect(traces(rows[1])[0]).toBeNull();
  });
});
