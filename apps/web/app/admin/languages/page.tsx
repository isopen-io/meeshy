'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Globe,
  ArrowLeft,
  TrendingUp,
  MessageSquare,
  Users,
  Languages as LanguagesIcon,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { StatsGrid, TimeSeriesChart, DonutChart, type StatItem } from '@/components/admin/Charts';
import { StatCardSkeleton } from '@/components/admin/TableSkeleton';

interface LanguageData {
  topLanguages: Array<{
    language: string;
    count: number;
  }>;
  totalMessages: number;
  totalUsers: number;
  totalTranslations: number;
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

const languageFlags: Record<string, string> = {
  'fr': '🇫🇷', 'en': '🇺🇸', 'es': '🇪🇸', 'de': '🇩🇪', 'it': '🇮🇹',
  'pt': '🇵🇹', 'ru': '🇷🇺', 'zh': '🇨🇳', 'ja': '🇯🇵', 'ko': '🇰🇷',
  'ar': '🇸🇦', 'hi': '🇮🇳', 'nl': '🇳🇱', 'sv': '🇸🇪', 'da': '🇩🇰',
  'no': '🇳🇴', 'fi': '🇫🇮', 'pl': '🇵🇱', 'tr': '🇹🇷', 'th': '🇹🇭',
  'vi': '🇻🇳', 'id': '🇮🇩', 'he': '🇮🇱', 'uk': '🇺🇦', 'cs': '🇨🇿',
  'hu': '🇭🇺', 'ro': '🇷🇴', 'bg': '🇧🇬', 'hr': '🇭🇷', 'sk': '🇸🇰',
  'sl': '🇸🇮', 'et': '🇪🇪', 'lv': '🇱🇻', 'lt': '🇱🇹', 'mt': '🇲🇹',
  'cy': '🇬🇧', 'ga': '🇮🇪', 'is': '🇮🇸', 'eu': '🇪🇸', 'ca': '🇪🇸', 'gl': '🇪🇸'
};

export default function AdminLanguagesPage() {
  const router = useRouter();
  const [languageData, setLanguageData] = useState<LanguageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadLanguageStats();
  }, []);

  const loadLanguageStats = async () => {
    try {
      setLoading(true);
      const response = await adminService.getDashboardStats();

      if (response.data) {
        const stats = response.data.statistics || response.data.data?.statistics;
        setLanguageData({
          topLanguages: stats?.topLanguages || [],
          totalMessages: stats?.totalMessages || 0,
          totalUsers: stats?.totalUsers || 0,
          totalTranslations: stats?.totalTranslations || 0
        });
      }
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques de langues:', error);
      toast.error('Erreur lors du chargement des statistiques de langues');
    } finally {
      setLoading(false);
    }
  };

  const getLanguageName = (code: string) => {
    return languageNames[code] || code.toUpperCase();
  };

  const getLanguageFlag = (code: string) => {
    return languageFlags[code] || '🌐';
  };

  // Filtrer les langues selon la recherche
  const filteredLanguages = languageData?.topLanguages.filter(lang => {
    const name = getLanguageName(lang.language).toLowerCase();
    const code = lang.language.toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || code.includes(query);
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredLanguages.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLanguages = filteredLanguages.slice(startIndex, startIndex + itemsPerPage);

  // Statistiques pour StatsGrid
  const stats: StatItem[] = [
    {
      title: 'Langues détectées',
      value: languageData?.topLanguages.length || 0,
      description: 'Langues uniques',
      icon: Globe,
      iconColor: 'text-slate-600 dark:text-slate-400',
      iconBgColor: 'bg-slate-100 dark:bg-slate-900/30',
      trend: { value: 5, isPositive: true }
    },
    {
      title: 'Messages analysés',
      value: languageData?.totalMessages || 0,
      description: 'Total messages',
      icon: MessageSquare,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
      trend: { value: 12, isPositive: true }
    },
    {
      title: 'Utilisateurs multilingues',
      value: languageData?.totalUsers || 0,
      description: 'Utilisateurs actifs',
      icon: Users,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      title: 'Traductions',
      value: languageData?.totalTranslations || 0,
      description: 'Traductions effectuées',
      icon: LanguagesIcon,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBgColor: 'bg-purple-100 dark:bg-purple-900/30',
      trend: { value: 8, isPositive: true }
    }
  ];

  // Données pour TimeSeriesChart (mockup)
  const timeSeriesData = [
    { name: 'Lun', value: 30 },
    { name: 'Mar', value: 45 },
    { name: 'Mer', value: 35 },
    { name: 'Jeu', value: 50 },
    { name: 'Ven', value: 42 },
    { name: 'Sam', value: 38 },
    { name: 'Dim', value: 48 }
  ];

  // Données pour DonutChart
  const donutData = languageData?.topLanguages.slice(0, 5).map((lang, index) => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
    return {
      name: `${getLanguageFlag(lang.language)} ${getLanguageName(lang.language)}`,
      value: lang.count,
      color: colors[index % colors.length]
    };
  }) || [];

  if (loading) {
    return (
      <AdminLayout currentPage="/admin/languages">
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div className="bg-gradient-to-r from-slate-600 to-gray-600 rounded-lg p-6 text-white shadow-lg animate-pulse">
            <div className="h-8 bg-white/20 rounded w-64 mb-2"></div>
            <div className="h-4 bg-white/20 rounded w-96"></div>
          </div>

          {/* Stats Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/languages">
      <div className="space-y-6">
        {/* Header avec gradient slate→gray */}
        <div className="bg-gradient-to-r from-slate-600 to-gray-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/admin')}
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Statistiques des langues</h1>
                <p className="text-slate-100 mt-1">Analyse de l&apos;utilisation des langues sur la plateforme</p>
              </div>
            </div>
          </div>
        </div>

        {/* Statistiques principales */}
        <StatsGrid stats={stats} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TimeSeriesChart
            data={timeSeriesData}
            title="Évolution des messages multilingues"
            description="Nombre de messages traduits par jour"
            color="#64748b"
            dataKey="value"
          />

          <DonutChart
            data={donutData}
            title="Top 5 des langues"
            description="Répartition des langues les plus utilisées"
          />
        </div>

        {/* Filtres et recherche */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
              <CardTitle className="flex items-center space-x-2">
                <Globe className="h-5 w-5" />
                <span>Classement des langues</span>
                <Badge variant="secondary">{filteredLanguages.length} langues</Badge>
              </CardTitle>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Rechercher une langue..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Tableau des langues */}
            <div className="space-y-3">
              {paginatedLanguages.length === 0 ? (
                <div className="text-center py-12">
                  <Globe className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Aucune langue trouvée
                  </h3>
                  <p className="text-gray-600">
                    {searchQuery ? 'Essayez avec un autre terme de recherche' : 'Les statistiques seront disponibles une fois que des messages auront été analysés'}
                  </p>
                </div>
              ) : (
                paginatedLanguages.map((lang, index) => {
                  const globalIndex = startIndex + index;
                  const percentage = languageData && languageData.totalMessages > 0
                    ? (lang.count / languageData.totalMessages) * 100
                    : 0;

                  const rankColors = [
                    'from-yellow-400 to-yellow-600',
                    'from-gray-300 to-gray-500',
                    'from-orange-400 to-orange-600',
                    'from-blue-400 to-blue-600'
                  ];

                  return (
                    <div
                      key={lang.language}
                      className="flex items-center space-x-4 p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      {/* Position */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${rankColors[Math.min(globalIndex, 3)]} flex items-center justify-center text-white font-bold text-sm shadow-md`}>
                        {globalIndex + 1}
                      </div>

                      {/* Drapeau et nom */}
                      <div className="flex items-center space-x-3 flex-shrink-0 min-w-[180px]">
                        <span className="text-3xl">{getLanguageFlag(lang.language)}</span>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">
                            {getLanguageName(lang.language)}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Code: {lang.language.toUpperCase()}
                          </div>
                        </div>
                      </div>

                      {/* Statistiques */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {lang.count.toLocaleString()} messages
                          </span>
                          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-slate-500 to-gray-500 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Badge */}
                      <div className="flex-shrink-0">
                        {globalIndex < 3 ? (
                          <Badge className="bg-gradient-to-r from-slate-600 to-gray-600 text-white">
                            Top {globalIndex + 1}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            #{globalIndex + 1}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} sur {totalPages} • {filteredLanguages.length} langue(s)
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informations sur la détection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <LanguagesIcon className="h-5 w-5" />
              <span>À propos de la détection de langues</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-slate-600" />
                  <span>Comment ça marche ?</span>
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li className="flex items-start space-x-2">
                    <span className="text-slate-600 dark:text-slate-400">•</span>
                    <span>Analyse automatique du contenu des messages</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-slate-600 dark:text-slate-400">•</span>
                    <span>Détection basée sur des modèles de langage avancés</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-slate-600 dark:text-slate-400">•</span>
                    <span>Support de plus de {Object.keys(languageNames).length} langues</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-slate-600 dark:text-slate-400">•</span>
                    <span>Mise à jour en temps réel des statistiques</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                  <Globe className="h-4 w-4 text-slate-600" />
                  <span>Langues supportées</span>
                </h4>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p className="mb-3">
                    Notre système détecte automatiquement les langues suivantes :
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(languageNames).slice(0, 12).map(([code, name]) => (
                      <Badge key={code} variant="outline" className="text-xs">
                        {getLanguageFlag(code)} {name}
                      </Badge>
                    ))}
                    <Badge variant="secondary" className="text-xs">
                      +{Object.keys(languageNames).length - 12} autres
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
