'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import type { VoiceQualityAnalysis } from '@meeshy/shared/types/voice-api';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface VoiceQualityConfigProps {
  analysis: VoiceQualityAnalysis | null;
  isLoading?: boolean;
  className?: string;
}

interface QualityMetricProps {
  label: string;
  value: number;
  unit?: string;
  description?: string;
  goodRange?: [number, number];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Détermine le niveau de qualité basé sur le score
 */
function getQualityLevel(score: number): {
  label: string;
  color: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  if (score >= 0.8) {
    return { label: 'Excellent', color: 'text-green-600', variant: 'default' };
  } else if (score >= 0.6) {
    return { label: 'Bon', color: 'text-blue-600', variant: 'secondary' };
  } else if (score >= 0.4) {
    return { label: 'Moyen', color: 'text-yellow-600', variant: 'outline' };
  } else {
    return { label: 'Faible', color: 'text-red-600', variant: 'destructive' };
  }
}

/**
 * Vérifie si une valeur est dans la plage recommandée
 */
function isInGoodRange(value: number, range?: [number, number]): boolean {
  if (!range) return true;
  return value >= range[0] && value <= range[1];
}

// ═══════════════════════════════════════════════════════════════════════════
// METRIC COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function QualityMetric({ label, value, unit = '', description, goodRange }: QualityMetricProps) {
  const inRange = isInGoodRange(value, goodRange);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {description && (
            <Info className="h-4 w-4 text-muted-foreground" title={description} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono tabular-nums">
            {typeof value === 'number' ? value.toFixed(2) : value}
            {unit}
          </span>
          {goodRange && (
            inRange ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            )
          )}
        </div>
      </div>
      {goodRange && (
        <div className="text-xs text-muted-foreground">
          Plage recommandée: {goodRange[0]} - {goodRange[1]}{unit}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function VoiceQualityConfig({ analysis, isLoading, className }: VoiceQualityConfigProps) {
  const { t } = useI18n('settings');

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Analyse vocale</CardTitle>
          <CardDescription>
            Aucune analyse disponible. Enregistrez un échantillon vocal pour voir les métriques de qualité.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const qualityMetrics = analysis.qualityMetrics;
  const qualityLevel = qualityMetrics ? getQualityLevel(qualityMetrics.overallScore) : null;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overall Quality Score */}
      {qualityMetrics && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Qualité vocale globale</CardTitle>
                <CardDescription>
                  Évaluation de la qualité pour le clonage vocal
                </CardDescription>
              </div>
              {qualityLevel && (
                <Badge variant={qualityLevel.variant}>
                  {qualityLevel.label}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Score global</span>
                <span className="font-mono tabular-nums font-medium">
                  {(qualityMetrics.overallScore * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={qualityMetrics.overallScore * 100} className="h-2" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <QualityMetric
                label="Clarté"
                value={qualityMetrics.clarity}
                description="Rapport signal/bruit et qualité audio"
                goodRange={[0.4, 1.0]}
              />
              <QualityMetric
                label="Consistance"
                value={qualityMetrics.consistency}
                description="Stabilité des caractéristiques vocales"
                goodRange={[0.5, 1.0]}
              />
            </div>

            {qualityMetrics.suitableForCloning !== undefined && (
              <div className={cn(
                'flex items-center gap-2 p-3 rounded-lg',
                qualityMetrics.suitableForCloning
                  ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                  : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200'
              )}>
                {qualityMetrics.suitableForCloning ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <span className="text-sm font-medium">
                  {qualityMetrics.suitableForCloning
                    ? 'Convient au clonage vocal'
                    : 'Qualité insuffisante pour le clonage'
                  }
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pitch Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Analyse du pitch (fréquence fondamentale)</CardTitle>
          <CardDescription>Caractéristiques de hauteur vocale</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QualityMetric
            label="Moyenne"
            value={analysis.pitch.mean}
            unit=" Hz"
            description="Fréquence fondamentale moyenne"
            goodRange={[80, 300]}
          />
          <QualityMetric
            label="Écart-type"
            value={analysis.pitch.std}
            unit=" Hz"
            description="Variation du pitch"
          />
          <div className="grid grid-cols-2 gap-4">
            <QualityMetric
              label="Minimum"
              value={analysis.pitch.min}
              unit=" Hz"
            />
            <QualityMetric
              label="Maximum"
              value={analysis.pitch.max}
              unit=" Hz"
            />
          </div>
        </CardContent>
      </Card>

      {/* Timbre Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Analyse du timbre</CardTitle>
          <CardDescription>Couleur et texture vocale</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QualityMetric
            label="Centroïde spectral"
            value={analysis.timbre.spectralCentroid}
            unit=" Hz"
            description="Centre de gravité du spectre fréquentiel"
          />
          <QualityMetric
            label="Largeur de bande spectrale"
            value={analysis.timbre.spectralBandwidth}
            unit=" Hz"
            description="Étendue du spectre"
          />
          <QualityMetric
            label="Rolloff spectral"
            value={analysis.timbre.spectralRolloff}
            unit=" Hz"
            description="Fréquence de coupure à 85% de l'énergie"
          />
          <QualityMetric
            label="Flatness spectrale"
            value={analysis.timbre.spectralFlatness}
            description="Mesure du bruit vs tonalité (0=tonal, 1=bruit)"
            goodRange={[0, 0.3]}
          />
        </CardContent>
      </Card>

      {/* Energy Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Analyse d'énergie</CardTitle>
          <CardDescription>Niveau sonore et dynamique</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QualityMetric
            label="RMS (niveau moyen)"
            value={analysis.energy.rms}
            description="Niveau d'énergie moyen"
          />
          <QualityMetric
            label="Pic"
            value={analysis.energy.peak}
            description="Niveau maximum"
          />
          <QualityMetric
            label="Plage dynamique"
            value={analysis.energy.dynamicRange}
            unit=" dB"
            description="Différence entre pic et minimum"
            goodRange={[30, 60]}
          />
        </CardContent>
      </Card>

      {/* Classification */}
      <Card>
        <CardHeader>
          <CardTitle>Classification vocale</CardTitle>
          <CardDescription>Type et caractéristiques</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Type de voix</div>
              <Badge variant="secondary">{analysis.classification.voiceType}</Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Genre</div>
              <Badge variant="secondary">{analysis.classification.gender}</Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Tranche d'âge</div>
              <Badge variant="secondary">{analysis.classification.ageRange}</Badge>
            </div>
          </div>
          <QualityMetric
            label="Confiance de classification"
            value={analysis.classification.confidence}
            description="Fiabilité de la classification automatique"
            goodRange={[0.7, 1.0]}
          />
        </CardContent>
      </Card>

      {/* Prosody (if available) */}
      {analysis.prosody && (
        <Card>
          <CardHeader>
            <CardTitle>Analyse prosodique</CardTitle>
            <CardDescription>Rythme et modulation de la parole</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QualityMetric
              label="Énergie moyenne"
              value={analysis.prosody.energyMean}
              description="Niveau d'intensité vocale moyen"
            />
            <QualityMetric
              label="Variabilité de l'énergie"
              value={analysis.prosody.energyStd}
              description="Variation de l'intensité"
            />
            <QualityMetric
              label="Ratio de silence"
              value={analysis.prosody.silenceRatio}
              description="Proportion de pauses dans la parole"
              goodRange={[0.1, 0.4]}
            />
            <QualityMetric
              label="Débit de parole"
              value={analysis.prosody.speechRateWpm}
              unit=" mots/min"
              description="Vitesse d'élocution"
              goodRange={[100, 160]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
