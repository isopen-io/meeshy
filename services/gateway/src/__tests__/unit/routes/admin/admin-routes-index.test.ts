/**
 * Tests for routes/admin/index.ts
 * Covers the adminRoutes plugin that registers all 11 sub-routes (lines 20-30).
 */

import Fastify from 'fastify';

// Mock all sub-routes to prevent loading their heavy dependencies
jest.mock('../../../../routes/admin/users', () => ({
  userAdminRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/reports', () => ({
  reportRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/invitations', () => ({
  invitationRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/analytics', () => ({
  analyticsRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/languages', () => ({
  languagesRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/messages', () => ({
  messagesRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/roles', () => ({
  registerRoleRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/content', () => ({
  registerContentRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/dashboard', () => ({
  dashboardRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/system-rankings', () => ({
  systemRankingsRoutes: jest.fn(async () => {}),
}));
jest.mock('../../../../routes/admin/agent', () => ({
  agentAdminRoutes: jest.fn(async () => {}),
}));

import { adminRoutes } from '../../../../routes/admin/index';
import { userAdminRoutes } from '../../../../routes/admin/users';
import { reportRoutes } from '../../../../routes/admin/reports';
import { invitationRoutes } from '../../../../routes/admin/invitations';
import { analyticsRoutes } from '../../../../routes/admin/analytics';
import { languagesRoutes } from '../../../../routes/admin/languages';
import { messagesRoutes } from '../../../../routes/admin/messages';
import { registerRoleRoutes } from '../../../../routes/admin/roles';
import { registerContentRoutes } from '../../../../routes/admin/content';
import { dashboardRoutes } from '../../../../routes/admin/dashboard';
import { systemRankingsRoutes } from '../../../../routes/admin/system-rankings';
import { agentAdminRoutes } from '../../../../routes/admin/agent';

describe('adminRoutes (routes/admin/index.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers all 11 sub-route plugins when invoked as a Fastify plugin', async () => {
    const app = Fastify({ logger: false });

    await app.register(adminRoutes);
    await app.ready();

    expect(dashboardRoutes).toHaveBeenCalledTimes(1);
    expect(userAdminRoutes).toHaveBeenCalledTimes(1);
    expect(reportRoutes).toHaveBeenCalledTimes(1);
    expect(invitationRoutes).toHaveBeenCalledTimes(1);
    expect(analyticsRoutes).toHaveBeenCalledTimes(1);
    expect(languagesRoutes).toHaveBeenCalledTimes(1);
    expect(messagesRoutes).toHaveBeenCalledTimes(1);
    expect(registerRoleRoutes).toHaveBeenCalledTimes(1);
    expect(registerContentRoutes).toHaveBeenCalledTimes(1);
    expect(systemRankingsRoutes).toHaveBeenCalledTimes(1);
    expect(agentAdminRoutes).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('re-exports all sub-route functions as named exports', () => {
    expect(typeof dashboardRoutes).toBe('function');
    expect(typeof userAdminRoutes).toBe('function');
    expect(typeof reportRoutes).toBe('function');
    expect(typeof invitationRoutes).toBe('function');
    expect(typeof analyticsRoutes).toBe('function');
    expect(typeof languagesRoutes).toBe('function');
    expect(typeof messagesRoutes).toBe('function');
    expect(typeof registerRoleRoutes).toBe('function');
    expect(typeof registerContentRoutes).toBe('function');
    expect(typeof systemRankingsRoutes).toBe('function');
    expect(typeof agentAdminRoutes).toBe('function');
  });
});
