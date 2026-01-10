'use client';

import { useState, useEffect, useCallback } from 'react';
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
  X
} from 'lucide-react';
import { toast } from 'sonner';
import type { Group } from '@meeshy/shared/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { cn } from '@/lib/utils';
import { generateCommunityIdentifier, validateCommunityIdentifier, sanitizeCommunityIdentifier } from '@/utils/community-identifier';
import { authManager } from '@/services/auth-manager.service';

interface GroupsLayoutResponsiveProps {
  selectedGroupIdentifier?: string;
}

export function GroupsLayoutResponsive({ selectedGroupIdentifier }: GroupsLayoutResponsiveProps) {

  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser(); const isAuthChecking = useIsAuthChecking();
  const { t: tGroups } = useI18n('groups');

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

  // États principaux
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // États UI responsive
  const [showGroupsList, setShowGroupsList] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // États modaux et formulaires
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);

  // États formulaire
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupIdentifier, setNewGroupIdentifier] = useState('');
  const [newGroupIsPrivate, setNewGroupIsPrivate] = useState(false);

  // État pour la copie d'identifiant
  const [copiedIdentifier, setCopiedIdentifier] = useState<string | null>(null);

  // États pour la vérification d'unicité de l'identifiant
  const [isCheckingIdentifier, setIsCheckingIdentifier] = useState(false);
  const [identifierAvailable, setIdentifierAvailable] = useState<boolean | null>(null);
  const [identifierCheckTimeout, setIdentifierCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  // Détecter si on est sur mobile
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
      if (!token) return;

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
        console.error('Erreur chargement détails groupe');
        toast.error('Erreur lors du chargement du groupe');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors du chargement du groupe');
    }
  }, [isMobile]);

  // Sélectionner un groupe depuis la liste
  const handleSelectGroup = useCallback((group: Group) => {
    setSelectedGroup(group);
    // L'identifiant contient déjà mshy_ depuis le serveur
    const identifier = group.identifier || '';
    router.push(`/groups/${identifier}`);
  }, [router]);

  // Retour à la liste (mobile uniquement)
  const handleBackToList = useCallback(() => {
    if (isMobile) {
      setShowGroupsList(true);
      setSelectedGroup(null);
      router.push('/groups');
    }
  }, [isMobile, router]);

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
      console.error('Erreur lors de la vérification de l\'identifiant:', error);
    } finally {
      setIsCheckingIdentifier(false);
    }
  }, []);

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
      // Retirer le préfixe mshy_ si présent
      const cleanIdentifier = selectedGroupIdentifier.replace(/^mshy_/, '');
      const group = groups.find(g => g.identifier === cleanIdentifier);
      if (group) {
        setSelectedGroup(group);
        if (isMobile) {
          setShowGroupsList(false);
        }
      } else {
        // Essayer de charger depuis l'API
        loadGroupDetails(cleanIdentifier);
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

  return (
    <DashboardLayout>
      {/* Contenu principal */}
      <div className="flex h-full">
        {/* Liste des groupes */}
        {showGroupsList && (
          <div className={cn(
            "border-r bg-muted/10",
            isMobile ? "w-full" : "w-80 min-w-80"
          )}>
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{tGroups('list.communities')}</h2>
                <Button
                  onClick={() => setIsCreateModalOpen(true)}
                  size="sm"
                  className="rounded-xl"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {tGroups('createGroup')}
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-sm text-muted-foreground">Chargement...</p>
                </div>
              ) : groups.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Aucune communauté</p>
                  <p className="text-xs">Créez-en une pour commencer</p>
                </div>
              ) : (
                <div className="p-2">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className={cn(
                        "p-3 mb-2 rounded-lg cursor-pointer transition-colors",
                        "hover:bg-muted/50",
                        selectedGroup?.id === group.id && "bg-primary/10 border border-primary/20"
                      )}
                      onClick={() => handleSelectGroup(group)}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarImage src={group.avatar || undefined} />
                          <AvatarFallback>
                            {group.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">{group.name}</h3>
                            {group.isPrivate && (
                              <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                          
                          {group.description && (
                            <p className="text-xs text-muted-foreground truncate mb-2">
                              {group.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-1 mb-2 group/identifier">
                            <span 
                              className="text-xs text-primary font-mono cursor-pointer hover:text-primary/80 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyIdentifier(group.identifier || '');
                              }}
                              onMouseEnter={() => {}}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Détails du groupe */}
        {selectedGroup && (!isMobile || !showGroupsList) && (
          <div className="flex-1 flex flex-col">
            {/* Header du groupe */}
            <div className="p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBackToList}
                      className="mr-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedGroup.avatar || undefined} />
                    <AvatarFallback>
                      {selectedGroup.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-semibold">{selectedGroup.name}</h1>
                      {selectedGroup.isPrivate ? (
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Privée
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Globe className="h-3 w-3 mr-1" />
                          Publique
                        </Badge>
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
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <UserPlus className="h-4 w-4 mr-1" />
                    Inviter
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsSettingsModalOpen(true)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Contenu du groupe */}
            <div className="flex-1 p-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    À propos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    {selectedGroup.description || 'Aucune description disponible.'}
                  </p>
                  
                  <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {selectedGroup._count?.members || 0} membres
                    </div>
                    <div>
                      Créée le {new Date(selectedGroup.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* État vide desktop */}
        {!selectedGroup && !isMobile && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2">Sélectionnez une communauté</h3>
              <p className="text-muted-foreground">
                Choisissez une communauté dans la liste pour voir ses détails
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de création */}
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
