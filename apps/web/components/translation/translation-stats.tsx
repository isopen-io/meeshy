'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Globe } from 'lucide-react';

interface SimpleStats {
  totalTranslations: number;
  lastUsed: Date | null;
}

export function TranslationStats() {
  const [stats, setStats] = useState<SimpleStats>({
    totalTranslations: 0,
    lastUsed: null
  });

  useEffect(() => {
    const loadStats = () => {
      try {
        const statsData = localStorage.getItem('translation_stats');
        if (statsData) {
          const parsedStats = JSON.parse(statsData);
          setStats({
            totalTranslations: parsedStats.totalTranslations || 0,
            lastUsed: parsedStats.lastUsed ? new Date(parsedStats.lastUsed) : null
          });
        }
      } catch (error) {
        console.error('Erreur lors du chargement des statistiques:', error);
      }
    };

    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Statistiques de traduction
          </CardTitle>
          <CardDescription>
            Aperçu de votre activité de traduction
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total des traductions</span>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {stats.totalTranslations}
                </Badge>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Dernière utilisation</span>
                <span className="text-sm text-muted-foreground">
                  {stats.lastUsed 
                    ? stats.lastUsed.toLocaleDateString('fr-FR')
                    : 'Jamais'
                  }
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-center text-sm text-muted-foreground">
              <p>Service de traduction API actif</p>
              <p className="text-xs mt-1">Traductions traitées côté serveur</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
