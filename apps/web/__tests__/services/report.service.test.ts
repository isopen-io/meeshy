import { reportService } from '@/services/report.service';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: { post: jest.fn() },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'report-1',
    reportedType: 'message',
    reportedEntityId: 'msg-1',
    reportType: 'spam',
    reason: 'unwanted content',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ─── reportMessage ────────────────────────────────────────────────────────────

describe('reportService.reportMessage', () => {
  it('POSTs to /admin/reports with reportedType=message and returns report on success', async () => {
    const report = makeReport();
    mockApi.post.mockResolvedValue({ data: { success: true, data: report } } as any);

    const result = await reportService.reportMessage('msg-1', 'spam', 'unwanted');

    expect(mockApi.post).toHaveBeenCalledWith('/admin/reports', {
      reportedType: 'message',
      reportedEntityId: 'msg-1',
      reportType: 'spam',
      reason: 'unwanted',
    });
    expect(result).toEqual(report);
  });

  it('returns response.data.data when success flag is falsy', async () => {
    const report = makeReport();
    mockApi.post.mockResolvedValue({ data: { data: report } } as any);

    const result = await reportService.reportMessage('msg-1', 'spam', 'reason');

    expect(result).toEqual(report);
  });

  it('propagates API errors', async () => {
    mockApi.post.mockRejectedValue(new Error('network error'));

    await expect(reportService.reportMessage('msg-1', 'spam', 'reason')).rejects.toThrow('network error');
  });
});

// ─── reportUser ───────────────────────────────────────────────────────────────

describe('reportService.reportUser', () => {
  it('POSTs with reportedType=user and returns report on success', async () => {
    const report = makeReport({ reportedType: 'user', reportedEntityId: 'user-1' });
    mockApi.post.mockResolvedValue({ data: { success: true, data: report } } as any);

    const result = await reportService.reportUser('user-1', 'harassment', 'harassing me');

    expect(mockApi.post).toHaveBeenCalledWith('/admin/reports', {
      reportedType: 'user',
      reportedEntityId: 'user-1',
      reportType: 'harassment',
      reason: 'harassing me',
    });
    expect(result).toEqual(report);
  });

  it('returns fallback data when success is absent', async () => {
    const report = makeReport({ reportedType: 'user' });
    mockApi.post.mockResolvedValue({ data: { data: report } } as any);

    const result = await reportService.reportUser('user-1', 'spam', 'reason');

    expect(result).toEqual(report);
  });
});

// ─── reportConversation ───────────────────────────────────────────────────────

describe('reportService.reportConversation', () => {
  it('POSTs with reportedType=conversation and returns report on success', async () => {
    const report = makeReport({ reportedType: 'conversation', reportedEntityId: 'conv-1' });
    mockApi.post.mockResolvedValue({ data: { success: true, data: report } } as any);

    const result = await reportService.reportConversation('conv-1', 'illegal', 'illegal content');

    expect(mockApi.post).toHaveBeenCalledWith('/admin/reports', {
      reportedType: 'conversation',
      reportedEntityId: 'conv-1',
      reportType: 'illegal',
      reason: 'illegal content',
    });
    expect(result).toEqual(report);
  });

  it('returns fallback data when success is absent', async () => {
    const report = makeReport({ reportedType: 'conversation' });
    mockApi.post.mockResolvedValue({ data: { data: report } } as any);

    const result = await reportService.reportConversation('conv-1', 'spam', 'reason');

    expect(result).toEqual(report);
  });
});

// ─── reportCommunity ──────────────────────────────────────────────────────────

describe('reportService.reportCommunity', () => {
  it('POSTs with reportedType=community and returns report on success', async () => {
    const report = makeReport({ reportedType: 'community', reportedEntityId: 'comm-1' });
    mockApi.post.mockResolvedValue({ data: { success: true, data: report } } as any);

    const result = await reportService.reportCommunity('comm-1', 'hate-speech', 'hate content');

    expect(mockApi.post).toHaveBeenCalledWith('/admin/reports', {
      reportedType: 'community',
      reportedEntityId: 'comm-1',
      reportType: 'hate-speech',
      reason: 'hate content',
    });
    expect(result).toEqual(report);
  });

  it('returns fallback data when success is absent', async () => {
    const report = makeReport({ reportedType: 'community' });
    mockApi.post.mockResolvedValue({ data: { data: report } } as any);

    const result = await reportService.reportCommunity('comm-1', 'spam', 'reason');

    expect(result).toEqual(report);
  });

  it('propagates API errors', async () => {
    mockApi.post.mockRejectedValue(new Error('timeout'));

    await expect(reportService.reportCommunity('comm-1', 'spam', 'reason')).rejects.toThrow('timeout');
  });
});
