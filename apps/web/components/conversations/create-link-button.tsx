'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Link2, Plus } from 'lucide-react';
import { CreateLinkModalV2 } from './create-link-modal';
import { LinkSummaryModal } from './link-summary-modal';
import { QuickLinkConfigModal, QuickLinkConfig, CreatedLinkData } from './quick-link-config-modal';
import { toast } from 'sonner';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { copyToClipboard } from '@/lib/clipboard';
import { useUser } from '@/stores';
import { useLanguage } from '@/hooks/use-language';
import { generateLinkName } from '@/utils/link-name-generator';
import { conversationsService } from '@/services/conversations.service';
import { authManager } from '@/services/auth-manager.service';

interface CreateLinkButtonProps {
  conversationId?: string; // ID de la conversation (optionnel, détecté depuis l'URL sinon)
  currentUser?: any; // Utilisateur courant (optionnel, utilise le store si non fourni)
  onLinkCreated?: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  children?: React.ReactNode;
  forceModal?: boolean; // Force l'ouverture de la modale au lieu de créer un lien directement
  disableSummaryModal?: boolean; // Désactive la modale de résumé après création
}

export function CreateLinkButton({

  conversationId: propConversationId,
  currentUser: propCurrentUser,
  onLinkCreated,
  variant = 'default',
  size = 'default',
  className,
  children,
  forceModal = false,
  disableSummaryModal = false
}: CreateLinkButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickConfigModalOpen, setIsQuickConfigModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [linkSummaryData, setLinkSummaryData] = useState<any>(null);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [quickLinkDefaultTitle, setQuickLinkDefaultTitle] = useState<string>('');
  const [createdLinkData, setCreatedLinkData] = useState<CreatedLinkData | null>(null);
  const storeUser = useUser();
  const currentUser = propCurrentUser || storeUser; // Utiliser la prop en priorité, sinon le store
  const router = useRouter();
  const searchParams = useSearchParams();
  const { detectedInterfaceLanguage } = useLanguage();

  // Messages traduits selon la langue de l'interface
  const getTranslatedMessages = (lang: string) => {
    const messages: Record<string, { success: string; shareMessage: string; copied: string }> = {
      fr: {
        success: 'Point d\'ancrage créé avec succès',
        shareMessage: '🔗 Rejoignez la conversation Meeshy !\n\n',
        copied: 'Lien copié dans le presse-papier !'
      },
      en: {
        success: 'Anchor point created successfully',
        shareMessage: '🔗 Join the Meeshy conversation!\n\n',
        copied: 'Link copied to clipboard!'
      },
      es: {
        success: 'Punto de anclaje creado con éxito',
        shareMessage: '🔗 ¡Únete a la conversación de Meeshy!\n\n',
        copied: '¡Enlace copiado al portapapeles!'
      },
      de: {
        success: 'Ankerpunkt erfolgreich erstellt',
        shareMessage: '🔗 Treten Sie dem Meeshy-Gespräch bei!\n\n',
        copied: 'Link in die Zwischenablage kopiert!'
      },
      it: {
        success: 'Punto di ancoraggio creato con successo',
        shareMessage: '🔗 Unisciti alla conversazione Meeshy!\n\n',
        copied: 'Link copiato negli appunti!'
      },
      pt: {
        success: 'Ponto de ancoragem criado com sucesso',
        shareMessage: '🔗 Junte-se à conversa Meeshy!\n\n',
        copied: 'Link copiado para a área de transferência!'
      },
      zh: {
        success: '锚点创建成功',
        shareMessage: '🔗 加入 Meeshy 对话！\n\n',
        copied: '链接已复制到剪贴板！'
      },
      ja: {
        success: 'アンカーポイントが正常に作成されました',
        shareMessage: '🔗 Meeshy の会話に参加しましょう！\n\n',
        copied: 'リンクがクリップボードにコピーされました！'
      },
      ar: {
        success: 'تم إنشاء نقطة الربط بنجاح',
        shareMessage: '🔗 انضم إلى محادثة Meeshy!\n\n',
        copied: 'تم نسخ الرابط إلى الحافظة!'
      }
    };
    return messages[lang] || messages['en'];
  };

  const handleLinkCreated = () => {
    setIsModalOpen(false);
    setGeneratedLink(null);
    setGeneratedToken(null);
    setLinkSummaryData(null);
    onLinkCreated?.();
  };

  const handleSummaryModalClose = () => {
    setIsSummaryModalOpen(false);
    setGeneratedLink(null);
    setGeneratedToken(null);
    setLinkSummaryData(null);
  };

  const createQuickLink = async (conversationId: string, config: QuickLinkConfig) => {
    if (!currentUser) {
      toast.error('Impossible de créer le lien : utilisateur non connecté');
      return;
    }

    if (!conversationId) {
      toast.error('Impossible de créer le lien : conversation non identifiée');
      return;
    }

    setIsCreating(true);

    try {
      // Paramètres du lien avec configuration sécurisée par défaut
      const expirationDays = 7; // 1 semaine
      const maxUses = undefined;
      const maxConcurrentUsers = undefined;

      // Calculer la date d'expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const linkData = {
        conversationId: conversationId,
        name: config.title, // Le backend attend "name" et non "title"
        description: config.description || 'Bienvenue dans la conversation !',
        expiresAt: expiresAt.toISOString(), // Envoyer la date ISO au lieu de expirationDays
        maxUses: maxUses,
        maxConcurrentUsers: maxConcurrentUsers,
        maxUniqueSessions: undefined,
        // Configuration sécurisée : tout autorisé pour les membres authentifiés
        allowAnonymousMessages: true,
        allowAnonymousFiles: true,
        allowAnonymousImages: true,
        allowViewHistory: true,
        // Configuration sécurisée : compte obligatoire avec toutes les vérifications
        requireAccount: true,
        requireNickname: true,
        requireEmail: true,
        requireBirthday: true,
        allowedLanguages: [] // Toutes les langues (tableau vide = toutes autorisées)
      };

      const token = typeof window !== 'undefined' ? authManager.getAuthToken() : null;
      
      const response = await fetch(buildApiUrl(API_ENDPOINTS.CONVERSATION.CREATE_LINK), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify(linkData)
      });

      if (response.ok) {
        const result = await response.json();
        const linkUrl = `${window.location.origin}/join/${result.data.linkId}`;
        const messages = getTranslatedMessages(detectedInterfaceLanguage);

        // Stocker les liens générés
        setGeneratedLink(linkUrl);
        setGeneratedToken(result.data.linkId);

        // Préparer les données pour le modal QuickLink (étape 2)
        setCreatedLinkData({
          url: linkUrl,
          title: linkData.name,
          description: linkData.description || '',
          expirationDays: expirationDays
        });

        // Afficher le toast de succès
        toast.success(messages.success);

        onLinkCreated?.();
      } else {
        const error = await response.json();
        console.error('Erreur API:', error);
        toast.error(error.message || 'Erreur lors de la création du lien');
      }
    } catch (error) {
      console.error('Erreur création lien:', error);
      toast.error('Erreur lors de la création du lien');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClick = async () => {
    // Si forceModal est activé, ouvrir toujours la modale complète
    if (forceModal) {
      setIsModalOpen(true);
      return;
    }

    // Utiliser la prop conversationId en priorité, sinon détecter depuis l'URL
    const currentPath = window.location.pathname;
    const conversationIdFromPath = currentPath.match(/\/conversations\/([^\/]+)/)?.[1];
    const conversationIdFromQuery = searchParams.get('id');
    const currentConversationId = propConversationId || conversationIdFromPath || conversationIdFromQuery;

    if (currentConversationId) {
      // Contexte : conversation spécifique -> modale de configuration rapide
      try {
        // Récupérer les détails de la conversation pour le titre par défaut
        const conversation = await conversationsService.getConversation(currentConversationId);
        const conversationTitle = conversation.title || 'Conversation';

        // Générer le nom du lien selon la langue de l'interface (priorité sur la langue utilisateur)
        const defaultTitle = generateLinkName({
          conversationTitle,
          language: detectedInterfaceLanguage || currentUser?.systemLanguage || 'fr',
          durationDays: 7,
          maxParticipants: undefined,
          maxUses: undefined,
          isPublic: false
        });

        setQuickLinkDefaultTitle(defaultTitle);
        setPendingConversationId(currentConversationId);
        setIsQuickConfigModalOpen(true);
      } catch (error) {
        console.error('Erreur récupération conversation:', error);
        toast.error('Erreur lors de la récupération de la conversation');
      }
    } else {
      // Contexte : liste des conversations -> modale complète
      setIsModalOpen(true);
    }
  };

  const handleQuickLinkConfirm = (config: QuickLinkConfig) => {
    if (pendingConversationId) {
      createQuickLink(pendingConversationId, config);
      // Ne PAS fermer le modal ici - il restera ouvert pour afficher l'étape 2
      // setIsQuickConfigModalOpen(false);
    }
  };

  const handleQuickConfigClose = () => {
    setIsQuickConfigModalOpen(false);
    setPendingConversationId(null);
    setQuickLinkDefaultTitle('');
    setCreatedLinkData(null); // Reset le lien créé
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={isCreating}
        className={className}
      >
        {children || (
          <>
            <Link2 className="h-4 w-4 mr-2" />
            {isCreating ? 'Création...' : 'Créer un lien'}
          </>
        )}
      </Button>

      <CreateLinkModalV2
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLinkCreated={handleLinkCreated}
        preGeneratedLink={generatedLink || undefined}
        preGeneratedToken={generatedToken || undefined}
      />

      <QuickLinkConfigModal
        isOpen={isQuickConfigModalOpen}
        onClose={handleQuickConfigClose}
        onConfirm={handleQuickLinkConfirm}
        defaultTitle={quickLinkDefaultTitle}
        isCreating={isCreating}
        createdLink={createdLinkData}
      />

      {linkSummaryData && (
        <LinkSummaryModal
          isOpen={isSummaryModalOpen}
          onClose={handleSummaryModalClose}
          linkData={linkSummaryData}
        />
      )}
    </>
  );
}
