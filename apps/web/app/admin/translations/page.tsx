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
  Languages,
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  User,
  Globe,
  Brain,
  TrendingUp,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { StatsGrid, TimeSeriesChart, DonutChart, StatItem, TimeSeriesDataPoint, DonutDataPoint } from '@/components/admin/Charts';
import { TableSkeleton, StatCardSkeleton } from '@/components/admin/TableSkeleton';

interface Translation {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedContent: string;
  translationModel: string;
  confidenceScore?: number;
  createdAt: string;
  message: {
    id: string;
    content: string;
    originalContent?: string;
    originalLanguage: string;
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
}

const languageNames: Record<string, string> = {
  'fr': 'Français',
  'en': 'Anglais',
  'es': 'Espagnol',
  'de': 'Allemand',
  'it': 'Italien',
  'pt': 'Portugais',
  'ru': 'Russe',
  'zh': 'Chinois',
  'ja': 'Japonais',
  'ko': 'Coréen',
  'ar': 'Arabe',
  'hi': 'Hindi',
  'nl': 'Néerlandais',
  'sv': 'Suédois',
  'da': 'Danois',
  'no': 'Norvégien',
  'fi': 'Finnois',
  'pl': 'Polonais',
  'tr': 'Turc',
  'th': 'Thaï',
  'vi': 'Vietnamien',
  'id': 'Indonésien',
  'ms': 'Malais',
  'tl': 'Tagalog',
  'sw': 'Swahili',
  'he': 'Hébreu',
  'uk': 'Ukrainien',
  'cs': 'Tchèque',
  'hu': 'Hongrois',
  'ro': 'Roumain',
  'bg': 'Bulgare',
  'hr': 'Croate',
  'sk': 'Slovaque',
  'sl': 'Slovène',
  'et': 'Estonien',
  'lv': 'Letton',
  'lt': 'Lituanien',
  'mt': 'Maltais',
  'cy': 'Gallois',
  'ga': 'Irlandais',
  'is': 'Islandais',
  'eu': 'Basque',
  'ca': 'Catalan',
  'gl': 'Galicien'
};

export default function AdminTranslationsPage() {
  const router = useRouter();
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [period, setPeriod] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Réinitialiser la page quand les filtres changent
  useEffect(() => {
    if (!loading) {
      setCurrentPage(1);
    }
  }, [sourceLanguage, targetLanguage, period]);

  useEffect(() => {
    loadTranslations();
  }, [currentPage, sourceLanguage, targetLanguage, period, pageSize]);

  const getOriginalContent = (translation: Translation): string => {
    if (translation.message.originalContent) {
      return translation.message.originalContent;
    }
    return translation.message.content;
  };

  const loadTranslations = async (showLoader = false) => {
    try {
      if (showLoader) setRefreshing(true);
      if (loading && currentPage === 1) setLoading(true);

      const offset = (currentPage - 1) * pageSize;
      const response = await adminService.getTranslations(
        offset,
        pageSize,
        sourceLanguage || undefined,
        targetLanguage || undefined,
        period || undefined
      );

      if (response.data) {
        setTranslations(response.data.translations || []);
        setTotalCount(response.data.pagination?.total || 0);
        setTotalPages(Math.ceil((response.data.pagination?.total || 0) / pageSize));
      } else {
        setTranslations([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des traductions:', error);
      toast.error('Erreur lors du chargement des traductions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleFilterChange = (filterType: string, value: string) => {
    if (filterType === 'source') {
      setSourceLanguage(value === 'all' ? '' : value);
    } else if (filterType === 'target') {
      setTargetLanguage(value === 'all' ? '' : value);
    } else if (filterType === 'period') {
      setPeriod(value === 'all' ? '' : value);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setCurrentPage(1);
    setPageSize(newSize);
  };

  const handleRefresh = () => {
    loadTranslations(true);
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

  const getConfidenceColor = (score?: number) => {
    if (!score) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    if (score >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (score >= 0.7) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  };

  const getConfidenceLabel = (score?: number) => {
    if (!score) return 'Inconnu';
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.7) return 'Bon';
    return 'Faible';
  };

  const getLanguageName = (code: string) => {
    return languageNames[code] || code.toUpperCase();
  };

  // Calcul des statistiques
  const avgConfidence = translations.length > 0
    ? translations.reduce((acc, t) => acc + (t.confidenceScore || 0), 0) / translations.length
    : 0;
  const uniqueLanguages = new Set(translations.map(t => t.sourceLanguage).concat(translations.map(t => t.targetLanguage))).size;
  const excellentTranslations = translations.filter(t => (t.confidenceScore || 0) >= 0.9).length;

  // Données pour StatsGrid
  const stats: StatItem[] = [
    {
      title: 'Total Traductions',
      value: totalCount,
      description: 'Traductions effectuées',
      icon: Languages,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBgColor: 'bg-purple-100 dark:bg-purple-900/30',
      trend: { value: 15, isPositive: true }
    },
    {
      title: 'Langues Uniques',
      value: uniqueLanguages,
      description: 'Langues détectées',
      icon: Globe,
      iconColor: 'text-pink-600 dark:text-pink-400',
      iconBgColor: 'bg-pink-100 dark:bg-pink-900/30',
      trend: { value: 3, isPositive: true }
    },
    {
      title: 'Score Moyen',
      value: avgConfidence.toFixed(2),
      description: 'Confiance moyenne',
      icon: TrendingUp,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
      trend: { value: 5, isPositive: true }
    },
    {
      title: 'Excellentes',
      value: excellentTranslations,
      description: 'Score > 90%',
      icon: CheckCircle,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: 8, isPositive: true }
    }
  ];

  // Données pour le TimeSeriesChart
  const timeSeriesData: TimeSeriesDataPoint[] = [
    { name: 'Lun', value: 145 },
    { name: 'Mar', value: 189 },
    { name: 'Mer', value: 165 },
    { name: 'Jeu', value: 235 },
    { name: 'Ven', value: 212 },
    { name: 'Sam', value: 198 },
    { name: 'Dim', value: 175 }
  ];

  // Données pour le DonutChart - Top langues cibles
  const languageCounts = translations.reduce((acc, t) => {
    acc[t.targetLanguage] = (acc[t.targetLanguage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topLanguages = Object.entries(languageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const colors = ['#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];
  const donutData: DonutDataPoint[] = topLanguages.map(([lang, count], index) => ({
    name: getLanguageName(lang),
    value: count,
    color: colors[index] || '#6b7280'
  }));

  if (loading && currentPage === 1) {
    return (
      <AdminLayout currentPage="/admin/translations">
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
    <AdminLayout currentPage="/admin/translations">
      <div className="space-y-6">
        {/* Header avec gradient purple→pink */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-6 text-white shadow-lg">
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
                <h1 className="text-2xl font-bold">Gestion des Traductions</h1>
                <p className="text-purple-100 mt-1">Administration et statistiques des traductions automatiques</p>
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
            title="Évolution des traductions"
            description="Nombre de traductions effectuées cette semaine"
            color="#a855f7"
            showArea={true}
          />
          {donutData.length > 0 && (
            <DonutChart
              data={donutData}
              title="Top 5 Langues Cibles"
              description="Langues les plus traduites"
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Select value={sourceLanguage || 'all'} onValueChange={(value) => handleFilterChange('source', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Langue source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les sources</SelectItem>
                  {Object.entries(languageNames).map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {name} ({code.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={targetLanguage || 'all'} onValueChange={(value) => handleFilterChange('target', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Langue cible" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les cibles</SelectItem>
                  {Object.entries(languageNames).map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {name} ({code.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={period || 'all'} onValueChange={(value) => handleFilterChange('period', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les périodes</SelectItem>
                  <SelectItem value="today">Aujourd'hui</SelectItem>
                  <SelectItem value="week">Cette semaine</SelectItem>
                  <SelectItem value="month">Ce mois</SelectItem>
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

        {/* Liste des traductions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <Languages className="h-5 w-5" />
              <span>Traductions ({totalCount})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!translations || translations.length === 0 ? (
              <div className="text-center py-12">
                <Languages className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Aucune traduction trouvée
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Aucune traduction ne correspond aux critères de recherche actuels.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {translations.map((translation) => (
                  <div
                    key={translation.id}
                    className="border dark:border-gray-700 rounded-lg p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="space-y-4">
                      {/* En-tête */}
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge variant="outline" className="flex items-center space-x-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                            <Globe className="h-3 w-3" />
                            <span>{getLanguageName(translation.sourceLanguage)}</span>
                          </Badge>
                          <span className="text-gray-400">→</span>
                          <Badge variant="outline" className="flex items-center space-x-1 bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300">
                            <Globe className="h-3 w-3" />
                            <span>{getLanguageName(translation.targetLanguage)}</span>
                          </Badge>
                          <Badge className={getConfidenceColor(translation.confidenceScore)}>
                            {getConfidenceLabel(translation.confidenceScore)}
                            {translation.confidenceScore && (
                              <span className="ml-1">({Math.round(translation.confidenceScore * 100)}%)</span>
                            )}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(translation.createdAt)}
                        </div>
                      </div>

                      {/* Contenu */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                            <Globe className="h-4 w-4 text-purple-600" />
                            Message original ({getLanguageName(translation.message.originalLanguage)})
                          </h4>
                          <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                            <p className="text-gray-900 dark:text-gray-100 leading-relaxed">{getOriginalContent(translation)}</p>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-pink-600" />
                            Traduction ({getLanguageName(translation.targetLanguage)})
                          </h4>
                          <div className="bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 rounded-lg p-4 border border-pink-200 dark:border-pink-800">
                            <p className="text-gray-900 dark:text-gray-100 leading-relaxed">{translation.translatedContent}</p>
                          </div>
                        </div>
                      </div>

                      {/* Métadonnées */}
                      <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 flex-wrap gap-3 pt-2 border-t dark:border-gray-700">
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center space-x-1">
                            <Brain className="h-4 w-4 text-purple-600" />
                            <span className="font-medium">{translation.translationModel}</span>
                          </div>
                          {translation.message.sender && (
                            <div className="flex items-center space-x-1">
                              <User className="h-4 w-4" />
                              <span>{translation.message.sender.displayName || translation.message.sender.username}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1">
                            <Globe className="h-4 w-4" />
                            <span>
                              {translation.message.conversation.title ||
                               translation.message.conversation.identifier ||
                               'Conversation'}
                            </span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">Voir détails</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {translations && translations.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 border-t dark:border-gray-700 pt-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} sur {totalPages} • {translations.length} traductions affichées • {totalCount} au total
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
