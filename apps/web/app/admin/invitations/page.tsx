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
  UserPlus,
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  User,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  Send,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { StatsGrid, TimeSeriesChart, DonutChart, StatItem, TimeSeriesDataPoint, DonutDataPoint } from '@/components/admin/Charts';
import { TableSkeleton, StatCardSkeleton } from '@/components/admin/TableSkeleton';

interface Invitation {
  id: string;
  senderId: string;
  receiverId: string;
  communityId?: string;
  conversationId?: string;
  type: 'friend' | 'community' | 'conversation';
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  message?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  receiver: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  community?: {
    id: string;
    name: string;
    identifier?: string;
    avatar?: string;
  };
  conversation?: {
    id: string;
    title?: string;
    identifier?: string;
    type: string;
  };
}

export default function AdminInvitationsPage() {
  const router = useRouter();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
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
  }, [debouncedSearch, statusFilter, typeFilter]);

  useEffect(() => {
    loadInvitations();
  }, [currentPage, debouncedSearch, statusFilter, typeFilter, pageSize]);

  const loadInvitations = async (showLoader = false) => {
    try {
      if (showLoader) setRefreshing(true);
      if (loading && currentPage === 1) setLoading(true);

      // Simulation de données pour la démo
      const mockInvitations: Invitation[] = [
        {
          id: '1',
          senderId: 'user1',
          receiverId: 'user2',
          type: 'friend',
          status: 'pending',
          message: 'Salut ! J\'aimerais être ton ami sur Meeshy.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sender: {
            id: 'user1',
            username: 'alice_user',
            displayName: 'Alice Martin',
            avatar: undefined
          },
          receiver: {
            id: 'user2',
            username: 'bob_user',
            displayName: 'Bob Dupont',
            avatar: undefined
          }
        },
        {
          id: '2',
          senderId: 'user3',
          receiverId: 'user4',
          communityId: 'comm1',
          type: 'community',
          status: 'accepted',
          message: 'Rejoins notre communauté de développeurs !',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 1800000).toISOString(),
          sender: {
            id: 'user3',
            username: 'charlie_user',
            displayName: 'Charlie Dev',
            avatar: undefined
          },
          receiver: {
            id: 'user4',
            username: 'diana_user',
            displayName: 'Diana Code',
            avatar: undefined
          },
          community: {
            id: 'comm1',
            name: 'Développeurs Meeshy',
            identifier: 'dev-community',
            avatar: undefined
          }
        },
        {
          id: '3',
          senderId: 'user5',
          receiverId: 'user6',
          conversationId: 'conv1',
          type: 'conversation',
          status: 'rejected',
          message: 'Viens participer à notre discussion sur les nouvelles fonctionnalités.',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
          sender: {
            id: 'user5',
            username: 'eve_user',
            displayName: 'Eve Manager',
            avatar: undefined
          },
          receiver: {
            id: 'user6',
            username: 'frank_user',
            displayName: 'Frank User',
            avatar: undefined
          },
          conversation: {
            id: 'conv1',
            title: 'Discussion Nouvelles Fonctionnalités',
            identifier: 'features-discussion',
            type: 'group'
          }
        }
      ];

      // Filtrage simulé
      let filteredInvitations = mockInvitations;

      if (debouncedSearch) {
        filteredInvitations = filteredInvitations.filter(invitation =>
          invitation.sender.displayName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          invitation.sender.username.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          invitation.receiver.displayName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          invitation.receiver.username.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          invitation.message?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          invitation.community?.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          invitation.conversation?.title?.toLowerCase().includes(debouncedSearch.toLowerCase())
        );
      }

      if (statusFilter) {
        filteredInvitations = filteredInvitations.filter(invitation => invitation.status === statusFilter);
      }

      if (typeFilter) {
        filteredInvitations = filteredInvitations.filter(invitation => invitation.type === typeFilter);
      }

      setInvitations(filteredInvitations);
      setTotalCount(filteredInvitations.length);
      setTotalPages(Math.ceil(filteredInvitations.length / pageSize));

    } catch (error) {
      console.error('Erreur lors du chargement des invitations:', error);
      toast.error('Erreur lors du chargement des invitations');
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
    } else if (filterType === 'type') {
      setTypeFilter(value === 'all' ? '' : value);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setCurrentPage(1);
    setPageSize(newSize);
  };

  const handleRefresh = () => {
    loadInvitations(true);
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
      accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      expired: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: 'En attente',
      accepted: 'Acceptée',
      rejected: 'Refusée',
      expired: 'Expirée'
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getTypeColor = (type: string) => {
    const colors = {
      friend: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
      community: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      conversation: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      friend: 'Amitié',
      community: 'Communauté',
      conversation: 'Conversation'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'friend':
        return <User className="h-4 w-4" />;
      case 'community':
        return <Users className="h-4 w-4" />;
      case 'conversation':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <UserPlus className="h-4 w-4" />;
    }
  };

  // Calcul des statistiques
  const pendingInvitations = invitations.filter(i => i.status === 'pending').length;
  const acceptedInvitations = invitations.filter(i => i.status === 'accepted').length;
  const rejectedInvitations = invitations.filter(i => i.status === 'rejected').length;

  // Données pour StatsGrid
  const stats: StatItem[] = [
    {
      title: 'Total Invitations',
      value: totalCount,
      description: 'Invitations envoyées',
      icon: UserPlus,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
      trend: { value: 10, isPositive: true }
    },
    {
      title: 'En Attente',
      value: pendingInvitations,
      description: 'À traiter',
      icon: Clock,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBgColor: 'bg-purple-100 dark:bg-purple-900/30',
      trend: { value: 5, isPositive: true }
    },
    {
      title: 'Acceptées',
      value: acceptedInvitations,
      description: 'Confirmées',
      icon: CheckCircle,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: 20, isPositive: true }
    },
    {
      title: 'Refusées',
      value: rejectedInvitations,
      description: 'Déclinées',
      icon: XCircle,
      iconColor: 'text-red-600 dark:text-red-400',
      iconBgColor: 'bg-red-100 dark:bg-red-900/30',
      trend: { value: 3, isPositive: false }
    }
  ];

  // Données pour le TimeSeriesChart
  const timeSeriesData: TimeSeriesDataPoint[] = [
    { name: 'Lun', value: 25 },
    { name: 'Mar', value: 32 },
    { name: 'Mer', value: 28 },
    { name: 'Jeu', value: 45 },
    { name: 'Ven', value: 38 },
    { name: 'Sam', value: 30 },
    { name: 'Dim', value: 22 }
  ];

  // Données pour le DonutChart - Par type
  const typeCounts = invitations.reduce((acc, i) => {
    acc[i.type] = (acc[i.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const colors = ['#6366f1', '#a855f7', '#ec4899'];
  const donutData: DonutDataPoint[] = Object.entries(typeCounts).map(([type, count], index) => ({
    name: getTypeLabel(type),
    value: count,
    color: colors[index] || '#6b7280'
  }));

  if (loading && currentPage === 1) {
    return (
      <AdminLayout currentPage="/admin/invitations">
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card><CardContent className="h-80 animate-pulse bg-gray-100 dark:bg-gray-800" /></Card>
            <Card><CardContent className="h-80 animate-pulse bg-gray-100 dark:bg-gray-800" /></Card>
          </div>
          <TableSkeleton rows={10} columns={4} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/invitations">
      <div className="space-y-6">
        {/* Header avec gradient indigo→purple */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg p-6 text-white shadow-lg">
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
                <h1 className="text-2xl font-bold">Gestion des Invitations</h1>
                <p className="text-indigo-100 mt-1">Administration des invitations et demandes</p>
              </div>
            </div>
            <Button className="flex items-center space-x-2 bg-white text-indigo-600 hover:bg-indigo-50">
              <Send className="h-4 w-4" />
              <span>Nouvelle invitation</span>
            </Button>
          </div>
        </div>

        {/* StatsGrid */}
        <StatsGrid stats={stats} columns={4} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TimeSeriesChart
            data={timeSeriesData}
            title="Invitations par jour"
            description="Nombre d'invitations envoyées cette semaine"
            color="#6366f1"
            showArea={true}
          />
          {donutData.length > 0 && (
            <DonutChart
              data={donutData}
              title="Répartition par type"
              description="Distribution des invitations par type"
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
                  placeholder="Expéditeur, destinataire, message..."
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
                  <SelectItem value="accepted">Acceptées</SelectItem>
                  <SelectItem value="rejected">Refusées</SelectItem>
                  <SelectItem value="expired">Expirées</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter || 'all'} onValueChange={(value) => handleFilterChange('type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="friend">Amitié</SelectItem>
                  <SelectItem value="community">Communauté</SelectItem>
                  <SelectItem value="conversation">Conversation</SelectItem>
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

        {/* Liste des invitations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <UserPlus className="h-5 w-5" />
              <span>Invitations ({totalCount})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!invitations || invitations.length === 0 ? (
              <div className="text-center py-12">
                <UserPlus className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Aucune invitation trouvée
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Aucune invitation ne correspond aux critères de recherche actuels.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="border dark:border-gray-700 rounded-lg p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="space-y-4">
                      {/* En-tête */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge className={getTypeColor(invitation.type)}>
                              {getTypeIcon(invitation.type)}
                              <span className="ml-1">{getTypeLabel(invitation.type)}</span>
                            </Badge>
                            <Badge className={getStatusColor(invitation.status)}>
                              {getStatusLabel(invitation.status)}
                            </Badge>
                          </div>

                          {invitation.message && (
                            <p className="text-gray-700 dark:text-gray-300 mb-3 italic">"{invitation.message}"</p>
                          )}

                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                            <div className="flex items-center space-x-1">
                              <User className="h-4 w-4 text-indigo-600" />
                              <span>
                                {invitation.sender.displayName || invitation.sender.username} → {invitation.receiver.displayName || invitation.receiver.username}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(invitation.createdAt)}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4" />
                              <span>Màj {formatDate(invitation.updatedAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 flex-shrink-0">
                          {invitation.status === 'pending' && (
                            <>
                              <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                <span className="hidden sm:inline">Accepter</span>
                              </Button>
                              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                                <XCircle className="h-4 w-4 mr-1" />
                                <span className="hidden sm:inline">Refuser</span>
                              </Button>
                            </>
                          )}
                          <Button variant="outline" size="sm">
                            Voir détails
                          </Button>
                        </div>
                      </div>

                      {/* Informations contextuelles */}
                      {(invitation.community || invitation.conversation) && (
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                          <div className="flex items-center space-x-2 mb-2">
                            {invitation.community ? (
                              <>
                                <Users className="h-4 w-4 text-indigo-600" />
                                <span className="font-medium text-indigo-900 dark:text-indigo-300">Communauté</span>
                              </>
                            ) : (
                              <>
                                <MessageSquare className="h-4 w-4 text-purple-600" />
                                <span className="font-medium text-purple-900 dark:text-purple-300">Conversation</span>
                              </>
                            )}
                          </div>
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {invitation.community ? (
                              <div>
                                <div className="font-medium">{invitation.community.name}</div>
                                {invitation.community.identifier && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400">
                                    ID: {invitation.community.identifier}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium">
                                  {invitation.conversation?.title || 'Conversation sans nom'}
                                </div>
                                {invitation.conversation?.identifier && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400">
                                    ID: {invitation.conversation.identifier}
                                  </div>
                                )}
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  Type: {invitation.conversation?.type}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {invitations && invitations.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 border-t dark:border-gray-700 pt-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} sur {totalPages} • {invitations.length} invitations affichées • {totalCount} au total
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
