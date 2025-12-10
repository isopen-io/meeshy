'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle,
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  User,
  MessageSquare,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  Flag,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { StatsGrid, TimeSeriesChart, DonutChart, StatItem, TimeSeriesDataPoint, DonutDataPoint } from '@/components/admin/Charts';
import { TableSkeleton, StatCardSkeleton } from '@/components/admin/TableSkeleton';

interface Report {
  id: string;
  messageId: string;
  reporterId: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
  message: {
    id: string;
    content: string;
    messageType: string;
    createdAt: string;
    sender?: {
      id: string;
      username: string;
      displayName?: string;
    };
    conversation: {
      id: string;
      identifier?: string;
      title?: string;
    };
  };
  reporter: {
    id: string;
    username: string;
    displayName?: string;
  };
}

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Debounce pour la recherche
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!loading) {
      setCurrentPage(1);
    }
  }, [debouncedSearch, statusFilter, priorityFilter]);

  useEffect(() => {
    loadReports();
  }, [currentPage, debouncedSearch, statusFilter, priorityFilter, pageSize]);

  const loadReports = async (showLoader = false) => {
    try {
      if (showLoader) setRefreshing(true);
      if (loading && currentPage === 1) setLoading(true);

      // Simulation de données pour la démo
      const mockReports: Report[] = [
        {
          id: '1',
          messageId: 'msg1',
          reporterId: 'user1',
          reason: 'spam',
          description: 'Message répétitif et non pertinent',
          status: 'pending',
          priority: 'medium',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          message: {
            id: 'msg1',
            content: 'Ceci est un message de spam répétitif...',
            messageType: 'text',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            sender: {
              id: 'spammer1',
              username: 'spammer_user',
              displayName: 'Utilisateur Spam'
            },
            conversation: {
              id: 'conv1',
              identifier: 'general',
              title: 'Général'
            }
          },
          reporter: {
            id: 'user1',
            username: 'reporter_user',
            displayName: 'Utilisateur Signalant'
          }
        },
        {
          id: '2',
          messageId: 'msg2',
          reporterId: 'user2',
          reason: 'inappropriate_content',
          description: 'Contenu inapproprié et offensant',
          status: 'reviewed',
          priority: 'high',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          updatedAt: new Date(Date.now() - 1800000).toISOString(),
          message: {
            id: 'msg2',
            content: 'Contenu inapproprié signalé...',
            messageType: 'text',
            createdAt: new Date(Date.now() - 7200000).toISOString(),
            sender: {
              id: 'offender1',
              username: 'offensive_user',
              displayName: 'Utilisateur Offensant'
            },
            conversation: {
              id: 'conv2',
              identifier: 'support',
              title: 'Support'
            }
          },
          reporter: {
            id: 'user2',
            username: 'moderator_user',
            displayName: 'Modérateur'
          }
        }
      ];

      // Filtrage simulé
      let filteredReports = mockReports;

      if (debouncedSearch) {
        filteredReports = filteredReports.filter(report =>
          report.message.content.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          report.reason.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          report.description?.toLowerCase().includes(debouncedSearch.toLowerCase())
        );
      }

      if (statusFilter) {
        filteredReports = filteredReports.filter(report => report.status === statusFilter);
      }

      if (priorityFilter) {
        filteredReports = filteredReports.filter(report => report.priority === priorityFilter);
      }

      setReports(filteredReports);
      setTotalCount(filteredReports.length);
      setTotalPages(Math.ceil(filteredReports.length / pageSize));

    } catch (error) {
      console.error('Erreur lors du chargement des signalements:', error);
      toast.error('Erreur lors du chargement des signalements');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handleFilterChange = (filterType: string, value: string) => {
    if (filterType === 'status') {
      setStatusFilter(value === 'all' ? '' : value);
    } else if (filterType === 'priority') {
      setPriorityFilter(value === 'all' ? '' : value);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setCurrentPage(1);
    setPageSize(newSize);
  };

  const handleRefresh = () => {
    loadReports(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      reviewed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      dismissed: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: 'En attente',
      reviewed: 'Examiné',
      resolved: 'Résolu',
      dismissed: 'Rejeté'
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      urgent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    };
    return colors[priority as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityLabel = (priority: string) => {
    const labels = {
      low: 'Faible',
      medium: 'Moyenne',
      high: 'Élevée',
      urgent: 'Urgente'
    };
    return labels[priority as keyof typeof labels] || priority;
  };

  const getReasonLabel = (reason: string) => {
    const labels = {
      spam: 'Spam',
      inappropriate_content: 'Contenu inapproprié',
      harassment: 'Harcèlement',
      hate_speech: 'Discours de haine',
      violence: 'Violence',
      misinformation: 'Désinformation',
      copyright: 'Violation de droits d\'auteur',
      other: 'Autre'
    };
    return labels[reason as keyof typeof labels] || reason;
  };

  // Calcul des statistiques
  const pendingReports = reports.filter(r => r.status === 'pending').length;
  const resolvedReports = reports.filter(r => r.status === 'resolved').length;
  const urgentReports = reports.filter(r => r.priority === 'urgent').length;

  // Données pour StatsGrid
  const stats: StatItem[] = [
    {
      title: 'Total Signalements',
      value: totalCount,
      description: 'Signalements enregistrés',
      icon: AlertTriangle,
      iconColor: 'text-red-600 dark:text-red-400',
      iconBgColor: 'bg-red-100 dark:bg-red-900/30',
      trend: { value: 12, isPositive: false }
    },
    {
      title: 'En Attente',
      value: pendingReports,
      description: 'À traiter',
      icon: Clock,
      iconColor: 'text-orange-600 dark:text-orange-400',
      iconBgColor: 'bg-orange-100 dark:bg-orange-900/30',
      trend: { value: 5, isPositive: false }
    },
    {
      title: 'Résolus',
      value: resolvedReports,
      description: 'Traités avec succès',
      icon: CheckCircle,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: 18, isPositive: true }
    },
    {
      title: 'Urgents',
      value: urgentReports,
      description: 'Priorité urgente',
      icon: AlertCircle,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBgColor: 'bg-purple-100 dark:bg-purple-900/30',
      trend: { value: 2, isPositive: false }
    }
  ];

  // Données pour le TimeSeriesChart
  const timeSeriesData: TimeSeriesDataPoint[] = [
    { name: 'Lun', value: 12 },
    { name: 'Mar', value: 8 },
    { name: 'Mer', value: 15 },
    { name: 'Jeu', value: 6 },
    { name: 'Ven', value: 9 },
    { name: 'Sam', value: 4 },
    { name: 'Dim', value: 3 }
  ];

  // Données pour le DonutChart - Par statut
  const statusCounts = reports.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const colors = ['#ef4444', '#f97316', '#eab308', '#6b7280'];
  const donutData: DonutDataPoint[] = Object.entries(statusCounts).map(([status, count], index) => ({
    name: getStatusLabel(status),
    value: count,
    color: colors[index] || '#6b7280'
  }));

  if (loading && currentPage === 1) {
    return (
      <AdminLayout currentPage="/admin/reports">
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card><CardContent className="h-80 animate-pulse bg-gray-100 dark:bg-gray-800" /></Card>
            <Card><CardContent className="h-80 animate-pulse bg-gray-100 dark:bg-gray-800" /></Card>
          </div>
          <TableSkeleton rows={10} columns={5} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/reports">
      <div className="space-y-6">
        {/* Header avec gradient red→orange */}
        <div className="bg-gradient-to-r from-red-600 to-orange-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={() => router.push('/admin')}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white border-white/20"
                size="sm"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Retour</span>
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Gestion des Signalements</h1>
                <p className="text-red-100 mt-1">Modération et traitement des signalements</p>
              </div>
            </div>
          </div>
        </div>

        {/* StatsGrid */}
        <StatsGrid stats={stats} columns={4} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TimeSeriesChart
            data={timeSeriesData}
            title="Signalements par jour"
            description="Nombre de signalements reçus cette semaine"
            color="#ef4444"
            showArea={true}
          />
          {donutData.length > 0 && (
            <DonutChart
              data={donutData}
              title="Répartition par statut"
              description="Distribution des signalements par état"
              showLegend={false}
            />
          )}
        </div>

        {/* Filtres */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <Filter className="h-5 w-5" />
              <span>Filtres et recherche</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder="Contenu, raison, description..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={statusFilter || 'all'} onValueChange={(value) => handleFilterChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="reviewed">Examiné</SelectItem>
                  <SelectItem value="resolved">Résolu</SelectItem>
                  <SelectItem value="dismissed">Rejeté</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter || 'all'} onValueChange={(value) => handleFilterChange('priority', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Priorité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les priorités</SelectItem>
                  <SelectItem value="low">Faible</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="high">Élevée</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>

              <Select value={String(pageSize)} onValueChange={(val) => handlePageSizeChange(Number(val))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20 par page</SelectItem>
                  <SelectItem value="50">50 par page</SelectItem>
                  <SelectItem value="100">100 par page</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Liste des signalements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <AlertTriangle className="h-5 w-5" />
              <span>Signalements ({totalCount})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!reports || reports.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Aucun signalement trouvé
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Aucun signalement ne correspond aux critères de recherche actuels.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="border dark:border-gray-700 rounded-lg p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="space-y-4">
                      {/* En-tête */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge className={getStatusColor(report.status)}>
                              {getStatusLabel(report.status)}
                            </Badge>
                            <Badge className={getPriorityColor(report.priority)}>
                              {getPriorityLabel(report.priority)}
                            </Badge>
                            <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                              {getReasonLabel(report.reason)}
                            </Badge>
                          </div>

                          {report.description && (
                            <p className="text-gray-700 dark:text-gray-300 mb-3">{report.description}</p>
                          )}

                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                            <div className="flex items-center space-x-1">
                              <Flag className="h-4 w-4 text-red-600" />
                              <span>Signalé par {report.reporter.displayName || report.reporter.username}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(report.createdAt)}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4" />
                              <span>Màj {formatDate(report.updatedAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 flex-shrink-0">
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Voir</span>
                          </Button>
                          <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Résoudre</span>
                          </Button>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <XCircle className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Rejeter</span>
                          </Button>
                        </div>
                      </div>

                      {/* Message signalé */}
                      <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <MessageSquare className="h-4 w-4 text-red-600" />
                          <span className="font-medium text-red-900 dark:text-red-300">Message signalé</span>
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-100 mb-2">
                          {report.message.content}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center space-x-1">
                            <User className="h-3 w-3" />
                            <span>
                              {report.message.sender
                                ? (report.message.sender.displayName || report.message.sender.username)
                                : 'Utilisateur anonyme'
                              }
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(report.message.createdAt)}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <MessageSquare className="h-3 w-3" />
                            <span>
                              {report.message.conversation.title ||
                               report.message.conversation.identifier ||
                               'Conversation'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {reports && reports.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 border-t dark:border-gray-700 pt-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} sur {totalPages} • {reports.length} signalements affichés • {totalCount} au total
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Précédent</span>
                  </Button>
                  <div className="flex items-center px-3 py-2 border dark:border-gray-700 rounded-md text-sm font-medium">
                    {currentPage} / {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
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
