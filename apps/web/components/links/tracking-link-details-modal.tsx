'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  Globe, 
  Monitor, 
  Chrome, 
  Calendar,
  TrendingUp,
  Users,
  Link2,
  Eye,
  MousePointerClick,
  ExternalLink
} from 'lucide-react';
import type { TrackingLink } from '@meeshy/shared/types/tracking-link';
import { getTrackingLinkStats } from '@/services/tracking-links';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';

interface TrackingLinkDetailsModalProps {
  link: TrackingLink;
  isOpen: boolean;
  onClose: () => void;
}

export function TrackingLinkDetailsModal({ 
  link, 
  isOpen, 
  onClose 
}: TrackingLinkDetailsModalProps) {
  const { t } = useI18n('links');
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && link) {
      loadStats();
    }
  }, [isOpen, link]);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const data = await getTrackingLinkStats(link.token);
      setStats(data);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
      toast.error(t('tracking.errors.statsFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl">
              <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            {t('tracking.details.title')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-primary"></div>
            <p className="mt-4 text-muted-foreground">Loading statistics...</p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="w-full grid grid-cols-3 md:grid-cols-6">
              <TabsTrigger value="overview" title={t('tracking.details.overview')}>
                <TrendingUp className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="geography" title={t('tracking.details.geography')}>
                <Globe className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="devices" title={t('tracking.details.devices')}>
                <Monitor className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="browsers" title={t('tracking.details.browsers')}>
                <Chrome className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="timeline" title={t('tracking.details.timeline')}>
                <Calendar className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="referrers" title="Referrers">
                <Eye className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-blue-600" />
                      Link Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Original URL</p>
                      <a 
                        href={link.originalUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
                      >
                        {link.originalUrl}
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Short URL</p>
                      <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded break-all">
                        {typeof window !== 'undefined' && link.shortUrl.startsWith('/')
                          ? `${window.location.origin}${link.shortUrl}`
                          : link.shortUrl}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Token</p>
                      <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">{link.token}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Status</p>
                      <Badge variant={link.isActive ? 'default' : 'secondary'}>
                        {link.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                      Performance Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <MousePointerClick className="h-5 w-5 text-blue-600" />
                        <span className="font-medium">Total Clicks</span>
                      </div>
                      <span className="text-2xl font-bold text-blue-600">{stats?.totalClicks || 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-green-600" />
                        <span className="font-medium">Unique Clicks</span>
                      </div>
                      <span className="text-2xl font-bold text-green-600">{stats?.uniqueClicks || 0}</span>
                    </div>
                    {link.lastClickedAt && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Last Clicked</p>
                        <p className="text-sm">{formatDate(link.lastClickedAt)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Created</p>
                      <p className="text-sm">{formatDate(link.createdAt)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Geography Tab */}
            <TabsContent value="geography" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-purple-600" />
                    {t('tracking.details.clicksByCountry')}
                  </CardTitle>
                  <CardDescription>Geographic distribution of clicks</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.clicksByCountry && Object.keys(stats.clicksByCountry).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(stats.clicksByCountry)
                        .sort(([, a]: any, [, b]: any) => b - a)
                        .map(([country, clicks]: any) => (
                          <div key={country} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <span className="font-medium">{country || 'Unknown'}</span>
                            <Badge variant="outline">{clicks} clicks</Badge>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No geographic data available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Devices Tab */}
            <TabsContent value="devices" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-indigo-600" />
                    {t('tracking.details.clicksByDevice')}
                  </CardTitle>
                  <CardDescription>Device type distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.clicksByDevice && Object.keys(stats.clicksByDevice).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(stats.clicksByDevice)
                        .sort(([, a]: any, [, b]: any) => b - a)
                        .map(([device, clicks]: any) => (
                          <div key={device} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <span className="font-medium capitalize">{device || 'Unknown'}</span>
                            <Badge variant="outline">{clicks} clicks</Badge>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No device data available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Browsers Tab */}
            <TabsContent value="browsers" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Chrome className="h-5 w-5 text-orange-600" />
                    {t('tracking.details.clicksByBrowser')}
                  </CardTitle>
                  <CardDescription>Browser distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.clicksByBrowser && Object.keys(stats.clicksByBrowser).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(stats.clicksByBrowser)
                        .sort(([, a]: any, [, b]: any) => b - a)
                        .map(([browser, clicks]: any) => (
                          <div key={browser} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <span className="font-medium">{browser || 'Unknown'}</span>
                            <Badge variant="outline">{clicks} clicks</Badge>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No browser data available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-green-600" />
                    {t('tracking.details.clicksByDate')}
                  </CardTitle>
                  <CardDescription>Clicks over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.clicksByDate && Object.keys(stats.clicksByDate).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(stats.clicksByDate)
                        .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                        .map(([date, clicks]: any) => (
                          <div key={date} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <span className="font-medium">{new Date(date).toLocaleDateString()}</span>
                            <Badge variant="outline">{clicks} clicks</Badge>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No timeline data available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Referrers Tab */}
            <TabsContent value="referrers" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-pink-600" />
                    {t('tracking.details.topReferrers')}
                  </CardTitle>
                  <CardDescription>Traffic sources</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.topReferrers && stats.topReferrers.length > 0 ? (
                    <div className="space-y-2">
                      {stats.topReferrers.map((item: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <span className="font-medium truncate">{item.referrer || 'Direct'}</span>
                          <Badge variant="outline">{item.count} clicks</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No referrer data available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
