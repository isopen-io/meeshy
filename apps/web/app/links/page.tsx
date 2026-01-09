'use client';

import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Link2,
  Search,
  Calendar,
  Users,
  Activity,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Clock,
  Copy,
  BarChart,
  CheckCircle,
  XCircle,
  RefreshCw,
  MessageSquare,
  Plus,
  TrendingUp,
  AlertCircle,
  Zap,
  ExternalLink,
  MousePointerClick,
  ChevronDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import type { TrackingLink } from '@meeshy/shared/types/tracking-link';
import { useI18n } from '@/hooks/useI18n';
import { ExpandableLinkCard } from '@/components/links/expandable-link-card';
import { ExpandableTrackingLinkCard } from '@/components/links/expandable-tracking-link-card';

// Extended type for ConversationLink with all fields from Prisma
interface ConversationLink {
  id: string;
  linkId: string;
  identifier?: string;
  conversationId: string;
  name?: string;
  description?: string;
  maxUses?: number;
  currentUses: number;
  maxConcurrentUsers?: number;
  currentConcurrentUsers: number;
  expiresAt?: string;
  isActive: boolean;
  allowAnonymousMessages: boolean;
  allowAnonymousFiles: boolean;
  allowAnonymousImages: boolean;
  requireAccount?: boolean; // Ajouté
  createdAt: string;
  conversation: {
    id: string;
    title?: string;
    type: string;
    description?: string;
  };
  creator?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    avatar?: string;
  };
}
import { LinkEditModal } from '@/components/links/link-edit-modal';
import { CreateLinkButton } from '@/components/links/create-link-button';
import { CreateLinkModalV2 } from '@/components/conversations/create-link-modal';
import { CreateTrackingLinkModal } from '@/components/links/create-tracking-link-modal';
import { EditTrackingLinkModal } from '@/components/links/edit-tracking-link-modal';
import { CreateConversationModal } from '@/components/conversations/create-conversation-modal';
import { copyToClipboard } from '@/lib/clipboard';
import { useUser } from '@/stores';
import { useRouter } from 'next/navigation';
import { getUserTrackingLinks, deleteTrackingLink, deactivateTrackingLink } from '@/services/tracking-links';
import { authManager } from '@/services/auth-manager.service';

