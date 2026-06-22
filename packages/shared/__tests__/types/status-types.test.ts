import { describe, it, expect } from 'vitest';
import {
  PROCESS_STATUS_ALIASES,
  DELIVERY_STATUS_ORDER,
  normalizeProcessStatus,
  toUITranslationStatus,
  isDeliveryStatusBetter,
  aggregateHealthStatus,
  type ProcessStatus,
  type TranslationStatus,
  type DeliveryStatus,
  type ServiceHealthStatus,
} from '../../types/status-types.js';

describe('PROCESS_STATUS_ALIASES', () => {
  it('maps legacy aliases to canonical ProcessStatus values', () => {
    expect(PROCESS_STATUS_ALIASES['processing']).toBe('in_progress');
    expect(PROCESS_STATUS_ALIASES['translating']).toBe('in_progress');
    expect(PROCESS_STATUS_ALIASES['done']).toBe('completed');
    expect(PROCESS_STATUS_ALIASES['success']).toBe('completed');
    expect(PROCESS_STATUS_ALIASES['error']).toBe('failed');
  });
});

describe('normalizeProcessStatus', () => {
  it('returns canonical status for recognized aliases', () => {
    expect(normalizeProcessStatus('processing')).toBe('in_progress');
    expect(normalizeProcessStatus('translating')).toBe('in_progress');
    expect(normalizeProcessStatus('done')).toBe('completed');
    expect(normalizeProcessStatus('success')).toBe('completed');
    expect(normalizeProcessStatus('error')).toBe('failed');
  });

  it('passes through canonical ProcessStatus values unchanged', () => {
    const statuses: ProcessStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
    for (const s of statuses) {
      expect(normalizeProcessStatus(s)).toBe(s);
    }
  });

  it('lowercases input before lookup', () => {
    expect(normalizeProcessStatus('PROCESSING')).toBe('in_progress');
    expect(normalizeProcessStatus('Done')).toBe('completed');
    expect(normalizeProcessStatus('ERROR')).toBe('failed');
  });

  it('passes through unknown status values as-is (lowercased)', () => {
    expect(normalizeProcessStatus('QUEUED')).toBe('queued');
    expect(normalizeProcessStatus('unknown_state')).toBe('unknown_state');
  });
});

describe('toUITranslationStatus', () => {
  it('maps pending → pending', () => {
    expect(toUITranslationStatus('pending')).toBe('pending');
  });

  it('maps in_progress → translating', () => {
    expect(toUITranslationStatus('in_progress')).toBe('translating');
  });

  it('maps completed → completed', () => {
    expect(toUITranslationStatus('completed')).toBe('completed');
  });

  it('maps cached → completed', () => {
    expect(toUITranslationStatus('cached')).toBe('completed');
  });

  it('maps failed → failed', () => {
    expect(toUITranslationStatus('failed')).toBe('failed');
  });

  it('maps cancelled → failed', () => {
    expect(toUITranslationStatus('cancelled')).toBe('failed');
  });

  it('maps unknown status → pending (default branch)', () => {
    expect(toUITranslationStatus('unknown_status' as TranslationStatus)).toBe('pending');
  });
});

describe('DELIVERY_STATUS_ORDER', () => {
  it('defines a monotonically increasing order for delivery progression', () => {
    expect(DELIVERY_STATUS_ORDER['failed']).toBeLessThan(DELIVERY_STATUS_ORDER['sent']);
    expect(DELIVERY_STATUS_ORDER['sent']).toBeLessThan(DELIVERY_STATUS_ORDER['delivered']);
    expect(DELIVERY_STATUS_ORDER['delivered']).toBeLessThan(DELIVERY_STATUS_ORDER['read']);
  });

  it('contains entries for all DeliveryStatus values', () => {
    const statuses: DeliveryStatus[] = ['sent', 'delivered', 'read', 'failed'];
    for (const s of statuses) {
      expect(typeof DELIVERY_STATUS_ORDER[s]).toBe('number');
    }
  });
});

describe('isDeliveryStatusBetter', () => {
  it('returns true when newStatus has a higher order than currentStatus', () => {
    expect(isDeliveryStatusBetter('delivered', 'sent')).toBe(true);
    expect(isDeliveryStatusBetter('read', 'delivered')).toBe(true);
    expect(isDeliveryStatusBetter('read', 'sent')).toBe(true);
    expect(isDeliveryStatusBetter('sent', 'failed')).toBe(true);
  });

  it('returns false when newStatus is equal to currentStatus', () => {
    expect(isDeliveryStatusBetter('sent', 'sent')).toBe(false);
    expect(isDeliveryStatusBetter('read', 'read')).toBe(false);
    expect(isDeliveryStatusBetter('failed', 'failed')).toBe(false);
  });

  it('returns false when newStatus has a lower order than currentStatus', () => {
    expect(isDeliveryStatusBetter('sent', 'delivered')).toBe(false);
    expect(isDeliveryStatusBetter('delivered', 'read')).toBe(false);
    expect(isDeliveryStatusBetter('failed', 'sent')).toBe(false);
  });
});

describe('aggregateHealthStatus', () => {
  it('returns healthy when all statuses are healthy', () => {
    expect(aggregateHealthStatus(['healthy', 'healthy', 'healthy'])).toBe('healthy');
  });

  it('returns healthy for empty input', () => {
    expect(aggregateHealthStatus([])).toBe('healthy');
  });

  it('returns degraded when at least one status is degraded and none are unhealthy', () => {
    expect(aggregateHealthStatus(['healthy', 'degraded', 'healthy'])).toBe('degraded');
    expect(aggregateHealthStatus(['degraded'])).toBe('degraded');
    expect(aggregateHealthStatus(['degraded', 'degraded'])).toBe('degraded');
  });

  it('returns unhealthy when at least one status is unhealthy', () => {
    expect(aggregateHealthStatus(['healthy', 'unhealthy', 'healthy'])).toBe('unhealthy');
    expect(aggregateHealthStatus(['degraded', 'unhealthy'])).toBe('unhealthy');
    expect(aggregateHealthStatus(['unhealthy'])).toBe('unhealthy');
  });

  it('unhealthy takes priority over degraded', () => {
    const statuses: ServiceHealthStatus[] = ['degraded', 'unhealthy', 'healthy'];
    expect(aggregateHealthStatus(statuses)).toBe('unhealthy');
  });
});
