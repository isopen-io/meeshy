'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, useIsAuthChecking } from '@/stores';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  Plus,
  ArrowLeft,
  Settings,
  Copy,
  CheckCircle2,
  UserPlus,
  MessageSquare,
  Lock,
  Globe,
  Search,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import type { Group } from '@/types/frontend';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { cn } from '@/lib/utils';
import { isValidJWTFormat } from '@/utils/auth';
import { communitiesService } from '@/services/communities.service';
import { conversationsService } from '@/services/conversations.service';
import type { Conversation } from '@meeshy/shared/types';
import { generateCommunityIdentifier, validateCommunityIdentifier, sanitizeCommunityIdentifier } from '@/utils/community-identifier';
import { authManager } from '@/services/auth-manager.service';

interface GroupsLayoutProps {
  selectedGroupIdentifier?: string;
}

export function GroupsLayout({ selectedGroupIdentifier }: GroupsLayoutProps) {

  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser(); const isAuthChecking = useIsAuthChecking();
  const { t: tGroups } = useI18n('groups');
  const { t: tConv } = useI18n('conversations');

  // États principaux - TOUJOURS appelés avant tout return conditionnel
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // États pour les conversations de la communauté
  const [communityConversations, setCommunityConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // États UI responsive
  const [showGroupsList, setShowGroupsList] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // États modaux et formulaires
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  
  // États pour les tabs
  const [activeTab, setActiveTab] = useState('public');

  // États formulaire
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupIdentifier, setNewGroupIdentifier] = useState('');
  const [newGroupIsPrivate, setNewGroupIsPrivate] = useState(false);

  // État pour la copie d'identifiant
  const [copiedIdentifier, setCopiedIdentifier] = useState<string | null>(null);

  // État pour le filtre de recherche
  const [searchFilter, setSearchFilter] = useState('');

  // États pour la vérification d'unicité de l'identifiant
  const [isCheckingIdentifier, setIsCheckingIdentifier] = useState(false);
  const [identifierAvailable, setIdentifierAvailable] = useState<boolean | null>(null);
  const [identifierCheckTimeout, setIdentifierCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  // Détecter si on est sur mobile - HOOK AVANT TOUT RETURN
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Gérer la responsivité : masquer/afficher la liste selon la sélection
  useEffect(() => {
    if (isMobile) {
      // Sur mobile, montrer la liste si aucun groupe sélectionné
      setShowGroupsList(!selectedGroup);
    } else {
      // Sur desktop, toujours montrer la liste
      setShowGroupsList(true);
    }
  }, [isMobile, selectedGroup]);

  // Charger les conversations d'une communauté
  const loadCommunityConversations = useCallback(async (communityId: string) => {
    
    try {
      setIsLoadingConversations(true);
      
      const response = await communitiesService.getCommunityConversations(communityId);
      
      // L'API retourne {success: true, data: [...]} donc nous devons extraire response.data.data
      if (response.data && typeof response.data === 'object' && 'data' in response.data) {
        const rawConversations = (response.data as any).data;
        
        // Mapper les conversations pour corriger les incohérences de format
        const mappedConversations = rawConversations.map((conv: any) => ({
          ...conv,
          // Mapper 'members' vers 'participants' pour compatibilité avec le type Conversation
          participants: conv.members || [],
          // Les conversations héritent du caractère privé de leur communauté
          isPrivate: selectedGroup?.isPrivate || false,
          // Garder 'members' pour l'affichage direct
          members: conv.members || []
        }));
        
        setCommunityConversations(mappedConversations || []);
      } else if (Array.isArray(response.data)) {
        // Fallback si la réponse est directement un array
        const mappedConversations = response.data.map((conv: any) => ({
          ...conv,
          participants: conv.members || [],
          isPrivate: selectedGroup?.isPrivate || false,
          members: conv.members || []
        }));
        setCommunityConversations(mappedConversations);
      } else {
        setCommunityConversations([]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des conversations de la communauté:', error);
      toast.error('Erreur lors du chargement des conversations');
      setCommunityConversations([]);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [selectedGroup]);

  // Charger les groupes
  const loadGroups = useCallback(async () => {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        return;
      }
      
      const response = await fetch(buildApiUrl(API_ENDPOINTS.GROUP.LIST), {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      
      if (response.ok) {
        const result = await response.json();
        // L'API retourne {success: true, data: [...]}
        const data = result.success ? result.data : result;
        setGroups(Array.isArray(data) ? data : []);
      } else if (response.status === 401) {
        authManager.clearAllSessions();
        router.push('/');
      } else {
        console.error('Groups API error:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Erreur chargement groupes:', error);
      toast.error('Erreur lors du chargement des groupes');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  // Charger les détails d'un groupe
  const loadGroupDetails = useCallback(async (identifier: string) => {
    
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        toast.error('Token d\'authentification manquant. Veuillez vous reconnecter.');
        return;
      }

      // Vérifier que le token n'est pas corrompu
      if (!isValidJWTFormat(token)) {
        console.error('[DEBUG] Invalid JWT token format:', token);
        toast.error('Token d\'authentification invalide. Veuillez vous reconnecter.');
        authManager.clearAllSessions();
        return;
      }

      const response = await fetch(buildApiUrl(`/communities/${identifier}`), {
        headers: { Authorization: `Bearer ${token}` }
      });

      
      if (response.ok) {
        const result = await response.json();
        const data = result.success ? result.data : result;
        setSelectedGroup(data);
        
        // Sur mobile, masquer la liste pour afficher les détails
        if (isMobile) {
          setShowGroupsList(false);
        }
      } else {
        console.error('Erreur chargement détails groupe:', response.status, response.statusText);
        
        // Gérer les erreurs d'authentification spécifiquement
        if (response.status === 401 || response.status === 403) {
          authManager.clearAllSessions();
          toast.error('Session expirée. Veuillez vous reconnecter.');
          // Rediriger vers la page de connexion
          window.location.href = '/login';
          return;
        }
        
        // Autres erreurs
        const errorText = await response.text();
        console.error('[DEBUG] Error response body:', errorText);
        toast.error(`Erreur lors du chargement du groupe (${response.status})`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur de connexion lors du chargement du groupe');
    }
  }, [isMobile]);

  // Vérifier la disponibilité de l'identifiant
  const checkIdentifierAvailability = useCallback(async (identifier: string) => {
    if (!identifier || identifier.trim() === '') {
      setIdentifierAvailable(null);
      return;
    }

    // Ajouter le préfixe mshy_ pour la vérification côté serveur
    const fullIdentifier = `mshy_${identifier}`;

    setIsCheckingIdentifier(true);
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        setIsCheckingIdentifier(false);
        return;
      }

      const response = await fetch(buildApiUrl(`/communities/check-identifier/${encodeURIComponent(fullIdentifier)}`), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        setIdentifierAvailable(result.available);
      }
    } catch (error) {
      console.error('[Groups] Error checking identifier availability:', error);
    } finally {
      setIsCheckingIdentifier(false);
    }
  }, []);

  // Sélectionner un groupe depuis la liste
  const handleSelectGroup = useCallback((group: Group) => {
    
    try {
      setSelectedGroup(group);
      
      // Charger les conversations de la communauté
      if (group.id) {
        loadCommunityConversations(group.id);
      }
      
      // L'identifiant contient déjà mshy_ depuis le serveur
      const identifier = group.identifier || '';
      
      router.push(`/groups/${identifier}`);
    } catch (error) {
      console.error('[ERROR] handleSelectGroup failed:', error);
    }
  }, [router, loadCommunityConversations]);

  // Retour à la liste (mobile uniquement)
  const handleBackToList = useCallback(() => {
    if (isMobile) {
      setShowGroupsList(true);
      setSelectedGroup(null);
      router.push('/groups');
    }
  }, [isMobile, router]);

  // Copier l'identifiant au presse-papier (afficher sans mshy_)
  const copyIdentifier = useCallback(async (identifier: string) => {
    try {
      const displayIdentifier = identifier.replace(/^mshy_/, '');
      await navigator.clipboard.writeText(displayIdentifier);
      setCopiedIdentifier(identifier);
      toast.success(tGroups('success.identifierCopied'));
      
      // Réinitialiser l'état de copie après 2 secondes
      setTimeout(() => {
        setCopiedIdentifier(null);
      }, 2000);
    } catch (error) {
      console.error('[Groups] Error copying identifier:', error);
      toast.error(tGroups('errors.copyError'));
    }
  }, [tGroups]);

  // Créer un groupe
  const createGroup = useCallback(async () => {
    // Vérifier que l'identifiant est disponible
    if (identifierAvailable === false) {
      toast.error(tGroups('errors.identifierTaken'));
      return;
    }

    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      // Ajouter le préfixe mshy_ pour l'envoi au serveur
      const fullIdentifier = `mshy_${newGroupIdentifier}`;

      const response = await fetch(buildApiUrl(API_ENDPOINTS.GROUP.CREATE), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newGroupName,
          description: newGroupDescription,
          identifier: fullIdentifier,
          isPrivate: newGroupIsPrivate
        })
      });

      if (response.ok) {
        const result = await response.json();
        const data = result.success ? result.data : result;
        
        // Ajouter le nouveau groupe à la liste
        setGroups(prev => [data, ...prev]);
        
        // Réinitialiser le formulaire
        setNewGroupName('');
        setNewGroupDescription('');
        setNewGroupIdentifier('');
        setNewGroupIsPrivate(false);
        setIdentifierAvailable(null);
        setIsCreateModalOpen(false);
        
        toast.success(tGroups('success.groupCreated'));
      } else {
        const error = await response.json();
        toast.error(error.message || tGroups('errors.createError'));
      }
    } catch (error) {
      console.error('[Groups] Error creating community:', error);
      toast.error(tGroups('errors.createError'));
    }
  }, [newGroupName, newGroupDescription, newGroupIdentifier, newGroupIsPrivate, identifierAvailable, tGroups]);

  // Charger les données initiales
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Gérer la sélection depuis l'URL
  useEffect(() => {
    
    if (selectedGroupIdentifier && groups.length > 0) {
      
      // Chercher d'abord par identifiant exact (avec ou sans mshy_)
      let group = groups.find(g => g.identifier === selectedGroupIdentifier);
      
      // Si pas trouvé et que l'identifiant ne commence pas par mshy_, essayer avec le préfixe
      if (!group && !selectedGroupIdentifier.startsWith('mshy_')) {
        group = groups.find(g => g.identifier === `mshy_${selectedGroupIdentifier}`);
      }
      
      // Si pas trouvé et que l'identifiant commence par mshy_, essayer sans le préfixe
      if (!group && selectedGroupIdentifier.startsWith('mshy_')) {
        const cleanIdentifier = selectedGroupIdentifier.replace(/^mshy_/, '');
        group = groups.find(g => g.identifier === cleanIdentifier);
      }
      
      if (group) {
        setSelectedGroup(group);
        if (isMobile) {
          setShowGroupsList(false);
        }
      } else {
        // Essayer de charger depuis l'API avec l'identifiant tel quel
        loadGroupDetails(selectedGroupIdentifier);
      }
    }
  }, [selectedGroupIdentifier, groups, isMobile, loadGroupDetails]);

  // Mettre à jour l'identifiant automatiquement basé sur le nom
  useEffect(() => {
    if (newGroupName && newGroupName.trim()) {
      // Générer automatiquement un identifiant avec le titre + 6 caractères aléatoires
      const generatedIdentifier = generateCommunityIdentifier(newGroupName);
      setNewGroupIdentifier(generatedIdentifier);
      
      // Vérifier la disponibilité après un court délai (debounce)
      if (identifierCheckTimeout) {
        clearTimeout(identifierCheckTimeout);
      }
      
      const timeout = setTimeout(() => {
        checkIdentifierAvailability(generatedIdentifier);
      }, 500);
      
      setIdentifierCheckTimeout(timeout);
    }
  }, [newGroupName]);

  // Vérifier l'unicité lorsque l'utilisateur modifie manuellement l'identifiant
  useEffect(() => {
    if (newGroupIdentifier && newGroupIdentifier.trim()) {
      // Annuler le timeout précédent
      if (identifierCheckTimeout) {
        clearTimeout(identifierCheckTimeout);
      }
      
      // Vérifier après un délai (debounce)
      const timeout = setTimeout(() => {
        checkIdentifierAvailability(newGroupIdentifier);
      }, 500);
      
      setIdentifierCheckTimeout(timeout);
    } else {
      setIdentifierAvailable(null);
    }
    
    // Cleanup
    return () => {
      if (identifierCheckTimeout) {
        clearTimeout(identifierCheckTimeout);
      }
    };
  }, [newGroupIdentifier]);

  // Filtrer les groupes basé sur la recherche
  // Filtrer les groupes par tab et recherche
  const filteredGroups = useMemo(() => {
    let filtered = groups;
    
    // Filtrer par tab (seulement PUBLIC et PRIVÉE)
    if (activeTab === 'private') {
      filtered = filtered.filter(group => group.isPrivate);
    } else {
      // Par défaut, afficher les communautés publiques
      filtered = filtered.filter(group => !group.isPrivate);
    }
    
    // Filtrer par recherche
    if (searchFilter.trim()) {
      filtered = filtered.filter(group => 
        group.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (group.identifier && group.identifier.toLowerCase().includes(searchFilter.toLowerCase())) ||
        (group.description && group.description.toLowerCase().includes(searchFilter.toLowerCase()))
      );
    }
    
    return filtered;
  }, [groups, activeTab, searchFilter]);

  // Si on est en train de vérifier l'authentification, afficher un loader
  if (isAuthChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{tGroups('authChecking')}</p>
        </div>
      </div>
    );
  }

  // Si pas d'utilisateur après vérification, ne rien afficher
  if (!user) {
    return null;
  }

  return (
    <DashboardLayout title={tConv('communities.title')}>
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">{tConv('loading')}</p>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-6rem)] flex bg-transparent">
          {/* Liste des groupes */}
          <div className={cn(
            "flex flex-col bg-background/80 dark:bg-background/90 backdrop-blur-sm rounded-l-2xl border border-border/50 shadow-lg",
            isMobile ? (showGroupsList ? "w-full" : "hidden") : "w-96"
          )}>
            {/* Header fixe */}
            <div className="flex-shrink-0 p-4 border-b border-border/30 dark:border-border/50">
              <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-foreground">{tGroups('list.communities')}</h2>
              </div>
                <div className="relative">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>

              {/* Tabs pour classer les communautés */}
              <div className="mb-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="public" className="flex items-center space-x-2">
                      <Globe className="h-4 w-4" />
                      <span>{tGroups('visibility.public')}</span>
                      <Badge variant="secondary">{groups.filter(g => !g.isPrivate).length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="private" className="flex items-center space-x-2">
                      <Lock className="h-4 w-4" />
                      <span>{tGroups('visibility.private')}</span>
                      <Badge variant="secondary">{groups.filter(g => g.isPrivate).length}</Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Champ de filtrage des groupes */}
              <div className="mb-2">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  {tGroups('list.filterPlaceholder')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder={tGroups('list.filterLabel')}
                    className="w-full h-8 text-sm px-3 py-2 border border-border/30 dark:border-border/50 rounded-lg 
                             bg-background/50 dark:bg-background/70 text-foreground
                             placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 
                             transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Liste scrollable */}
            <div className="flex-1 overflow-y-auto">              
              {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {isLoading ? tGroups('list.loading') : tGroups('list.noCommunityFound')}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {isLoading 
                      ? tGroups('list.loadingInProgress')
                      : tGroups('noGroupsDescription')
                    }
                  </p>
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {tGroups('list.noCommunityFound')} {activeTab === 'private' ? tGroups('visibility.private').toLowerCase() : tGroups('visibility.public').toLowerCase()}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {searchFilter.trim() 
                      ? tGroups('list.noCommunityForSearch')
                      : `${tGroups('list.noCommunityFound')} ${activeTab === 'private' ? tGroups('visibility.private').toLowerCase() : tGroups('visibility.public').toLowerCase()}`
                    }
                  </p>
                </div>
              ) : (
                <div className="p-2">
                  <div className="space-y-2">
                    {filteredGroups.map((group) => (
                      <div
                        key={group.id}
                        onClick={() => handleSelectGroup(group)}
                        className={cn(
                          "flex items-start p-4 rounded-2xl cursor-pointer transition-all border-2",
                          selectedGroup?.id === group.id
                            ? "bg-primary/20 dark:bg-primary/30 border-primary/40 dark:border-primary/50 shadow-md"
                            : "hover:bg-accent/50 dark:hover:bg-accent/70 border-transparent hover:border-border/30 dark:hover:border-border/40"
                        )}
                      >
                        <div className="relative flex-shrink-0">
                          <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                            <AvatarImage src={group.avatar || undefined} />
                            <AvatarFallback className="bg-primary/20 text-primary font-bold">
                              {group.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className={cn(
                            "absolute -bottom-0 -right-0 h-4 w-4 rounded-full border-2 border-background dark:border-background",
                            group.isPrivate ? "bg-orange-500 dark:bg-orange-600" : "bg-green-500 dark:bg-green-600"
                          )}></div>
                        </div>

                        <div className="ml-4 flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-foreground truncate">
                              {group.name}
                            </h3>
                            {group.isPrivate && (
                              <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                          
                          {group.description && (
                            <p className="text-sm text-muted-foreground truncate mb-2">
                              {group.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-1 mb-2 group/identifier">
                            <span 
                              className="text-xs text-primary font-mono cursor-pointer hover:text-primary/80 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                const displayIdentifier = group.identifier?.replace(/^mshy_/, '') || '';
                                copyIdentifier(group.identifier || '');
                              }}
                            >
                              {group.identifier?.replace(/^mshy_/, '') || ''}
                            </span>
                            {copiedIdentifier === group.identifier ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover/identifier:opacity-100 transition-opacity" />
                            )}
                          </div>

                          {/* Ligne d'informations : membres, conversations, date */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              <span>{group._count?.members || 0}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              <span>{group._count?.conversations || 0}</span>
                            </div>
                            {group.createdAt && (
                              <div className="flex items-center gap-1">
                                <span>{new Date(group.createdAt).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer fixe avec boutons */}
            <div className="flex-shrink-0 p-4 border-t border-border/30 dark:border-border/50 bg-background/50 dark:bg-background/70">
              <div className="flex flex-col gap-3">
                <Button
                  className="w-full rounded-2xl h-12 bg-primary/10 dark:bg-primary/20 hover:bg-primary/20 dark:hover:bg-primary/30 border-0 text-primary font-semibold"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <Plus className="h-5 w-5 mr-2" />
                  {tGroups('list.newCommunity')}
                </Button>
              </div>
            </div>
          </div>

          {/* Zone de détails du groupe */}
          <div className={cn(
            "flex flex-col",
            isMobile ? (showGroupsList ? "hidden" : "w-full") : "flex-1"
          )}>
            {selectedGroup ? (
              <>
                {/* En-tête du groupe */}
                <div className="flex-shrink-0 p-4 border-b border-border/30 dark:border-border/50 bg-background/90 dark:bg-background/95 backdrop-blur-sm rounded-tr-2xl">
                  <div className="flex items-center gap-3">
                    {isMobile && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleBackToList}
                        className="rounded-full h-10 w-10 p-0 hover:bg-accent/50"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                    )}
                    <div className="relative">
                      <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                        <AvatarImage src={selectedGroup.avatar || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary font-bold">
                          {selectedGroup.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h1 className="text-lg font-bold text-foreground">{selectedGroup.name}</h1>
                        {selectedGroup.isPrivate && (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    <div className="flex items-center gap-1 group/identifier">
                      <span 
                        className="text-sm text-primary font-mono cursor-pointer hover:text-primary/80 transition-colors"
                        onClick={() => copyIdentifier(selectedGroup.identifier || '')}
                      >
                        {selectedGroup.identifier?.replace(/^mshy_/, '') || ''}
                      </span>
                      {copiedIdentifier === selectedGroup.identifier ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover/identifier:opacity-100 transition-opacity" />
                      )}
                    </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="rounded-2xl">
                        <UserPlus className="h-4 w-4 mr-1" />
                        {tGroups('actions.invite')}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="rounded-2xl"
                        onClick={() => setIsSettingsModalOpen(true)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Contenu principal du groupe */}
                <div className="flex-1 overflow-y-auto bg-background/50 dark:bg-background/60 backdrop-blur-sm rounded-br-2xl p-6">
                  <div className="max-w-4xl mx-auto space-y-6">
                    {/* Section À propos */}
                    <div className="bg-background/80 dark:bg-background/90 backdrop-blur-sm rounded-2xl border border-border/30 dark:border-border/50 p-6 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <MessageSquare className="h-6 w-6 text-primary" />
                        <h2 className="text-xl font-bold text-foreground">{tGroups('details.about')}</h2>
                      </div>
                      
                      <p className="text-muted-foreground leading-relaxed mb-6">
                        {selectedGroup.description || tGroups('details.noDescription')}
                      </p>
                      
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>{selectedGroup._count?.members || 0} {tGroups('members')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedGroup.isPrivate ? (
                            <>
                              <Lock className="h-4 w-4" />
                              <span>{tGroups('visibility.private')} community</span>
                            </>
                          ) : (
                            <>
                              <Globe className="h-4 w-4" />
                              <span>{tGroups('visibility.public')} community</span>
                            </>
                          )}
                        </div>
                        {selectedGroup.createdAt && (
                          <div>
                            {tGroups('details.createdOn')} {new Date(selectedGroup.createdAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Section Conversations */}
                    <div className="bg-background/80 dark:bg-background/90 backdrop-blur-sm rounded-2xl border border-border/30 dark:border-border/50 p-6 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <MessageSquare className="h-6 w-6 text-primary" />
                        <h2 className="text-xl font-bold text-foreground">{tGroups('details.conversations')}</h2>
                      </div>
                      
                      {isLoadingConversations ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                          <span className="ml-2 text-muted-foreground">{tGroups('details.loadingConversations')}</span>
                        </div>
                      ) : communityConversations.length > 0 ? (
                        <div className="space-y-3">
                          {communityConversations.map((conversation) => (
                            <div
                              key={conversation.id}
                              className="flex items-center gap-3 p-3 rounded-xl border border-border/20 dark:border-border/40 hover:bg-accent/50 dark:hover:bg-accent/70 transition-colors cursor-pointer"
                              onClick={() => router.push(`/conversations/${conversation.id}`)}
                            >
                              <div className="flex-shrink-0">
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={conversation.avatar || undefined} />
                                  <AvatarFallback className="bg-primary/20 text-primary font-bold">
                                    {conversation.title?.substring(0, 2).toUpperCase() || 'C'}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-foreground truncate">
                                    {conversation.title || `Conversation ${conversation.id.slice(-4)}`}
                                  </h3>
                                  {conversation.isPrivate && (
                                    <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">
                                  {conversation.description || 'Aucune description'}
                                </p>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                  <span>{(conversation as any)._count?.members || 0} membres</span>
                                  <span>{(conversation as any)._count?.messages || 0} messages</span>
                                  {conversation.lastMessageAt && (
                                    <span>
                                      Dernière activité: {new Date(conversation.lastMessageAt).toLocaleDateString('fr-FR')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                          <h3 className="text-lg font-semibold text-foreground mb-2">{tGroups('details.noConversations')}</h3>
                          <p className="text-muted-foreground">
                            {tGroups('details.noConversationsDescription')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-background/30 dark:bg-background/40 backdrop-blur-sm rounded-r-2xl">
                <div className="text-center p-8">
                  <Users className="h-16 w-16 mx-auto mb-6 text-muted-foreground/50" />
                  <h3 className="text-xl font-bold text-foreground mb-3">{tGroups('list.selectCommunity')}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {tGroups('list.selectCommunityDescription')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de création de groupe */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:max-w-md sm:w-[90vw]">
          <DialogHeader>
            <DialogTitle>{tGroups('createModal.title')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{tGroups('createModal.nameLabel')}</label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={tGroups('createModal.namePlaceholder')}
                className="mt-1"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{tGroups('createModal.descriptionLabel')}</label>
              <Input
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder={tGroups('createModal.descriptionPlaceholder')}
                className="mt-1"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{tGroups('createModal.identifierLabel')}</label>
              <div className="relative mt-1">
                <Input
                  value={newGroupIdentifier}
                  onChange={(e) => {
                    const sanitized = sanitizeCommunityIdentifier(e.target.value);
                    setNewGroupIdentifier(sanitized);
                  }}
                  placeholder={tGroups('createModal.identifierPlaceholder')}
                  className={cn(
                    "pr-10",
                    identifierAvailable === true && "border-green-500 focus:border-green-500",
                    identifierAvailable === false && "border-red-500 focus:border-red-500"
                  )}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isCheckingIdentifier ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  ) : identifierAvailable === true ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : identifierAvailable === false ? (
                    <X className="h-4 w-4 text-red-500" />
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {identifierAvailable === false ? (
                  <span className="text-red-500">{tGroups('createModal.identifierTaken')}</span>
                ) : identifierAvailable === true ? (
                  <span className="text-green-500">{tGroups('createModal.identifierAvailable')}</span>
                ) : (
                  tGroups('createModal.identifierHelp')
                )}
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">{tGroups('createModal.privateLabel')}</label>
                <p className="text-xs text-muted-foreground">
                  {tGroups('createModal.privateHelp')}
                </p>
              </div>
              <Switch
                checked={newGroupIsPrivate}
                onCheckedChange={setNewGroupIsPrivate}
              />
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsCreateModalOpen(false)}
                className="flex-1"
              >
                {tGroups('createModal.cancel')}
              </Button>
              <Button
                onClick={createGroup}
                disabled={!newGroupName.trim() || !newGroupIdentifier.trim() || identifierAvailable === false || isCheckingIdentifier}
                className="flex-1"
              >
                {tGroups('createModal.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
