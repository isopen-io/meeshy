'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { agentAdminService, type ArchetypeData } from '@/services/agent-admin.service';
import { toast } from 'sonner';

const TONE_COLORS: Record<string, string> = {
  enthousiaste: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  chaleureux: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  analytique: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  direct: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  amical: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const EMOJI_LABELS: Record<string, string> = {
  occasionnel: 'Occasionnel',
  abondant: 'Abondant',
  jamais: 'Jamais',
};

export function AgentArchetypesTab() {
  const [archetypes, setArchetypes] = useState<ArchetypeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArchetypes = async () => {
      try {
        const response = await agentAdminService.getArchetypes();
        if (response.success && response.data) {
          setArchetypes(response.data);
        }
      } catch {
        toast.error('Erreur lors du chargement des archétypes');
      } finally {
        setLoading(false);
      }
    };
    fetchArchetypes();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Catalogue d&apos;archétypes
        </h2>
        <Badge variant="outline">{archetypes.length} archétypes</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {archetypes.map(archetype => (
          <Card key={archetype.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{archetype.name}</CardTitle>
                <Badge variant="outline" className="font-mono text-xs">{archetype.id}</Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{archetype.personaSummary}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                <Badge className={TONE_COLORS[archetype.tone] ?? 'bg-gray-100 text-gray-800'}>
                  {archetype.tone}
                </Badge>
                <Badge variant="outline">{archetype.vocabularyLevel}</Badge>
                <Badge variant="outline">{EMOJI_LABELS[archetype.emojiUsage] ?? archetype.emojiUsage}</Badge>
                <Badge variant="secondary">{archetype.typicalLength}</Badge>
              </div>

              {/* Catchphrases */}
              {archetype.catchphrases.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-gray-500 uppercase">Catchphrases</span>
                  <div className="flex flex-wrap gap-1">
                    {archetype.catchphrases.map((phrase, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 italic"
                      >
                        &laquo; {phrase} &raquo;
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible triggers */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  <ChevronDown className="h-3 w-3" />
                  Triggers
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  {archetype.responseTriggers.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-green-600">Répond à :</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {archetype.responseTriggers.map((t, i) => (
                          <Badge key={i} variant="outline" className="text-xs border-green-200 text-green-700">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {archetype.silenceTriggers.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-red-600">Se tait sur :</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {archetype.silenceTriggers.map((t, i) => (
                          <Badge key={i} variant="outline" className="text-xs border-red-200 text-red-700">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
