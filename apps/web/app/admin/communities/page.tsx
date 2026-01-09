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
  Users,
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  User,
  Lock,
  Globe,
  Settings,
  Eye,
  Edit,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { StatsGrid, TimeSeriesChart, DonutChart, StatItem, TimeSeriesDataPoint, DonutDataPoint } from '@/components/admin/Charts';
import { TableSkeleton, StatCardSkeleton } from '@/components/admin/TableSkeleton';

interface Community {
  id: string;
  identifier?: string;
  name: string;
  description?: string;
  avatar?: string;
  isPrivate: boolean;
  createdAt: string;
  creator: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  _count: {
    members: number;
    Conversation: number;
  };
}

export default function AdminCommunitiesPage() {
  const router = useRouter();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [privacyFilter, setPrivacyFilter] = useState('');
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

  // Réinitialiser la page quand les filtres changent
  useEffect(() => {
    if (!loading) {
      setCurrentPage(1);
    }
  }, [debouncedSearch, privacyFilter]);

  useEffect(() => {
    loadCommunities();
  }, [currentPage, debouncedSearch, privacyFilter, pageSize]);

  const loadCommunities = async (showLoader = false) => {
    try {
      if (showLoader) setRefreshing(true);
      if (loading && currentPage === 1) setLoading(true);

      const offset = (currentPage - 1) * pageSize;
      const response = await adminService.getCommunities(
        offset,
        pageSize,
        debouncedSearch || undefined,
        privacyFilter === 'private' ? true : privacyFilter === 'public' ? false : undefined
      );

      if (response.data) {
        setCommunities(response.data.communities || []);
        setTotalCount(response.data.pagination?.total || 0);
        setTotalPages(Math.ceil((response.data.pagination?.total || 0) / pageSize));
      } else {
        setCommunities([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des communautés:', error);
      toast.error('Erreur lors du chargement des communautés');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handleFilterChange = (value: string) => {
    setPrivacyFilter(value === 'all' ? '' : value);
  };

  const handlePageSizeChange = (newSize: number) => {
    setCurrentPage(1);
    setPageSize(newSize);
  };

  const handleRefresh = () => {
    loadCommunities(true);
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

  // Calcul des statistiques
  const publicCommunities = communities.filter(c => !c.isPrivate).length;
  const privateCommunities = communities.filter(c => c.isPrivate).length;
  const totalMembers = communities.reduce((sum, c) => sum + c._count.members, 0);
  const avgMembersPerCommunity = communities.length > 0
    ? Math.round(totalMembers / communities.length)
    : 0;

  // Données pour StatsGrid
  const stats: StatItem[] = [
    {
      title: 'Total Communautés',
      value: totalCount,
      description: 'Communautés créées',
      icon: Users,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: 12, isPositive: true }
    },
    {
      title: 'Publiques',
      value: publicCommunities,
      description: 'Visibles par tous',
      icon: Globe,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      trend: { value: 8, isPositive: true }
    },
    {
      title: 'Privées',
      value: privateCommunities,
      description: 'Accès restreint',
      icon: Lock,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
      trend: { value: 5, isPositive: true }
    },
    {
      title: 'Membres moyens',
      value: avgMembersPerCommunity,
      description: 'Par communauté',
      icon: User,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBgColor: 'bg-purple-100 dark:bg-purple-900/30',
      trend: { value: 3, isPositive: false }
    }
  ];

  // Données pour le TimeSeriesChart (exemple - à remplacer par de vraies données API)
  const timeSeriesData: TimeSeriesDataPoint[] = [
    { name: 'Lun', value: 12 },
    { name: 'Mar', value: 19 },
    { name: 'Mer', value: 15 },
    { name: 'Jeu', value: 25 },
    { name: 'Ven', value: 22 },
    { name: 'Sam', value: 30 },
    { name: 'Dim', value: 28 }
  ];

  // Données pour le DonutChart
  const donutData: DonutDataPoint[] = [
    { name: 'Publiques', value: publicCommunities, color: '#10b981' },
    { name: 'Privées', value: privateCommunities, color: '#3b82f6' }
  ];

  if (loading && currentPage === 1) {
    return (
      <AdminLayout currentPage="/admin/communities">
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
    <AdminLayout currentPage="/admin/communities">
      <div className="space-y-6">
        {/* Header avec gradient green→emerald */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-6 text-white shadow-lg">
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
                <h1 className="text-2xl font-bold">Gestion des Communautés</h1>
                <p className="text-green-100 mt-1">Administration des communautés et groupes</p>
              </div>
            </div>
            <Button
              className="flex items-center space-x-2 bg-white text-green-600 hover:bg-green-50"
              size="sm"
            >
              <Users className="h-4 w-4" />
              <span>Nouvelle communauté</span>
            </Button>
          </div>
        </div>

        {/* StatsGrid */}
        <StatsGrid stats={stats} columns={4} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TimeSeriesChart
            data={timeSeriesData}
            title="Évolution des communautés"
            description="Nouvelles communautés créées cette semaine"
            color="#10b981"
            showArea={true}
          />
          <DonutChart
            data={donutData}
            title="Répartition Public/Privé"
            description="Distribution par type de visibilité"
            showLegend={false}
          />
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder="Nom, identifiant, description..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={privacyFilter || 'all'} onValueChange={handleFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Toutes les communautés" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les communautés</SelectItem>
                  <SelectItem value="public">Publiques</SelectItem>
                  <SelectItem value="private">Privées</SelectItem>
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

        {/* Liste des communautés */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <Users className="h-5 w-5" />
              <span>Communautés ({totalCount})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!communities || communities.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Aucune communauté trouvée
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Aucune communauté ne correspond aux critères de recherche actuels.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {communities.map((community) => (
                  <div
                    key={community.id}
                    className="border dark:border-gray-700 rounded-lg p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-4 flex-1">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {community.avatar ? (
                            <img
                              src={community.avatar}
                              alt={community.name}
                              className="h-14 w-14 rounded-full object-cover ring-2 ring-green-500/20"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center ring-2 ring-green-500/20">
                              <Users className="h-7 w-7 text-white" />
                            </div>
                          )}
                        </div>

                        {/* Informations */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {community.name}
                            </h3>
                            {community.isPrivate ? (
                              <Badge variant="secondary" className="flex items-center space-x-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                <Lock className="h-3 w-3" />
                                <span>Privée</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="flex items-center space-x-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                <Globe className="h-3 w-3" />
                                <span>Publique</span>
                              </Badge>
                            )}
                          </div>

                          {community.identifier && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              <span className="font-medium">ID:</span> {community.identifier}
                            </p>
                          )}

                          {community.description && (
                            <p className="text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">
                              {community.description}
                            </p>
                          )}

                          <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                            <div className="flex items-center space-x-1">
                              <Users className="h-4 w-4 text-green-600" />
                              <span className="font-medium text-green-600 dark:text-green-400">
                                {community._count.members}
                              </span>
                              <span>membre{community._count.members > 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <MessageSquare className="h-4 w-4 text-blue-600" />
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                {community._count.Conversation}
                              </span>
                              <span>conversation{community._count.Conversation > 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <User className="h-4 w-4" />
                              <span>
                                Créé par {community.creator.displayName || community.creator.username}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(community.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">Voir</span>
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">Modifier</span>
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 dark:text-red-400">
                          <Trash2 className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">Supprimer</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {communities && communities.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 border-t dark:border-gray-700 pt-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} sur {totalPages} • {communities.length} communautés affichées • {totalCount} au total
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
