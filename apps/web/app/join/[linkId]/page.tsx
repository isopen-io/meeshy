'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  MessageSquare,
  Users,
  LogIn,
  UserPlus,
  UserMinus,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Globe,
  Loader2
} from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { User } from '@meeshy/shared/types';
import { ConversationLink } from '@meeshy/shared/types';
import { AuthMode } from '@/types';
import { toast } from 'sonner';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/hooks/useI18n';
import { LinkConversationService } from '@/services/link-conversation.service';
import { authManager } from '@/services/auth-manager.service';
import { Header } from '@/components/layout/Header';
import { usersService } from '@/services/users.service';

// Langues supportées pour les participants anonymes
const ANONYMOUS_LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' }
];

interface AnonymousFormData {
  firstName: string;
  lastName: string;
  username: string; // Renommé depuis nickname
  email: string;
  birthday: string;
  language: string;
}

export default function JoinConversationPage() {
  const params = useParams();
  const router = useRouter();
  const linkId = params?.linkId as string;
  const { user: currentUser, login, joinAnonymously, isChecking, isAnonymous, token, logout, leaveAnonymousSession } = useAuth();
  const { t } = useI18n('joinPage');

  // Fonction pour obtenir le type de conversation traduit
  const getConversationTypeLabel = (type: string | undefined) => {
    switch (type) {
      case 'group':
        return t('group');
      case 'direct':
        return t('direct');
      case 'public':
        return t('public');
      case 'global':
        return t('global');
      default:
        return t('privateConversation');
    }
  };

  // Fonction pour obtenir la variante du badge selon le type
  const getBadgeVariant = (type: string | undefined) => {
    switch (type) {
      case 'group':
        return "default";
      case 'global':
        return "default";
      case 'public':
        return "secondary";
      case 'direct':
        return "outline";
      default:
        return "secondary";
    }
  };
  
  const [conversationLink, setConversationLink] = useState<ConversationLink | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('welcome');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showAnonymousForm, setShowAnonymousForm] = useState(false);
  const [anonymousForm, setAnonymousForm] = useState<AnonymousFormData>({
    firstName: '',
    lastName: '',
    username: '', // Renommé depuis nickname
    email: '',
    birthday: '',
    language: 'fr'
  });

  // État pour la validation du username
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  // Debug: Log currentUser pour voir ce qu'on a
  useEffect(() => {
  }, [currentUser, isChecking]);

  /**
   * Récupère et stocke le token d'affiliation du créateur du lien
   * Cela permet d'associer automatiquement les nouveaux utilisateurs qui s'inscrivent
   * via ce lien avec l'affiliation du créateur
   *
   * Utilise usersService pour une meilleure architecture
   */
  const fetchAndStoreCreatorAffiliateToken = async (creatorId: string) => {
    try {
      // Appel API via usersService (meilleure architecture)
      const response = await usersService.getUserAffiliateToken(creatorId);

      // Vérifier si des données ont été retournées (response.data contient le token ou null)
      if (response.data && response.data.token) {
        const affiliateToken = response.data.token;

        // Stocker dans localStorage (durée: 30 jours)
        if (typeof window !== 'undefined') {
          localStorage.setItem('meeshy_affiliate_token', affiliateToken);

          // Stocker dans cookie (durée: 30 jours)
          document.cookie = `meeshy_affiliate_token=${affiliateToken}; max-age=${30 * 24 * 60 * 60}; path=/; samesite=lax`;

          if (process.env.NODE_ENV === 'development') {
            console.log(`[JOIN] Token d'affiliation du créateur stocké: ${affiliateToken.substring(0, 10)}...`);
          }
        }
      } else if (process.env.NODE_ENV === 'development') {
        console.log('[JOIN] Créateur sans token d\'affiliation actif');
      }
    } catch (error) {
      // Échec silencieux - l'affiliation n'est pas critique pour rejoindre
      if (process.env.NODE_ENV === 'development') {
        console.error('[JOIN] Erreur récupération token affiliation:', error);
      }
    }
  };

  useEffect(() => {
    const initializePage = async () => {
      try {
        // Charger les informations du lien via l'API anonyme
        const linkResponse = await fetch(`${buildApiUrl('/anonymous/link')}/${linkId}`);

        if (linkResponse.ok) {
          const result = await linkResponse.json();
          if (result.success) {
            setConversationLink(result.data);

            // AFFILIATION AUTOMATIQUE: Récupérer et stocker le token d'affiliation du créateur
            if (result.data.creator?.id) {
              fetchAndStoreCreatorAffiliateToken(result.data.creator.id);
            }
          } else {
            setLinkError(result.message);
          }
        } else {
          const errorResult = await linkResponse.json().catch(() => ({}));
          setLinkError(errorResult.message || t('linkError'));
        }
      } catch (error) {
        console.error('Erreur initialisation:', error);
        setLinkError(t('linkError'));
      } finally {
        setIsLoading(false);
      }
    };

    if (linkId) {
      initializePage();
    }
  }, [linkId]);

  // Vérifier si on doit ouvrir automatiquement le formulaire anonyme
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const autoAnonymous = urlParams.get('anonymous');

      if (autoAnonymous === 'true' && !currentUser) {
        setShowAnonymousForm(true);
      }
    }
  }, [currentUser]);

  // Vérification de disponibilité du username avec debounce
  useEffect(() => {
    // Clear le timeout précédent
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    // Si le username est vide, reset le statut
    if (!anonymousForm.username.trim()) {
      setUsernameCheckStatus('idle');
      return;
    }

    // Indiquer qu'on est en train de vérifier
    setUsernameCheckStatus('checking');

    // Debounce: attendre 500ms avant de lancer la vérification
    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch(
          buildApiUrl(`/auth/check-availability?username=${encodeURIComponent(anonymousForm.username.trim())}`)
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setUsernameCheckStatus(result.data?.usernameAvailable ? 'available' : 'taken');
          } else {
            setUsernameCheckStatus('idle');
          }
        } else {
          setUsernameCheckStatus('idle');
        }
      } catch (error) {
        console.error('Erreur vérification username:', error);
        setUsernameCheckStatus('idle');
      }
    }, 500);

    // Cleanup
    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, [anonymousForm.username]);

  // Wrapper function for auth success that handles dialog state management
  const onAuthSuccess = (user: User, token: string) => {
    setAuthMode('welcome');
    
    // Automatiquement rejoindre la conversation après la connexion
    setTimeout(() => {
      joinConversation();
    }, 500); // Petit délai pour laisser le temps au dialog de se fermer et à l'état d'être mis à jour
  };

  // Fonction pour générer automatiquement le username
  const generateUsername = (firstName: string, lastName: string) => {
    // Utiliser le prénom et nom complets (pas juste les initiales)
    const cleanFirstName = firstName.toLowerCase().replace(/[^a-z]/g, '');
    const cleanLastName = lastName.toLowerCase().replace(/[^a-z]/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${cleanFirstName}_${cleanLastName}${randomSuffix}`;
  };

  // Fonction pour mettre à jour le formulaire anonyme
  const updateAnonymousForm = (field: keyof AnonymousFormData, value: string) => {
    setAnonymousForm(prev => {
      const newForm = { ...prev, [field]: value };
      
      // Auto-générer le username quand le prénom ou nom change
      if (field === 'firstName' || field === 'lastName') {
        if (newForm.firstName && newForm.lastName && !prev.username) {
          newForm.username = generateUsername(newForm.firstName, newForm.lastName);
        }
      }
      
      return newForm;
    });
  };

  // Fonction pour rejoindre de manière anonyme
  const handleJoinAnonymously = async () => {
    if (!anonymousForm.firstName.trim() || !anonymousForm.lastName.trim()) {
      toast.error(t('firstNameRequired'));
      return;
    }

    // Vérifier si l'username est requis
    if (conversationLink?.requireNickname && !anonymousForm.username.trim()) {
      toast.error(t('usernameRequired'));
      return;
    }

    // Vérifier si l'email est requis
    if (conversationLink?.requireEmail && !anonymousForm.email.trim()) {
      toast.error(t('emailRequired'));
      return;
    }

    // Vérifier si la date de naissance est requise
    if (conversationLink?.requireBirthday && !anonymousForm.birthday.trim()) {
      toast.error(t('birthdayRequired'));
      return;
    }

    setIsJoining(true);
    try {
      const response = await fetch(`${buildApiUrl('/anonymous/join')}/${linkId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName: anonymousForm.firstName.trim(),
          lastName: anonymousForm.lastName.trim(),
          username: anonymousForm.username.trim() || generateUsername(anonymousForm.firstName, anonymousForm.lastName), // Envoyer comme username au backend
          email: anonymousForm.email.trim() || undefined,
          birthday: anonymousForm.birthday ? new Date(anonymousForm.birthday).toISOString() : undefined,
          language: anonymousForm.language,
          deviceFingerprint: navigator.userAgent // Empreinte basique
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        // Utiliser le hook d'authentification pour gérer la session anonyme
        joinAnonymously(result.data.participant, result.data.sessionToken, result.data.conversationShareLinkId || linkId);
        
        // Stocker le linkId original pour permettre la redirection depuis la page d'accueil
        localStorage.setItem('anonymous_current_link_id', linkId);
        
        toast.success(t('welcome', { username: result.data.participant.username }));
        
        // Rediriger vers la page de chat anonyme avec le linkId (pas l'ID de la conversation!)
        // Utiliser window.location.href pour forcer la redirection immédiate
        window.location.href = `/chat/${linkId}`;
      } else {
        toast.error(result.message || t('joinError'));
        
        // Si le username est déjà pris, proposer le username suggéré
        if (response.status === 409 && result.suggestedNickname) {
          setAnonymousForm(prev => ({ ...prev, username: result.suggestedNickname })); // Mettre à jour username
          toast.info(t('suggestedUsername', { username: result.suggestedNickname }));
        }
      }
    } catch (error) {
      console.error('Erreur connexion anonyme:', error);
      toast.error(t('connectionError'));
    } finally {
      setIsJoining(false);
    }
  };

  const joinConversation = async () => {
    setIsJoining(true);
    
    try {
      const linkId = params.linkId as string; // C'est le linkId (token d'invitation)
      
      // Déterminer le type d'authentification
      const authToken = authManager.getAuthToken();
      const anonymousSession = authManager.getAnonymousSession();
      const sessionToken = anonymousSession?.token;
      

      // Préparer les headers selon le type d'authentification
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      if (sessionToken) {
        headers['x-session-token'] = sessionToken;
      }

      // Si l'utilisateur a un session token (participant anonyme), rediriger directement
      if (isAnonymous && sessionToken) {
        // Pour les utilisateurs anonymes, utiliser directement le linkId de l'URL
        // Cela garantit que nous utilisons toujours le bon identifiant de lien
        router.push(`/chat/${linkId}`);
        return;
      }

      // Si l'utilisateur a un access token, vérifier s'il est déjà membre
      if (authToken) {
        
        // D'abord, récupérer les informations du lien pour obtenir le conversationShareLinkId
        let conversationShareLinkId: string;
        try {
          const linkInfo = await LinkConversationService.getLinkInfo(linkId);
          if (!linkInfo.success) {
            throw new Error('Impossible de récupérer les informations du lien');
          }
          conversationShareLinkId = linkInfo.data.id; // C'est le conversationShareLinkId
        } catch (error) {
          console.error('[JOIN_CONVERSATION] Erreur récupération linkInfo:', error);
          toast.error(t('linkError'));
          return;
        }
        
        // Vérifier le type d'utilisateur avec l'endpoint /links/:conversationShareLinkId
        const chatResponse = await fetch(`${buildApiUrl('/api/links')}/${conversationShareLinkId}`, {
          method: 'GET',
          headers
        });

        if (chatResponse.ok) {
          const chatResult = await chatResponse.json();
          
          if (chatResult.success && chatResult.data.userType === 'member') {
            // Utilisateur membre authentifié - rediriger directement vers la conversation
            toast.success(t('redirecting'));
            // Pour les utilisateurs authentifiés, rediriger vers la page de conversation normale
            // Utiliser l'ID de la conversation depuis les données reçues
            router.push(`/conversations/${chatResult.data.conversation.id}`);
            return;
          } else if (chatResult.success && chatResult.data.userType === 'authenticated_non_member') {
            // Utilisateur authentifié mais pas membre - continuer vers l'endpoint de jointure
          }
        } else {
          console.error('[JOIN_CONVERSATION] Erreur GET /links:', chatResponse.status);
          const errorData = await chatResponse.json();
          console.error('[JOIN_CONVERSATION] Erreur détails:', errorData);
        }

        // Si ce n'est pas un membre, essayer de joindre via l'endpoint de jointure
        const response = await fetch(`${buildApiUrl('/conversations/join')}/${linkId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          toast.success(t('redirecting'));
          // Pour les utilisateurs authentifiés, rediriger vers la page de conversation normale
          // Utiliser l'ID de la conversation retourné par l'API
          router.push(`/conversations/${result.data.conversationId}`);
        } else {
          const error = await response.json();
          console.error('[JOIN_CONVERSATION] Erreur POST /conversations/join:', response.status, error);
          toast.error(error.message || t('joinError'));
        }
      }
    } catch (error) {
      console.error('[JOIN_CONVERSATION] Erreur jointure:', error);
      toast.error(t('connectionError'));
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading || isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-xl text-red-700">{t('invalidLink')}</CardTitle>
            <CardDescription className="text-red-600">
              {linkError}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/')}
              className="w-full"
            >
              {t('returnToHome')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!conversationLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>{t('conversationNotFound')}</CardTitle>
            <CardDescription>
              {t('conversationNotFoundDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/')}
              className="w-full"
            >
              {t('returnToHome')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header unifié avec la landing page */}
      <Header
        mode="landing"
        authMode={authMode}
        onAuthModeChange={setAuthMode}
      />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                {conversationLink.conversation?.type === 'group' ? (
                  <Users className="h-8 w-8 text-blue-600" />
                ) : (
                  <MessageSquare className="h-8 w-8 text-blue-600" />
                )}
              </div>
              
              <CardTitle className="text-2xl">
                {t('title')}
              </CardTitle>
              <CardDescription className="text-lg">
                {t('invitedTo')} &quot;{conversationLink.conversation?.title || t('conversationWithoutName')}&quot;
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Message du créateur */}
              {conversationLink.description && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">
                        {conversationLink.description}
                      </p>
                      {conversationLink.creator && (
                        <p className="text-xs text-blue-600 mt-2">
                          — {conversationLink.creator.displayName || `${conversationLink.creator.firstName} ${conversationLink.creator.lastName}`.trim() || conversationLink.creator.username}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Informations sur la conversation */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('type')}:</span>
                  <Badge variant={getBadgeVariant(conversationLink.conversation?.type) as any}>
                    {getConversationTypeLabel(conversationLink.conversation?.type)}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('participants')}:</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {conversationLink.stats?.totalParticipants || 0} {t('members')}
                    {conversationLink.stats && conversationLink.stats.anonymousCount > 0 && (
                      <span className="text-xs text-gray-500 ml-1">
                        {t('includingAnonymous', { count: conversationLink.stats.anonymousCount })}
                      </span>
                    )}
                  </span>
                </div>
                
                {conversationLink.stats && conversationLink.stats.languageCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('spokenLanguages')}:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {conversationLink.stats.languageCount} {t('languages')}
                      </span>
                      <div className="flex gap-1">
                        {conversationLink.stats.spokenLanguages.slice(0, 3).map((lang: string, index: number) => (
                          <span
                            key={lang}
                            className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full"
                          >
                            {lang.toUpperCase()}
                          </span>
                        ))}
                        {conversationLink.stats.languageCount > 3 && (
                          <span className="text-xs text-gray-500">
                            +{conversationLink.stats.languageCount - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('createdOn')}:</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {conversationLink.conversation?.createdAt ? new Date(conversationLink.conversation.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>

                {conversationLink.expiresAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('expiresOn')}:</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      {new Date(conversationLink.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {currentUser ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">
                        {t('connectedAs')} {currentUser.displayName || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.username}
                      </p>
                      <p className="text-sm text-green-700">
                        @{currentUser.username || currentUser.displayName || 'utilisateur'}
                      </p>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={joinConversation}
                    disabled={isJoining}
                    size="lg"
                    className="w-full"
                  >
                    {isJoining ? `${t('joinButton')}...` : t('joinButton')}
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center text-gray-600 dark:text-gray-400">
                    <p className="mb-4">{t('chooseHowToJoin')}</p>
                  </div>
                  
                  {!showAnonymousForm ? (
                    <div className="space-y-4">
                      {/* Si requireAccount est true, ne pas afficher le bouton Rejoindre anonymement */}
                      {!conversationLink?.requireAccount && (
                        <>
                          {/* Options d'accès */}
                          <div className="grid grid-cols-1 gap-3">
                            <Button
                              size="lg"
                              className="w-full"
                              onClick={() => setShowAnonymousForm(true)}
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              {t('joinAnonymously')}
                            </Button>
                          </div>

                          <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                              <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                              <span className="bg-white dark:bg-gray-800 px-2 text-muted-foreground">{t('orWithAccount')}</span>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Afficher un message si requireAccount est true */}
                      {conversationLink?.requireAccount && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg text-center">
                          <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                            {t('accountRequired')}
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            {t('accountRequiredDescription')}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <Dialog open={authMode === 'login'} onOpenChange={(open) => setAuthMode(open ? 'login' : 'welcome')}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="lg">
                              <LogIn className="h-4 w-4 mr-2" />
                              {t('signIn')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                            {/* Header fixe */}
                            <div className="px-6 pt-6 pb-4 border-b shrink-0">
                              <DialogHeader>
                                <DialogTitle>{t('signIn')}</DialogTitle>
                                <DialogDescription>
                                  {t('signInToJoin')}
                                </DialogDescription>
                              </DialogHeader>
                            </div>
                            {/* Contenu scrollable */}
                            <div className="flex-1 overflow-y-auto px-6 min-h-0 py-4">
                              <LoginForm onSuccess={onAuthSuccess} />
                            </div>
                          </DialogContent>
                        </Dialog>
                        
                        <Dialog open={authMode === 'register'} onOpenChange={(open) => setAuthMode(open ? 'register' : 'welcome')}>
                          <DialogTrigger asChild>
                            <Button size="lg">
                              <UserPlus className="h-4 w-4 mr-2" />
                              {t('signUp')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                            {/* Header fixe */}
                            <div className="px-6 pt-6 pb-4 border-b shrink-0">
                              <DialogHeader>
                                <DialogTitle>{t('createAccount')}</DialogTitle>
                                <DialogDescription>
                                  {t('createAccountToJoin')}
                                </DialogDescription>
                              </DialogHeader>
                            </div>
                            {/* Contenu scrollable */}
                            <div className="flex-1 overflow-y-auto px-6 min-h-0">
                              <RegisterForm onSuccess={onAuthSuccess} formPrefix="register-join-large" />
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  ) : (
                    /* Formulaire anonyme */
                    <div className="space-y-4">
                      <div className="text-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('anonymousAccess')}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{t('createTemporaryIdentity')}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">{t('firstName')} *</Label>
                          <Input
                            id="firstName"
                            value={anonymousForm.firstName}
                            onChange={(e) => updateAnonymousForm('firstName', e.target.value)}
                            placeholder="John"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">{t('lastName')} *</Label>
                          <Input
                            id="lastName"
                            value={anonymousForm.lastName}
                            onChange={(e) => updateAnonymousForm('lastName', e.target.value)}
                            placeholder="Doe"
                            required
                          />
                        </div>
                      </div>
                      
                      {conversationLink.requireNickname && (
                        <div className="space-y-2">
                          <Label htmlFor="username">
                            {t('username')} <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <Input
                              id="username"
                              value={anonymousForm.username}
                              onChange={(e) => updateAnonymousForm('username', e.target.value)}
                              placeholder={t('username')}
                              required={conversationLink.requireNickname}
                              className="pr-10"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              {usernameCheckStatus === 'checking' && (
                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                              )}
                              {usernameCheckStatus === 'available' && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                              {usernameCheckStatus === 'taken' && (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                          </div>
                          {usernameCheckStatus === 'taken' && (
                            <p className="text-xs text-red-500">
                              Ce pseudo est déjà utilisé
                            </p>
                          )}
                          {usernameCheckStatus === 'available' && (
                            <p className="text-xs text-green-600">
                              Ce pseudo est disponible
                            </p>
                          )}
                          {usernameCheckStatus === 'idle' && (
                            <>
                              <p className="text-xs text-red-500">
                                {t('usernameRequired')}
                              </p>
                              <p className="text-xs text-gray-500">
                                {t('usernameWarning')}
                              </p>
                            </>
                          )}
                        </div>
                      )}
                      
                      {!conversationLink.requireNickname && (
                        <div className="space-y-2">
                          <Label htmlFor="username">{t('usernameOptional')}</Label>
                          <div className="relative">
                            <Input
                              id="username"
                              value={anonymousForm.username}
                              onChange={(e) => updateAnonymousForm('username', e.target.value)}
                              placeholder={t('autoGenerated')}
                              className="pr-10"
                            />
                            {anonymousForm.username.trim() && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                {usernameCheckStatus === 'checking' && (
                                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                )}
                                {usernameCheckStatus === 'available' && (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                )}
                                {usernameCheckStatus === 'taken' && (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                              </div>
                            )}
                          </div>
                          {usernameCheckStatus === 'taken' && (
                            <p className="text-xs text-red-500">
                              Ce pseudo est déjà utilisé
                            </p>
                          )}
                          {usernameCheckStatus === 'available' && (
                            <p className="text-xs text-green-600">
                              Ce pseudo est disponible
                            </p>
                          )}
                          {usernameCheckStatus === 'idle' && (
                            <>
                              <p className="text-xs text-gray-500">
                                {t('leaveEmpty')}
                              </p>
                              <p className="text-xs text-gray-500">
                                {t('customUsernameWarning')}
                              </p>
                            </>
                          )}
                        </div>
                      )}
                      
                      {conversationLink.requireEmail && (
                        <div className="space-y-2">
                          <Label htmlFor="email">
                            {t('email')} <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={anonymousForm.email}
                            onChange={(e) => updateAnonymousForm('email', e.target.value)}
                            placeholder="john.doe@example.com"
                            required={conversationLink.requireEmail}
                          />
                          <p className="text-xs text-red-500">
                            {t('emailRequired')}
                          </p>
                        </div>
                      )}

                      {conversationLink.requireBirthday && (
                        <div className="space-y-2">
                          <Label htmlFor="birthday">
                            {t('birthday')} <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="birthday"
                            type="date"
                            value={anonymousForm.birthday}
                            onChange={(e) => updateAnonymousForm('birthday', e.target.value)}
                            required={conversationLink.requireBirthday}
                            max={new Date().toISOString().split('T')[0]}
                          />
                          <p className="text-xs text-red-500">
                            {t('birthdayRequired')}
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="language">{t('spokenLanguage')}</Label>
                        <Select 
                          value={anonymousForm.language} 
                          onValueChange={(value) => updateAnonymousForm('language', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ANONYMOUS_LANGUAGES.map((lang) => (
                              <SelectItem key={lang.code} value={lang.code}>
                                <span className="flex items-center">
                                  <span className="mr-2">{lang.flag}</span>
                                  {lang.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex space-x-3 pt-4">
                        <Button
                          onClick={handleJoinAnonymously}
                          disabled={
                            isJoining ||
                            !anonymousForm.firstName.trim() ||
                            !anonymousForm.lastName.trim() ||
                            (conversationLink.requireNickname && !anonymousForm.username.trim()) ||
                            (conversationLink.requireEmail && !anonymousForm.email.trim()) ||
                            (conversationLink.requireBirthday && !anonymousForm.birthday.trim()) ||
                            // Désactiver si le username est en cours de vérification ou pris
                            usernameCheckStatus === 'checking' ||
                            (anonymousForm.username.trim() && usernameCheckStatus === 'taken')
                          }
                          size="lg"
                          className="flex-1"
                        >
                          {isJoining ? t('joining') : t('join')}
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </Button>
                        <Button 
                          onClick={() => setShowAnonymousForm(false)}
                          variant="outline"
                          size="lg"
                        >
                          {t('back')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
