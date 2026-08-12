/**
 * ReportService unit tests
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ReportService, getReportService } from '../../../../services/admin/report.service';

function makePrisma(methods: Partial<{
  create: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  groupBy: jest.Mock;
}> = {}) {
  return {
    report: {
      create: methods.create ?? jest.fn(),
      findUnique: methods.findUnique ?? jest.fn(),
      findMany: methods.findMany ?? jest.fn(),
      count: methods.count ?? jest.fn(),
      update: methods.update ?? jest.fn(),
      delete: methods.delete ?? jest.fn(),
      groupBy: methods.groupBy ?? jest.fn(),
    },
  } as unknown as PrismaClient;
}

function makeReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '507f1f77bcf86cd799439001',
    reportedType: 'message',
    reportedEntityId: '507f1f77bcf86cd799439002',
    reporterId: '507f1f77bcf86cd799439003',
    reporterName: 'Alice',
    reportType: 'spam',
    reason: 'Spam content',
    status: 'pending',
    moderatorId: null as string | null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    resolvedAt: null as Date | null,
    ...overrides,
  };
}

function makeService(prisma?: PrismaClient) {
  return new ReportService(prisma ?? makePrisma());
}

// ─── createReport ──────────────────────────────────────────────────────────────

describe('ReportService.createReport', () => {
  it('creates report with status=pending', async () => {
    const report = makeReport();
    const create = jest.fn().mockResolvedValue(report);
    const svc = makeService(makePrisma({ create }));

    const result = await svc.createReport({
      reportedType: 'message',
      reportedEntityId: '507f1f77bcf86cd799439002',
      reportType: 'spam',
      reporterId: '507f1f77bcf86cd799439003',
      reporterName: 'Alice',
      reason: 'Spam content',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'pending' }),
    });
    expect(result.id).toBe(report.id);
  });

  it('sets optional reporter fields to null when omitted', async () => {
    const report = makeReport({ reporterId: null, reporterName: null });
    const create = jest.fn().mockResolvedValue(report);
    const svc = makeService(makePrisma({ create }));

    await svc.createReport({
      reportedType: 'user',
      reportedEntityId: 'entity-id',
      reportType: 'harassment',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reporterId: null, reporterName: null, reason: null }),
    });
  });
});

// ─── getReportById ────────────────────────────────────────────────────────────

describe('ReportService.getReportById', () => {
  it('returns the report when found', async () => {
    const report = makeReport();
    const findUnique = jest.fn().mockResolvedValue(report);
    const svc = makeService(makePrisma({ findUnique }));

    const result = await svc.getReportById(report.id as string);
    expect(result?.id).toBe(report.id);
  });

  it('returns null when not found', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const svc = makeService(makePrisma({ findUnique }));

    const result = await svc.getReportById('nonexistent');
    expect(result).toBeNull();
  });
});

// ─── listReports ──────────────────────────────────────────────────────────────

describe('ReportService.listReports', () => {
  it('queries with no filters and default pagination', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    const result = await svc.listReports();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    }));
    expect(result).toEqual({ reports: [], total: 0 });
  });

  it('applies all filter types to where clause', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    const after = new Date('2026-01-01');
    const before = new Date('2026-06-01');
    await svc.listReports({
      reportedType: 'message',
      reportType: 'spam',
      status: 'pending',
      reporterId: 'reporter-1',
      moderatorId: 'mod-1',
      createdAfter: after,
      createdBefore: before,
    });

    const callArg = (findMany.mock.calls[0] as any[])[0];
    expect(callArg.where.reportedType).toBe('message');
    expect(callArg.where.reportType).toBe('spam');
    expect(callArg.where.status).toBe('pending');
    expect(callArg.where.reporterId).toBe('reporter-1');
    expect(callArg.where.moderatorId).toBe('mod-1');
    expect(callArg.where.createdAt.gte).toBe(after);
    expect(callArg.where.createdAt.lte).toBe(before);
  });

  it('applies only createdAfter when createdBefore is omitted', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));
    const after = new Date('2026-01-01');

    await svc.listReports({ createdAfter: after });

    const callArg = (findMany.mock.calls[0] as any[])[0];
    expect(callArg.where.createdAt.gte).toBe(after);
    expect(callArg.where.createdAt.lte).toBeUndefined();
  });

  it('applies custom sortBy and sortOrder', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ findMany, count }));

    await svc.listReports({ sortBy: 'updatedAt', sortOrder: 'asc' });

    const callArg = (findMany.mock.calls[0] as any[])[0];
    expect(callArg.orderBy).toEqual({ updatedAt: 'asc' });
  });

  it('applies pagination offset and limit', async () => {
    const findMany = jest.fn().mockResolvedValue([makeReport()]);
    const count = jest.fn().mockResolvedValue(100);
    const svc = makeService(makePrisma({ findMany, count }));

    const result = await svc.listReports({}, { offset: 20, limit: 10 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    expect(result.total).toBe(100);
    expect(result.reports).toHaveLength(1);
  });
});

// ─── updateReport ─────────────────────────────────────────────────────────────

describe('ReportService.updateReport', () => {
  it('sets resolvedAt and moderatorId when status is resolved', async () => {
    const update = jest.fn().mockResolvedValue(makeReport({ status: 'resolved' }));
    const svc = makeService(makePrisma({ update }));

    await svc.updateReport('report-id', 'mod-1', { status: 'resolved' });

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.resolvedAt).toBeInstanceOf(Date);
    expect(callData.moderatorId).toBe('mod-1');
  });

  it('sets resolvedAt and moderatorId when status is rejected', async () => {
    const update = jest.fn().mockResolvedValue(makeReport({ status: 'rejected' }));
    const svc = makeService(makePrisma({ update }));

    await svc.updateReport('report-id', 'mod-1', { status: 'rejected' });

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.resolvedAt).toBeInstanceOf(Date);
  });

  it('assigns moderator even for non-terminal status update', async () => {
    const update = jest.fn().mockResolvedValue(makeReport({ status: 'under_review' }));
    const svc = makeService(makePrisma({ update }));

    await svc.updateReport('report-id', 'mod-1', { status: 'under_review' });

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.moderatorId).toBe('mod-1');
  });

  it('always sets updatedAt', async () => {
    const update = jest.fn().mockResolvedValue(makeReport());
    const svc = makeService(makePrisma({ update }));

    await svc.updateReport('report-id', 'mod-1', {});

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.updatedAt).toBeInstanceOf(Date);
  });

  it('does not set resolvedAt for non-terminal status like under_review', async () => {
    const update = jest.fn().mockResolvedValue(makeReport());
    const svc = makeService(makePrisma({ update }));

    await svc.updateReport('report-id', 'mod-1', { status: 'under_review' });

    const callData = (update.mock.calls[0] as any[])[0].data;
    expect(callData.resolvedAt).toBeUndefined();
  });
});

// ─── deleteReport ─────────────────────────────────────────────────────────────

describe('ReportService.deleteReport', () => {
  it('calls prisma.delete with correct reportId', async () => {
    const del = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(makePrisma({ delete: del }));

    await svc.deleteReport('report-id');

    expect(del).toHaveBeenCalledWith({ where: { id: 'report-id' } });
  });
});

// ─── getReportStats ───────────────────────────────────────────────────────────

describe('ReportService.getReportStats', () => {
  function makeStatsPrisma(opts: {
    total?: number;
    byStatus?: { pending: number; under_review: number; resolved: number; rejected: number; dismissed: number };
    byType?: { reportType: string; _count: { reportType: number } }[];
    byReportedType?: { reportedType: string; _count: { reportedType: number } }[];
    resolvedWithTime?: { createdAt: Date; resolvedAt: Date | null }[];
  } = {}) {
    const { total = 0, byStatus = { pending: 0, under_review: 0, resolved: 0, rejected: 0, dismissed: 0 }, byType = [], byReportedType = [], resolvedWithTime = [] } = opts;

    let countCallIdx = 0;
    const countValues = [total, byStatus.pending, byStatus.under_review, byStatus.resolved, byStatus.rejected, byStatus.dismissed];
    const count = jest.fn().mockImplementation(() => Promise.resolve(countValues[countCallIdx++]));
    const groupBy = jest.fn()
      .mockResolvedValueOnce(byType)
      .mockResolvedValueOnce(byReportedType);
    const findMany = jest.fn().mockResolvedValue(resolvedWithTime);

    return makePrisma({ count, groupBy, findMany });
  }

  it('returns zeroed stats when there are no reports', async () => {
    const svc = makeService(makeStatsPrisma());

    const result = await svc.getReportStats();

    expect(result.totalReports).toBe(0);
    expect(result.pendingReports).toBe(0);
    expect(result.resolvedReports).toBe(0);
    expect(result.averageResolutionTimeHours).toBe(0);
    expect(result.reportsByType).toEqual({});
  });

  it('calculates averageResolutionTimeHours correctly', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const resolvedAt = new Date('2026-01-01T02:00:00Z'); // 2 hours later
    const svc = makeService(makeStatsPrisma({
      total: 1,
      byStatus: { pending: 0, under_review: 0, resolved: 1, rejected: 0, dismissed: 0 },
      resolvedWithTime: [{ createdAt, resolvedAt }],
    }));

    const result = await svc.getReportStats();
    expect(result.averageResolutionTimeHours).toBeCloseTo(2, 1);
  });

  it('skips reports with null resolvedAt in average calculation', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const svc = makeService(makeStatsPrisma({
      resolvedWithTime: [{ createdAt, resolvedAt: null }],
    }));

    const result = await svc.getReportStats();
    expect(result.averageResolutionTimeHours).toBe(0);
  });

  it('maps reportsByType from groupBy results', async () => {
    const svc = makeService(makeStatsPrisma({
      byType: [
        { reportType: 'spam', _count: { reportType: 5 } },
        { reportType: 'harassment', _count: { reportType: 3 } },
      ],
    }));

    const result = await svc.getReportStats();
    expect(result.reportsByType).toEqual({ spam: 5, harassment: 3 });
  });

  it('maps reportsByReportedType from groupBy results', async () => {
    const svc = makeService(makeStatsPrisma({
      byReportedType: [
        { reportedType: 'message', _count: { reportedType: 10 } },
      ],
    }));

    const result = await svc.getReportStats();
    expect(result.reportsByReportedType).toEqual({ message: 10 });
  });
});

// ─── getReportsForEntity ──────────────────────────────────────────────────────

describe('ReportService.getReportsForEntity', () => {
  it('queries by entityType and entityId', async () => {
    const findMany = jest.fn().mockResolvedValue([makeReport()]);
    const svc = makeService(makePrisma({ findMany }));

    await svc.getReportsForEntity('message', 'entity-id');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { reportedType: 'message', reportedEntityId: 'entity-id' },
    }));
  });
});

// ─── hasPendingReports ────────────────────────────────────────────────────────

describe('ReportService.hasPendingReports', () => {
  it('returns true when count > 0', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const svc = makeService(makePrisma({ count }));

    expect(await svc.hasPendingReports('message', 'entity-id')).toBe(true);
  });

  it('returns false when count is 0', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ count }));

    expect(await svc.hasPendingReports('message', 'entity-id')).toBe(false);
  });

  it('checks both pending and under_review statuses', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const svc = makeService(makePrisma({ count }));

    await svc.hasPendingReports('message', 'entity-id');

    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['pending', 'under_review'] } }),
    }));
  });
});

// ─── countReportsForEntity ────────────────────────────────────────────────────

describe('ReportService.countReportsForEntity', () => {
  it('returns count from prisma', async () => {
    const count = jest.fn().mockResolvedValue(7);
    const svc = makeService(makePrisma({ count }));

    const result = await svc.countReportsForEntity('user', 'user-id');
    expect(result).toBe(7);
  });
});

// ─── getRecentReports ────────────────────────────────────────────────────────

describe('ReportService.getRecentReports', () => {
  it('queries reports in the last 24 hours', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService(makePrisma({ findMany }));

    await svc.getRecentReports(5);

    const callArg = (findMany.mock.calls[0] as any[])[0];
    expect(callArg.take).toBe(5);
    expect(callArg.where.createdAt.gte).toBeInstanceOf(Date);
    const diff = Date.now() - (callArg.where.createdAt.gte as Date).getTime();
    expect(diff).toBeLessThan(24 * 60 * 60 * 1000 + 1000); // within 24h + 1s tolerance
  });

  it('defaults limit to 10', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService(makePrisma({ findMany }));

    await svc.getRecentReports();

    expect((findMany.mock.calls[0] as any[])[0].take).toBe(10);
  });
});

// ─── assignModerator ──────────────────────────────────────────────────────────

describe('ReportService.assignModerator', () => {
  it('sets moderatorId and status=under_review', async () => {
    const update = jest.fn().mockResolvedValue(makeReport({ status: 'under_review', moderatorId: 'mod-1' }));
    const svc = makeService(makePrisma({ update }));

    await svc.assignModerator('report-id', 'mod-1');

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'report-id' },
      data: expect.objectContaining({ moderatorId: 'mod-1', status: 'under_review' }),
    }));
  });
});

// ─── getModeratorReports ──────────────────────────────────────────────────────

describe('ReportService.getModeratorReports', () => {
  it('queries reports assigned to moderator with under_review and pending status', async () => {
    const findMany = jest.fn().mockResolvedValue([makeReport()]);
    const svc = makeService(makePrisma({ findMany }));

    const results = await svc.getModeratorReports('mod-1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        moderatorId: 'mod-1',
        status: { in: ['under_review', 'pending'] },
      }),
    }));
    expect(results).toHaveLength(1);
  });
});

// ─── getReportService singleton ───────────────────────────────────────────────

describe('getReportService singleton', () => {
  it('returns the same instance on repeated calls', () => {
    const prisma = makePrisma();
    const s1 = getReportService(prisma);
    const s2 = getReportService(prisma);
    expect(s1).toBe(s2);
  });
});
