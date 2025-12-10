'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Link2,
  Copy,
  Calendar,
  Clock,
  MessageSquare,
  FileText,
  Image,
  Check,
  X,
  Users,
  User,
  Mail,
  Video,
  Volume2,
  File,
  Link,
  MapPin,
  Phone,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';
import { useI18n } from '@/hooks/useI18n';

interface LinkSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  linkData: {
    url: string;
    token: string;
    title: string;
    description: string;
    expirationDays: number;
    maxUses?: number;
    maxConcurrentUsers?: number;
    maxUniqueSessions?: number;
    allowAnonymousMessages: boolean;
    allowAnonymousFiles: boolean;
    allowAnonymousImages: boolean;
    allowViewHistory: boolean;
    requireAccount: boolean;
    requireNickname: boolean;
    requireEmail: boolean;
    requireBirthday: boolean;
    allowedLanguages: string[];
  };
}

export function LinkSummaryModal({
  isOpen,
  onClose,
  linkData
}: LinkSummaryModalProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n('modals');

  const handleCopyLink = async () => {
    try {
      await copyToClipboard(linkData.url);
      setCopied(true);
      toast.success('Lien copié dans le presse-papier !');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
      toast.error('Erreur lors de la copie du lien');
    }
  };

  const formatExpirationDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getLanguageName = (code: string) => {
    const languages: Record<string, string> = {
      'fr': 'Français',
      'en': 'English',
      'es': 'Español',
      'de': 'Deutsch',
      'it': 'Italiano',
      'pt': 'Português',
      'zh': '中文',
      'ja': '日本語',
      'ar': 'العربية'
    };
    return languages[code] || code;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[95vw] sm:max-w-lg sm:w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            {t('linkSummaryModal.title')}
          </DialogTitle>
          <DialogDescription>
            {t('linkSummaryModal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lien de partage */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('linkSummaryModal.shareLink')}</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                {linkData.url}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? t('linkSummaryModal.copied') : t('linkSummaryModal.copy')}
              </Button>
            </div>
          </div>

          {/* Détails du lien */}
          <div className="space-y-4">
            {/* Première ligne : Expiration et Limites d'usage vs Exigences d'authentification */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Expiration et Limites d'usage */}
              <div className="space-y-3">
                {/* Expiration */}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('linkSummaryModal.expires')}</span>
                  <span className="font-medium">{formatExpirationDate(linkData.expirationDays)}</span>
                </div>

                {/* Limites d'usage */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('linkSummaryModal.userLimits')}</span>
                  </div>
                  <div className="ml-6 space-y-1 text-sm">
                    {linkData.maxUses ? (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{t('linkSummaryModal.limitedTo')}:</span>
                        <Badge variant="outline">{linkData.maxUses} {linkData.maxUses === 1 ? t('linkSummaryModal.usage') : t('linkSummaryModal.usages')}</Badge>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t('linkSummaryModal.unlimitedUsage')}</span>
                    )}
                    {linkData.maxConcurrentUsers && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{t('linkSummaryModal.maxConcurrent')}:</span>
                        <Badge variant="outline">{linkData.maxConcurrentUsers}</Badge>
                      </div>
                    )}
                    {linkData.maxUniqueSessions && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{t('linkSummaryModal.maxSessions')}:</span>
                        <Badge variant="outline">{linkData.maxUniqueSessions}</Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Exigences d'authentification */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t('linkSummaryModal.authRequirements')}</span>
                </div>
                <div className="ml-6 space-y-2">
                  {linkData.requireAccount && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t('linkSummaryModal.accountRequired')}</span>
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{t('linkSummaryModal.nickname')}</span>
                    {linkData.requireNickname ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <X className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{t('linkSummaryModal.email')}</span>
                    {linkData.requireEmail ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <X className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  {linkData.requireBirthday !== undefined && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{t('linkSummaryModal.birthday')}</span>
                      {linkData.requireBirthday ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Langues autorisées */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('linkSummaryModal.languages')}</span>
              </div>
              <div className="ml-6 flex flex-wrap gap-1">
                {linkData.allowedLanguages.map((lang) => (
                  <Badge key={lang} variant="secondary" className="text-xs">
                    {lang.toUpperCase()}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Permissions d'envoi sur 3 colonnes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('linkSummaryModal.sendPermissions')}</span>
              </div>
              <div className="ml-6 grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.messages')}</span>
                  {linkData.allowAnonymousMessages ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.files')}</span>
                  {linkData.allowAnonymousFiles ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.images')}</span>
                  {linkData.allowAnonymousImages ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.videos')}</span>
                  {linkData.allowAnonymousFiles ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.audio')}</span>
                  {linkData.allowAnonymousFiles ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <File className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.documents')}</span>
                  {linkData.allowAnonymousFiles ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.links')}</span>
                  <Check className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.location')}</span>
                  <Check className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('linkSummaryModal.contacts')}</span>
                  <Check className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
