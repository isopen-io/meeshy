'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VoiceQualityAnalysis } from '@meeshy/shared/types/voice-api';
import { useI18n } from '@/hooks/use-i18n';

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
  labelKey: 'voiceQuality.levels.excellent' | 'voiceQuality.levels.good' | 'voiceQuality.levels.average' | 'voiceQuality.levels.low';
  color: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  if (score >= 0.8) {
    return { labelKey: 'voiceQuality.levels.excellent', color: 'text-green-600', variant: 'default' };
  } else if (score >= 0.6) {
    return { labelKey: 'voiceQuality.levels.good', color: 'text-blue-600', variant: 'secondary' };
  } else if (score >= 0.4) {
    return { labelKey: 'voiceQuality.levels.average', color: 'text-yellow-600', variant: 'outline' };
  } else {
    return { labelKey: 'voiceQuality.levels.low', color: 'text-red-600', variant: 'destructive' };
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

function QualityMetric({ label, value, unit = '', description, goodRange, recommendedRangeText }: QualityMetricProps & { recommendedRangeText?: string }) {
  const inRange = isInGoodRange(value, goodRange);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {description && (
            <Info className="h-4 w-4 text-muted-foreground" />
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
      {goodRange && recommendedRangeText && (
        <div className="text-xs text-muted-foreground">
          {recommendedRangeText}
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
          <CardTitle>{t('voiceQuality.title')}</CardTitle>
          <CardDescription>
            {t('voiceQuality.noAnalysis')}
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
                <CardTitle>{t('voiceQuality.overall.title')}</CardTitle>
                <CardDescription>
                  {t('voiceQuality.overall.description')}
                </CardDescription>
              </div>
              {qualityLevel && (
                <Badge variant={qualityLevel.variant}>
                  {t(qualityLevel.labelKey)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{t('voiceQuality.overall.score')}</span>
                <span className="font-mono tabular-nums font-medium">
                  {(qualityMetrics.overallScore * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={qualityMetrics.overallScore * 100} className="h-2" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <QualityMetric
                label={t('voiceQuality.overall.clarity.label')}
                value={qualityMetrics.clarity}
                description={t('voiceQuality.overall.clarity.description')}
                goodRange={[0.4, 1.0]}
                recommendedRangeText={t('voiceQuality.recommendedRange', { min: '0.4', max: '1.0', unit: '' })}
              />
              <QualityMetric
                label={t('voiceQuality.overall.consistency.label')}
                value={qualityMetrics.consistency}
                description={t('voiceQuality.overall.consistency.description')}
                goodRange={[0.5, 1.0]}
                recommendedRangeText={t('voiceQuality.recommendedRange', { min: '0.5', max: '1.0', unit: '' })}
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
                    ? t('voiceQuality.overall.suitableForCloning')
                    : t('voiceQuality.overall.insufficientQuality')
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
          <CardTitle>{t('voiceQuality.pitch.title')}</CardTitle>
          <CardDescription>{t('voiceQuality.pitch.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QualityMetric
            label={t('voiceQuality.pitch.mean.label')}
            value={analysis.pitch.mean}
            unit=" Hz"
            description={t('voiceQuality.pitch.mean.description')}
            goodRange={[80, 300]}
            recommendedRangeText={t('voiceQuality.recommendedRange', { min: '80', max: '300', unit: ' Hz' })}
          />
          <QualityMetric
            label={t('voiceQuality.pitch.std.label')}
            value={analysis.pitch.std}
            unit=" Hz"
            description={t('voiceQuality.pitch.std.description')}
          />
          <div className="grid grid-cols-2 gap-4">
            <QualityMetric
              label={t('voiceQuality.pitch.min')}
              value={analysis.pitch.min}
              unit=" Hz"
            />
            <QualityMetric
              label={t('voiceQuality.pitch.max')}
              value={analysis.pitch.max}
              unit=" Hz"
            />
          </div>
        </CardContent>
      </Card>

      {/* Timbre Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>{t('voiceQuality.timbre.title')}</CardTitle>
          <CardDescription>{t('voiceQuality.timbre.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QualityMetric
            label={t('voiceQuality.timbre.spectralCentroid.label')}
            value={analysis.timbre.spectralCentroid}
            unit=" Hz"
            description={t('voiceQuality.timbre.spectralCentroid.description')}
          />
          <QualityMetric
            label={t('voiceQuality.timbre.spectralBandwidth.label')}
            value={analysis.timbre.spectralBandwidth}
            unit=" Hz"
            description={t('voiceQuality.timbre.spectralBandwidth.description')}
          />
          <QualityMetric
            label={t('voiceQuality.timbre.spectralRolloff.label')}
            value={analysis.timbre.spectralRolloff}
            unit=" Hz"
            description={t('voiceQuality.timbre.spectralRolloff.description')}
          />
          <QualityMetric
            label={t('voiceQuality.timbre.spectralFlatness.label')}
            value={analysis.timbre.spectralFlatness}
            description={t('voiceQuality.timbre.spectralFlatness.description')}
            goodRange={[0, 0.3]}
            recommendedRangeText={t('voiceQuality.recommendedRange', { min: '0', max: '0.3', unit: '' })}
          />
        </CardContent>
      </Card>

      {/* Energy Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>{t('voiceQuality.energy.title')}</CardTitle>
          <CardDescription>{t('voiceQuality.energy.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QualityMetric
            label={t('voiceQuality.energy.rms.label')}
            value={analysis.energy.rms}
            description={t('voiceQuality.energy.rms.description')}
          />
          <QualityMetric
            label={t('voiceQuality.energy.peak.label')}
            value={analysis.energy.peak}
            description={t('voiceQuality.energy.peak.description')}
          />
          <QualityMetric
            label={t('voiceQuality.energy.dynamicRange.label')}
            value={analysis.energy.dynamicRange}
            unit=" dB"
            description={t('voiceQuality.energy.dynamicRange.description')}
            goodRange={[30, 60]}
            recommendedRangeText={t('voiceQuality.recommendedRange', { min: '30', max: '60', unit: ' dB' })}
          />
        </CardContent>
      </Card>

      {/* Classification */}
      <Card>
        <CardHeader>
          <CardTitle>{t('voiceQuality.classification.title')}</CardTitle>
          <CardDescription>{t('voiceQuality.classification.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">{t('voiceQuality.classification.voiceType')}</div>
              <Badge variant="secondary">{analysis.classification.voiceType}</Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">{t('voiceQuality.classification.gender')}</div>
              <Badge variant="secondary">{analysis.classification.gender}</Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">{t('voiceQuality.classification.ageRange')}</div>
              <Badge variant="secondary">{analysis.classification.ageRange}</Badge>
            </div>
          </div>
          <QualityMetric
            label={t('voiceQuality.classification.confidence.label')}
            value={analysis.classification.confidence}
            description={t('voiceQuality.classification.confidence.description')}
            goodRange={[0.7, 1.0]}
            recommendedRangeText={t('voiceQuality.recommendedRange', { min: '0.7', max: '1.0', unit: '' })}
          />
        </CardContent>
      </Card>

      {/* Prosody (if available) */}
      {analysis.prosody && (
        <Card>
          <CardHeader>
            <CardTitle>{t('voiceQuality.prosody.title')}</CardTitle>
            <CardDescription>{t('voiceQuality.prosody.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <QualityMetric
              label={t('voiceQuality.prosody.energyMean.label')}
              value={analysis.prosody.energyMean}
              description={t('voiceQuality.prosody.energyMean.description')}
            />
            <QualityMetric
              label={t('voiceQuality.prosody.energyStd.label')}
              value={analysis.prosody.energyStd}
              description={t('voiceQuality.prosody.energyStd.description')}
            />
            <QualityMetric
              label={t('voiceQuality.prosody.silenceRatio.label')}
              value={analysis.prosody.silenceRatio}
              description={t('voiceQuality.prosody.silenceRatio.description')}
              goodRange={[0.1, 0.4]}
              recommendedRangeText={t('voiceQuality.recommendedRange', { min: '0.1', max: '0.4', unit: '' })}
            />
            <QualityMetric
              label={t('voiceQuality.prosody.speechRate.label')}
              value={analysis.prosody.speechRateWpm}
              unit=" wpm"
              description={t('voiceQuality.prosody.speechRate.description')}
              goodRange={[100, 160]}
              recommendedRangeText={t('voiceQuality.recommendedRange', { min: '100', max: '160', unit: ' wpm' })}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
