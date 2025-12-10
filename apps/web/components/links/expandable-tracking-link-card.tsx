'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Copy,
  Trash2,
  XCircle,
  CheckCircle,
  ExternalLink,
  MousePointerClick,
  Users,
  Calendar,
  Clock,
  BarChart,
  Edit
} from 'lucide-react';
import type { TrackingLink } from '@meeshy/shared/types/tracking-link';
import { useI18n } from '@/hooks/useI18n';
import { useRouter } from 'next/navigation';

interface ExpandableTrackingLinkCardProps {
  link: TrackingLink;
  onCopy: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

export function ExpandableTrackingLinkCard({
  link,
  onCopy,
  onEdit,
  onToggle,
  onDelete
}: ExpandableTrackingLinkCardProps) {
  const { t } = useI18n('links');
  const router = useRouter();

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="relative border-2 hover:border-primary/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950">
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

      <CardContent className="relative z-10 p-4 sm:p-6">
        <div className="flex items-start space-x-3 sm:space-x-4">
          {/* Icon */}
          <div className="p-2 sm:p-2.5 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl flex-shrink-0">
            <BarChart className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 dark:text-purple-400" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header: Short URL + Badge + Menu */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                {link.shortUrl}
              </h3>

              <div className="flex flex-row items-center gap-2 flex-shrink-0">
                <Badge
                  variant={link.isActive ? 'default' : 'secondary'}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold flex-shrink-0 whitespace-nowrap ${
                    link.isActive ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400 hover:bg-gray-500'
                  }`}
                >
                  {link.isActive ? t('status.active') : t('status.inactive')}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-10 sm:w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0">
                      <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span className="sr-only">{t('actions.menu')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 z-[100]">
                    <DropdownMenuItem onClick={onCopy} className="py-3">
                      <Copy className="h-4 w-4 mr-3" />
                      <span className="font-medium">{t('tracking.actions.copyShortUrl')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push(`/links/tracked/${link.token}`)} className="py-3">
                      <BarChart className="h-4 w-4 mr-3" />
                      <span className="font-medium">{t('tracking.actions.viewStats')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onEdit} className="py-3">
                      <Edit className="h-4 w-4 mr-3" />
                      <span className="font-medium">{t('tracking.actions.edit')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onToggle} className="py-3">
                      {link.isActive ? (
                        <>
                          <XCircle className="h-4 w-4 mr-3" />
                          <span className="font-medium">{t('tracking.actions.deactivate')}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-3" />
                          <span className="font-medium">{t('tracking.actions.activate')}</span>
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-red-600 py-3 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4 mr-3" />
                      <span className="font-medium">{t('actions.delete')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Original URL link */}
            <a
              href={link.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs sm:text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left block"
            >
              <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5 inline mr-1" />
              {link.originalUrl}
            </a>

            {/* Stats & Info */}
            <div className="space-y-2">
              {/* Click stats */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center space-x-2">
                  <MousePointerClick className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {link.totalClicks} {t('tracking.stats.totalClicks')}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {link.uniqueClicks} {t('tracking.stats.uniqueClicks')}
                  </span>
                </div>
              </div>

              {/* Dates */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500">
                <div className="flex items-center space-x-1.5">
                  <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>{formatDate(link.createdAt)}</span>
                </div>
                {link.lastClickedAt && (
                  <div className="flex items-center space-x-1.5">
                    <MousePointerClick className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="text-gray-600 dark:text-gray-400 font-medium">
                      {t('tracking.stats.lastClick')}: {formatDate(link.lastClickedAt)}
                    </span>
                  </div>
                )}
                {link.expiresAt && (
                  <div className="flex items-center space-x-1.5">
                    <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="text-orange-600 dark:text-orange-400 font-medium">
                      {new Date(link.expiresAt) > new Date() ? t('status.expires') : t('status.expired')}: {formatDate(link.expiresAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onCopy}
                className="h-9 px-4 border-2 shadow-sm hover:shadow-md transition-all flex-1 sm:flex-none"
              >
                <Copy className="h-4 w-4 mr-2" />
                <span className="text-sm">{t('actions.copy')}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/links/tracked/${link.token}`)}
                className="h-9 px-4 border-2 shadow-sm hover:shadow-md transition-all flex-1 sm:flex-none"
              >
                <BarChart className="h-4 w-4 mr-2" />
                <span className="text-sm hidden sm:inline">{t('tracking.actions.viewStats')}</span>
                <span className="text-sm sm:hidden">{t('tracking.stats.stats')}</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
