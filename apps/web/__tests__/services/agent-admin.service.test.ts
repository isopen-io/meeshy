/**
 * Tests for services/agent-admin.service.ts
 */

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    patch: (...args: any[]) => mockPatch(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

import { agentAdminService } from '@/services/agent-admin.service';

const ok = <T>(data: T) => ({ success: true, data });
// Double-nested response format the gateway sometimes returns
const nested = <T>(data: T) => ({ success: true, data: { success: true, data } });

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── unwrapResponse behavior ──────────────────────────────────────────────────

describe('unwrapResponse (via getStats)', () => {
  it('unwraps single-level success response', async () => {
    const payload = { totalConfigs: 5 };
    mockGet.mockResolvedValueOnce(ok(payload));
    const result = await agentAdminService.getStats();
    expect(result.data).toEqual(payload);
  });

  it('unwraps double-nested success response', async () => {
    const inner = { totalConfigs: 3 };
    mockGet.mockResolvedValueOnce(nested(inner));
    const result = await agentAdminService.getStats();
    expect(result.data).toEqual(inner);
  });

  it('passes through failed responses unchanged', async () => {
    mockGet.mockResolvedValueOnce({ success: false, data: null });
    const result = await agentAdminService.getStats();
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });
});

// ─── getConfigs ───────────────────────────────────────────────────────────────

describe('getConfigs', () => {
  it('calls GET /admin/agent/configs with default pagination', async () => {
    mockGet.mockResolvedValueOnce(ok([]));
    await agentAdminService.getConfigs();
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/configs', { page: 1, limit: 20, search: undefined });
  });

  it('forwards custom pagination params', async () => {
    mockGet.mockResolvedValueOnce(ok([]));
    await agentAdminService.getConfigs(2, 10, 'alice');
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/configs', { page: 2, limit: 10, search: 'alice' });
  });
});

// ─── getConfig ────────────────────────────────────────────────────────────────

describe('getConfig', () => {
  it('calls GET /admin/agent/configs/:id', async () => {
    mockGet.mockResolvedValueOnce(ok({ id: 'conv-1' }));
    await agentAdminService.getConfig('conv-1');
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/configs/conv-1');
  });
});

// ─── upsertConfig ─────────────────────────────────────────────────────────────

describe('upsertConfig', () => {
  it('calls PUT /admin/agent/configs/:id with data', async () => {
    mockPut.mockResolvedValueOnce(ok({ id: 'conv-1' }));
    const data = { enabled: true, agentType: 'STANDARD' as any };
    await agentAdminService.upsertConfig('conv-1', data as any);
    expect(mockPut).toHaveBeenCalledWith('/admin/agent/configs/conv-1', data);
  });
});

// ─── deleteConfig ─────────────────────────────────────────────────────────────

describe('deleteConfig', () => {
  it('calls DELETE /admin/agent/configs/:id', async () => {
    mockDelete.mockResolvedValueOnce(ok(undefined));
    await agentAdminService.deleteConfig('conv-1');
    expect(mockDelete).toHaveBeenCalledWith('/admin/agent/configs/conv-1');
  });
});

// ─── roles and archetypes ─────────────────────────────────────────────────────

describe('getRoles', () => {
  it('calls GET /admin/agent/configs/:id/roles', async () => {
    mockGet.mockResolvedValueOnce(ok([]));
    await agentAdminService.getRoles('conv-1');
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/configs/conv-1/roles');
  });
});

describe('assignArchetype', () => {
  it('calls POST /admin/agent/roles/:convId/:userId/assign', async () => {
    mockPost.mockResolvedValueOnce(ok({ id: 'role-1' }));
    await agentAdminService.assignArchetype('conv-1', 'user-1', 'archetype-1');
    expect(mockPost).toHaveBeenCalledWith(
      '/admin/agent/roles/conv-1/user-1/assign',
      { archetypeId: 'archetype-1' }
    );
  });
});

describe('getArchetypes', () => {
  it('calls GET /admin/agent/archetypes', async () => {
    mockGet.mockResolvedValueOnce(ok([]));
    await agentAdminService.getArchetypes();
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/archetypes');
  });
});

// ─── LLM config ───────────────────────────────────────────────────────────────

describe('getLlmConfig', () => {
  it('calls GET /admin/agent/llm', async () => {
    mockGet.mockResolvedValueOnce(ok(null));
    await agentAdminService.getLlmConfig();
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/llm');
  });
});

describe('updateLlmConfig', () => {
  it('calls PUT /admin/agent/llm', async () => {
    mockPut.mockResolvedValueOnce(ok({ model: 'gpt-4' }));
    await agentAdminService.updateLlmConfig({ model: 'gpt-4' } as any);
    expect(mockPut).toHaveBeenCalledWith('/admin/agent/llm', { model: 'gpt-4' });
  });
});

// ─── global config ────────────────────────────────────────────────────────────

describe('getGlobalConfig', () => {
  it('calls GET /admin/agent/global-config', async () => {
    mockGet.mockResolvedValueOnce(ok({}));
    await agentAdminService.getGlobalConfig();
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/global-config');
  });
});

describe('updateGlobalConfig', () => {
  it('calls PUT /admin/agent/global-config', async () => {
    mockPut.mockResolvedValueOnce(ok({}));
    await agentAdminService.updateGlobalConfig({ enabled: true } as any);
    expect(mockPut).toHaveBeenCalledWith('/admin/agent/global-config', { enabled: true });
  });
});

// ─── scan operations ──────────────────────────────────────────────────────────

describe('triggerScan', () => {
  it('calls POST /admin/agent/configs/:id/trigger', async () => {
    mockPost.mockResolvedValueOnce(ok({ triggered: true }));
    await agentAdminService.triggerScan('conv-1');
    expect(mockPost).toHaveBeenCalledWith('/admin/agent/configs/conv-1/trigger', {});
  });
});

describe('stopScan', () => {
  it('calls POST /admin/agent/configs/:id/stop', async () => {
    mockPost.mockResolvedValueOnce(ok(undefined));
    await agentAdminService.stopScan('conv-1');
    expect(mockPost).toHaveBeenCalledWith('/admin/agent/configs/conv-1/stop', {});
  });
});

describe('getScanLogs', () => {
  it('calls GET /admin/agent/scan-logs with no filters by default', async () => {
    mockGet.mockResolvedValueOnce(ok([]));
    await agentAdminService.getScanLogs();
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/scan-logs', {});
  });

  it('forwards filters', async () => {
    mockGet.mockResolvedValueOnce(ok([]));
    await agentAdminService.getScanLogs({ conversationId: 'conv-1' });
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/scan-logs', { conversationId: 'conv-1' });
  });
});

// ─── delivery queue ───────────────────────────────────────────────────────────

describe('getDeliveryQueue', () => {
  it('calls GET /admin/agent/delivery-queue without params when no conversationId', async () => {
    mockGet.mockResolvedValueOnce(ok([]));
    await agentAdminService.getDeliveryQueue();
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/delivery-queue', {});
  });

  it('includes conversationId param when provided', async () => {
    mockGet.mockResolvedValueOnce(ok([]));
    await agentAdminService.getDeliveryQueue('conv-1');
    expect(mockGet).toHaveBeenCalledWith('/admin/agent/delivery-queue', { conversationId: 'conv-1' });
  });
});

describe('deleteDeliveryItem', () => {
  it('calls DELETE /admin/agent/delivery-queue/:id', async () => {
    mockDelete.mockResolvedValueOnce(ok({ deleted: true }));
    await agentAdminService.deleteDeliveryItem('item-1');
    expect(mockDelete).toHaveBeenCalledWith('/admin/agent/delivery-queue/item-1');
  });
});

describe('editDeliveryItem', () => {
  it('calls PATCH /admin/agent/delivery-queue/:id with content', async () => {
    mockPatch.mockResolvedValueOnce(ok({}));
    await agentAdminService.editDeliveryItem('item-1', 'new content');
    expect(mockPatch).toHaveBeenCalledWith('/admin/agent/delivery-queue/item-1', { content: 'new content' });
  });
});

// ─── reset operations ─────────────────────────────────────────────────────────

describe('resetAll', () => {
  it('calls DELETE /admin/agent/reset', async () => {
    mockDelete.mockResolvedValueOnce(ok({ reset: true }));
    await agentAdminService.resetAll();
    expect(mockDelete).toHaveBeenCalledWith('/admin/agent/reset');
  });
});

describe('resetConversation', () => {
  it('calls DELETE /admin/agent/reset/conversation/:id', async () => {
    mockDelete.mockResolvedValueOnce(ok({ reset: true }));
    await agentAdminService.resetConversation('conv-1');
    expect(mockDelete).toHaveBeenCalledWith('/admin/agent/reset/conversation/conv-1');
  });
});

describe('resetUser', () => {
  it('calls DELETE /admin/agent/reset/user/:id', async () => {
    mockDelete.mockResolvedValueOnce(ok({ reset: true }));
    await agentAdminService.resetUser('user-1');
    expect(mockDelete).toHaveBeenCalledWith('/admin/agent/reset/user/user-1');
  });
});
