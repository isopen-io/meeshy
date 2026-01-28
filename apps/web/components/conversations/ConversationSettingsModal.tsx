'use client';

import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Settings,
  User,
  Pin,
  BellOff,
  Archive,
  Tag,
  Smile,
  Lock,
  LockOpen,
  Key,
  Globe,
  Image as ImageIcon,
  X,
  Check,
  Loader2,
  FolderOpen,
  Pencil,
  Sparkles,
  Shield,
  Users,
  Languages,
  Link2,
  Info,
  Upload,
  ImagePlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import { userPreferencesService } from '@/services/user-preferences.service';
import { conversationsService } from '@/services/conversations.service';
import type { Conversation, ConversationParticipant, Message } from '@meeshy/shared/types';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';
import { AttachmentService } from '@/services/attachmentService';
import {
  FoldableSection,
  LanguageIndicators,
  SidebarLanguageHeader,
} from '@/lib/bubble-stream-modules';

// Hooks
import { useConversationStats } from '@/hooks/use-conversation-stats';
import { useParticipantManagement } from '@/hooks/use-participant-management';

// Composants lazy-loaded du details-sidebar
const TagsManager = lazy(() =>
  import('./details-sidebar/TagsManager').then(m => ({ default: m.TagsManager }))
);
const CategorySelector = lazy(() =>
  import('./details-sidebar/CategorySelector').then(m => ({ default: m.CategorySelector }))
);
const CustomizationManager = lazy(() =>
  import('./details-sidebar/CustomizationManager').then(m => ({ default: m.CustomizationManager }))
);
const ActiveUsersSection = lazy(() =>
  import('./details-sidebar/ActiveUsersSection').then(m => ({ default: m.ActiveUsersSection }))
);
const ShareLinksSection = lazy(() =>
  import('./details-sidebar/ShareLinksSection').then(m => ({ default: m.ShareLinksSection }))
);

// Dialog upload image
import { ConversationImageUploadDialog } from './conversation-image-upload-dialog';

// Rôles qui peuvent accéder à la configuration admin
const ADMIN_ROLES = ['ADMIN', 'MODERATOR', 'BIGBOSS', 'CREATOR', 'AUDIT', 'ANALYST', 'admin', 'moderator'];

interface ConversationSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  currentUser: any; // User from shared/types
  messages?: Message[]; // Pour les stats de langues
  currentUserRole?: string;
  onConversationUpdate?: (conversation: Conversation) => void;
  onOpenParticipantsDrawer?: () => void; // Callback pour ouvrir le drawer participants
}

/**
 * Modal moderne avec glassmorphism pour configurer une conversation
 * - Onglet "Mes préférences" : préférences personnelles (visible à tous)
 * - Onglet "Configuration" : paramètres de la conversation (visible aux admins/modérateurs)
 */
