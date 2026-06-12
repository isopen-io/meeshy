'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Search, Users, UserCheck, Globe, MessageSquare, Calendar, MapPin, Eye, ExternalLink, Shield, Clock, Link2 } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { adminService, AnonymousUser } from '@/services/admin.service';

export default function AdminAnonymousUsersPage() {
  const router = useRouter();
  const { t, locale } = useI18n('admin');
  const [anonymousUsers, setAnonymousUsers] = useState<AnonymousUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AnonymousUser | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [pageSize, setPageSize] = useState(20);

  const loadAnonymousUsers = async (page: number = 1, search?: string, status?: string) => {
    try {
      setLoading(true);
      const offset = (page - 1) * pageSize;
      const response = await adminService.getAnonymousUsers(offset, pageSize, search, status);

      if (response.data) {
        setAnonymousUsers(response.data.anonymousUsers || []);
        setTotalPages(Math.ceil((response.data.pagination?.total || 0) / pageSize));
        setTotalCount(response.data.pagination?.total || 0);
        setHasMore(response.data.pagination?.hasMore || false);
        setCurrentPage(page);
      } else {
        setAnonymousUsers([]);
        setTotalPages(1);
        setTotalCount(0);
        setHasMore(false);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des utilisateurs anonymes:', error);
      toast.error(t('anonUsers.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnonymousUsers();
  }, [pageSize]);

  const handleSearch = () => {
    loadAnonymousUsers(1, searchTerm || undefined, statusFilter || undefined);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    loadAnonymousUsers(1, searchTerm || undefined, status || undefined);
  };

  const handlePageSizeChange = (newSize: number) => {
    setCurrentPage(1);
    setPageSize(newSize);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString(locale);
  };

  const getStatusBadge = (isActive: boolean, isOnline: boolean) => {
    if (isActive && isOnline) {
      return <Badge className="bg-green-100 text-green-800">{t('anonUsers.statusActive')}</Badge>;
    } else if (isActive && !isOnline) {
      return <Badge className="bg-yellow-100 text-yellow-800">{t('anonUsers.statusInactive')}</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">{t('anonUsers.statusDisabled')}</Badge>;
    }
  };

  if (loading) {
    return (
      <AdminLayout currentPage="/admin/anonymous-users">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">{t('anonUsers.loading')}</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/anonymous-users">
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
              <span>{t('anonUsers.backButton')}</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('anonUsers.pageTitle')}</h1>
              <p className="text-gray-600">{t('anonUsers.pageSubtitle')}</p>
            </div>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('anonUsers.statTotal')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
              <p className="text-xs text-muted-foreground">
{t('anonUsers.statTotalDesc')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('anonUsers.statActive')}</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {anonymousUsers?.filter(u => u.isActive && u.isOnline).length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
{t('anonUsers.statActiveDesc')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('anonUsers.statMessages')}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {anonymousUsers?.reduce((sum, u) => sum + u._count.sentMessages, 0) || 0}
              </div>
              <p className="text-xs text-muted-foreground">
{t('anonUsers.statMessagesDesc')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filtres et recherche */}
        <Card>
          <CardHeader>
            <CardTitle>{t('anonUsers.filtersTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder={t('anonUsers.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === '' ? 'default' : 'outline'}
                  onClick={() => handleStatusFilter('')}
                  size="sm"
                >
                  {t('anonUsers.filterAll')}
                </Button>
                <Button
                  variant={statusFilter === 'active' ? 'default' : 'outline'}
                  onClick={() => handleStatusFilter('active')}
                  size="sm"
                >
                  {t('anonUsers.filterActive')}
                </Button>
                <Button
                  variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                  onClick={() => handleStatusFilter('inactive')}
                  size="sm"
                >
                  {t('anonUsers.filterInactive')}
                </Button>
              </div>
              <Select value={String(pageSize)} onValueChange={(val) => handlePageSizeChange(Number(val))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">{t('anonUsers.perPage', { count: 20 })}</SelectItem>
                  <SelectItem value="50">{t('anonUsers.perPage', { count: 50 })}</SelectItem>
                  <SelectItem value="100">{t('anonUsers.perPage', { count: 100 })}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} size="sm">
                {t('anonUsers.searchButton')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Liste des utilisateurs anonymes */}
        <Card>
          <CardHeader>
            <CardTitle>{t('anonUsers.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!anonymousUsers || anonymousUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
{t('anonUsers.emptyTitle')}
              </div>
            ) : (
              <div className="space-y-4">
                {anonymousUsers.map((user) => (
                  <div key={user.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium text-gray-900">
                              {user.firstName} {user.lastName}
                            </h3>
                            <span className="text-sm text-gray-500">(@{user.username})</span>
                            {getStatusBadge(user.isActive, user.isOnline)}
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            {user.email && (
                              <span className="flex items-center space-x-1">
                                <span>{user.email}</span>
                              </span>
                            )}
                            {user.country && (
                              <span className="flex items-center space-x-1">
                                <MapPin className="h-3 w-3" />
                                <span>{user.country}</span>
                              </span>
                            )}
                            <span className="flex items-center space-x-1">
                              <Globe className="h-3 w-3" />
                              <span>{user.language}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end space-y-2">
                        <div className="text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <MessageSquare className="h-3 w-3" />
                            <span>{user._count.sentMessages} messages</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{t('anonUsers.joinedAt', { date: formatDate(user.joinedAt) })}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDetailsModal(true);
                          }}
                          className="flex items-center space-x-1"
                        >
                          <Eye className="h-3 w-3" />
                          <span>{t('anonUsers.actionDetails')}</span>
                        </Button>
                      </div>
                    </div>
                    
                    {/* Informations sur le lien de partage */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="text-gray-500">{t('anonUsers.conversationLabel')} </span>
                          <span className="font-medium">
{user.shareLink.conversation.title || user.shareLink.conversation.identifier || t('anonUsers.noTitle')}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500">{t('anonUsers.linkLabel')} </span>
                          <Badge variant="outline">{user.shareLink.identifier || user.shareLink.linkId}</Badge>
                        </div>
                      </div>
                    </div>

                    {/* Permissions */}
                    <div className="mt-2 flex items-center space-x-2 text-xs">
                      <span className="text-gray-500">{t('anonUsers.permissionsLabel')}</span>
                      {user.canSendMessages && <Badge variant="outline" className="text-xs">Messages</Badge>}
                      {user.canSendFiles && <Badge variant="outline" className="text-xs">Fichiers</Badge>}
                      {user.canSendImages && <Badge variant="outline" className="text-xs">Images</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-500">
                  {t('anonUsers.paginationInfo', { page: currentPage, total: totalPages, count: totalCount })}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadAnonymousUsers(currentPage - 1, searchTerm || undefined, statusFilter || undefined)}
                    disabled={currentPage === 1}
                  >
                    {t('anonUsers.prevPage')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadAnonymousUsers(currentPage + 1, searchTerm || undefined, statusFilter || undefined)}
                    disabled={!hasMore}
                  >
                    {t('anonUsers.nextPage')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de détails */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>{t('anonUsers.detailTitle')}</span>
              </DialogTitle>
            </DialogHeader>

            {selectedUser && (
              <ScrollArea className="max-h-[70vh] pr-4">
                <div className="space-y-6">
                  {/* Informations générales */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <Shield className="h-4 w-4" />
                        <span>{t('anonUsers.infoGeneral')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">{t('anonUsers.labelFullName')}</p>
                          <p className="text-sm font-semibold">{selectedUser.firstName} {selectedUser.lastName}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">{t('anonUsers.labelUsername')}</p>
                          <p className="text-sm font-semibold">@{selectedUser.username}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">{t('anonUsers.labelEmail')}</p>
                          <p className="text-sm">{selectedUser.email || t('anonUsers.notProvided')}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">{t('anonUsers.labelStatus')}</p>
                          <div>{getStatusBadge(selectedUser.isActive, selectedUser.isOnline)}</div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">{t('anonUsers.labelCountry')}</p>
                          <p className="text-sm flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span>{selectedUser.country || t('anonUsers.notProvided')}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">{t('anonUsers.labelLanguage')}</p>
                          <p className="text-sm flex items-center space-x-1">
                            <Globe className="h-3 w-3" />
                            <span>{selectedUser.language}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">{t('anonUsers.labelJoinDate')}</p>
                          <p className="text-sm flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(selectedUser.joinedAt)}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">{t('anonUsers.labelLastActivity')}</p>
                          <p className="text-sm flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{selectedUser.lastActiveAt ? formatDate(selectedUser.lastActiveAt) : t('anonUsers.never')}</span>
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Permissions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <Shield className="h-4 w-4" />
                        <span>{t('anonUsers.permissionsTitle')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium">{t('anonUsers.permSendMessages')}</span>
                          <Badge variant={selectedUser.canSendMessages ? "default" : "secondary"}>
{selectedUser.canSendMessages ? t('anonUsers.permAllowed') : t('anonUsers.permDenied')}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium">{t('anonUsers.permSendFiles')}</span>
                          <Badge variant={selectedUser.canSendFiles ? "default" : "secondary"}>
{selectedUser.canSendFiles ? t('anonUsers.permAllowed') : t('anonUsers.permDenied')}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium">{t('anonUsers.permSendImages')}</span>
                          <Badge variant={selectedUser.canSendImages ? "default" : "secondary"}>
{selectedUser.canSendImages ? t('anonUsers.permAllowed') : t('anonUsers.permDenied')}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium">{t('anonUsers.permOnline')}</span>
                          <Badge variant={selectedUser.isOnline ? "default" : "secondary"}>
{selectedUser.isOnline ? t('anonUsers.permYes') : t('anonUsers.permNo')}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Statistiques des messages */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <MessageSquare className="h-4 w-4" />
                        <span>{t('anonUsers.statsTitle')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                          <p className="text-2xl font-bold text-blue-600">{selectedUser._count.sentMessages}</p>
                          <p className="text-sm text-gray-600">{t('anonUsers.statsMsgSent')}</p>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <p className="text-2xl font-bold text-green-600">
                            {(selectedUser._count as Record<string, number>).reactions ?? 0}
                          </p>
                          <p className="text-sm text-gray-600">{t('anonUsers.statsReactions')}</p>
                        </div>
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                          <p className="text-2xl font-bold text-purple-600">
                            {Math.round((selectedUser._count.sentMessages / Math.max(1, Math.ceil((new Date().getTime() - new Date(selectedUser.joinedAt).getTime()) / (1000 * 60 * 60 * 24)))) * 10) / 10}
                          </p>
                          <p className="text-sm text-gray-600">{t('anonUsers.statsMsgPerDay')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Lien de partage et conversation */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <Link2 className="h-4 w-4" />
                        <span>{t('anonUsers.shareLinkTitle')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">{t('anonUsers.usedLink')}</p>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{selectedUser.shareLink.name || t('anonUsers.noName')}</p>
                            <p className="text-sm text-gray-500">
                              ID: {selectedUser.shareLink.identifier || selectedUser.shareLink.linkId}
                            </p>
                          </div>
                          <Badge variant="outline">
{(selectedUser.shareLink as Record<string, unknown>).isActive ? t('anonUsers.statusActive') : t('anonUsers.statusInactive')}
                          </Badge>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">{t('anonUsers.joinedConversation')}</p>
                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium">
{selectedUser.shareLink.conversation.title ||
                               selectedUser.shareLink.conversation.identifier ||
                               t('anonUsers.noTitle')}
                            </p>
                            <p className="text-sm text-gray-500">
                              Type: {String((selectedUser.shareLink.conversation as Record<string, unknown>).type ?? 'Standard')}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              router.push(`/admin/conversations?id=${selectedUser.shareLink.conversation.id}`);
                              setShowDetailsModal(false);
                            }}
                            className="flex items-center space-x-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>{t('anonUsers.viewConversation')}</span>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Actions admin */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('anonUsers.adminActions')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // TODO: Implémenter la visualisation des messages
                            toast.info(t('anonUsers.comingSoon'));
                          }}
                          className="flex items-center space-x-1"
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span>{t('anonUsers.viewMessages')}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            router.push(`/conversations/${selectedUser.shareLink.conversation.id}`);
                            setShowDetailsModal(false);
                          }}
                          className="flex items-center space-x-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>{t('anonUsers.accessConversation')}</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
