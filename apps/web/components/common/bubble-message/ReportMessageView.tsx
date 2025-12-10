'use client';

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Flag, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Message } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/useI18n';

interface ReportMessageViewProps {
  message: Message;
  isOwnMessage: boolean;
  onReport: (messageId: string, reportType: string, reason: string) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitError?: string;
}

// Types de signalement disponibles
const REPORT_TYPE_VALUES = [
  'spam',
  'inappropriate',
  'harassment',
  'violence',
  'hate_speech',
  'fake_profile',
  'impersonation',
  'other'
] as const;

export const ReportMessageView = memo(function ReportMessageView({
  message,
  isOwnMessage,
  onReport,
  onCancel,
  isSubmitting = false,
  submitError
}: ReportMessageViewProps) {
  const { t } = useI18n('reportMessage');
  const [reportType, setReportType] = useState<string>('');
  const [reason, setReason] = useState('');
  const [canSubmit, setCanSubmit] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Détection mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Focus sur le select au mount
  useEffect(() => {
    // Aucun focus automatique pour permettre à l'utilisateur de choisir
  }, []);

  // Vérifier si le formulaire peut être soumis
  useEffect(() => {
    setCanSubmit(!!reportType && reason.trim().length > 0);
  }, [reportType, reason]);

  const handleReasonChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReason(e.target.value);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    try {
      await onReport(message.id, reportType, reason.trim());
    } catch (error) {
      // Error handled by parent component
      console.error('Failed to report message:', error);
    }
  }, [canSubmit, reportType, reason, onReport, message.id]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  }, [onCancel]);

  // Générer les types de rapport avec les traductions
  const reportTypes = REPORT_TYPE_VALUES.map(value => ({
    value,
    label: t(`reportTypes.${value}.label`),
    description: t(`reportTypes.${value}.description`)
  }));

  const selectedReportInfo = reportTypes.find(type => type.value === reportType);

  // Version mobile épurée
  if (isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.15 }}
        className="relative w-full rounded-xl border-2 border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 overflow-hidden shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Select épuré */}
        <div className="p-4 space-y-3">
          <Select value={reportType} onValueChange={setReportType} disabled={isSubmitting}>
            <SelectTrigger className="w-full text-base" style={{ fontSize: '16px' }}>
              <SelectValue placeholder={t('reportTypePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {reportTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Textarea épuré */}
          <Textarea
            ref={textareaRef}
            value={reason}
            onChange={handleReasonChange}
            placeholder={t('reasonPlaceholder')}
            className="min-h-[100px] resize-none text-base border-gray-300 dark:border-gray-600"
            disabled={isSubmitting}
            style={{ fontSize: '16px' }}
          />

          {/* Erreur si présente */}
          {submitError && (
            <p className="text-xs text-red-600 dark:text-red-400">{submitError}</p>
          )}
        </div>

        {/* Boutons simples en bas */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          {/* Bouton Annuler (X) */}
          <Button
            onClick={onCancel}
            disabled={isSubmitting}
            size="lg"
            variant="ghost"
            className="h-12 w-12 p-0 rounded-full"
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Bouton Signaler (Check) */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            size="lg"
            className="h-12 w-12 p-0 rounded-full bg-red-600 hover:bg-red-700"
          >
            <Check className="h-6 w-6" />
          </Button>
        </div>
      </motion.div>
    );
  }

  // Version desktop complète
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        "relative w-full max-w-2xl mx-auto rounded-lg border shadow-lg overflow-hidden",
        "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-b",
        "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
      )}>
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-red-600 dark:text-red-400" />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {t('reportMessage')}
          </h3>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-6 w-6 p-0 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700"
          aria-label={t('cancel')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="space-y-4">
          {/* Message preview */}
          <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-md p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('messagePreview')}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
              {message.content}
            </p>
          </div>

          {/* Report type selection */}
          <div className="space-y-2">
            <Label htmlFor="report-type" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('reportType')} *
            </Label>
            <Select value={reportType} onValueChange={setReportType} disabled={isSubmitting}>
              <SelectTrigger id="report-type" className="w-full">
                <SelectValue placeholder={t('reportTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReportInfo && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedReportInfo.description}
              </p>
            )}
          </div>

          {/* Reason textarea */}
          <div className="space-y-2">
            <Label htmlFor="report-reason" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('reason')} * <span className="text-xs text-gray-500">{t('reasonMinLength')}</span>
            </Label>
            <Textarea
              ref={textareaRef}
              id="report-reason"
              value={reason}
              onChange={handleReasonChange}
              placeholder={t('reasonPlaceholder')}
              className="min-h-[100px] resize-none text-sm leading-relaxed bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              disabled={isSubmitting}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {reason.length} {t('characterCount')}
              </p>
              {reason.length > 0 && reason.length < 10 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t('charactersRemaining', { count: 10 - reason.length })}
                </p>
              )}
            </div>
          </div>

          {/* Info notice */}
          <div className="flex items-start gap-2 p-3 rounded-md border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-xs font-medium mb-1 text-blue-800 dark:text-blue-200">
                {t('confidentialNotice')}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {t('confidentialDescription')}
              </p>
            </div>
          </div>

          {/* Submit Error */}
          {submitError && (
            <div className="flex items-start gap-2 p-3 rounded-md border bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-xs text-red-700 dark:text-red-300">
                {submitError}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-t",
        "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
      )}>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('requiredFields')}
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-8 px-3 text-xs border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            {t('cancel')}
          </Button>

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="h-8 px-3 text-xs bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="mr-1"
                >
                  <Flag className="h-3 w-3" />
                </motion.div>
                {t('reporting')}
              </>
            ) : (
              <>
                <Flag className="h-3 w-3 mr-1" />
                {t('report')}
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
});
