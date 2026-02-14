'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Plus, Search, ChevronLeft, ChevronRight, Eye, Trash2, Send, RefreshCw } from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { TableSkeleton, StatCardSkeleton } from '@/components/admin/TableSkeleton';

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'DRAFT': return <Badge variant="secondary">Brouillon</Badge>;
    case 'TRANSLATING': return <Badge className="bg-yellow-100 text-yellow-800">Traduction...</Badge>;
    case 'READY': return <Badge className="bg-blue-100 text-blue-800">Pret</Badge>;
    case 'SENDING': return <Badge className="bg-orange-100 text-orange-800">Envoi...</Badge>;
    case 'SENT': return <Badge className="bg-green-100 text-green-800">Envoye</Badge>;
    case 'FAILED': return <Badge className="bg-red-100 text-red-800">Echoue</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

export default function AdminBroadcastsPage() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    sending: 0,
    sent: 0,
    failed: 0,
  });

  // Filtres et pagination
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  const loadBroadcasts = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      const offset = (currentPage - 1) * pageSize;
      const response = await adminService.getBroadcasts(offset, pageSize, statusFilter || undefined);

      const data = response.data?.data || response.data;

      if (data) {
        setBroadcasts(data.broadcasts || []);
        const total = data.pagination?.total || 0;
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)));

        // Compute stats from the stats field if provided, otherwise derive from list
        if (data.stats) {
          setStats({
            total: data.stats.total || 0,
            sending: data.stats.sending || 0,
            sent: data.stats.sent || 0,
            failed: data.stats.failed || 0,
          });
        } else {
          setStats({
            total: total,
            sending: 0,
            sent: 0,
            failed: 0,
          });
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des broadcasts:', error);
      toast.error('Erreur lors du chargement des broadcasts');
      setBroadcasts([]);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  }, [currentPage, statusFilter]);

  useEffect(() => {
    if (!isInitialLoad) {
      setCurrentPage(1);
    }
  }, [statusFilter, isInitialLoad]);

  useEffect(() => {
    loadBroadcasts(isInitialLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, statusFilter, isInitialLoad]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce broadcast ?')) return;
    try {
      await adminService.deleteBroadcast(id);
      toast.success('Broadcast supprime');
      loadBroadcasts(false);
    } catch (error) {
      console.error('Erreur suppression broadcast:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const formatDate = (date: Date | string) => {
    try {
      const d = new Date(date);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'N/A';
    }
  };

  if (isInitialLoad) {
    return (
      <AdminLayout currentPage="/admin/broadcasts">
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
          </div>
          <TableSkeleton rows={10} columns={6} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/broadcasts">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Broadcasts Email</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 hidden sm:block">Gestion des campagnes email</p>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadBroadcasts(false)}
              className="dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => router.push('/admin/broadcasts/new')}
              className="flex items-center space-x-2 dark:bg-blue-700 dark:hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">Nouveau broadcast</span>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold dark:text-gray-100">{stats.total}</div>
              <Badge variant="outline" className="mt-1 text-xs dark:border-gray-700 dark:text-gray-300">Broadcasts</Badge>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">En cours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.sending}</div>
              <Badge variant="outline" className="mt-1 text-xs text-orange-600 dark:text-orange-400 dark:border-orange-700">Envoi</Badge>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Envoyes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{stats.sent}</div>
              <Badge variant="outline" className="mt-1 text-xs text-green-600 dark:text-green-400 dark:border-green-700">Termine</Badge>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">Echoues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
              <Badge variant="outline" className="mt-1 text-xs text-red-600 dark:text-red-400 dark:border-red-700">Erreurs</Badge>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader className="space-y-4">
            <CardTitle className="flex items-center space-x-2 text-base sm:text-lg dark:text-gray-100">
              <Mail className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>Broadcasts ({broadcasts?.length || 0})</span>
            </CardTitle>

            {/* Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Tous les statuts</option>
                <option value="DRAFT">Brouillon</option>
                <option value="READY">Pret</option>
                <option value="SENDING">En cours d&apos;envoi</option>
                <option value="SENT">Envoye</option>
                <option value="FAILED">Echoue</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {/* Desktop Table */}
            <div className="hidden lg:block space-y-4">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg font-medium text-sm text-gray-700 dark:text-gray-300 sticky top-0 z-10">
                <div className="col-span-3">Nom</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Destinataires</div>
                <div className="col-span-2">Envoyes / Echoues</div>
                <div className="col-span-2">Cree le</div>
                <div className="col-span-1">Actions</div>
              </div>

              {/* Rows */}
              {broadcasts?.map((broadcast) => (
                <div key={broadcast.id} className="grid grid-cols-12 gap-4 p-3 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="col-span-3 flex items-center">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{broadcast.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{broadcast.subject}</div>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center">
                    {getStatusBadge(broadcast.status)}
                  </div>
                  <div className="col-span-2 text-sm text-gray-600 dark:text-gray-400 flex items-center">
                    {broadcast.totalRecipients ?? '-'}
                  </div>
                  <div className="col-span-2 text-sm flex items-center space-x-2">
                    <span className="text-green-600 dark:text-green-400">{broadcast.sentCount ?? 0}</span>
                    <span className="text-gray-400">/</span>
                    <span className="text-red-600 dark:text-red-400">{broadcast.failedCount ?? 0}</span>
                  </div>
                  <div className="col-span-2 text-sm text-gray-600 dark:text-gray-400 flex items-center">
                    {formatDate(broadcast.createdAt)}
                  </div>
                  <div className="col-span-1 flex items-center space-x-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/admin/broadcasts/${broadcast.id}`)}
                      className="dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-200"
                      title="Voir"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                    {(broadcast.status === 'DRAFT' || broadcast.status === 'READY') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(broadcast.id)}
                        className="text-red-600 hover:text-red-700 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {broadcasts?.map((broadcast) => (
                <Card key={broadcast.id} className="hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{broadcast.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{broadcast.subject}</p>
                      </div>
                      {getStatusBadge(broadcast.status)}
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
                      <span>Dest: {broadcast.totalRecipients ?? '-'}</span>
                      <span>
                        <span className="text-green-600 dark:text-green-400">{broadcast.sentCount ?? 0}</span>
                        {' / '}
                        <span className="text-red-600 dark:text-red-400">{broadcast.failedCount ?? 0}</span>
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatDate(broadcast.createdAt)}</div>
                    <div className="flex space-x-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-200"
                        onClick={() => router.push(`/admin/broadcasts/${broadcast.id}`)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Voir
                      </Button>
                      {(broadcast.status === 'DRAFT' || broadcast.status === 'READY') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-red-600 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600"
                          onClick={() => handleDelete(broadcast.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Empty state */}
            {(!broadcasts || broadcasts.length === 0) && (
              <div className="text-center py-12">
                <Mail className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Aucun broadcast trouve</h3>
                <p className="text-gray-500 dark:text-gray-400">Creez votre premier broadcast email</p>
                <Button
                  className="mt-4"
                  onClick={() => router.push('/admin/broadcasts/new')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nouveau broadcast
                </Button>
              </div>
            )}

            {/* Pagination */}
            {broadcasts && broadcasts.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4">
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} sur {totalPages} - {broadcasts.length} broadcasts affiches
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={handlePreviousPage}
                    className="text-xs sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200 dark:disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Precedent</span>
                  </Button>
                  <div className="flex items-center px-3 py-2 border dark:border-gray-700 rounded-md text-xs sm:text-sm font-medium dark:bg-gray-800 dark:text-gray-200">
                    {currentPage} / {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={handleNextPage}
                    className="text-xs sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200 dark:disabled:opacity-50"
                  >
                    <span className="hidden sm:inline mr-1">Suivant</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
