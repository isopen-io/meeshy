'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Link2,
  Shield,
  CheckCircle,
  Info,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { copyToClipboard } from '@/lib/clipboard';
import { toast } from 'sonner';

interface QuickLinkConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: QuickLinkConfig) => void;
  defaultTitle?: string;
  isCreating?: boolean;
  createdLink?: CreatedLinkData | null; // Le lien créé pour l'étape 2
}

export interface QuickLinkConfig {
  title: string;
  description: string;
}

export interface CreatedLinkData {
  url: string;
  title: string;
  description: string;
  expirationDays: number;
}

// Configuration par défaut pour les liens rapides
const DEFAULT_LINK_CONFIG = {
  expirationDays: 7,
  requireAccount: true,
  requireNickname: true,
  requireEmail: true,
  requireBirthday: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: true,
  allowAnonymousImages: true,
  allowViewHistory: true,
  allowedLanguages: [] // Toutes les langues
};

export function QuickLinkConfigModal({
  isOpen,
  onClose,
  onConfirm,
  defaultTitle,
  isCreating = false,
  createdLink = null
}: QuickLinkConfigModalProps) {
  const { t } = useI18n('modals');
  const [currentStep, setCurrentStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState(false);

  // Initialiser le titre quand la modale s'ouvre
  useEffect(() => {
    if (isOpen && defaultTitle) {
      setTitle(defaultTitle);
    }
  }, [isOpen, defaultTitle]);

  // Passer automatiquement à l'étape 2 quand le lien est créé
  useEffect(() => {
    if (createdLink) {
      setCurrentStep(2);
    }
  }, [createdLink]);

  const handleConfirm = () => {
    onConfirm({
      title: title.trim() || defaultTitle || 'Lien de partage',
      description: description.trim()
    });
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setCurrentStep(1);
    setCopied(false);
    onClose();
  };

  const handleCopyLink = async () => {
    if (!createdLink) return;

    const result = await copyToClipboard(createdLink.url);

    if (result.success) {
      setCopied(true);
      toast.success('Lien copié dans le presse-papier !');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(result.message || 'Erreur lors de la copie du lien');
    }
  };

  const canCreate = title.trim().length > 0;

  const formatExpirationDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg w-[90vw] max-h-[85vh] flex flex-col">
        {/* Header fixe */}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            {currentStep === 1 ? t('quickLinkModal.title') : t('linkSummaryModal.title')}
          </DialogTitle>
          <DialogDescription>
            {currentStep === 1 ? t('quickLinkModal.description') : t('linkSummaryModal.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto">
          {currentStep === 1 ? (
          <div className="space-y-2 py-2">
            {/* Configuration sécurisée par défaut */}
            <div className="p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                      {t('quickLinkModal.secureConfig.title')}
                    </h4>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-blue-600 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          <p>{t('quickLinkModal.secureConfig.tooltip')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-[11px] text-blue-700 dark:text-blue-300">
                    {t('quickLinkModal.secureConfig.description')}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('quickLinkModal.secureConfig.accountRequired')}
                    </Badge>
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('quickLinkModal.secureConfig.emailRequired')}
                    </Badge>
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('quickLinkModal.secureConfig.birthdayRequired')}
                    </Badge>
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('quickLinkModal.secureConfig.allPermissions')}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Titre du lien */}
            <div className="space-y-2">
              <Label htmlFor="linkTitle">
                {t('quickLinkModal.linkTitle.label')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="linkTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('quickLinkModal.linkTitle.placeholder')}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                {t('quickLinkModal.linkTitle.hint')}
              </p>
            </div>

            {/* Message de bienvenue */}
            <div className="space-y-2">
              <Label htmlFor="welcomeMessage">
                {t('quickLinkModal.welcomeMessage.label')}
              </Label>
              <Textarea
                id="welcomeMessage"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('quickLinkModal.welcomeMessage.placeholder')}
                className="min-h-[60px] resize-none"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {t('quickLinkModal.welcomeMessage.hint')}
              </p>
            </div>

            {/* Note sur la durée */}
            <div className="p-2 bg-muted/50 rounded-lg text-xs">
              <p className="text-xs text-muted-foreground">
                ℹ️ {t('quickLinkModal.expirationNote')}
              </p>
            </div>
          </div>
          ) : (
          <div className="space-y-4 py-2">
            {/* Étape 2: Lien créé avec succès */}
            <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
                    Lien créé avec succès !
                  </h4>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    Votre lien de partage est prêt à être utilisé
                  </p>
                </div>
              </div>
            </div>

            {/* Lien à copier */}
            {createdLink && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Lien de partage</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 bg-muted rounded text-xs break-all border">
                      {createdLink.url}
                    </code>
                  </div>
                </div>

                {/* Informations du lien */}
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-semibold mb-2">Titre</h4>
                    <p className="text-sm">{createdLink.title}</p>
                  </div>

                  {createdLink.description && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <h4 className="text-sm font-semibold mb-2">Description</h4>
                      <p className="text-sm whitespace-pre-wrap">{createdLink.description}</p>
                    </div>
                  )}

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-semibold mb-2">Expire le</h4>
                    <p className="text-sm">{formatExpirationDate(createdLink.expirationDays)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
          )}
        </div>

        {/* Footer fixe */}
        <DialogFooter className="flex-shrink-0 flex-col sm:flex-row gap-2 pt-4 border-t">
          {currentStep === 1 ? (
          <>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isCreating}
              className="w-full sm:w-auto"
            >
              {t('quickLinkModal.actions.cancel')}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canCreate || isCreating}
              className="w-full sm:w-auto"
            >
              {isCreating ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  {t('quickLinkModal.actions.creating')}
                </>
              ) : (
                <>
                  {t('quickLinkModal.actions.create')}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </>
          ) : (
          <>
            <Button
              variant="default"
              onClick={handleCopyLink}
              className="w-full sm:flex-1"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copié !
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copier le lien
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              className="w-full sm:w-auto"
            >
              Fermer
            </Button>
          </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
