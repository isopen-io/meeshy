'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Link2,
  ExternalLink,
  Copy,
  Calendar,
  MousePointerClick,
  Users,
  TrendingUp,
  Globe,
  Smartphone,
  Monitor,
  Activity,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { getTrackingLinkStats } from '@/services/tracking-links';
import { copyToClipboard } from '@/lib/clipboard';
import type { TrackingLink } from '@meeshy/shared/types/tracking-link';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface TrackingLinkStats {
  trackingLink: TrackingLink;
  clicksByDate: Array<{ date: string; clicks: number; uniqueClicks: number }>;
  clicksByCountry: Array<{ country: string; clicks: number }>;
  clicksByDevice: Array<{ device: string; clicks: number }>;
  clicksByBrowser: Array<{ browser: string; clicks: number }>;
  topReferrers: Array<{ referrer: string; clicks: number }>;
}

export default function TrackingLinkDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useI18n('links');
  const token = params.token as string;

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<TrackingLinkStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, [token]);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getTrackingLinkStats(token);

      if (!data) {
        throw new Error('No data returned from API');
      }

      // Transformer les données du format API vers le format attendu par le composant
      const transformedStats: TrackingLinkStats = {
        trackingLink: data.trackingLink,
        clicksByDate: Object.entries(data.clicksByDate || {})
          .map(([date, clicks]) => ({
            date,
            clicks: clicks as number,
            uniqueClicks: clicks as number // Approximation, en attendant que le backend renvoie les données détaillées
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        clicksByCountry: Object.entries(data.clicksByCountry || {})
          .map(([country, clicks]) => ({ country, clicks: clicks as number }))
          .sort((a, b) => b.clicks - a.clicks),
        clicksByDevice: Object.entries(data.clicksByDevice || {})
          .map(([device, clicks]) => ({ device, clicks: clicks as number }))
          .sort((a, b) => b.clicks - a.clicks),
        clicksByBrowser: Object.entries(data.clicksByBrowser || {})
          .map(([browser, clicks]) => ({ browser, clicks: clicks as number }))
          .sort((a, b) => b.clicks - a.clicks),
        topReferrers: (data.topReferrers || []).map(r => ({
          referrer: r.referrer,
          clicks: r.count
        }))
      };

      setStats(transformedStats);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);

      // Vérifier le type d'erreur
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Non authentifié') || errorMessage.includes('401')) {
        // Rediriger vers la page de login avec retour vers cette page
        toast.error(t('tracking.errors.authRequired') || 'Vous devez être connecté pour voir ces statistiques');
        setTimeout(() => {
          router.push(`/login?redirect=/links/tracked/${token}`);
        }, 1500);
        setError('auth_required');
      } else if (errorMessage.includes('403') || errorMessage.includes('Accès non autorisé')) {
        // L'utilisateur n'est pas le créateur du lien
        toast.error(t('tracking.errors.unauthorized') || 'Vous n\'êtes pas autorisé à voir ces statistiques');
        setError('unauthorized');
      } else if (errorMessage.includes('404') || errorMessage.includes('non trouvé')) {
        // Le lien n'existe pas
        toast.error(t('tracking.errors.notFound') || 'Lien de tracking non trouvé');
        setError('not_found');
      } else {
        // Erreur générique
        toast.error(t('tracking.errors.statsFailed') || 'Erreur lors du chargement des statistiques');
        setError('generic');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async (url: string) => {
    const result = await copyToClipboard(url);
    if (result.success) {
      toast.success(t('tracking.success.copied'));
    } else {
      toast.error(result.message);
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!stats && error) {
    // Messages d'erreur personnalisés selon le type d'erreur
    let errorTitle = t('tracking.details.linkNotFound') || 'Lien non trouvé';
    let errorDescription = t('tracking.details.linkNotFoundDescription') || 'Ce lien de tracking n\'existe pas';
    let errorIcon = <XCircle className="h-16 w-16 text-red-600 mb-4" />;

    if (error === 'auth_required') {
      errorTitle = t('tracking.errors.authRequiredTitle') || 'Authentification requise';
      errorDescription = t('tracking.errors.authRequiredDesc') || 'Vous devez être connecté pour voir les statistiques de ce lien. Redirection vers la page de connexion...';
      errorIcon = <Activity className="h-16 w-16 text-orange-600 mb-4" />;
    } else if (error === 'unauthorized') {
      errorTitle = t('tracking.errors.unauthorizedTitle') || 'Accès refusé';
      errorDescription = t('tracking.errors.unauthorizedDesc') || 'Vous n\'êtes pas autorisé à voir les statistiques de ce lien. Seul le créateur peut y accéder.';
      errorIcon = <XCircle className="h-16 w-16 text-red-600 mb-4" />;
    } else if (error === 'not_found') {
      errorTitle = t('tracking.details.linkNotFound') || 'Lien non trouvé';
      errorDescription = t('tracking.details.linkNotFoundDescription') || 'Ce lien de tracking n\'existe pas ou a été supprimé.';
      errorIcon = <XCircle className="h-16 w-16 text-red-600 mb-4" />;
    }

    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <DashboardLayout title={t('tracking.details.title')} className="!bg-none !bg-transparent !h-auto">
          <div className="relative z-10 space-y-6 pb-8">
            <Card className="border-2 bg-white dark:bg-gray-950">
              <CardContent className="flex flex-col items-center justify-center py-16">
                {errorIcon}
                <h3 className="text-2xl font-bold text-foreground mb-3">{errorTitle}</h3>
                <p className="text-muted-foreground mb-6 text-center max-w-md">{errorDescription}</p>
                <Button onClick={() => router.push('/links#tracked')} variant="default">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('tracking.details.backToLinks') || 'Retour aux liens'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
      </div>
    );
  }

  // Fallback au cas où stats est null sans erreur (ne devrait jamais arriver)
  if (!stats) {
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <DashboardLayout title={t('tracking.details.title')} className="!bg-none !bg-transparent !h-auto">
          <div className="relative z-10 space-y-6 pb-8">
            <Card className="border-2 bg-white dark:bg-gray-950">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <XCircle className="h-16 w-16 text-red-600 mb-4" />
                <h3 className="text-2xl font-bold text-foreground mb-3">{t('tracking.details.linkNotFound') || 'Erreur'}</h3>
                <p className="text-muted-foreground mb-6">Une erreur inattendue s'est produite</p>
                <Button onClick={() => router.push('/links#tracked')} variant="default">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('tracking.details.backToLinks') || 'Retour aux liens'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
      </div>
    );
  }

  const { trackingLink } = stats;

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <DashboardLayout title={t('tracking.details.title')} className="!bg-none !bg-transparent !h-auto">
        <div className="relative z-10 space-y-8 pb-8 py-8">

          {/* Header avec retour */}
          <div className="flex items-center gap-4">
            <Button
              onClick={() => router.push('/links#tracked')}
              variant="outline"
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('tracking.details.backToLinks')}
            </Button>
          </div>

          {/* Hero Section - Info du lien */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 p-8 md:p-12 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                      <Link2 className="h-8 w-8" />
                    </div>
                    <div>
                      <h1 className="text-3xl md:text-4xl font-bold">{trackingLink.shortUrl}</h1>
                      <p className="text-blue-100 mt-1">Token: {trackingLink.token}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-lg">
                    <ExternalLink className="h-5 w-5" />
                    <a
                      href={trackingLink.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline break-all"
                    >
                      {trackingLink.originalUrl}
                    </a>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Badge
                    className={`px-3 py-1.5 text-sm font-semibold ${
                      trackingLink.isActive
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-gray-400 hover:bg-gray-500'
                    }`}
                  >
                    {trackingLink.isActive ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('status.active')}
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        {t('status.inactive')}
                      </>
                    )}
                  </Badge>
                  <Button
                    onClick={() => handleCopyLink(trackingLink.shortUrl)}
                    variant="secondary"
                    size="sm"
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    {t('tracking.details.copy')}
                  </Button>
                </div>
              </div>
            </div>
            {/* Decorative elements */}
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -left-12 -top-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
          </div>

          {/* Stats principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg bg-white dark:bg-gray-950">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">{t('tracking.stats.totalClicks')}</p>
                    <p className="text-3xl font-bold text-foreground">{trackingLink.totalClicks}</p>
                  </div>
                  <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-2xl">
                    <MousePointerClick className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-green-500/50 transition-all hover:shadow-lg bg-white dark:bg-gray-950">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">{t('tracking.stats.uniqueClicks')}</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">{trackingLink.uniqueClicks}</p>
                  </div>
                  <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-2xl">
                    <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-purple-500/50 transition-all hover:shadow-lg bg-white dark:bg-gray-950">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">{t('tracking.stats.conversionRate')}</p>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                      {trackingLink.totalClicks > 0
                        ? Math.round((trackingLink.uniqueClicks / trackingLink.totalClicks) * 100)
                        : 0}%
                    </p>
                  </div>
                  <div className="p-4 bg-purple-100 dark:bg-purple-900/30 rounded-2xl">
                    <TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-orange-500/50 transition-all hover:shadow-lg bg-white dark:bg-gray-950">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">{t('tracking.stats.lastClick')}</p>
                    <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      {trackingLink.lastClickedAt ? formatDate(trackingLink.lastClickedAt) : t('tracking.stats.never')}
                    </p>
                  </div>
                  <div className="p-4 bg-orange-100 dark:bg-orange-900/30 rounded-2xl">
                    <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Graphes et données détaillées */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Clics par pays */}
            {stats.clicksByCountry && stats.clicksByCountry.length > 0 && (
              <Card className="border-2 bg-white dark:bg-gray-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    {t('tracking.details.clicksByCountry')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats.clicksByCountry.slice(0, 5).map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.country || t('tracking.details.unknown')}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600"
                              style={{
                                width: `${(item.clicks / trackingLink.totalClicks) * 100}%`
                              }}
                            />
                          </div>
                          <span className="text-sm font-bold w-12 text-right">{item.clicks}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Clics par appareil */}
            {stats.clicksByDevice && stats.clicksByDevice.length > 0 && (
              <Card className="border-2 bg-white dark:bg-gray-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5" />
                    {t('tracking.details.clicksByDevice')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats.clicksByDevice.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-2">
                          {item.device === 'mobile' && <Smartphone className="h-4 w-4" />}
                          {item.device === 'desktop' && <Monitor className="h-4 w-4" />}
                          {item.device === 'tablet' && <Monitor className="h-4 w-4" />}
                          {item.device || t('tracking.details.unknown')}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-600"
                              style={{
                                width: `${(item.clicks / trackingLink.totalClicks) * 100}%`
                              }}
                            />
                          </div>
                          <span className="text-sm font-bold w-12 text-right">{item.clicks}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top référents */}
            {stats.topReferrers && stats.topReferrers.length > 0 && (
              <Card className="border-2 bg-white dark:bg-gray-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    {t('tracking.details.topReferrers')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats.topReferrers.slice(0, 5).map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate flex-1">{item.referrer || t('tracking.details.direct')}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-600"
                              style={{
                                width: `${(item.clicks / trackingLink.totalClicks) * 100}%`
                              }}
                            />
                          </div>
                          <span className="text-sm font-bold w-12 text-right">{item.clicks}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Clics par navigateur */}
            {stats.clicksByBrowser && stats.clicksByBrowser.length > 0 && (
              <Card className="border-2 bg-white dark:bg-gray-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    {t('tracking.details.clicksByBrowser')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats.clicksByBrowser.slice(0, 5).map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.browser || t('tracking.details.unknown')}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-600"
                              style={{
                                width: `${(item.clicks / trackingLink.totalClicks) * 100}%`
                              }}
                            />
                          </div>
                          <span className="text-sm font-bold w-12 text-right">{item.clicks}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Graphique des clics avec moyenne */}
          {stats.clicksByDate && stats.clicksByDate.length > 0 && (() => {
            // Calculer la moyenne des clics totaux et uniques
            const avgClicks = stats.clicksByDate.reduce((sum, item) => sum + item.clicks, 0) / stats.clicksByDate.length;
            const avgUniqueClicks = stats.clicksByDate.reduce((sum, item) => sum + item.uniqueClicks, 0) / stats.clicksByDate.length;

            // Préparer les données pour le graphique
            const chartData = stats.clicksByDate.slice(-14).map(item => ({
              date: new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
              fullDate: item.date,
              [t('stats.totalClicks')]: item.clicks,
              [t('stats.uniqueClicks')]: item.uniqueClicks,
              [t('stats.avgTotal')]: Math.round(avgClicks * 10) / 10,
              [t('stats.avgUnique')]: Math.round(avgUniqueClicks * 10) / 10,
            }));

            return (
              <Card className="border-2 bg-white dark:bg-gray-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {t('tracking.details.clicksByDate')}
                  </CardTitle>
                  <CardDescription>{t('tracking.details.evolutionOverTime')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Graphique Recharts */}
                    <ResponsiveContainer width="100%" height={400}>
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                        <XAxis
                          dataKey="date"
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          className="text-xs"
                        />
                        <YAxis className="text-xs" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white'
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey={t('stats.totalClicks')}
                          fill="#3b82f6"
                          radius={[8, 8, 0, 0]}
                        />
                        <Bar
                          dataKey={t('stats.uniqueClicks')}
                          fill="#10b981"
                          radius={[8, 8, 0, 0]}
                        />
                        <Line
                          type="monotone"
                          dataKey={t('stats.avgTotal')}
                          stroke="#ef4444"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey={t('stats.avgUnique')}
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>

                    {/* Tableau récapitulatif */}
                    <div className="mt-6 pt-6 border-t">
                      <div className="grid grid-cols-1 gap-2">
                        {stats.clicksByDate.slice(-5).reverse().map((item, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                            <span className="text-sm font-medium">{formatDate(item.date)}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-blue-600 font-bold">{item.clicks} clics</span>
                              <span className="text-sm text-green-600 font-bold">{item.uniqueClicks} uniques</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Informations du lien */}
          <Card className="border-2 bg-white dark:bg-gray-950">
            <CardHeader>
              <CardTitle>{t('tracking.details.linkInformation')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('tracking.details.token')}</p>
                  <p className="text-lg font-bold">{trackingLink.token}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('tracking.details.createdOn')}</p>
                  <p className="text-lg font-bold">{formatDate(trackingLink.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('tracking.details.shortUrl')}</p>
                  <p className="text-lg font-bold break-all">{trackingLink.shortUrl}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('tracking.details.originalUrl')}</p>
                  <p className="text-lg font-bold break-all">{trackingLink.originalUrl}</p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </DashboardLayout>

      {/* Footer */}
      <div className="relative z-20 mt-auto">
        <Footer />
      </div>
    </div>
  );
}
