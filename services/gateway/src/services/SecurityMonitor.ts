/**
 * Security Monitor Service
 * Real-time security event monitoring, anomaly detection, and alerting
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { EmailService } from './EmailService';
import type {
  VSecurityEventType,
  VSecuritySeverity,
  VSecurityStatus,
} from '@meeshy/shared/utils/validation';

// Types re-exported with standard naming convention
export type SecurityEventType = VSecurityEventType;
export type SecuritySeverity = VSecuritySeverity;
export type SecurityStatus = VSecurityStatus;

export interface SecurityEventData {
  userId?: string | null;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  status: SecurityStatus;
  description?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  geoLocation?: string;
}

export interface SecurityAlert {
  severity: SecuritySeverity;
  eventType: SecurityEventType;
  message: string;
  details: any;
  timestamp: Date;
}

export class SecurityMonitor {
  private alertThresholds: Map<SecurityEventType, number> = new Map();
  private eventCounts: Map<string, { count: number; firstSeen: Date }> = new Map();
  private admins: string[] = []; // Admin email addresses for alerts

  constructor(
    private prisma: PrismaClient,
    private emailService?: EmailService
  ) {
    this.initializeThresholds();
    this.loadAdminEmails();
    this.startEventCountCleanup();
  }

  /**
   * Log security event to database
   */
  async logEvent(data: SecurityEventData): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: {
          userId: data.userId || null,
          eventType: data.eventType,
          severity: data.severity,
          status: data.status,
          description: data.description,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          deviceFingerprint: data.deviceFingerprint,
          geoLocation: data.geoLocation
        }
      });

      // Check for anomalies and send alerts if needed
      await this.checkThresholds(data);
    } catch (error) {
      console.error('[SecurityMonitor] Failed to log security event:', error);
    }
  }

  /**
   * Log multiple events in batch
   */
  async logBatch(events: SecurityEventData[]): Promise<void> {
    try {
      await this.prisma.securityEvent.createMany({
        data: events.map(event => ({
          userId: event.userId || null,
          eventType: event.eventType,
          severity: event.severity,
          status: event.status,
          description: event.description,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          deviceFingerprint: event.deviceFingerprint,
          geoLocation: event.geoLocation
        }))
      });
    } catch (error) {
      console.error('[SecurityMonitor] Failed to log batch security events:', error);
    }
  }

  /**
   * Get recent security events
   */
  async getRecentEvents(
    hours: number = 24,
    severity?: SecuritySeverity
  ): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.prisma.securityEvent.findMany({
      where: {
        createdAt: { gte: since },
        ...(severity && { severity })
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }

  /**
   * Get security metrics
   */
  async getMetrics(hours: number = 24): Promise<any> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const events = await this.prisma.securityEvent.groupBy({
      by: ['eventType', 'severity'],
      where: {
        createdAt: { gte: since }
      },
      _count: {
        id: true
      }
    });

    const totalEvents = await this.prisma.securityEvent.count({
      where: {
        createdAt: { gte: since }
      }
    });

    const criticalEvents = await this.prisma.securityEvent.count({
      where: {
        createdAt: { gte: since },
        severity: 'CRITICAL'
      }
    });

    const highEvents = await this.prisma.securityEvent.count({
      where: {
        createdAt: { gte: since },
        severity: 'HIGH'
      }
    });

    return {
      period: `${hours}h`,
      totalEvents,
      criticalEvents,
      highEvents,
      eventsByType: events,
      timestamp: new Date()
    };
  }

  /**
   * Get events for specific user
   */
  async getUserEvents(userId: string, hours: number = 24): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.prisma.securityEvent.findMany({
      where: {
        userId,
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Initialize alert thresholds (events per hour)
   */
  private initializeThresholds(): void {
    this.alertThresholds.set('PASSWORD_RESET_FAILED', 10);
    this.alertThresholds.set('ACCOUNT_LOCKED', 5);
    this.alertThresholds.set('RATE_LIMIT_EXCEEDED', 20);
    this.alertThresholds.set('SUSPICIOUS_PASSWORD_RESET', 1);
    this.alertThresholds.set('IMPOSSIBLE_TRAVEL', 1);
    this.alertThresholds.set('TWO_FA_FAILED', 5);
    this.alertThresholds.set('LOGIN_FAILED', 50);
  }

  /**
   * Check if event count exceeds thresholds
   */
  private async checkThresholds(event: SecurityEventData): Promise<void> {
    const threshold = this.alertThresholds.get(event.eventType);
    if (!threshold) return;

    const key = `${event.eventType}:${event.ipAddress || 'unknown'}`;
    const existing = this.eventCounts.get(key);

    if (existing) {
      const hoursSinceFirst = (Date.now() - existing.firstSeen.getTime()) / (1000 * 60 * 60);

      if (hoursSinceFirst < 1) {
        existing.count++;

        if (existing.count >= threshold) {
          await this.sendAlert({
            severity: event.severity,
            eventType: event.eventType,
            message: `Threshold exceeded for ${event.eventType}`,
            details: {
              count: existing.count,
              threshold,
              ipAddress: event.ipAddress,
              timeWindow: '1 hour'
            },
            timestamp: new Date()
          });
        }
      } else {
        // Reset counter after 1 hour
        this.eventCounts.set(key, { count: 1, firstSeen: new Date() });
      }
    } else {
      this.eventCounts.set(key, { count: 1, firstSeen: new Date() });
    }

    // Always send immediate alerts for CRITICAL events
    if (event.severity === 'CRITICAL') {
      await this.sendAlert({
        severity: 'CRITICAL',
        eventType: event.eventType,
        message: `CRITICAL security event: ${event.eventType}`,
        details: event.metadata || {},
        timestamp: new Date()
      });
    }
  }

  /**
   * Send security alert
   */
  private async sendAlert(alert: SecurityAlert): Promise<void> {
    console.warn('[SecurityMonitor] SECURITY ALERT:', alert);

    // Send email alerts to admins
    if (this.emailService && this.admins.length > 0) {
      for (const adminEmail of this.admins) {
        try {
          await this.emailService.sendSecurityAlertEmail({
            to: adminEmail,
            name: 'Security Team',
            alertType: `${alert.severity}: ${alert.eventType}`,
            details: JSON.stringify(alert.details, null, 2)
          });
        } catch (error) {
          console.error('[SecurityMonitor] Failed to send alert email:', error);
        }
      }
    }

    // TODO: Send to Slack, PagerDuty, or other alerting systems
  }

  /**
   * Load admin email addresses from environment or database
   */
  private loadAdminEmails(): void {
    const adminEmailsEnv = process.env.SECURITY_ADMIN_EMAILS;
    if (adminEmailsEnv) {
      this.admins = adminEmailsEnv.split(',').map(email => email.trim());
    }
  }

  /**
   * Add admin email for alerts
   */
  addAdminEmail(email: string): void {
    if (!this.admins.includes(email)) {
      this.admins.push(email);
    }
  }

  /**
   * Remove admin email
   */
  removeAdminEmail(email: string): void {
    this.admins = this.admins.filter(e => e !== email);
  }

  /**
   * Start cleanup interval for event counts
   */
  private startEventCountCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let deletedCount = 0;

      for (const [key, data] of this.eventCounts.entries()) {
        const hoursSinceFirst = (now - data.firstSeen.getTime()) / (1000 * 60 * 60);
        if (hoursSinceFirst > 1) {
          this.eventCounts.delete(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`[SecurityMonitor] Cleaned ${deletedCount} expired event counters`);
      }
    }, 600000); // Run every 10 minutes
  }

  /**
   * Get current alert statistics
   */
  getAlertStats(): any {
    return {
      thresholds: Array.from(this.alertThresholds.entries()).map(([event, threshold]) => ({
        event,
        threshold
      })),
      activeCounters: this.eventCounts.size,
      adminEmails: this.admins.length
    };
  }
}
