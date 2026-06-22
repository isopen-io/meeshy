/**
 * UserAuditService unit tests
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserAuditService } from '../../../../services/admin/user-audit.service';
import { UserAuditAction } from '@meeshy/shared/types';

function makeDbRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '507f1f77bcf86cd799439099',
    userId: '507f1f77bcf86cd799439011',
    adminId: '507f1f77bcf86cd799439022',
    action: UserAuditAction.VIEW_USER,
    entity: 'User',
    entityId: '507f1f77bcf86cd799439011',
    changes: null as string | null,
    metadata: null as string | null,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makePrisma(overrides: Partial<{
  create: jest.Mock;
  findMany: jest.Mock;
}> = {}) {
  return {
    adminAuditLog: {
      create: overrides.create ?? jest.fn(),
      findMany: overrides.findMany ?? jest.fn(),
    },
  } as unknown as PrismaClient;
}

function makeService(prisma?: PrismaClient) {
  return new UserAuditService(prisma ?? makePrisma());
}

// ─── createAuditLog ──────────────────────────────────────────────────────────

describe('UserAuditService.createAuditLog', () => {
  it('creates a log and returns a parsed UserAuditLog', async () => {
    const dbRecord = makeDbRecord();
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    const result = await svc.createAuditLog({
      userId: 'user-1',
      adminId: 'admin-1',
      action: UserAuditAction.VIEW_USER,
      entityId: 'user-1',
    });

    expect(result.id).toBe(dbRecord.id);
    expect(result.action).toBe(UserAuditAction.VIEW_USER);
    expect(result.entity).toBe('User');
    expect(result.changes).toBeNull();
    expect(result.metadata).toBeNull();
  });

  it('stringifies changes to JSON before storing', async () => {
    const changes = { role: { before: 'USER', after: 'ADMIN' } };
    const dbRecord = makeDbRecord({ changes: JSON.stringify(changes) });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    const result = await svc.createAuditLog({
      userId: 'user-1',
      adminId: 'admin-1',
      action: UserAuditAction.UPDATE_ROLE,
      entityId: 'user-1',
      changes: changes as any,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ changes: JSON.stringify(changes) }),
    });
    expect(result.changes).toEqual(changes);
  });

  it('stringifies metadata to JSON before storing', async () => {
    const metadata = { reason: 'promotion' };
    const dbRecord = makeDbRecord({ metadata: JSON.stringify(metadata) });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.createAuditLog({
      userId: 'user-1',
      adminId: 'admin-1',
      action: UserAuditAction.UPDATE_ROLE,
      entityId: 'user-1',
      metadata: metadata as any,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: JSON.stringify(metadata) }),
    });
  });

  it('stores null for null changes and metadata', async () => {
    const dbRecord = makeDbRecord();
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.createAuditLog({
      userId: 'user-1',
      adminId: 'admin-1',
      action: UserAuditAction.VIEW_USER,
      entityId: 'user-1',
      changes: null,
      metadata: null,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ changes: null, metadata: null }),
    });
  });

  it('stores null for missing ipAddress and userAgent', async () => {
    const dbRecord = makeDbRecord({ ipAddress: null, userAgent: null });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.createAuditLog({
      userId: 'user-1',
      adminId: 'admin-1',
      action: UserAuditAction.VIEW_USER,
      entityId: 'user-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: null, userAgent: null }),
    });
  });

  it('always sets entity to "User"', async () => {
    const dbRecord = makeDbRecord();
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.createAuditLog({
      userId: 'user-1',
      adminId: 'admin-1',
      action: UserAuditAction.VIEW_USER,
      entityId: 'user-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: 'User' }),
    });
  });

  it('parses changes and metadata from DB record back to objects', async () => {
    const changes = { field: { before: 'old', after: 'new' } };
    const metadata = { reason: 'test' };
    const dbRecord = makeDbRecord({
      changes: JSON.stringify(changes),
      metadata: JSON.stringify(metadata),
    });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    const result = await svc.createAuditLog({
      userId: 'user-1',
      adminId: 'admin-1',
      action: UserAuditAction.VIEW_USER,
      entityId: 'user-1',
    });

    expect(result.changes).toEqual(changes);
    expect(result.metadata).toEqual(metadata);
  });

  it('propagates DB errors', async () => {
    const create = jest.fn().mockRejectedValue(new Error('DB failure'));
    const svc = makeService(makePrisma({ create }));

    await expect(svc.createAuditLog({
      userId: 'u', adminId: 'a', action: UserAuditAction.VIEW_USER, entityId: 'u',
    })).rejects.toThrow('DB failure');
  });
});

// ─── getAuditLogsForUser ──────────────────────────────────────────────────────

describe('UserAuditService.getAuditLogsForUser', () => {
  it('queries with correct where clause and maps results', async () => {
    const records = [makeDbRecord(), makeDbRecord({ id: 'id2' })];
    const findMany = jest.fn().mockResolvedValue(records);
    const svc = makeService(makePrisma({ findMany }));

    const results = await svc.getAuditLogsForUser('user-1', 10);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { entityId: 'user-1', entity: 'User' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }));
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe(records[0].id);
  });

  it('defaults limit to 50', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService(makePrisma({ findMany }));

    await svc.getAuditLogsForUser('user-1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it('parses JSON changes and metadata from DB records', async () => {
    const changes = { role: { before: 'USER', after: 'ADMIN' } };
    const metadata = { reason: 'admin action' };
    const records = [makeDbRecord({
      changes: JSON.stringify(changes),
      metadata: JSON.stringify(metadata),
    })];
    const findMany = jest.fn().mockResolvedValue(records);
    const svc = makeService(makePrisma({ findMany }));

    const results = await svc.getAuditLogsForUser('user-1');
    expect(results[0].changes).toEqual(changes);
    expect(results[0].metadata).toEqual(metadata);
  });

  it('returns null for null changes/metadata in mapped results', async () => {
    const records = [makeDbRecord({ changes: null, metadata: null })];
    const findMany = jest.fn().mockResolvedValue(records);
    const svc = makeService(makePrisma({ findMany }));

    const results = await svc.getAuditLogsForUser('user-1');
    expect(results[0].changes).toBeNull();
    expect(results[0].metadata).toBeNull();
  });

  it('returns empty array when no logs exist', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService(makePrisma({ findMany }));

    const results = await svc.getAuditLogsForUser('user-1');
    expect(results).toEqual([]);
  });
});

// ─── getAuditLogsByAdmin ──────────────────────────────────────────────────────

describe('UserAuditService.getAuditLogsByAdmin', () => {
  it('queries by adminId with default limit 50', async () => {
    const findMany = jest.fn().mockResolvedValue([makeDbRecord()]);
    const svc = makeService(makePrisma({ findMany }));

    await svc.getAuditLogsByAdmin('admin-1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { adminId: 'admin-1' },
      take: 50,
    }));
  });

  it('accepts custom limit', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService(makePrisma({ findMany }));

    await svc.getAuditLogsByAdmin('admin-1', 5);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });

  it('maps and returns results', async () => {
    const records = [makeDbRecord({ adminId: 'admin-1' })];
    const findMany = jest.fn().mockResolvedValue(records);
    const svc = makeService(makePrisma({ findMany }));

    const results = await svc.getAuditLogsByAdmin('admin-1');
    expect(results[0].adminId).toBe('admin-1');
  });

  it('parses non-null changes and metadata from DB records', async () => {
    const changes = { role: { before: 'USER', after: 'ADMIN' } };
    const metadata = { reason: 'promotion' };
    const records = [makeDbRecord({
      adminId: 'admin-1',
      changes: JSON.stringify(changes),
      metadata: JSON.stringify(metadata),
    })];
    const findMany = jest.fn().mockResolvedValue(records);
    const svc = makeService(makePrisma({ findMany }));

    const results = await svc.getAuditLogsByAdmin('admin-1');
    expect(results[0].changes).toEqual(changes);
    expect(results[0].metadata).toEqual(metadata);
  });
});

// ─── Convenience methods ──────────────────────────────────────────────────────

describe('UserAuditService.logViewUser', () => {
  it('calls createAuditLog with VIEW_USER action', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.VIEW_USER });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logViewUser('admin-1', 'user-1', '1.2.3.4', 'UA');

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: UserAuditAction.VIEW_USER, userId: 'user-1', adminId: 'admin-1' }),
    });
  });
});

describe('UserAuditService.logCreateUser', () => {
  it('builds changes from userData keys and stores CREATE_USER action', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.CREATE_USER });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    const userData = { username: 'alice', role: 'USER' };
    await svc.logCreateUser('admin-1', 'new-user-id', userData);

    const callData = (create.mock.calls[0] as any[])[0].data;
    const parsedChanges = JSON.parse(callData.changes);
    expect(parsedChanges.username).toEqual({ before: null, after: 'alice' });
    expect(parsedChanges.role).toEqual({ before: null, after: 'USER' });
  });

  it('handles empty userData (no changes)', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.CREATE_USER, changes: '{}' });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logCreateUser('admin-1', 'user-id', {});
    expect(create).toHaveBeenCalled();
  });
});

describe('UserAuditService.logUpdateUser', () => {
  it('uses UPDATE_PROFILE action and includes reason in metadata', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.UPDATE_PROFILE });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logUpdateUser('admin-1', 'user-1', { bio: { before: 'old', after: 'new' } }, 'profile fix');

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.action).toBe(UserAuditAction.UPDATE_PROFILE);
    expect(JSON.parse(callData.metadata)).toEqual({ reason: 'profile fix' });
  });

  it('stores null metadata when no reason provided', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.UPDATE_PROFILE });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logUpdateUser('admin-1', 'user-1', {});

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.metadata).toBeNull();
  });
});

describe('UserAuditService.logUpdateRole', () => {
  it('stores role change with before/after and optional reason', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.UPDATE_ROLE });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logUpdateRole('admin-1', 'user-1', 'USER', 'MODERATOR', 'promoted');

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.action).toBe(UserAuditAction.UPDATE_ROLE);
    const changes = JSON.parse(callData.changes);
    expect(changes.role).toEqual({ before: 'USER', after: 'MODERATOR' });
    expect(JSON.parse(callData.metadata)).toEqual({ reason: 'promoted' });
  });

  it('stores null metadata when no reason provided', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.UPDATE_ROLE });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logUpdateRole('admin-1', 'user-1', 'USER', 'ADMIN');

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.metadata).toBeNull();
  });
});

describe('UserAuditService.logUpdateStatus', () => {
  it('stores isActive change with before/after booleans', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.UPDATE_STATUS });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logUpdateStatus('admin-1', 'user-1', true, false, 'abuse');

    const callData = (create.mock.calls[0] as any[])[0].data;
    const changes = JSON.parse(callData.changes);
    expect(changes.isActive).toEqual({ before: true, after: false });
  });

  it('stores null metadata when no reason provided', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.UPDATE_STATUS });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logUpdateStatus('admin-1', 'user-1', false, true);

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.metadata).toBeNull();
  });
});

describe('UserAuditService.logResetPassword', () => {
  it('calls createAuditLog with RESET_PASSWORD action', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.RESET_PASSWORD });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logResetPassword('admin-1', 'user-1');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: UserAuditAction.RESET_PASSWORD }),
    });
  });
});

describe('UserAuditService.logDeleteUser', () => {
  it('uses DELETE_USER action with optional reason', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.DELETE_USER });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logDeleteUser('admin-1', 'user-1', 'violation');

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.action).toBe(UserAuditAction.DELETE_USER);
    expect(JSON.parse(callData.metadata)).toEqual({ reason: 'violation' });
  });

  it('stores null metadata when no reason given', async () => {
    const dbRecord = makeDbRecord({ action: UserAuditAction.DELETE_USER });
    const create = jest.fn().mockResolvedValue(dbRecord);
    const svc = makeService(makePrisma({ create }));

    await svc.logDeleteUser('admin-1', 'user-1');

    const callData = (create.mock.calls[0] as any[])[0].data;
    expect(callData.metadata).toBeNull();
  });
});
