'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Link2,
  Copy,
  ExternalLink,
  CheckCircle,
  Search,
  MessageSquare,
  Calendar
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { createTrackingLink, copyTrackingLinkToClipboard } from '@/services/tracking-links';
import { conversationsService } from '@/services/conversations.service';
import type { Conversation } from '@meeshy/shared/types';
import type { CreateTrackingLinkRequest } from '@meeshy/shared/types/tracking-link';

interface CreateTrackingLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkCreated?: () => void;
}

// Options de durée d'expiration (en jours)
const EXPIRATION_OPTIONS = [
  { value: 0, labelKey: 'tracking.expirationOptions.never' },
  { value: 1, labelKey: 'tracking.expirationOptions.1day' },
  { value: 7, labelKey: 'tracking.expirationOptions.7days' },
  { value: 30, labelKey: 'tracking.expirationOptions.30days' },
  { value: 90, labelKey: 'tracking.expirationOptions.90days' },
  { value: 365, labelKey: 'tracking.expirationOptions.1year' }
];

export function CreateTrackingLinkModal({
  isOpen,
  onClose,
  onLinkCreated
}: CreateTrackingLinkModalProps) {
  const { t } = useI18n('links');
  const { t: tCommon } = useI18n('common');

  // États du formulaire
  const [originalUrl, setOriginalUrl] = useState('');
  const [expirationDays, setExpirationDays] = useState(0); // 0 = jamais
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // États pour les conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationSearchQuery, setConversationSearchQuery] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // États de création
  const [isCreating, setIsCreating] = useState(false);
  const [generatedShortUrl, setGeneratedShortUrl] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  // Charger les conversations disponibles
  const loadConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const conversationsData = await conversationsService.getConversations();
      setConversations(conversationsData.conversations || []);
    } catch (error) {
      console.error('Erreur lors du chargement des conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  // Conversations filtrées
  const filteredConversations = useMemo(() => {
    if (!conversationSearchQuery.trim()) return conversations;
    return conversations.filter(conv =>
      (conv.title && conv.title.toLowerCase().includes(conversationSearchQuery.toLowerCase())) ||
      (conv.description && conv.description.toLowerCase().includes(conversationSearchQuery.toLowerCase()))
    );
  }, [conversations, conversationSearchQuery]);

  // Charger les conversations au montage
  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen, loadConversations]);

  // Validation de l'URL
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Création du lien de tracking
  const handleCreateLink = async () => {
    if (!originalUrl.trim()) {
      toast.error(t('tracking.errors.urlRequired'));
      return;
    }

    if (!isValidUrl(originalUrl)) {
      toast.error(t('tracking.errors.invalidUrl'));
      return;
    }

    setIsCreating(true);
    try {
      const request: CreateTrackingLinkRequest = {
        originalUrl: originalUrl.trim(),
        conversationId: selectedConversationId || undefined,
        expiresAt: expirationDays > 0
          ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
          : undefined
      };

      const trackingLink = await createTrackingLink(request);
      setGeneratedShortUrl(trackingLink.shortUrl);
      setGeneratedToken(trackingLink.token);

      // Copier automatiquement dans le presse-papiers
      const copied = await copyTrackingLinkToClipboard(trackingLink.shortUrl);
      if (copied) {
        toast.success(t('tracking.success.created'));
      } else {
        toast.success(t('tracking.success.createdNoCopy'));
      }
    } catch (error) {
      console.error('Erreur lors de la création du lien de tracking:', error);
      toast.error(t('tracking.errors.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  // Copier le lien
  const handleCopyLink = async () => {
    if (generatedShortUrl) {
      const copied = await copyTrackingLinkToClipboard(generatedShortUrl);
      if (copied) {
        toast.success(t('tracking.success.copied'));
      }
    }
  };

  // Fermer et réinitialiser
  const handleClose = () => {
    setOriginalUrl('');
    setExpirationDays(0);
    setSelectedConversationId(null);
    setConversationSearchQuery('');
    setGeneratedShortUrl(null);
    setGeneratedToken(null);

    if (generatedShortUrl && onLinkCreated) {
      onLinkCreated();
    }

    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[95vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="flex-shrink-0 bg-background border-b px-6 py-4">
          <DialogTitle className="text-xl font-bold flex items-center">
            <Link2 className="h-5 w-5 mr-2" />
            {t('tracking.createLink')}
          </DialogTitle>
          <DialogDescription>
            {t('tracking.createLinkDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {generatedShortUrl && generatedToken ? (
            // Vue de succès avec le lien généré
            <div className="space-y-6">
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="text-center">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <CardTitle className="text-2xl text-green-700">
                    {t('tracking.success.linkCreated')}
                  </CardTitle>
                  <CardDescription className="text-green-600">
                    {t('tracking.success.linkCreatedDescription')}
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Lien court généré */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Link2 className="h-5 w-5 mr-2" />
                    {t('tracking.shortUrl')}
                  </CardTitle>
                  <CardDescription>
                    {t('tracking.shareThisLink')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-white border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Input
                        value={generatedShortUrl}
                        readOnly
                        className="flex-1 text-sm bg-white font-mono"
                      />
                      <Button
                        onClick={handleCopyLink}
                        size="sm"
                        variant="outline"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        {tCommon('copy')}
                      </Button>
                    </div>
                  </div>

                  {/* Lien original */}
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <h5 className="font-medium text-sm text-muted-foreground mb-1">
                      {t('tracking.originalUrl')}
                    </h5>
                    <a
                      href={originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1 break-all"
                    >
                      {originalUrl}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>

                  {/* Token */}
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <h5 className="font-medium text-sm text-muted-foreground mb-1">
                      {t('tracking.details.token')}
                    </h5>
                    <code className="text-sm font-mono">{generatedToken}</code>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex space-x-3">
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="flex-1"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t('tracking.actions.copyShortUrl')}
                </Button>
                <Button
                  onClick={handleClose}
                  className="flex-1"
                >
                  {tCommon('close')}
                </Button>
              </div>
            </div>
          ) : (
            // Formulaire de création
            <div className="space-y-6">
              {/* URL originale */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <ExternalLink className="h-5 w-5 mr-2" />
                    {t('tracking.originalUrl')}
                  </CardTitle>
                  <CardDescription>
                    {t('tracking.enterUrlToShorten')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label htmlFor="originalUrl">
                      {t('tracking.urlLabel')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="originalUrl"
                      type="url"
                      placeholder="https://example.com/my-long-url"
                      value={originalUrl}
                      onChange={(e) => setOriginalUrl(e.target.value)}
                      className="font-mono"
                    />
                    {originalUrl && !isValidUrl(originalUrl) && (
                      <p className="text-xs text-red-500">
                        {t('tracking.errors.invalidUrl')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Options avancées */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Calendar className="h-5 w-5 mr-2" />
                    {t('tracking.advancedOptions')}
                  </CardTitle>
                  <CardDescription>
                    {t('tracking.optionalSettings')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Expiration */}
                  <div className="space-y-2">
                    <Label htmlFor="expiration">
                      {t('tracking.expirationLabel')}
                    </Label>
                    <Select
                      value={expirationDays.toString()}
                      onValueChange={(value) => setExpirationDays(parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPIRATION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value.toString()}>
                            {t(option.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Conversation (optionnelle) */}
                  <div className="space-y-2">
                    <Label>
                      {t('tracking.associateConversation')}
                    </Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('tracking.associateConversationDescription')}
                    </p>

                    {/* Recherche */}
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('searchPlaceholder')}
                        value={conversationSearchQuery}
                        onChange={(e) => setConversationSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    {/* Liste des conversations */}
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                      {isLoadingConversations ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        </div>
                      ) : filteredConversations.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          {t('noLinksFound')}
                        </div>
                      ) : (
                        filteredConversations.map((conversation) => (
                          <div
                            key={conversation.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all hover:bg-accent ${
                              selectedConversationId === conversation.id
                                ? 'border-primary bg-primary/5'
                                : 'border-transparent'
                            }`}
                            onClick={() => {
                              setSelectedConversationId(
                                selectedConversationId === conversation.id ? null : conversation.id
                              );
                            }}
                          >
                            <div className="flex items-center space-x-2">
                              <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{conversation.title}</p>
                                {conversation.description && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {conversation.description}
                                  </p>
                                )}
                              </div>
                              {selectedConversationId === conversation.id && (
                                <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer avec boutons */}
        {!generatedShortUrl && (
          <div className="flex-shrink-0 bg-background border-t px-6 py-4">
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={handleClose}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                onClick={handleCreateLink}
                disabled={!originalUrl.trim() || !isValidUrl(originalUrl) || isCreating}
              >
                {isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {t('tracking.creating')}
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    {t('tracking.createButton')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
