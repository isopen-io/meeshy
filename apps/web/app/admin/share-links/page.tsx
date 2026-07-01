'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { isExpired } from '@/utils/time-remaining';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Link,
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  User,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  Clock,
  FileText,
  Image,
  MessageSquare,
  MoreVertical
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { copyToClipboard as copyTextToClipboard } from '@/lib/clipboard';

interface ShareLink {
  id: string;
  linkId: string;
  identifier?: string;
  name?: string;
  description?: string;
  maxUses?: number;
  currentUses: number;
  maxConcurrentUsers?: number;
  currentConcurrentUsers: number;
  expiresAt?: string;
  isActive: boolean;
  allowAnonymousMessages: boolean;
  allowAnonymousFiles: boolean;
  allowAnonymousImages: boolean;
  createdAt: string;
  creator: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  conversation: {
    id: string;
    identifier?: string;
    title?: string;
    type: string;
  };
  _count: {
    anonymousParticipants: number;
  };
}

export default function AdminShareLinksPage() {
  const router = useRouter();
  const { t, locale } = useI18n('admin');
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; linkId: string | null }>({
    open: false,
    linkId: null
  });

  useEffect(() => {
    loadShareLinks();
  }, [currentPage, searchTerm, statusFilter, pageSize]);

  const loadShareLinks = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * pageSize;
      const response = await adminService.getShareLinks(
        offset,
        pageSize,
        searchTerm || undefined,
        statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined
      );

      if (response.data) {
        setShareLinks(response.data.shareLinks || []);
        setTotalCount(response.data.pagination?.total || 0);
        setTotalPages(Math.ceil((response.data.pagination?.total || 0) / pageSize));
      } else {
        setShareLinks([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des liens de partage:', error);
      toast.error(t('shareLinks.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFilterChange = (value: string) => {
    setStatusFilter(value === 'all' ? '' : value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setCurrentPage(1);
    setPageSize(newSize);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };


  const copyToClipboard = async (text: string) => {
    const { success } = await copyTextToClipboard(text);
    if (success) {
      toast.success(t('shareLinks.copiedToClipboard'));
    } else {
      toast.error(t('shareLinks.copyError'));
    }
  };

  const handleDeleteLink = async () => {
    try {
      // TODO: Implement actual delete API call
      // await adminService.deleteShareLink(deleteDialog.linkId);
      toast.success(t('shareLinks.deleteSuccess'));
      loadShareLinks();
    } catch (error) {
      console.error('Erreur lors de la suppression du lien:', error);
      toast.error(t('shareLinks.deleteError'));
    }
  };

  if (loading) {
    return (
      <AdminLayout currentPage="/admin/share-links">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">{t('shareLinks.loading')}</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/share-links">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              onClick={() => router.push('/admin')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{t('shareLinks.back')}</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('shareLinks.pageTitle')}</h1>
              <p className="text-gray-600">{t('shareLinks.pageSubtitle')}</p>
            </div>
          </div>
          <Button className="flex items-center space-x-2">
            <Link className="h-4 w-4" />
            <span>{t('shareLinks.newLink')}</span>
          </Button>
        </div>

        {/* Filtres */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>{t('shareLinks.filtersTitle')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('shareLinks.searchLabel')}</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t('shareLinks.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('shareLinks.statusLabel')}</label>
                <Select value={statusFilter || 'all'} onValueChange={handleFilterChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('shareLinks.allStatuses')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('shareLinks.allStatuses')}</SelectItem>
                    <SelectItem value="active">{t('shareLinks.statusActive')}</SelectItem>
                    <SelectItem value="inactive">{t('shareLinks.statusInactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('shareLinks.perPage')}</label>
                <Select value={String(pageSize)} onValueChange={(val) => handlePageSizeChange(Number(val))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">{t('shareLinks.perPage20')}</SelectItem>
                    <SelectItem value="50">{t('shareLinks.perPage50')}</SelectItem>
                    <SelectItem value="100">{t('shareLinks.perPage100')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('shareLinks.actionsLabel')}</label>
                <Button
                  variant="outline"
                  onClick={loadShareLinks}
                  className="w-full"
                >
                  {t('shareLinks.refresh')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t('shareLinks.statTotal')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
              <Badge variant="outline" className="mt-1">{t('shareLinks.statTotalBadge')}</Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t('shareLinks.statActive')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {shareLinks?.filter(link => link.isActive && !isExpired(link.expiresAt)).length || 0}
              </div>
              <Badge variant="outline" className="mt-1">{t('shareLinks.statActiveBadge')}</Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t('shareLinks.statParticipants')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {shareLinks?.reduce((acc, link) => acc + link._count.anonymousParticipants, 0) || 0}
              </div>
              <Badge variant="outline" className="mt-1">{t('shareLinks.statParticipantsBadge')}</Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t('shareLinks.statUsages')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {shareLinks?.reduce((acc, link) => acc + link.currentUses, 0) || 0}
              </div>
              <Badge variant="outline" className="mt-1">{t('shareLinks.statUsagesBadge')}</Badge>
            </CardContent>
          </Card>
        </div>

        {/* Liste des liens de partage */}
        <Card className="flex flex-col max-h-[calc(100vh-32rem)]">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="flex items-center space-x-2">
              <Link className="h-5 w-5" />
              <span>{t('shareLinks.listTitle', { count: totalCount })}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {!shareLinks || shareLinks.length === 0 ? (
              <div className="text-center py-12">
                <Link className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t('shareLinks.empty')}
                </h3>
                <p className="text-gray-600">
                  {t('shareLinks.emptySubtitle')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {shareLinks.map((shareLink) => (
                  <div key={shareLink.id} className="border rounded-lg p-6 hover:bg-gray-50">
                    <div className="space-y-4">
                      {/* En-tête avec statut et actions */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate max-w-md">
                              {shareLink.name || shareLink.identifier || shareLink.linkId}
                            </h3>
                            {shareLink.isActive ? (
                              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 flex-shrink-0">
                                {t('shareLinks.badgeActive')}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="flex-shrink-0">{t('shareLinks.badgeInactive')}</Badge>
                            )}
                            {isExpired(shareLink.expiresAt) && (
                              <Badge variant="destructive" className="flex-shrink-0">{t('shareLinks.badgeExpired')}</Badge>
                            )}
                          </div>

                          {shareLink.description && (
                            <p className="text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{shareLink.description}</p>
                          )}

                          <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                            <div className="flex items-center space-x-1">
                              <Link className="h-4 w-4" />
                              <span className="font-mono text-xs">{shareLink.linkId}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <User className="h-4 w-4" />
                              <span>{t('shareLinks.createdBy', { name: shareLink.creator.displayName || shareLink.creator.username })}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(shareLink.createdAt)}</span>
                            </div>
                            {shareLink.expiresAt && (
                              <div className="flex items-center space-x-1">
                                <Clock className="h-4 w-4" />
                                <span>{t('shareLinks.expiresAt', { date: formatDate(shareLink.expiresAt) })}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Boutons d'action - responsive */}
                        <div className="flex items-center space-x-2">
                          {/* Primary action - always visible */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(shareLink.linkId)}
                          >
                            <Copy className="h-4 w-4" />
                            <span className="sr-only sm:not-sr-only sm:ml-1">{t('shareLinks.copy')}</span>
                          </Button>

                          {/* Mobile dropdown for secondary actions */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="md:hidden">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => window.open(`/tracked/${shareLink.linkId}`, '_blank', 'noopener,noreferrer')}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {t('shareLinks.open')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/admin/share-links/${shareLink.id}`)}>
                                <Edit className="mr-2 h-4 w-4" />
                                {t('shareLinks.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setDeleteDialog({ open: true, linkId: shareLink.id })}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('shareLinks.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {/* Desktop - all actions visible */}
                          <div className="hidden md:flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(`/tracked/${shareLink.linkId}`, '_blank', 'noopener,noreferrer')}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              {t('shareLinks.open')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/admin/share-links/${shareLink.id}`)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              {t('shareLinks.edit')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700 dark:text-red-400"
                              onClick={() => setDeleteDialog({ open: true, linkId: shareLink.id })}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              {t('shareLinks.delete')}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Informations de la conversation */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <MessageSquare className="h-4 w-4 text-gray-600" />
                          <span className="font-medium text-gray-900">{t('shareLinks.linkedConversation')}</span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <div className="flex items-center space-x-4">
                            <span>
                              {shareLink.conversation.title || 
                               shareLink.conversation.identifier || 
                               t('shareLinks.noName')}
                            </span>
                            <Badge variant="outline">
                              {shareLink.conversation.type}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Statistiques d'utilisation */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{shareLink.currentUses}</div>
                          <div className="text-sm text-gray-600">{t('shareLinks.usageCount')}</div>
                          {shareLink.maxUses && (
                            <div className="text-xs text-gray-500">/ {shareLink.maxUses} max</div>
                          )}
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">{shareLink.currentConcurrentUsers}</div>
                          <div className="text-sm text-gray-600">{t('shareLinks.concurrentUsers')}</div>
                          {shareLink.maxConcurrentUsers && (
                            <div className="text-xs text-gray-500">/ {shareLink.maxConcurrentUsers} max</div>
                          )}
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">{shareLink._count.anonymousParticipants}</div>
                          <div className="text-sm text-gray-600">{t('shareLinks.uniqueParticipants')}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">
                            {[shareLink.allowAnonymousMessages, shareLink.allowAnonymousFiles, shareLink.allowAnonymousImages].filter(Boolean).length}
                          </div>
                          <div className="text-sm text-gray-600">{t('shareLinks.grantedPermissions')}</div>
                        </div>
                      </div>

                      {/* Permissions détaillées */}
                      <div className="flex items-center space-x-4 text-sm">
                        <div className="flex items-center space-x-1">
                          {shareLink.allowAnonymousMessages ? (
                            <MessageSquare className="h-4 w-4 text-green-600" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-gray-400" />
                          )}
                          <span className={shareLink.allowAnonymousMessages ? 'text-green-600' : 'text-gray-400'}>
                            Messages
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {shareLink.allowAnonymousFiles ? (
                            <FileText className="h-4 w-4 text-green-600" />
                          ) : (
                            <FileText className="h-4 w-4 text-gray-400" />
                          )}
                          <span className={shareLink.allowAnonymousFiles ? 'text-green-600' : 'text-gray-400'}>
                            Fichiers
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {shareLink.allowAnonymousImages ? (
                            <Image className="h-4 w-4 text-green-600" />
                          ) : (
                            <Image className="h-4 w-4 text-gray-400" />
                          )}
                          <span className={shareLink.allowAnonymousImages ? 'text-green-600' : 'text-gray-400'}>
                            Images
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-600">
{t('shareLinks.paginationInfo', { page: currentPage, total: totalPages, count: totalCount })}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    {t('shareLinks.prev')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    {t('shareLinks.next')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteDialog.open}
          onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
          onConfirm={() => {
            handleDeleteLink();
            setDeleteDialog({ open: false, linkId: null });
          }}
          title={t('shareLinks.deleteTitle')}
          description={t('shareLinks.deleteDescription')}
          confirmText={t('shareLinks.deleteConfirm')}
          variant="destructive"
        />
      </div>
    </AdminLayout>
  );
}
