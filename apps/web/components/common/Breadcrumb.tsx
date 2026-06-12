'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/use-i18n';

interface BreadcrumbSegment {
  label: string;
  href: string;
  isCurrent: boolean;
}

interface BreadcrumbProps {
  /** Override automatic path-based segments with explicit ones */
  segments?: Omit<BreadcrumbSegment, 'isCurrent'>[];
  /** Map path segments to human-readable labels */
  labelMap?: Record<string, string>;
  className?: string;
}

const DEFAULT_LABEL_KEYS: Record<string, string> = {
  admin: 'breadcrumbLabels.admin',
  users: 'breadcrumbLabels.users',
  analytics: 'breadcrumbLabels.analytics',
  moderation: 'breadcrumbLabels.moderation',
  settings: 'breadcrumbLabels.settings',
  messages: 'breadcrumbLabels.messages',
  conversations: 'breadcrumbLabels.conversations',
  communities: 'breadcrumbLabels.communities',
  broadcasts: 'breadcrumbLabels.broadcasts',
  reports: 'breadcrumbLabels.reports',
  ranking: 'breadcrumbLabels.ranking',
  agent: 'breadcrumbLabels.agent',
  monitoring: 'breadcrumbLabels.monitoring',
  notifications: 'breadcrumbLabels.notifications',
  'audit-logs': 'breadcrumbLabels.auditLogs',
  'tracking-links': 'breadcrumbLabels.trackingLinks',
  'share-links': 'breadcrumbLabels.shareLinks',
  languages: 'breadcrumbLabels.languages',
  dashboard: 'breadcrumbLabels.dashboard',
  contacts: 'breadcrumbLabels.contacts',
  feeds: 'breadcrumbLabels.feeds',
};

export function Breadcrumb({ segments, labelMap, className }: BreadcrumbProps) {
  const pathname = usePathname();
  const { t } = useI18n('common');

  const resolvedSegments = useMemo<BreadcrumbSegment[]>(() => {
    if (segments) {
      return segments.map((s, i) => ({ ...s, isCurrent: i === segments.length - 1 }));
    }

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length <= 1) return [];

    return parts.map((part, i) => {
      const fallback = part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ');
      const labelKey = DEFAULT_LABEL_KEYS[part];
      const defaultLabel = labelKey ? t(labelKey, fallback) : fallback;

      return {
        label: labelMap?.[part] ?? defaultLabel,
        href: '/' + parts.slice(0, i + 1).join('/'),
        isCurrent: i === parts.length - 1,
      };
    });
  }, [pathname, segments, labelMap, t]);

  if (resolvedSegments.length === 0) return null;

  return (
    <nav aria-label={t('breadcrumb')} className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" role="list">
        <li>
          <Link
            href="/"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            aria-label={t('home')}
          >
            <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        </li>

        {resolvedSegments.map((segment) => (
          <li key={segment.href} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
            {segment.isCurrent ? (
              <span
                className="font-medium text-foreground truncate max-w-[200px]"
                aria-current="page"
              >
                {segment.label}
              </span>
            ) : (
              <Link
                href={segment.href}
                className="truncate max-w-[200px] hover:text-foreground transition-colors"
              >
                {segment.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
