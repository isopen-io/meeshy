'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import { userPreferencesService } from '@/services/user-preferences.service';
import { conversationsService } from '@/services/conversations.service';
import type { Conversation, ConversationParticipant } from '@meeshy/shared/types';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';

// Rôles qui peuvent accéder à la configuration admin
const ADMIN_ROLES = ['ADMIN', 'MODERATOR', 'BIGBOSS', 'CREATOR', 'AUDIT', 'ANALYST', 'admin', 'moderator'];

interface ConversationSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  currentUserRole?: string;
  onConversationUpdate?: (conversation: Conversation) => void;
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
  currentUserRole = 'MEMBER',
  onConversationUpdate,
}: ConversationSettingsModalProps) {
  const { t } = useI18n('conversations');
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const [isSavingConfig, setIsSavingConfig] = useState(false);

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

  // Sauvegarder la configuration admin
  const saveConfiguration = async () => {
    setIsSavingConfig(true);
    try {
      const updatedConv = await conversationsService.updateConversation(conversation.id, {
        title: convTitle.trim(),
        description: convDescription.trim(),
        ...(encryptionMode && { encryptionMode }),
      });
      onConversationUpdate?.(updatedConv);
      toast.success(t('conversationDetails.configSaved') || 'Configuration enregistrée');
    } catch (error) {
      console.error('Erreur sauvegarde configuration:', error);
      toast.error(t('conversationDetails.configError') || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSavingConfig(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-[650px] max-h-[90vh] overflow-hidden flex flex-col",
          "w-[calc(100vw-2rem)] p-0",
          "bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950",
          "border border-white/20 dark:border-gray-700/30"
        )}
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* Header glassmorphism */}
        <DialogHeader className="px-6 pt-6 pb-4 backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-b border-white/30 dark:border-gray-700/40">
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
              <DialogTitle className="truncate text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                {t('conversationDetails.title') || 'Paramètres de la conversation'}
              </DialogTitle>
              <DialogDescription className="truncate text-sm">
                {conversation.title || t('conversationDetails.conversation')}
              </DialogDescription>
            </div>
            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          </motion.div>
        </DialogHeader>

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
                <span className="hidden sm:inline">
                  {t('conversationDetails.myPreferences') || 'Mes préférences'}
                </span>
                <span className="sm:hidden">Préférences</span>
              </TabsTrigger>
              {canAccessAdminSettings && (
                <TabsTrigger
                  value="config"
                  className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white transition-all duration-200"
                >
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t('conversationDetails.configuration') || 'Configuration'}
                  </span>
                  <span className="sm:hidden">Config</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
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
                          {t('conversationDetails.savePreferences') || 'Enregistrer mes préférences'}
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

                  {/* Titre */}
                  <div className="space-y-2 p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40">
                    <Label htmlFor="convTitle" className="font-semibold">
                      {t('conversationDetails.conversationName') || 'Nom de la conversation'}
                    </Label>
                    <Input
                      id="convTitle"
                      value={convTitle}
                      onChange={(e) => setConvTitle(e.target.value)}
                      placeholder={t('conversationDetails.namePlaceholder') || 'Entrez un nom...'}
                      className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2 p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40">
                    <Label htmlFor="convDescription" className="font-semibold">
                      {t('conversationDetails.description') || 'Description'}
                    </Label>
                    <Textarea
                      id="convDescription"
                      value={convDescription}
                      onChange={(e) => setConvDescription(e.target.value)}
                      placeholder={t('conversationDetails.descriptionPlaceholder') || 'Ajoutez une description...'}
                      className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40 min-h-[100px] resize-none"
                    />
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
                      {encryptionMode === 'e2ee' && (t('conversationDetails.e2eeDescription') || 'Les messages sont chiffrés de bout en bout. Seuls les participants peuvent les lire.')}
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

                {/* Bouton Sauvegarder */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={saveConfiguration}
                    disabled={isSavingConfig}
                    className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg shadow-purple-500/30"
                  >
                    {isSavingConfig ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {t('conversationDetails.saving') || 'Enregistrement...'}
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-5 w-5" />
                        {t('conversationDetails.saveConfig') || 'Enregistrer la configuration'}
                      </>
                    )}
                  </Button>
                </motion.div>
              </TabsContent>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default ConversationSettingsModal;