export function ConversationSettingsModal({
  open,
  onOpenChange,
  conversation,
  currentUser,
  messages = [],
  currentUserRole = 'MEMBER',
  onConversationUpdate,
  onOpenParticipantsDrawer,
}: ConversationSettingsModalProps) {
  const { t } = useI18n('conversations');
  const router = useRouter();
  const searchParams = useSearchParams();

  // Hooks pour les stats et la gestion des participants
  const { isAdmin, canModifyImage } = useParticipantManagement(conversation, currentUser);
  const { messageLanguageStats, activeLanguageStats, activeUsers } = useConversationStats(
    conversation,
    messages,
    currentUser
  );

  // Déterminer si l'utilisateur peut accéder aux paramètres admin
  const canAccessAdminSettings = useMemo(() => {
    return ADMIN_ROLES.includes(currentUserRole.toUpperCase()) ||
           ADMIN_ROLES.includes(currentUserRole.toLowerCase());
  }, [currentUserRole]);

  // État des tabs synchronisé avec l'URL
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('settings-tab');
    if (tab === 'config' && canAccessAdminSettings) return 'config';
    return 'preferences';
  });

  // Synchroniser l'URL avec le tab actif
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set('settings-tab', value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // États des préférences utilisateur
  const [preferences, setPreferences] = useState<UserConversationPreferences | null>(null);
  const [categories, setCategories] = useState<UserConversationCategory[]>([]);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // États locaux pour les préférences
  const [isPinned, setIsPinned] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [customName, setCustomName] = useState('');
  const [reaction, setReaction] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // États pour la configuration admin
  const [convTitle, setConvTitle] = useState(conversation.title || '');
  const [convDescription, setConvDescription] = useState(conversation.description || '');
  const [encryptionMode, setEncryptionMode] = useState<'e2ee' | 'hybrid' | 'server' | ''>(
    (conversation as any).encryptionMode || ''
  );

  // États pour l'édition inline avec X et ✓
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(conversation.title || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(conversation.description || '');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // États pour l'upload d'image et bannière
  const [isImageUploadDialogOpen, setIsImageUploadDialogOpen] = useState(false);
  const [isBannerUploadDialogOpen, setIsBannerUploadDialogOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  // Charger les préférences utilisateur
  useEffect(() => {
    if (open && conversation.id) {
      loadPreferences();
      loadCategories();
    }
  }, [open, conversation.id]);

  const loadPreferences = async () => {
    setIsLoadingPrefs(true);
    try {
      const prefs = await userPreferencesService.getPreferences(conversation.id);
      setPreferences(prefs);
      if (prefs) {
        setIsPinned(prefs.isPinned);
        setIsMuted(prefs.isMuted);
        setIsArchived(prefs.isArchived);
        setCustomName(prefs.customName || '');
        setReaction(prefs.reaction || '');
        setTags([...prefs.tags]);
        setSelectedCategoryId(prefs.categoryId || null);
      }
    } catch (error) {
      console.error('Erreur chargement préférences:', error);
    } finally {
      setIsLoadingPrefs(false);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await userPreferencesService.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  };

  // Sauvegarder les préférences utilisateur
  const savePreferences = async () => {
    setIsSavingPrefs(true);
    try {
      await userPreferencesService.upsertPreferences(conversation.id, {
        isPinned,
        isMuted,
        isArchived,
        customName: customName.trim() || null,
        reaction: reaction.trim() || null,
        tags,
        categoryId: selectedCategoryId,
      });
      toast.success(t('conversationDetails.preferencesSaved') || 'Préférences enregistrées');
    } catch (error) {
      console.error('Erreur sauvegarde préférences:', error);
      toast.error(t('conversationDetails.preferencesError') || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSavingPrefs(false);
    }
  };

  // Sauvegarder le titre inline
  const saveTitleInline = async () => {
    const trimmed = editedTitle.trim();
    if (!trimmed || trimmed === convTitle) {
      setIsEditingTitle(false);
      setEditedTitle(convTitle);
      return;
    }

    setIsSavingTitle(true);
    try {
      const updatedConv = await conversationsService.updateConversation(conversation.id, {
        title: trimmed,
      });
      setConvTitle(trimmed);
      onConversationUpdate?.(updatedConv);
      setIsEditingTitle(false);
      toast.success('Titre mis à jour');
    } catch (error) {
      console.error('Erreur sauvegarde titre:', error);
      toast.error('Erreur lors de la sauvegarde du titre');
    } finally {
      setIsSavingTitle(false);
    }
  };

  // Annuler l'édition du titre
  const cancelTitleEdit = () => {
    setEditedTitle(convTitle);
    setIsEditingTitle(false);
  };

  // Sauvegarder la description inline
  const saveDescriptionInline = async () => {
    const trimmed = editedDescription.trim();
    if (trimmed === convDescription) {
      setIsEditingDescription(false);
      return;
    }

    setIsSavingDescription(true);
    try {
      const updatedConv = await conversationsService.updateConversation(conversation.id, {
        description: trimmed,
      });
      setConvDescription(trimmed);
      onConversationUpdate?.(updatedConv);
      setIsEditingDescription(false);
      toast.success('Description mise à jour');
    } catch (error) {
      console.error('Erreur sauvegarde description:', error);
      toast.error('Erreur lors de la sauvegarde de la description');
    } finally {
      setIsSavingDescription(false);
    }
  };

  // Annuler l'édition de la description
  const cancelDescriptionEdit = () => {
    setEditedDescription(convDescription);
    setIsEditingDescription(false);
  };

  // Gérer l'upload d'image de conversation
  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    try {
      const uploadResult = await AttachmentService.uploadFiles([file]);

      if (uploadResult.success && uploadResult.attachments.length > 0) {
        const imageUrl = uploadResult.attachments[0].fileUrl;
        const updatedData = { image: imageUrl, avatar: imageUrl };
        await conversationsService.updateConversation(conversation.id, updatedData);

        onConversationUpdate?.(updatedData as any);
        toast.success('Image mise à jour');
        setIsImageUploadDialogOpen(false);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Erreur lors de l\'upload de l\'image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Gérer l'upload de bannière de groupe
  const handleBannerUpload = async (file: File) => {
    setIsUploadingBanner(true);
    try {
      const uploadResult = await AttachmentService.uploadFiles([file]);

      if (uploadResult.success && uploadResult.attachments.length > 0) {
        const bannerUrl = uploadResult.attachments[0].fileUrl;
        const updatedData = { banner: bannerUrl };
        await conversationsService.updateConversation(conversation.id, updatedData);

        onConversationUpdate?.(updatedData as any);
        toast.success('Bannière mise à jour');
        setIsBannerUploadDialogOpen(false);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading banner:', error);
      toast.error('Erreur lors de l\'upload de la bannière');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  // Ajouter un tag
  const addTag = () => {
    const trimmedTag = newTag.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setNewTag('');
    }
  };

  // Supprimer un tag
  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  // Obtenir l'icône d'encryption avec gradient
  const getEncryptionIcon = (mode: string) => {
    switch (mode) {
      case 'e2ee':
        return <Lock className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'hybrid':
        return <LockOpen className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
      case 'server':
        return <Key className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      default:
        return <Globe className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[400px] sm:w-[500px] p-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 border-r border-white/20 dark:border-gray-700/30"
      >
        {/* Header avec effet glassmorphism */}
        <SheetHeader className="px-6 py-4 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-b border-white/30 dark:border-gray-700/40">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <Avatar className="h-12 w-12 border-2 border-white dark:border-gray-800 shadow-lg">
              <AvatarImage src={conversation.image || conversation.avatar} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-lg">
                {(conversation.title || 'C')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="truncate text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                {t('conversationDetails.title') || 'Paramètres'}
              </SheetTitle>
              <SheetDescription className="truncate text-sm">
                {conversation.title || t('conversationDetails.conversation')}
              </SheetDescription>
            </div>
          </motion.div>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex-1 flex flex-col min-h-0"
        >
          {/* Tabs avec style moderne */}
          <div className="px-6 pt-4">
            <TabsList className="w-full grid grid-cols-2 h-12 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40 p-1">
              <TabsTrigger
                value="preferences"
                className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white transition-all duration-200"
              >
                <User className="h-4 w-4" />
                {t('conversationDetails.myPreferences') || 'Préférences'}
              </TabsTrigger>
              {canAccessAdminSettings && (
                <TabsTrigger
                  value="config"
                  className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white transition-all duration-200"
                >
                  <Settings className="h-4 w-4" />
                  {t('conversationDetails.configuration') || 'Configuration'}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Contenu scrollable */}
          <ScrollArea className="flex-1 px-6 pb-6">
            {/* Onglet Préférences Utilisateur */}
            <TabsContent value="preferences" className="mt-6 space-y-6 focus-visible:outline-none">
              {isLoadingPrefs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                </div>
              ) : (
                <>
                  {/* Section Organisation */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-4"
                  >
                    <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      {t('conversationDetails.organization') || 'Organisation'}
                    </h3>

                    <div className="space-y-3">
                      {/* Épingler */}
                      <motion.div
                        whileHover={{ scale: 1.01 }}
                        className="flex items-center justify-between p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2.5 rounded-full transition-colors",
                            isPinned
                              ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30"
                              : "bg-gray-100 dark:bg-gray-800"
                          )}>
                            <Pin className={cn(
                              "h-4 w-4 transition-transform",
                              isPinned ? "text-white rotate-45" : "text-gray-600 dark:text-gray-400"
                            )} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{t('conversationHeader.pin') || 'Épingler'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t('conversationDetails.pinDescription') || 'Garder en haut de la liste'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isPinned}
                          onCheckedChange={setIsPinned}
                          aria-label={t('conversationHeader.pin')}
                          className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-amber-500 data-[state=checked]:to-orange-600"
                        />
                      </motion.div>

                      {/* Notifications */}
                      <motion.div
                        whileHover={{ scale: 1.01 }}
                        className="flex items-center justify-between p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2.5 rounded-full transition-colors",
                            isMuted
                              ? "bg-gradient-to-br from-red-400 to-rose-500 shadow-lg shadow-red-500/30"
                              : "bg-gray-100 dark:bg-gray-800"
                          )}>
                            <BellOff className={cn(
                              "h-4 w-4",
                              isMuted ? "text-white" : "text-gray-600 dark:text-gray-400"
                            )} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{t('conversationHeader.mute') || 'Silencieux'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t('conversationDetails.muteDescription') || 'Désactiver les notifications'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isMuted}
                          onCheckedChange={setIsMuted}
                          aria-label={t('conversationHeader.mute')}
                          className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-red-500 data-[state=checked]:to-rose-600"
                        />
                      </motion.div>

                      {/* Archiver */}
                      <motion.div
                        whileHover={{ scale: 1.01 }}
                        className="flex items-center justify-between p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2.5 rounded-full transition-colors",
                            isArchived
                              ? "bg-gradient-to-br from-gray-400 to-gray-600 shadow-lg shadow-gray-500/30"
                              : "bg-gray-100 dark:bg-gray-800"
                          )}>
                            <Archive className={cn(
                              "h-4 w-4",
                              isArchived ? "text-white" : "text-gray-600 dark:text-gray-400"
                            )} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{t('conversationHeader.archive') || 'Archiver'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t('conversationDetails.archiveDescription') || 'Masquer de la liste principale'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isArchived}
                          onCheckedChange={setIsArchived}
                          aria-label={t('conversationHeader.archive')}
                          className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-gray-500 data-[state=checked]:to-gray-700"
                        />
                      </motion.div>

                      {/* Catégorie */}
                      <motion.div
                        whileHover={{ scale: 1.01 }}
                        className="p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40 shadow-sm space-y-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-full bg-gradient-to-br from-purple-400 to-violet-500 shadow-lg shadow-purple-500/30">
                            <FolderOpen className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-sm">{t('conversationDetails.category') || 'Catégorie'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t('conversationDetails.categoryDescription') || 'Organiser par catégorie'}
                            </p>
                          </div>
                        </div>
                        <Select
                          value={selectedCategoryId || 'none'}
                          onValueChange={(v) => setSelectedCategoryId(v === 'none' ? null : v)}
                        >
                          <SelectTrigger className="w-full backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40">
                            <SelectValue placeholder={t('conversationDetails.selectCategory') || 'Sélectionner...'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {t('conversationDetails.noCategory') || 'Aucune catégorie'}
                            </SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                <span className="flex items-center gap-2">
                                  {cat.icon && <span>{cat.icon}</span>}
                                  {cat.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </motion.div>
                    </div>
                  </motion.div>

                  {/* Section Personnalisation */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4"
                  >
                    <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      {t('conversationDetails.customization') || 'Personnalisation'}
                    </h3>

                    {/* Nom personnalisé */}
                    <div className="space-y-2 p-4 rounded-xl backdrop-blur-xl bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200/50 dark:border-blue-800/30">
                      <Label htmlFor="customName" className="flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-100">
                        <Pencil className="h-4 w-4" />
                        {t('conversationDetails.customName') || 'Nom personnalisé'}
                      </Label>
                      <Input
                        id="customName"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder={t('conversationDetails.customNamePlaceholder') || 'Entrez un nom...'}
                        className="backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-blue-200/50 dark:border-blue-800/30 focus-visible:ring-blue-500"
                      />
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {t('conversationDetails.customNameHelp') || 'Visible uniquement par vous'}
                      </p>
                    </div>

                    {/* Réaction */}
                    <div className="space-y-2 p-4 rounded-xl backdrop-blur-xl bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/50 dark:border-amber-800/30">
                      <Label htmlFor="reaction" className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-100">
                        <Smile className="h-4 w-4" />
                        {t('conversationDetails.reaction') || 'Réaction'}
                      </Label>
                      <Input
                        id="reaction"
                        value={reaction}
                        onChange={(e) => setReaction(e.target.value)}
                        placeholder="😀"
                        maxLength={2}
                        className="backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-amber-200/50 dark:border-amber-800/30 w-24 text-center text-2xl focus-visible:ring-amber-500"
                      />
                    </div>

                    {/* Tags */}
                    <div className="space-y-3 p-4 rounded-xl backdrop-blur-xl bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200/50 dark:border-green-800/30">
                      <Label className="flex items-center gap-2 font-semibold text-green-900 dark:text-green-100">
                        <Tag className="h-4 w-4" />
                        {t('conversationDetails.personalTags') || 'Tags personnels'}
                      </Label>
                      <div className="flex flex-wrap gap-2 min-h-[2rem]">
                        <AnimatePresence mode="popLayout">
                          {tags.map((tag) => (
                            <motion.div
                              key={tag}
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              layout
                            >
                              <Badge
                                variant="secondary"
                                className="gap-1 pr-1 bg-white/80 dark:bg-gray-900/80 border-green-200 dark:border-green-800"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => removeTag(tag)}
                                  className="ml-1 rounded-full p-0.5 hover:bg-red-500/20 transition-colors"
                                  aria-label={`Supprimer le tag ${tag}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {tags.length === 0 && (
                          <span className="text-sm text-green-700 dark:text-green-300">
                            {t('conversationDetails.noTags') || 'Aucun tag'}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                          placeholder={t('conversationDetails.addTag') || 'Ajouter un tag...'}
                          className="flex-1 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-green-200/50 dark:border-green-800/30 focus-visible:ring-green-500"
                        />
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={addTag}
                            disabled={!newTag.trim()}
                            className="backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-green-200/50 dark:border-green-800/30 hover:bg-green-500 hover:text-white"
                            aria-label="Ajouter le tag"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Bouton Sauvegarder */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={savePreferences}
                      disabled={isSavingPrefs}
                      className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/30"
                    >
                      {isSavingPrefs ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          {t('conversationDetails.saving') || 'Enregistrement...'}
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-5 w-5" />
                          {t('conversationDetails.savePreferences') || 'Enregistrer'}
                        </>
                      )}
                    </Button>
                  </motion.div>
                </>
              )}
            </TabsContent>

            {/* Onglet Configuration Admin */}
            {canAccessAdminSettings && (
              <TabsContent value="config" className="mt-6 space-y-6 focus-visible:outline-none">
                {/* Informations de base */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-4"
                >
                  <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t('conversationDetails.basicInfo') || 'Informations'}
                  </h3>

                  {/* Titre avec édition inline */}
                  <div className="space-y-2 p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40">
                    <Label className="font-semibold flex items-center gap-2">
                      <Pencil className="h-4 w-4" />
                      {t('conversationDetails.conversationName') || 'Nom'}
                    </Label>
                    {!isEditingTitle ? (
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-sm py-2">{convTitle || 'Sans titre'}</p>
                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditedTitle(convTitle);
                              setIsEditingTitle(true);
                            }}
                            className="h-8 w-8"
                            aria-label="Modifier le titre"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveTitleInline();
                            } else if (e.key === 'Escape') {
                              cancelTitleEdit();
                            }
                          }}
                          disabled={isSavingTitle}
                          autoFocus
                          className="flex-1 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40"
                        />
                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={cancelTitleEdit}
                            disabled={isSavingTitle}
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                            aria-label="Annuler"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={saveTitleInline}
                            disabled={isSavingTitle}
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                            aria-label="Valider"
                          >
                            {isSavingTitle ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                        </motion.div>
                      </div>
                    )}
                  </div>

                  {/* Description avec édition inline */}
                  <div className="space-y-2 p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40">
                    <Label className="font-semibold flex items-center gap-2">
                      <Pencil className="h-4 w-4" />
                      {t('conversationDetails.description') || 'Description'}
                    </Label>
                    {!isEditingDescription ? (
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-sm py-2 whitespace-pre-wrap">{convDescription || 'Aucune description'}</p>
                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditedDescription(convDescription);
                              setIsEditingDescription(true);
                            }}
                            className="h-8 w-8"
                            aria-label="Modifier la description"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Textarea
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.ctrlKey) {
                              e.preventDefault();
                              saveDescriptionInline();
                            } else if (e.key === 'Escape') {
                              cancelDescriptionEdit();
                            }
                          }}
                          disabled={isSavingDescription}
                          autoFocus
                          className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40 min-h-[100px] resize-none"
                        />
                        <div className="flex justify-end gap-2">
                          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={cancelDescriptionEdit}
                              disabled={isSavingDescription}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Annuler
                            </Button>
                          </motion.div>
                          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={saveDescriptionInline}
                              disabled={isSavingDescription}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                            >
                              {isSavingDescription ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4 mr-1" />
                              )}
                              Valider
                            </Button>
                          </motion.div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Sécurité */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-4"
                >
                  <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    {t('conversationDetails.security') || 'Sécurité'}
                  </h3>

                  {/* Mode d'encryption */}
                  <div className="space-y-3 p-4 rounded-xl backdrop-blur-xl bg-gradient-to-br from-purple-50/80 to-pink-50/80 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200/50 dark:border-purple-800/30">
                    <Label className="flex items-center gap-2 font-semibold text-purple-900 dark:text-purple-100">
                      <Lock className="h-4 w-4" />
                      {t('conversationDetails.encryptionMode') || 'Mode de chiffrement'}
                    </Label>
                    <Select
                      value={encryptionMode || 'none'}
                      onValueChange={(v) => setEncryptionMode(v === 'none' ? '' : v as any)}
                    >
                      <SelectTrigger className="w-full backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-purple-200/50 dark:border-purple-800/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-gray-400" />
                            {t('conversationDetails.noEncryption') || 'Aucun chiffrement'}
                          </span>
                        </SelectItem>
                        <SelectItem value="e2ee">
                          <span className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-green-600" />
                            {t('conversationDetails.e2ee') || 'Bout en bout (E2EE)'}
                          </span>
                        </SelectItem>
                        <SelectItem value="hybrid">
                          <span className="flex items-center gap-2">
                            <LockOpen className="h-4 w-4 text-yellow-600" />
                            {t('conversationDetails.hybrid') || 'Hybride'}
                          </span>
                        </SelectItem>
                        <SelectItem value="server">
                          <span className="flex items-center gap-2">
                            <Key className="h-4 w-4 text-blue-600" />
                            {t('conversationDetails.serverEncryption') || 'Serveur'}
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      {encryptionMode === 'e2ee' && (t('conversationDetails.e2eeDescription') || 'Les messages sont chiffrés de bout en bout.')}
                      {encryptionMode === 'hybrid' && (t('conversationDetails.hybridDescription') || 'Chiffrement côté serveur avec clés partagées.')}
                      {encryptionMode === 'server' && (t('conversationDetails.serverDescription') || 'Les messages sont chiffrés sur le serveur.')}
                      {!encryptionMode && (t('conversationDetails.noEncryptionDescription') || 'Les messages ne sont pas chiffrés.')}
                    </p>
                  </div>
                </motion.div>

                {/* Statut actuel */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="p-4 rounded-xl backdrop-blur-xl bg-gradient-to-br from-gray-50/80 to-slate-50/80 dark:from-gray-900/80 dark:to-slate-900/80 border border-gray-200/50 dark:border-gray-700/30 space-y-3"
                >
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {t('conversationDetails.currentStatus') || 'Statut actuel'}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1 backdrop-blur-sm bg-white/50 dark:bg-gray-800/50">
                      {conversation.isGroup ? (
                        <>{t('conversationDetails.groupConversation') || 'Groupe'}</>
                      ) : (
                        <>{t('conversationDetails.directConversation') || 'Direct'}</>
                      )}
                    </Badge>
                    {conversation.participants && (
                      <Badge variant="outline" className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50">
                        {conversation.participants.length} {t('conversationUI.members') || 'membres'}
                      </Badge>
                    )}
                    {(conversation as any).encryptionMode && (
                      <Badge variant="outline" className="gap-1 backdrop-blur-sm bg-white/50 dark:bg-gray-800/50">
                        {getEncryptionIcon((conversation as any).encryptionMode)}
                        {(conversation as any).encryptionMode.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </motion.div>
              </TabsContent>
            )}
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default ConversationSettingsModal;
