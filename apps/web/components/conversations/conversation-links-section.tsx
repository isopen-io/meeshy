'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Link2,
  Copy,
  Clock,
  Users,
  Eye,
  FileText,
  Image,
  MessageSquare,
  Settings,
  Globe,
  Shield,
  Calendar,
  User,
  CheckCircle,
  XCircle,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { toast } from 'sonner';
import { authManager } from '@/services/auth-manager.service';

interface ShareLink {
  id: string;
  linkId: string;
  name: string;
  description?: string;
  isActive: boolean;
  expiresAt?: string;
  maxUses?: number;
  currentUses: number;
  maxConcurrentUsers?: number;
  currentConcurrentUsers: number;
  maxUniqueSessions?: number;
  currentUniqueSessions: number;
  allowAnonymousMessages: boolean;
  allowAnonymousFiles: boolean;
  allowAnonymousImages: boolean;
  allowViewHistory: boolean;
  requireAccount: boolean;
  requireNickname: boolean;
  requireEmail: boolean;
  requireBirthday: boolean;
  allowedCountries: string[];
  allowedLanguages: string[];
  allowedIpRanges: string[];
  createdAt: string;
  creator: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    displayName: string;
    avatar?: string;
  };
  _count: {
    anonymousParticipants: number;
  };
}

interface ConversationLinksSectionProps {
  conversationId: string;
}

export function ConversationLinksSection({ conversationId }: ConversationLinksSectionProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadLinks();
  }, [conversationId]);

  const loadLinks = async () => {
    try {
      setIsLoading(true);
      const token = authManager.getAuthToken();
      if (!token) {
        setLinks([]);
        return;
      }

      const response = await fetch(buildApiUrl(API_ENDPOINTS.CONVERSATION.GET_CONVERSATION_LINKS(conversationId)), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setLinks(result.data || []);
        } else {
          console.error('Erreur lors du chargement des liens:', result.error);
          setLinks([]);
        }
      } else if (response.status === 401) {
        setLinks([]);
      } else if (response.status === 404) {
        setLinks([]);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Erreur lors du chargement des liens:', response.status, errorData.error || 'Erreur inconnue');
        setLinks([]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des liens:', error);
      setLinks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = async (linkId: string) => {
    const linkUrl = `${window.location.origin}/join/${linkId}`;
    const result = await copyToClipboard(linkUrl);
    
    if (result.success) {
    } else {
    }
  };

  const isLinkExpired = (link: ShareLink) => {
    if (!link.expiresAt) return false;
    return new Date(link.expiresAt) < new Date();
  };

  const isLinkActive = (link: ShareLink) => {
    return link.isActive && !isLinkExpired(link);
  };

  const activeLinks = links.filter(isLinkActive);
  const expiredLinks = links.filter(link => !isLinkActive(link));

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (link: ShareLink) => {
    if (!link.isActive) {
      return <Badge variant="destructive" className="text-xs">Désactivé</Badge>;
    }
    if (isLinkExpired(link)) {
      return <Badge variant="secondary" className="text-xs">Expiré</Badge>;
    }
    return <Badge variant="default" className="text-xs">Actif</Badge>;
  };

  /**
   * Tronque le nom du lien à 32 caractères pour l'affichage dans la liste
   * Le nom complet est visible dans la modale de détails
   */
  const truncateLinkName = (name: string, maxLength: number = 32): string => {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength - 3) + '...';
  };

  const renderLinkCard = (link: ShareLink) => (
    <Card key={link.id} className="mb-3">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="font-medium text-sm">
                {truncateLinkName(link.name || 'Lien de partage')}
              </h4>
              {getStatusBadge(link)}
            </div>
            
            <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {link.currentUses}/{link.maxUses || '∞'}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {link._count.anonymousParticipants}
              </span>
              {link.expiresAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(link.expiresAt)}
                </span>
              )}
            </div>
          </div>

          {/* Boutons d'action toujours visibles */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyLink(link.linkId)}
              className="h-7 px-2 text-xs"
            >
              <Copy className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Copier</span>
            </Button>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm mb-1 break-words">
                      {link.name || 'Lien de partage'}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {link.description || 'Aucune description'}
                    </p>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="font-medium">Créé par:</span>
                      <div className="flex items-center gap-1 mt-1">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={link.creator.avatar} />
                          <AvatarFallback className="text-xs">
                            {link.creator.firstName?.charAt(0) || link.creator.username?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">
                          {link.creator.displayName || link.creator.username}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">Créé le:</span>
                      <p className="mt-1">{formatDate(link.createdAt)}</p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h5 className="font-medium text-xs mb-2">Permissions</h5>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className="flex items-center gap-1">
                        {link.allowAnonymousMessages ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                        <MessageSquare className="h-3 w-3" />
                        Messages
                      </div>
                      <div className="flex items-center gap-1">
                        {link.allowAnonymousImages ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                        <Image className="h-3 w-3" />
                        Images
                      </div>
                      <div className="flex items-center gap-1">
                        {link.allowAnonymousFiles ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                        <FileText className="h-3 w-3" />
                        Fichiers
                      </div>
                      <div className="flex items-center gap-1">
                        {link.allowViewHistory ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                        <Eye className="h-3 w-3" />
                        Historique
                      </div>
                    </div>
                  </div>

                  {(link.allowedLanguages.length > 0 || link.allowedCountries.length > 0) && (
                    <>
                      <Separator />
                      <div>
                        <h5 className="font-medium text-xs mb-2">Restrictions</h5>
                        {link.allowedLanguages.length > 0 && (
                          <div className="mb-1">
                            <span className="text-xs font-medium">Langues:</span>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {link.allowedLanguages.join(', ')}
                            </p>
                          </div>
                        )}
                        {link.allowedCountries.length > 0 && (
                          <div>
                            <span className="text-xs font-medium">Pays:</span>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {link.allowedCountries.join(', ')}
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center">
          <Link2 className="h-4 w-4 mr-2" />
          Liens de partage
        </h3>
        <Badge variant="outline" className="text-xs">
          {links.length}
        </Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
          <p className="text-xs text-gray-500 mt-2">Chargement des liens...</p>
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-4">
          <Link2 className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="text-xs text-gray-500">Aucun lien de partage</p>
        </div>
      ) : (
        <ScrollArea className="max-h-64">
          <div className="space-y-3">
            {/* Liens actifs */}
            {activeLinks.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-green-700 mb-2 flex items-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Liens actifs ({activeLinks.length})
                </h4>
                {activeLinks.map(renderLinkCard)}
              </div>
            )}

            {/* Liens expirés */}
            {expiredLinks.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                  <XCircle className="h-3 w-3 mr-1" />
                  Liens expirés ({expiredLinks.length})
                </h4>
                {expiredLinks.map(renderLinkCard)}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
