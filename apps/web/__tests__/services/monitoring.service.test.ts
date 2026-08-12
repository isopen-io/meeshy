jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { get: jest.fn() },
}));

import { monitoringService } from '@/services/monitoring.service';
import { apiService } from '@/services/api.service';

const mockApi = apiService as jest.Mocked<typeof apiService>;

const SUCCESS = { data: { success: true, data: {} } };

beforeEach(() => jest.clearAllMocks());

// ─── getRealtime ──────────────────────────────────────────────────────────────

describe('monitoringService.getRealtime', () => {
  it('calls /admin/analytics/realtime and returns response', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    const result = await monitoringService.getRealtime();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/realtime');
    expect(result).toEqual(SUCCESS);
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('offline'));
    await expect(monitoringService.getRealtime()).rejects.toThrow('offline');
  });
});

// ─── getHealth ────────────────────────────────────────────────────────────────

describe('monitoringService.getHealth', () => {
  it('calls /health/ready', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getHealth();
    expect(mockApi.get).toHaveBeenCalledWith('/health/ready');
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('down'));
    await expect(monitoringService.getHealth()).rejects.toThrow('down');
  });
});

// ─── getMetrics ───────────────────────────────────────────────────────────────

describe('monitoringService.getMetrics', () => {
  it('calls /health/metrics', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getMetrics();
    expect(mockApi.get).toHaveBeenCalledWith('/health/metrics');
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('error'));
    await expect(monitoringService.getMetrics()).rejects.toThrow('error');
  });
});

// ─── getCircuitBreakers ───────────────────────────────────────────────────────

describe('monitoringService.getCircuitBreakers', () => {
  it('calls /health/circuit-breakers', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getCircuitBreakers();
    expect(mockApi.get).toHaveBeenCalledWith('/health/circuit-breakers');
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('error'));
    await expect(monitoringService.getCircuitBreakers()).rejects.toThrow('error');
  });
});

// ─── getKpis ──────────────────────────────────────────────────────────────────

describe('monitoringService.getKpis', () => {
  it('calls /admin/analytics/kpis with default period 7d', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getKpis();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/kpis', { period: '7d' });
  });

  it('accepts custom period', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getKpis('30d');
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/kpis', { period: '30d' });
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('error'));
    await expect(monitoringService.getKpis()).rejects.toThrow('error');
  });
});

// ─── getVolumeTimeline ────────────────────────────────────────────────────────

describe('monitoringService.getVolumeTimeline', () => {
  it('calls /admin/analytics/volume-timeline', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getVolumeTimeline();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/volume-timeline');
  });
});

// ─── getLanguageDistribution ──────────────────────────────────────────────────

describe('monitoringService.getLanguageDistribution', () => {
  it('calls /admin/analytics/language-distribution', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getLanguageDistribution();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/language-distribution');
  });
});

// ─── getUserDistribution ──────────────────────────────────────────────────────

describe('monitoringService.getUserDistribution', () => {
  it('calls /admin/analytics/user-distribution', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getUserDistribution();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/user-distribution');
  });
});

// ─── getHourlyActivity ────────────────────────────────────────────────────────

describe('monitoringService.getHourlyActivity', () => {
  it('calls /admin/analytics/hourly-activity', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getHourlyActivity();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/hourly-activity');
  });
});

// ─── getMessageTypes ──────────────────────────────────────────────────────────

describe('monitoringService.getMessageTypes', () => {
  it('calls /admin/analytics/message-types with default period 7d', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getMessageTypes();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/message-types', { period: '7d' });
  });

  it('accepts custom period', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getMessageTypes('24h');
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/message-types', { period: '24h' });
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('error'));
    await expect(monitoringService.getMessageTypes()).rejects.toThrow('error');
  });
});