export default function LinksPage() {
  const { t } = useI18n('links');
  const { t: tConversations } = useI18n('conversations');
  const user = useUser();
  const router = useRouter();
  const [links, setLinks] = useState<ConversationLink[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mainTab, setMainTab] = useState<'shareLinks' | 'trackingLinks'>('shareLinks');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [selectedLink, setSelectedLink] = useState<ConversationLink | null>(null);
  const [selectedTrackingLink, setSelectedTrackingLink] = useState<TrackingLink | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditTrackingLinkModal, setShowEditTrackingLinkModal] = useState(false);
  const [showCreateConversationModal, setShowCreateConversationModal] = useState(false);
  const [showCreateLinkModal, setShowCreateLinkModal] = useState(false);
  const [showCreateTrackingLinkModal, setShowCreateTrackingLinkModal] = useState(false);

  // Pagination state
  const [shareLinksOffset, setShareLinksOffset] = useState(0);
  const [trackingLinksOffset, setTrackingLinksOffset] = useState(0);
  const [hasMoreShareLinks, setHasMoreShareLinks] = useState(false);
  const [hasMoreTrackingLinks, setHasMoreTrackingLinks] = useState(false);
  const LINKS_PER_PAGE = 20;

  // Synchroniser l'onglet avec le hash de l'URL
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'tracked') {
      setMainTab('trackingLinks');
    } else if (hash === 'shared') {
      setMainTab('shareLinks');
    }
  }, []);

  // Mettre à jour le hash quand l'onglet change
  const handleTabChange = (value: 'shareLinks' | 'trackingLinks') => {
    setMainTab(value);
    const hash = value === 'trackingLinks' ? 'tracked' : 'shared';
    window.history.pushState(null, '', `#${hash}`);
  };

  /**
   * Tronque le nom du lien à 32 caractères pour l'affichage dans la liste
   * Le nom complet est visible dans la modale de détails/édition
   */
  const truncateLinkName = (name: string, maxLength: number = 32): string => {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength - 3) + '...';
  };

  // Charger les liens de partage
  const loadLinks = async (append: boolean = false) => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const token = authManager.getAuthToken();
      const offset = append ? shareLinksOffset : 0;

      // Charger les liens de partage avec pagination
      const shareLinksResponse = await fetch(
        buildApiUrl(`/api/links/my-links?limit=${LINKS_PER_PAGE}&offset=${offset}`),
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (shareLinksResponse.ok) {
        const data = await shareLinksResponse.json();
        if (append) {
          setLinks(prev => [...prev, ...(data.data || [])]);
        } else {
          setLinks(data.data || []);
        }
        setHasMoreShareLinks(data.pagination?.hasMore || false);
        setShareLinksOffset(offset + (data.data?.length || 0));
      } else {
        toast.error(t('errors.loadFailed'));
      }

      // Charger aussi les liens trackés
      if (!append) {
        await loadTrackingLinks(false);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des liens:', error);
      toast.error(t('errors.loadFailed'));
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Charger uniquement les liens trackés
  const loadTrackingLinks = async (append: boolean = false) => {
    try {
      if (append) {
        setIsLoadingMore(true);
      }

      const token = authManager.getAuthToken();
      const offset = append ? trackingLinksOffset : 0;

      const response = await fetch(
        buildApiUrl(`/api/tracking-links/user/me?limit=${LINKS_PER_PAGE}&offset=${offset}`),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (append) {
          setTrackingLinks(prev => [...prev, ...(data.data?.trackingLinks || [])]);
        } else {
          setTrackingLinks(data.data?.trackingLinks || []);
        }
        setHasMoreTrackingLinks(data.pagination?.hasMore || false);
        setTrackingLinksOffset(offset + (data.data?.trackingLinks?.length || 0));
      }
    } catch (error) {
      console.error('[Links Page] Erreur lors du chargement des liens trackés:', error);
      // Ne pas afficher d'erreur si c'est juste les liens trackés qui échouent
      if (!append) {
        setTrackingLinks([]); // S'assurer que trackingLinks est un tableau vide en cas d'erreur
      }
    } finally {
      if (append) {
        setIsLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  // Calculer les statistiques
  const stats = useMemo(() => {
    if (mainTab === 'shareLinks') {
      const activeLinks = links.filter(link => 
        link.isActive && (!link.expiresAt || new Date(link.expiresAt) > new Date())
      );
      const expiredLinks = links.filter(link => 
        link.expiresAt && new Date(link.expiresAt) <= new Date()
      );
      const totalUses = links.reduce((sum, link) => sum + (link.currentUses || 0), 0);
      const totalActiveUsers = links.reduce((sum, link) => sum + (link.currentConcurrentUsers || 0), 0);
      
      return {
        total: links.length,
        active: activeLinks.length,
        expired: expiredLinks.length,
        totalUses,
        totalActiveUsers
      };
    } else {
      // Stats pour tracking links
      const activeLinks = trackingLinks.filter(link => link.isActive);
      const totalClicks = trackingLinks.reduce((sum, link) => sum + link.totalClicks, 0);
      const uniqueClicks = trackingLinks.reduce((sum, link) => sum + link.uniqueClicks, 0);
      
      return {
        total: trackingLinks.length,
        active: activeLinks.length,
        totalClicks,
        uniqueClicks
      };
    }
  }, [links, trackingLinks, mainTab]);

  // Filtrer les liens de partage
  const filteredLinks = useMemo(() => {
    return links.filter(link => {
      const matchesSearch = link.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           link.conversation.title?.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = link.isActive;
      } else if (statusFilter === 'inactive') {
        matchesStatus = !link.isActive;
      } else if (statusFilter === 'expired') {
        // Un lien est expiré si expiresAt existe et est dans le passé
        matchesStatus = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
      }

      return matchesSearch && matchesStatus;
    });
  }, [links, searchQuery, statusFilter]);

  // Filtrer les liens de tracking
  const filteredTrackingLinks = useMemo(() => {
    return trackingLinks.filter(link => {
      const matchesSearch = link.originalUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           link.shortUrl.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = link.isActive;
      } else if (statusFilter === 'inactive') {
        matchesStatus = !link.isActive;
      } else if (statusFilter === 'expired') {
        // Un lien est expiré si expiresAt existe et est dans le passé
        matchesStatus = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
      }

      return matchesSearch && matchesStatus;
    });
  }, [trackingLinks, searchQuery, statusFilter]);

  // Copier le lien
  const handleCopyLink = async (linkId: string) => {
    const linkUrl = `${window.location.origin}/join/${linkId}`;
    const result = await copyToClipboard(linkUrl);
    if (result.success) {
      toast.success(t('success.linkCopied'));
    } else {
      toast.error(result.message);
    }
  };

  const handleConversationCreated = (conversationId: string) => {
    toast.success(tConversations('conversationCreated'));
    router.push(`/conversations/${conversationId}`);
  };

  const handleLinkCreated = () => {
    toast.success(t('success.linkCreated'));
    loadLinks(); // Recharger la liste des liens
  };

  // Basculer l'état actif/inactif
  const handleToggleActive = async (link: ConversationLink) => {
    try {
      const token = authManager.getAuthToken();
      const response = await fetch(buildApiUrl(`/api/links/${link.linkId}/toggle`), {
        method: 'PATCH',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !link.isActive })
      });

      if (response.ok) {
        toast.success(link.isActive ? t('success.linkDisabled') : t('success.linkEnabled'));
        loadLinks();
      } else {
        toast.error(t('errors.toggleFailed'));
      }
    } catch (error) {
      console.error('Erreur lors du basculement:', error);
      toast.error(t('errors.toggleFailed'));
    }
  };

  // Prolonger la durée
  const handleExtendDuration = async (link: ConversationLink, days: number) => {
    try {
      const token = authManager.getAuthToken();
      const newExpiresAt = new Date(link.expiresAt || new Date());
      newExpiresAt.setDate(newExpiresAt.getDate() + days);

      const response = await fetch(buildApiUrl(`/api/links/${link.linkId}/extend`), {
        method: 'PATCH',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresAt: newExpiresAt.toISOString() })
      });

      if (response.ok) {
        toast.success(t('success.linkExtended', { days }));
        loadLinks();
      } else {
        toast.error(t('errors.extendFailed'));
      }
    } catch (error) {
      console.error('Erreur lors de la prolongation:', error);
      toast.error(t('errors.extendFailed'));
    }
  };

  // Supprimer un lien
  const handleDeleteLink = async (link: ConversationLink) => {
    if (!confirm(t('confirm.delete'))) return;

    try {
      const token = authManager.getAuthToken();
      const response = await fetch(buildApiUrl(`/api/links/${link.linkId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success(t('success.linkDeleted'));
        loadLinks();
      } else {
        toast.error(t('errors.deleteFailed'));
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error(t('errors.deleteFailed'));
    }
  };

  // Copier un lien tracké
  const handleCopyTrackingLink = async (shortUrl: string) => {
    // Ajouter le domaine complet si shortUrl commence par /
    const fullUrl = shortUrl.startsWith('/')
      ? `${window.location.origin}${shortUrl}`
      : shortUrl;

    const result = await copyToClipboard(fullUrl);
    if (result.success) {
      toast.success(t('tracking.success.copied'));
    } else {
      toast.error(result.message);
    }
  };

  // Désactiver/activer un lien tracké
  const handleToggleTrackingLink = async (link: TrackingLink) => {
    try {
      if (link.isActive) {
        await deactivateTrackingLink(link.token);
        toast.success(t('tracking.success.deactivated'));
      } else {
        // Pour réactiver, on devrait avoir une route activate, pour l'instant on peut juste désactiver
        toast.info(t('activationNotImplemented'));
      }
      loadLinks();
    } catch (error) {
      console.error('Erreur lors du basculement:', error);
      toast.error(t('tracking.errors.deactivateFailed'));
    }
  };

  // Supprimer un lien tracké
  const handleDeleteTrackingLink = async (link: TrackingLink) => {
    if (!confirm(t('confirm.delete'))) return;

    try {
      await deleteTrackingLink(link.token);
      toast.success(t('tracking.success.deleted'));
      loadLinks();
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error(t('tracking.errors.deleteFailed'));
    }
  };

  // Formater la date
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculer le temps restant
  const getTimeRemaining = (expiresAt: string | Date) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return t('status.expired');
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return t('status.daysRemaining', { days });
    return t('status.hoursRemaining', { hours });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      <DashboardLayout title={t('title')} className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        {/* Contenu principal scrollable pleine largeur */}
        <div className="relative z-10 space-y-8 pb-8 w-full py-8 px-4 md:px-8">

        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 md:p-12 text-white shadow-2xl">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                <Link2 className="h-8 w-8" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">{t('title')}</h1>
            </div>
            <p className="text-lg md:text-xl text-blue-100 max-w-2xl">
              {t('subtitle')}
            </p>
          </div>
          {/* Decorative elements */}
          <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute -left-12 -top-12 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
        </div>

        {/* Section 1: Main Tab Selector + Stats + Search */}
        <Card className="border-2 shadow-lg bg-white dark:bg-gray-950">
          <CardContent className="p-6 space-y-6">
            {/* Tabs */}
            <Tabs value={mainTab} onValueChange={(value) => handleTabChange(value as 'shareLinks' | 'trackingLinks')}>
              <TabsList className="w-full grid grid-cols-2 h-auto p-1.5 bg-gray-100 dark:bg-gray-800">
                <TabsTrigger
                  value="shareLinks"
                  id="shared"
                  className="data-[state=active]:bg-blue-500 data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs md:text-sm">{t('tabs.shareLinks')}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="trackingLinks"
                  id="tracked"
                  className="data-[state=active]:bg-purple-500 data-[state=active]:text-white py-2 md:py-3 px-2 md:px-6 rounded-lg font-medium transition-all flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                >
                  <BarChart className="h-4 w-4" />
                  <span className="text-xs md:text-sm">{t('tabs.trackingLinks')}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Stats in 2x2 grid - Responsive */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t('stats.totalLinks')}</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t('tracking.stats.activeLinks')}</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
              </div>
              {mainTab === 'shareLinks' ? (
                <>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t('stats.uses')}</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.totalUses}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t('details.activeUsers')}</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.totalActiveUsers}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t('tracking.stats.totalClicks')}</p>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.totalClicks}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{t('tracking.stats.uniqueClicks')}</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.uniqueClicks}</p>
                  </div>
                </>
              )}
            </div>

            {/* Search and Actions */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base border-2 focus:border-primary"
                />
              </div>

              <Button
                onClick={() => mainTab === 'shareLinks' ? setShowCreateLinkModal(true) : setShowCreateTrackingLinkModal(true)}
                variant="default"
                className="h-12 rounded-xl px-6 font-semibold shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                <span>{t('createLink')}</span>
              </Button>
            </div>

            {/* Filtres de statut - Responsive */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('filters.status')}:</span>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                  className="h-9 px-4 text-sm"
                >
                  {t('filters.all')}
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'active' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('active')}
                  className={`h-9 px-4 text-sm ${statusFilter === 'active' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t('filters.active')}
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('inactive')}
                  className={`h-9 px-4 text-sm ${statusFilter === 'inactive' ? 'bg-gray-600 hover:bg-gray-700' : ''}`}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('filters.inactive')}
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'expired' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('expired')}
                  className={`h-9 px-4 text-sm ${statusFilter === 'expired' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  {t('filters.expired')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: List of links */}
        {mainTab === 'shareLinks' ? (
          <div className="space-y-6">
            {isLoading ? (
              <Card className="border-2 bg-white dark:bg-gray-950">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-primary"></div>
                    <Zap className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
                  </div>
                  <p className="mt-4 text-muted-foreground font-medium">{t('loadingLinks')}</p>
                </CardContent>
              </Card>
            ) : filteredLinks.length === 0 ? (
              <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-3xl rounded-full"></div>
                    <div className="relative p-6 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl">
                      <Link2 className="h-16 w-16 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-foreground mb-3 text-center">
                    {searchQuery ? t('noLinksFound') : t('tracking.noLinks')}
                  </h3>
                  <p className="text-muted-foreground text-base text-center max-w-md">
                    {searchQuery
                      ? t('noLinksFoundTryAnother')
                      : t('noLinksFoundCreateFirst')
                    }
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-6">
                  {filteredLinks.map((link) => (
                    <ExpandableLinkCard
                      key={link.id}
                      link={link}
                      onCopy={() => handleCopyLink(link.linkId)}
                      onEdit={() => {
                        setSelectedLink(link);
                        setShowEditModal(true);
                      }}
                      onToggle={() => handleToggleActive(link)}
                      onExtend={(days) => handleExtendDuration(link, days)}
                      onDelete={() => handleDeleteLink(link)}
                    />
                  ))}
                </div>

                {/* Bouton Charger Plus */}
                {hasMoreShareLinks && !searchQuery && statusFilter === 'all' && (
                  <div className="flex justify-center mt-6">
                    <Button
                      onClick={() => loadLinks(true)}
                      disabled={isLoadingMore}
                      variant="outline"
                      className="px-8 py-6 text-base font-semibold rounded-xl shadow-md hover:shadow-lg transition-all"
                    >
                      {isLoadingMore ? (
                        <>
                          <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                          {t('loadingMore')}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-5 w-5 mr-2" />
                          {t('loadMore')}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Tracking Links Content */
          <div className="space-y-6">
            {isLoading ? (
              <Card className="border-2 bg-white dark:bg-gray-950">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-primary"></div>
                    <Zap className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary" />
                  </div>
                  <p className="mt-4 text-muted-foreground font-medium">{t('loadingTrackingLinks')}</p>
                </CardContent>
              </Card>
            ) : trackingLinks.length === 0 ? (
              <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-3xl rounded-full"></div>
                    <div className="relative p-6 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 rounded-3xl">
                      <BarChart className="h-16 w-16 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-foreground mb-3 text-center">
                    {t('tracking.noLinks')}
                  </h3>
                  <p className="text-muted-foreground text-base text-center max-w-md">
                    {t('tracking.noLinksDescription')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-6">
                  {filteredTrackingLinks.map((link) => (
                    <ExpandableTrackingLinkCard
                      key={link.id}
                      link={link}
                      onCopy={() => handleCopyTrackingLink(link.shortUrl)}
                      onEdit={() => {
                        setSelectedTrackingLink(link);
                        setShowEditTrackingLinkModal(true);
                      }}
                      onToggle={() => handleToggleTrackingLink(link)}
                      onDelete={() => handleDeleteTrackingLink(link)}
                    />
                  ))}
                </div>

                {/* Bouton Charger Plus */}
                {hasMoreTrackingLinks && !searchQuery && statusFilter === 'all' && (
                  <div className="flex justify-center mt-6">
                    <Button
                      onClick={() => loadTrackingLinks(true)}
                      disabled={isLoadingMore}
                      variant="outline"
                      className="px-8 py-6 text-base font-semibold rounded-xl shadow-md hover:shadow-lg transition-all"
                    >
                      {isLoadingMore ? (
                        <>
                          <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                          {t('loadingMore')}
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-5 w-5 mr-2" />
                          {t('loadMore')}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Modales */}
        {selectedLink && (
          <LinkEditModal
            link={selectedLink}
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setSelectedLink(null);
            }}
            onUpdate={() => {
              loadLinks();
              setShowEditModal(false);
              setSelectedLink(null);
            }}
          />
        )}

        {/* Modales de création */}
        {user && (
          <CreateConversationModal
            isOpen={showCreateConversationModal}
            onClose={() => setShowCreateConversationModal(false)}
            currentUser={user}
            onConversationCreated={handleConversationCreated}
          />
        )}

        {/* Modal de création de share link */}
        <CreateLinkModalV2
          isOpen={showCreateLinkModal}
          onClose={() => setShowCreateLinkModal(false)}
          onLinkCreated={loadLinks}
        />

        {/* Modal de création de tracking link */}
        <CreateTrackingLinkModal
          isOpen={showCreateTrackingLinkModal}
          onClose={() => setShowCreateTrackingLinkModal(false)}
          onLinkCreated={loadTrackingLinks}
        />

        {/* Modal d'édition de tracking link */}
        <EditTrackingLinkModal
          isOpen={showEditTrackingLinkModal}
          onClose={() => {
            setShowEditTrackingLinkModal(false);
            setSelectedTrackingLink(null);
          }}
          link={selectedTrackingLink}
          onSuccess={() => {
            loadTrackingLinks();
            setShowEditTrackingLinkModal(false);
            setSelectedTrackingLink(null);
          }}
        />
        </div>
      </DashboardLayout>

      {/* Footer - Prend toute la largeur de la page, après le contenu scrollable */}
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}