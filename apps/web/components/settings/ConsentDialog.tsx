'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Info, Shield } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import type { ConsentViolation } from '@/types/preferences';
import { useI18n } from '@/hooks/use-i18n';

// ===== TYPES =====

export interface ConsentDialogProps {
  /**
   * État d'ouverture du dialogue
   */
  open: boolean;

  /**
   * Callback pour modifier l'état d'ouverture
   */
  onOpenChange: (open: boolean) => void;

  /**
   * Liste des violations de consentement
   */
  violations: ConsentViolation[];

  /**
   * Callback lors de l'acceptation des consentements
   */
  onConsent: (consents: Record<string, boolean>) => Promise<void>;

  /**
   * Callback lors de l'annulation
   */
  onCancel?: () => void;

  /**
   * Mode du dialogue
   * - 'blocking': L'utilisateur doit accepter pour continuer
   * - 'optional': L'utilisateur peut refuser
   */
  mode?: 'blocking' | 'optional';
}

interface ConsentItem {
  key: string;
  label: string;
  description: string;
  required: boolean;
  icon: 'shield' | 'info' | 'alert';
}

// ===== HELPERS =====

/**
 * Extrait les consentements uniques des violations
 */
function extractUniqueConsents(violations: ConsentViolation[]): string[] {
  const consentsSet = new Set<string>();
  violations.forEach((v) => {
    v.requiredConsents.forEach((c) => consentsSet.add(c));
  });
  return Array.from(consentsSet);
}

/**
 * Convertit une clé de consentement en label lisible
 */
function getConsentLabel(consentKey: string, t: (key: string) => string): string {
  const labelMap: Record<string, string> = {
    voiceDataConsentAt: t('consentDialog.labels.voiceDataConsent'),
    audioTranscriptionEnabledAt: t('consentDialog.labels.audioTranscription'),
    videoRecordingConsentAt: t('consentDialog.labels.videoRecording'),
    biometricDataConsentAt: t('consentDialog.labels.biometricData'),
    locationSharingConsentAt: t('consentDialog.labels.locationSharing'),
    analyticsConsentAt: t('consentDialog.labels.analytics'),
  };

  return labelMap[consentKey] || consentKey;
}

/**
 * Récupère la description d'un consentement
 */
function getConsentDescription(consentKey: string, t: (key: string) => string): string {
  const descMap: Record<string, string> = {
    voiceDataConsentAt: t('consentDialog.descriptions.voiceDataConsent'),
    audioTranscriptionEnabledAt: t('consentDialog.descriptions.audioTranscription'),
    videoRecordingConsentAt: t('consentDialog.descriptions.videoRecording'),
    biometricDataConsentAt: t('consentDialog.descriptions.biometricData'),
    locationSharingConsentAt: t('consentDialog.descriptions.locationSharing'),
    analyticsConsentAt: t('consentDialog.descriptions.analytics'),
  };

  return descMap[consentKey] || t('consentDialog.descriptions.default');
}

/**
 * Détermine l'icône pour un type de consentement
 */
function getConsentIcon(consentKey: string): 'shield' | 'info' | 'alert' {
  if (
    consentKey.includes('biometric') ||
    consentKey.includes('location') ||
    consentKey.includes('voice')
  ) {
    return 'shield';
  }
  if (consentKey.includes('analytics') || consentKey.includes('tracking')) {
    return 'alert';
  }
  return 'info';
}

// ===== COMPOSANT PRINCIPAL =====

export function ConsentDialog({
  open,
  onOpenChange,
  violations,
  onConsent,
  onCancel,
  mode = 'optional',
}: ConsentDialogProps) {
  const { t } = useI18n('settings');

  // État local des consentements
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extraire les consentements uniques requis
  const requiredConsents = useMemo(() => {
    return extractUniqueConsents(violations);
  }, [violations]);

  // Construire la liste des items de consentement
  const consentItems = useMemo<ConsentItem[]>(() => {
    return requiredConsents.map((key) => ({
      key,
      label: getConsentLabel(key, t),
      description: getConsentDescription(key, t),
      required: true,
      icon: getConsentIcon(key),
    }));
  }, [requiredConsents, t]);

  // Vérifier si tous les consentements requis sont acceptés
  const allRequiredAccepted = useMemo(() => {
    return requiredConsents.every((key) => consents[key] === true);
  }, [requiredConsents, consents]);

  // Toggle d'un consentement
  const handleToggleConsent = useCallback((key: string) => {
    setConsents((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  // Soumettre les consentements
  const handleSubmit = useCallback(async () => {
    if (!allRequiredAccepted && mode === 'blocking') {
      setError(t('consentDialog.errors.allRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConsent(consents);
      onOpenChange(false);
    } catch (err) {
      console.error('[ConsentDialog] Error submitting consents:', err);
      setError(
        err instanceof Error
          ? err.message
          : t('consentDialog.errors.submitFailed')
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [allRequiredAccepted, mode, consents, onConsent, onOpenChange, t]);

  // Annuler
  const handleCancel = useCallback(() => {
    if (mode === 'optional') {
      setConsents({});
      setError(null);
      onCancel?.();
      onOpenChange(false);
    }
  }, [mode, onCancel, onOpenChange]);

  // Icône par type
  const getIconComponent = (iconType: 'shield' | 'info' | 'alert') => {
    switch (iconType) {
      case 'shield':
        return <Shield className="h-5 w-5 text-blue-500" />;
      case 'alert':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={mode === 'optional' ? onOpenChange : undefined}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => {
          if (mode === 'blocking') {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            {t('consentDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('consentDialog.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Affichage des violations */}
        {violations.length > 0 && (
          <Alert variant="default" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-semibold">{t('consentDialog.violationsTitle')}</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {violations.map((v, idx) => (
                    <li key={idx}>{v.message}</li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Liste des consentements */}
        <div className="space-y-4 my-4">
          {consentItems.map((item) => (
            <div
              key={item.key}
              className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="mt-0.5">{getIconComponent(item.icon)}</div>
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor={`consent-${item.key}`}
                  className="text-base font-medium cursor-pointer"
                >
                  {item.label}
                  {item.required && (
                    <span className="text-red-500 ml-1">*</span>
                  )}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <Checkbox
                id={`consent-${item.key}`}
                checked={consents[item.key] || false}
                onCheckedChange={() => handleToggleConsent(item.key)}
                className="mt-1"
              />
            </div>
          ))}
        </div>

        {/* Affichage des erreurs */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Note légale */}
        <p className="text-xs text-muted-foreground">
          {t('consentDialog.legalNote')}
        </p>

        <DialogFooter className="gap-2">
          {mode === 'optional' && (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              {t('consentDialog.buttons.cancel')}
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (mode === 'blocking' && !allRequiredAccepted)}
            className="min-w-[120px]"
          >
            {isSubmitting
              ? t('consentDialog.buttons.submitting')
              : t('consentDialog.buttons.accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
