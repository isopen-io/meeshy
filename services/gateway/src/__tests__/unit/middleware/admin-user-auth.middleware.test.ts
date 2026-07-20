/**
 * admin-user-auth.middleware unit tests
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

const mockHasPermission = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/admin/permissions.service', () => ({
  permissionsService: {
    hasPermission: (...args: unknown[]) => mockHasPermission(...args),
  },
}));

import {
  requireUserViewAccess,
  requireUserModifyAccess,
  requireUserDeleteAccess,
} from '../../../middleware/admin-user-auth.middleware';

function makeReply() {
  const reply = {
    status: jest.fn() as jest.Mock<any>,
    send: jest.fn() as jest.Mock<any>,
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply as any;
}

function makeRequest(overrides?: {
  isAuthenticated?: boolean;
  isAnonymous?: boolean;
  registeredUser?: { role: string } | null;
} | null) {
  const authContext = overrides === null ? null : {
    isAuthenticated: overrides?.isAuthenticated ?? true,
    isAnonymous: overrides?.isAnonymous ?? false,
    registeredUser: overrides?.registeredUser !== undefined
      ? overrides.registeredUser
      : { role: 'ADMIN' },
  };
  return { authContext } as any;
}

const middlewares = [
  { name: 'requireUserViewAccess', fn: requireUserViewAccess, permKey: 'canViewUsers', errMsg: 'view users' },
  { name: 'requireUserModifyAccess', fn: requireUserModifyAccess, permKey: 'canUpdateUsers', errMsg: 'modify users' },
  { name: 'requireUserDeleteAccess', fn: requireUserDeleteAccess, permKey: 'canDeleteUsers', errMsg: 'delete users' },
];

for (const { name, fn, errMsg } of middlewares) {
  describe(name, () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('returns 401 when authContext is null', async () => {
      const req = makeRequest(null);
      const reply = makeReply();
      await fn(req, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns 401 when user is not authenticated', async () => {
      const req = makeRequest({ isAuthenticated: false, registeredUser: null });
      const reply = makeReply();
      await fn(req, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when user is anonymous', async () => {
      const req = makeRequest({ isAuthenticated: true, isAnonymous: true, registeredUser: { role: 'USER' } });
      const reply = makeReply();
      await fn(req, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('returns 403 when user lacks permission', async () => {
      mockHasPermission.mockReturnValue(false);
      const req = makeRequest();
      const reply = makeReply();
      await fn(req, reply);
      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining(errMsg) })
      );
    });

    it('passes through without setting status when user has permission', async () => {
      mockHasPermission.mockReturnValue(true);
      const req = makeRequest();
      const reply = makeReply();
      await fn(req, reply);
      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });
}
