'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useMemo } from 'react';

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

const DEFAULT_LABEL_MAP: Record<string, string> = {
  admin: 'Admin',
  users: 'Utilisateurs',
  analytics: 'Analytics',
  moderation: 'Modération',
  settings: 'Paramètres',
  messages: 'Messages',
  conversations: 'Conversations',
  communities: 'Communautés',
  broadcasts: 'Diffusions',
  reports: 'Rapports',
  ranking: 'Classement',
  agent: 'Agent IA',
  monitoring: 'Monitoring',
  notifications: 'Notifications',
  'audit-logs': 'Journaux d\'audit',
  'tracking-links': 'Liens de tracking',
  'share-links': 'Liens de partage',
  languages: 'Langues',
  dashboard: 'Tableau de bord',
  contacts: 'Contacts',
  feeds: 'Feeds',
};

export function Breadcrumb({ segments, labelMap, className }: BreadcrumbProps) {
  const pathname = usePathname();

  const resolvedSegments = useMemo<BreadcrumbSegment[]>(() => {
    if (segments) {
      return segments.map((s, i) => ({ ...s, isCurrent: i === segments.length - 1 }));
    }

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length <= 1) return [];

    const merged = { ...DEFAULT_LABEL_MAP, ...labelMap };

    return parts.map((part, i) => ({
      label: merged[part] ?? part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '),
      href: '/' + parts.slice(0, i + 1).join('/'),
      isCurrent: i === parts.length - 1,
    }));
  }, [pathname, segments, labelMap]);

  if (resolvedSegments.length === 0) return null;

  return (
    <nav aria-label="Fil d'Ariane" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" role="list">
        <li>
          <Link
            href="/"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            aria-label="Accueil"
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
