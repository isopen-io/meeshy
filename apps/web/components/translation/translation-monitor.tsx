'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Languages,
  TrendingUp,
  Database,
  Zap,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranslationMetrics {
  // Métriques de base
  totalMessages: number;
  translatedMessages: number;
  pendingTranslations: number;
  errorCount: number;
  
  // Métriques de performance
  avgTranslationTime: number;
  cacheHitRate: number;
  throughput: number; // messages/seconde
  
  // Métriques par langue
  languageBreakdown: {
    [language: string]: {
      count: number;
      avgTime: number;
      errorRate: number;
    };
  };
  
  // Métriques en temps réel
  activeTranslations: number;
  queueSize: number;
  lastUpdated: Date;
}

interface TranslationMonitorProps {
  conversationId?: string;
  onRefresh?: () => void;
  className?: string;
  showDetails?: boolean;
  refreshInterval?: number; // en ms
}

export function TranslationMonitor({
  conversationId,
  onRefresh,
  className,
  showDetails = true,
  refreshInterval = 5000
}: TranslationMonitorProps) {
  const [metrics, setMetrics] = useState<TranslationMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simulation des métriques (à remplacer par de vraies données)
  const fetchMetrics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simuler un appel API
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockMetrics: TranslationMetrics = {
        totalMessages: 1247,
        translatedMessages: 1198,
        pendingTranslations: 23,
        errorCount: 3,
        avgTranslationTime: 850,
        cacheHitRate: 78.5,
        throughput: 12.3,
        languageBreakdown: {
          'en': { count: 542, avgTime: 720, errorRate: 0.2 },
          'es': { count: 334, avgTime: 890, errorRate: 0.1 },
          'de': { count: 198, avgTime: 920, errorRate: 0.3 },
          'pt': { count: 124, avgTime: 780, errorRate: 0.1 }
        },
        activeTranslations: 5,
        queueSize: 18,
        lastUpdated: new Date()
      };
      
      setMetrics(mockMetrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  // Rafraîchissement automatique
  useEffect(() => {
    fetchMetrics();
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchMetrics, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, conversationId]);

  const handleRefresh = () => {
    fetchMetrics();
    onRefresh?.();
  };

  if (!metrics && !isLoading) return null;

  const translationRate = metrics ? (metrics.translatedMessages / metrics.totalMessages) * 100 : 0;
  const errorRate = metrics ? (metrics.errorCount / metrics.totalMessages) * 100 : 0;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          Monitoring Traductions
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="h-8"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Erreur de monitoring</span>
            </div>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        )}

        {isLoading && !metrics && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Chargement des métriques...</span>
          </div>
        )}

        {metrics && (
          <>
            {/* Métriques principales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-700 text-sm font-medium">Messages</p>
                    <p className="text-2xl font-bold text-blue-900">{metrics.totalMessages}</p>
                  </div>
                  <Languages className="h-8 w-8 text-blue-600 opacity-60" />
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-700 text-sm font-medium">Traduits</p>
                    <p className="text-2xl font-bold text-green-900">{metrics.translatedMessages}</p>
                    <p className="text-green-600 text-xs">{translationRate.toFixed(1)}%</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600 opacity-60" />
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-amber-700 text-sm font-medium">En attente</p>
                    <p className="text-2xl font-bold text-amber-900">{metrics.pendingTranslations}</p>
                  </div>
                  <Clock className="h-8 w-8 text-amber-600 opacity-60" />
                </div>
              </div>

              <div className="bg-red-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-700 text-sm font-medium">Erreurs</p>
                    <p className="text-2xl font-bold text-red-900">{metrics.errorCount}</p>
                    <p className="text-red-600 text-xs">{errorRate.toFixed(1)}%</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-red-600 opacity-60" />
                </div>
              </div>
            </div>

            {/* Barre de progression globale */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Progression des traductions</span>
                <span className="font-medium">{translationRate.toFixed(1)}%</span>
              </div>
              <Progress value={translationRate} className="h-2" />
            </div>

            {showDetails && (
              <>
                {/* Métriques de performance */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-center gap-1 text-gray-600 text-sm mb-1">
                      <Zap className="h-4 w-4" />
                      Temps moyen
                    </div>
                    <p className="font-bold text-lg">{metrics.avgTranslationTime}ms</p>
                  </div>

                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-center gap-1 text-gray-600 text-sm mb-1">
                      <Database className="h-4 w-4" />
                      Cache Hit
                    </div>
                    <p className="font-bold text-lg">{metrics.cacheHitRate}%</p>
                  </div>

                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-center gap-1 text-gray-600 text-sm mb-1">
                      <TrendingUp className="h-4 w-4" />
                      Débit
                    </div>
                    <p className="font-bold text-lg">{metrics.throughput}/s</p>
                  </div>
                </div>

                {/* Activité en temps réel */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Activité en temps réel
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-blue-700 text-sm">Traductions actives</p>
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-bold text-blue-900">{metrics.activeTranslations}</p>
                        {metrics.activeTranslations > 0 && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-blue-700 text-sm">File d'attente</p>
                      <p className="text-2xl font-bold text-blue-900">{metrics.queueSize}</p>
                    </div>
                  </div>
                </div>

                {/* Répartition par langue */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Répartition par langue</h4>
                  <div className="space-y-3">
                    {Object.entries(metrics.languageBreakdown)
                      .sort(([, a], [, b]) => b.count - a.count)
                      .map(([lang, data]) => (
                        <div key={lang} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono">
                              {lang.toUpperCase()}
                            </Badge>
                            <div>
                              <p className="font-medium">{data.count} messages</p>
                              <p className="text-sm text-gray-600">
                                {data.avgTime}ms • {data.errorRate}% erreurs
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ 
                                  width: `${(data.count / Math.max(...Object.values(metrics.languageBreakdown).map(d => d.count))) * 100}%` 
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* Dernière mise à jour */}
                <div className="text-center text-sm text-gray-500">
                  Dernière mise à jour: {metrics.lastUpdated.toLocaleTimeString()}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}