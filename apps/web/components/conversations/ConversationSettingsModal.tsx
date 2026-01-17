'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
 * Modal moderne et responsive pour configurer une conversation
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

  // Obtenir l'icône d'encryption
  const getEncryptionIcon = (mode: string) => {
    switch (mode) {
      case 'e2ee':
        return <Lock className="h-4 w-4 text-green-600" />;
      case 'hybrid':
        return <LockOpen className="h-4 w-4 text-yellow-600" />;
      case 'server':
        return <Key className="h-4 w-4 text-blue-600" />;
      default:
        return <Globe className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col",
          "w-[calc(100vw-2rem)] p-0"
        )}
        style={{ overscrollBehavior: 'contain' }}
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={conversation.image || conversation.avatar} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {(conversation.title || 'C')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">
                {t('conversationDetails.title') || 'Paramètres de la conversation'}
              </DialogTitle>
              <DialogDescription className="truncate">
                {conversation.title || t('conversationDetails.conversation')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-6">
            <TabsList className="w-full grid grid-cols-2 h-10">
              <TabsTrigger value="preferences" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t('conversationDetails.myPreferences') || 'Mes préférences'}
                </span>
                <span className="sm:hidden">Préférences</span>
              </TabsTrigger>
              {canAccessAdminSettings && (
                <TabsTrigger value="config" className="gap-2">
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
            <TabsContent value="preferences" className="mt-4 space-y-6 focus-visible:outline-none">
              {isLoadingPrefs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Section Organisation */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      {t('conversationDetails.organization') || 'Organisation'}
                    </h3>

                    <div className="space-y-3">
                      {/* Épingler */}
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-full",
                            isPinned ? "bg-amber-100 dark:bg-amber-900/30" : "bg-muted"
                          )}>
                            <Pin className={cn(
                              "h-4 w-4",
                              isPinned ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                            )} />
                          </div>
                          <div>
                            <p className="font-medium">{t('conversationHeader.pin') || 'Épingler'}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('conversationDetails.pinDescription') || 'Garder en haut de la liste'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isPinned}
                          onCheckedChange={setIsPinned}
                          aria-label={t('conversationHeader.pin')}
                        />
                      </div>

                      {/* Notifications */}
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-full",
                            isMuted ? "bg-red-100 dark:bg-red-900/30" : "bg-muted"
                          )}>
                            <BellOff className={cn(
                              "h-4 w-4",
                              isMuted ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                            )} />
                          </div>
                          <div>
                            <p className="font-medium">{t('conversationHeader.mute') || 'Silencieux'}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('conversationDetails.muteDescription') || 'Désactiver les notifications'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isMuted}
                          onCheckedChange={setIsMuted}
                          aria-label={t('conversationHeader.mute')}
                        />
                      </div>

                      {/* Archiver */}
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-full",
                            isArchived ? "bg-gray-200 dark:bg-gray-700" : "bg-muted"
                          )}>
                            <Archive className={cn(
                              "h-4 w-4",
                              isArchived ? "text-gray-600 dark:text-gray-300" : "text-muted-foreground"
                            )} />
                          </div>
                          <div>
                            <p className="font-medium">{t('conversationHeader.archive') || 'Archiver'}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('conversationDetails.archiveDescription') || 'Masquer de la liste principale'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isArchived}
                          onCheckedChange={setIsArchived}
                          aria-label={t('conversationHeader.archive')}
                        />
                      </div>

                      {/* Catégorie */}
                      <div className="p-3 rounded-lg border bg-card space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-muted">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{t('conversationDetails.category') || 'Catégorie'}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('conversationDetails.categoryDescription') || 'Organiser par catégorie'}
                            </p>
                          </div>
                        </div>
                        <Select
                          value={selectedCategoryId || 'none'}
                          onValueChange={(v) => setSelectedCategoryId(v === 'none' ? null : v)}
                        >
                          <SelectTrigger className="w-full">
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
                      </div>
                    </div>
                  </div>

                  {/* Section Personnalisation */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      {t('conversationDetails.customization') || 'Personnalisation'}
                    </h3>

                    {/* Nom personnalisé */}
                    <div className="space-y-2">
                      <Label htmlFor="customName" className="flex items-center gap-2">
                        <Pencil className="h-4 w-4" />
                        {t('conversationDetails.customName') || 'Nom personnalisé'}
                      </Label>
                      <Input
                        id="customName"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder={t('conversationDetails.customNamePlaceholder') || 'Entrez un nom...'}
                        className="bg-background"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('conversationDetails.customNameHelp') || 'Visible uniquement par vous'}
                      </p>
                    </div>

                    {/* Réaction */}
                    <div className="space-y-2">
                      <Label htmlFor="reaction" className="flex items-center gap-2">
                        <Smile className="h-4 w-4" />
                        {t('conversationDetails.reaction') || 'Réaction'}
                      </Label>
                      <Input
                        id="reaction"
                        value={reaction}
                        onChange={(e) => setReaction(e.target.value)}
                        placeholder="😀"
                        maxLength={2}
                        className="bg-background w-20 text-center text-xl"
                      />
                    </div>

                    {/* Tags */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        {t('conversationDetails.personalTags') || 'Tags personnels'}
                      </Label>
                      <div className="flex flex-wrap gap-2 min-h-[2rem]">
                        {tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="gap-1 pr-1"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                              aria-label={`Supprimer le tag ${tag}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {tags.length === 0 && (
                          <span className="text-sm text-muted-foreground">
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
                          className="flex-1 bg-background"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={addTag}
                          disabled={!newTag.trim()}
                          aria-label="Ajouter le tag"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Bouton Sauvegarder */}
                  <Button
                    onClick={savePreferences}
                    disabled={isSavingPrefs}
                    className="w-full"
                  >
                    {isSavingPrefs ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('conversationDetails.saving') || 'Enregistrement...'}
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        {t('conversationDetails.savePreferences') || 'Enregistrer mes préférences'}
                      </>
                    )}
                  </Button>
                </>
              )}
            </TabsContent>

            {/* Onglet Configuration Admin */}
            {canAccessAdminSettings && (
              <TabsContent value="config" className="mt-4 space-y-6 focus-visible:outline-none">
                {/* Informations de base */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {t('conversationDetails.basicInfo') || 'Informations'}
                  </h3>

                  {/* Titre */}
                  <div className="space-y-2">
                    <Label htmlFor="convTitle">
                      {t('conversationDetails.conversationName') || 'Nom de la conversation'}
                    </Label>
                    <Input
                      id="convTitle"
                      value={convTitle}
                      onChange={(e) => setConvTitle(e.target.value)}
                      placeholder={t('conversationDetails.namePlaceholder') || 'Entrez un nom...'}
                      className="bg-background"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="convDescription">
                      {t('conversationDetails.description') || 'Description'}
                    </Label>
                    <Textarea
                      id="convDescription"
                      value={convDescription}
                      onChange={(e) => setConvDescription(e.target.value)}
                      placeholder={t('conversationDetails.descriptionPlaceholder') || 'Ajoutez une description...'}
                      className="bg-background min-h-[80px] resize-none"
                    />
                  </div>
                </div>

                {/* Sécurité */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    {t('conversationDetails.security') || 'Sécurité'}
                  </h3>

                  {/* Mode d'encryption */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      {t('conversationDetails.encryptionMode') || 'Mode de chiffrement'}
                    </Label>
                    <Select
                      value={encryptionMode || 'none'}
                      onValueChange={(v) => setEncryptionMode(v === 'none' ? '' : v as any)}
                    >
                      <SelectTrigger className="w-full">
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
                    <p className="text-xs text-muted-foreground">
                      {encryptionMode === 'e2ee' && (t('conversationDetails.e2eeDescription') || 'Les messages sont chiffrés de bout en bout. Seuls les participants peuvent les lire.')}
                      {encryptionMode === 'hybrid' && (t('conversationDetails.hybridDescription') || 'Chiffrement côté serveur avec clés partagées.')}
                      {encryptionMode === 'server' && (t('conversationDetails.serverDescription') || 'Les messages sont chiffrés sur le serveur.')}
                      {!encryptionMode && (t('conversationDetails.noEncryptionDescription') || 'Les messages ne sont pas chiffrés.')}
                    </p>
                  </div>
                </div>

                {/* Statut actuel */}
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <h4 className="text-sm font-medium">
                    {t('conversationDetails.currentStatus') || 'Statut actuel'}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1">
                      {conversation.isGroup ? (
                        <>{t('conversationDetails.groupConversation') || 'Groupe'}</>
                      ) : (
                        <>{t('conversationDetails.directConversation') || 'Direct'}</>
                      )}
                    </Badge>
                    {conversation.participants && (
                      <Badge variant="outline">
                        {conversation.participants.length} {t('conversationUI.members') || 'membres'}
                      </Badge>
                    )}
                    {(conversation as any).encryptionMode && (
                      <Badge variant="outline" className="gap-1">
                        {getEncryptionIcon((conversation as any).encryptionMode)}
                        {(conversation as any).encryptionMode.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Bouton Sauvegarder */}
                <Button
                  onClick={saveConfiguration}
                  disabled={isSavingConfig}
                  className="w-full"
                >
                  {isSavingConfig ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('conversationDetails.saving') || 'Enregistrement...'}
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {t('conversationDetails.saveConfig') || 'Enregistrer la configuration'}
                    </>
                  )}
                </Button>
              </TabsContent>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default ConversationSettingsModal;
