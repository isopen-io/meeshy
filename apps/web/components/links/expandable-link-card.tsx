'use client';

import { useRouter } from 'next/navigation';
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
  Link2,
  Users,
  Activity,
  MoreVertical,
  Copy,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
  MessageSquare,
  Calendar,
  Image,
  FileText,
  Clock,
  ExternalLink as ExternalLinkIcon
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { copyToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';

interface ConversationLink {
  id: string;
  linkId: string;
  name?: string;
  description?: string;
  conversationId: string;
  isActive: boolean;
  currentUses: number;
  maxUses?: number;
  currentConcurrentUsers: number;
  maxConcurrentUsers?: number;
  expiresAt?: string;
  createdAt: string;
  allowAnonymousMessages: boolean;
  allowAnonymousImages: boolean;
  allowAnonymousFiles: boolean;
  allowViewHistory?: boolean;
  requireAccount?: boolean;  // Ajouter ce champ
  requireEmail?: boolean;
  requireName?: boolean;
  requireBirthday?: boolean;
  conversation: {
    id: string;
    title?: string;
    type: string;
    conversationUrl?: string;
  };
  stats?: {
    totalParticipants: number;
    languageCount: number;
  };
}

interface ExpandableLinkCardProps {
  link: ConversationLink;
  onCopy: (linkId: string) => void;
  onEdit: (link: ConversationLink) => void;
  onToggle: (link: ConversationLink) => void;
  onExtend: (link: ConversationLink, days: number) => void;
  onDelete: (link: ConversationLink) => void;
}

export function ExpandableLinkCard({
  link,
  onCopy,
  onEdit,
  onToggle,
  onExtend,
  onDelete
}: ExpandableLinkCardProps) {
  const { t } = useI18n('links');
  const router = useRouter();

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleCopyLink = async () => {
    const linkUrl = `${window.location.origin}/join/${link.linkId}`;
    const result = await copyToClipboard(linkUrl);
    if (result.success) {
      toast.success(t('success.linkCopied'));
    } else {
      toast.error(result.message);
    }
  };

  return (
    <Card className="relative border-2 hover:border-primary/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

      <CardContent className="relative z-10 p-4 sm:p-6">
        <div className="flex items-start space-x-3 sm:space-x-4">
          {/* Icon */}
          <div className="p-2 sm:p-2.5 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl flex-shrink-0">
            <Link2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header: Title + Badge + Menu */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                {link.name || t('unnamedLink')}
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
                    <DropdownMenuItem onClick={handleCopyLink} className="py-3">
                      <Copy className="h-4 w-4 mr-3" />
                      <span className="font-medium">{t('actions.copy')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push(`/join/${link.linkId}`)} className="py-3">
                      <ExternalLinkIcon className="h-4 w-4 mr-3" />
                      <span className="font-medium">{t('actions.view')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(link)} className="py-3">
                      <Edit className="h-4 w-4 mr-3" />
                      <span className="font-medium">{t('actions.edit')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggle(link)} className="py-3">
                      {link.isActive ? (
                        <>
                          <XCircle className="h-4 w-4 mr-3" />
                          <span className="font-medium">{t('actions.disable')}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-3" />
                          <span className="font-medium">{t('actions.enable')}</span>
                        </>
                      )}
                    </DropdownMenuItem>
                    {link.expiresAt && (
                      <DropdownMenuItem onClick={() => onExtend(link, 7)} className="py-3">
                        <RefreshCw className="h-4 w-4 mr-3" />
                        <span className="font-medium">{t('actions.extend7Days')}</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDelete(link)}
                      className="text-red-600 py-3 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4 mr-3" />
                      <span className="font-medium">{t('actions.delete')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Conversation link */}
            <button
              onClick={() => router.push(`/conversations/${link.conversationId}`)}
              className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left"
            >
              <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5 inline mr-1" />
              {link.conversation.title}
            </button>

            {/* Stats & Info */}
            <div className="space-y-2">
              {/* Usage stats */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center space-x-2">
                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {link.currentUses} / {link.maxUses || '∞'} {t('stats.uses')}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {link.currentConcurrentUsers} {t('stats.active')}
                  </span>
                </div>
              </div>

              {/* Permissions badges - compact display */}
              {(link.allowAnonymousMessages || link.allowAnonymousImages || link.allowAnonymousFiles) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {link.allowAnonymousMessages && (
                    <Badge variant="outline" className="text-xs px-2 py-0.5">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {t('permissions.messages')}
                    </Badge>
                  )}
                  {link.allowAnonymousImages && (
                    <Badge variant="outline" className="text-xs px-2 py-0.5">
                      <Image className="h-3 w-3 mr-1" />
                      {t('permissions.images')}
                    </Badge>
                  )}
                  {link.allowAnonymousFiles && (
                    <Badge variant="outline" className="text-xs px-2 py-0.5">
                      <FileText className="h-3 w-3 mr-1" />
                      {t('permissions.files')}
                    </Badge>
                  )}
                </div>
              )}

              {/* Dates & Expiry */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500">
                <div className="flex items-center space-x-1.5">
                  <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>{formatDate(link.createdAt)}</span>
                </div>
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

            {/* Copy URL button */}
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyLink}
                className="h-9 px-4 border-2 shadow-sm hover:shadow-md transition-all w-full sm:w-auto"
              >
                <Copy className="h-4 w-4 mr-2" />
                <span className="text-sm">{t('actions.copy')}</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
