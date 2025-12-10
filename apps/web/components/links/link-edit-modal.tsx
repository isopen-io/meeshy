'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Link2,
  Calendar as CalendarIcon,
  MessageSquare,
  Image,
  FileText,
  Eye,
  Users,
  Mail,
  Hash,
  Shield,
  Cake
} from 'lucide-react';
import { ConversationLink } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';

interface LinkEditModalProps {
  link: ConversationLink;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function LinkEditModal({ link, isOpen, onClose, onUpdate }: LinkEditModalProps) {

  const { t } = useI18n('links');
  const [isLoading, setIsLoading] = useState(false);
  
  // États du formulaire
  const [formData, setFormData] = useState({
    name: link.name || '',
    description: link.description || '',
    maxUses: link.maxUses || undefined,
    expiresAt: link.expiresAt ? new Date(link.expiresAt) : undefined,
    allowAnonymousMessages: link.allowAnonymousMessages,
    allowAnonymousImages: link.allowAnonymousImages,
    allowAnonymousFiles: link.allowAnonymousFiles,
    allowViewHistory: link.allowViewHistory,
    requireAccount: link.requireAccount || false,
    requireNickname: link.requireNickname,
    requireEmail: link.requireEmail,
    requireBirthday: link.requireBirthday || false
  });

  // Quand requireAccount est activé, activer automatiquement toutes les permissions
  useEffect(() => {
    if (formData.requireAccount) {
      setFormData(prev => ({
        ...prev,
        allowAnonymousMessages: true,
        allowAnonymousFiles: true,
        allowAnonymousImages: true,
        allowViewHistory: true,
        requireEmail: true,
        requireBirthday: true
      }));
    }
  }, [formData.requireAccount]);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const token = authManager.getAuthToken();
      const response = await fetch(buildApiUrl(`/api/links/${link.linkId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          expiresAt: formData.expiresAt?.toISOString()
        })
      });

      if (response.ok) {
        toast.success(t('success.linkUpdated'));
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(error.message || t('errors.updateFailed'));
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      toast.error(t('errors.updateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] p-0 gap-0 flex flex-col sm:max-w-2xl sm:w-[90vw] sm:max-h-[85vh]">
        {/* Header fixe */}
        <DialogHeader className="flex-shrink-0 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t('edit.title')}
          </DialogTitle>
        </DialogHeader>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
          {/* Informations de base */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t('edit.linkName')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('edit.linkNamePlaceholder')}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">{t('edit.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('edit.descriptionPlaceholder')}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          {/* Limites d'utilisation */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center space-x-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <Label htmlFor="maxUses">{t('edit.maxUses')}</Label>
                  <p className="text-sm text-muted-foreground">{t('edit.maxUsesDescription')}</p>
                </div>
                <Input
                  id="maxUses"
                  type="number"
                  value={formData.maxUses || ''}
                  onChange={(e) => setFormData({ ...formData, maxUses: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="∞"
                  className="w-24"
                  min="1"
                />
              </div>

              <div className="flex items-center space-x-3">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <Label htmlFor="expiresAt">{t('edit.expiresAt')}</Label>
                  <p className="text-sm text-muted-foreground">{t('edit.expiresAtDescription')}</p>
                </div>
                <div className="relative w-[240px]">
                  <Input
                    id="expiresAt"
                    type="datetime-local"
                    value={formData.expiresAt ? formData.expiresAt.toISOString().slice(0, 16) : ''}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value) : null;
                      setFormData({ ...formData, expiresAt: date });
                    }}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full pl-10"
                  />
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permissions */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-medium mb-4">{t('edit.permissions')}</h3>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="allowMessages">{t('permissions.messages')}</Label>
                    <p className="text-sm text-muted-foreground">{t('permissions.messagesDescription')}</p>
                  </div>
                </div>
                <Switch
                  id="allowMessages"
                  checked={formData.requireAccount ? true : formData.allowAnonymousMessages}
                  onCheckedChange={(checked) => setFormData({ ...formData, allowAnonymousMessages: checked })}
                  disabled={formData.requireAccount}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Image className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="allowImages">{t('permissions.images')}</Label>
                    <p className="text-sm text-muted-foreground">{t('permissions.imagesDescription')}</p>
                  </div>
                </div>
                <Switch
                  id="allowImages"
                  checked={formData.requireAccount ? true : formData.allowAnonymousImages}
                  onCheckedChange={(checked) => setFormData({ ...formData, allowAnonymousImages: checked })}
                  disabled={formData.requireAccount}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="allowFiles">{t('permissions.files')}</Label>
                    <p className="text-sm text-muted-foreground">{t('permissions.filesDescription')}</p>
                  </div>
                </div>
                <Switch
                  id="allowFiles"
                  checked={formData.requireAccount ? true : formData.allowAnonymousFiles}
                  onCheckedChange={(checked) => setFormData({ ...formData, allowAnonymousFiles: checked })}
                  disabled={formData.requireAccount}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Eye className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="allowHistory">{t('permissions.viewHistory')}</Label>
                    <p className="text-sm text-muted-foreground">{t('permissions.viewHistoryDescription')}</p>
                  </div>
                </div>
                <Switch
                  id="allowHistory"
                  checked={formData.requireAccount ? true : formData.allowViewHistory}
                  onCheckedChange={(checked) => setFormData({ ...formData, allowViewHistory: checked })}
                  disabled={formData.requireAccount}
                />
              </div>
            </CardContent>
          </Card>

          {/* Exigences */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-medium mb-4">{t('edit.requirements')}</h3>

              {/* Require Account - mise en évidence */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Shield className="h-5 w-5 text-blue-600" />
                    <div>
                      <Label htmlFor="requireAccount" className="text-blue-900 dark:text-blue-100 font-semibold">
                        {t('requirements.account')}
                      </Label>
                      <p className="text-sm text-blue-700 dark:text-blue-300">{t('requirements.accountDescription')}</p>
                    </div>
                  </div>
                  <Switch
                    id="requireAccount"
                    checked={formData.requireAccount}
                    onCheckedChange={(checked) => setFormData({ ...formData, requireAccount: checked })}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Hash className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="requireNickname">{t('requirements.nickname')}</Label>
                    <p className="text-sm text-muted-foreground">{t('requirements.nicknameDescription')}</p>
                  </div>
                </div>
                <Switch
                  id="requireNickname"
                  checked={formData.requireAccount ? true : formData.requireNickname}
                  onCheckedChange={(checked) => setFormData({ ...formData, requireNickname: checked })}
                  disabled={formData.requireAccount}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="requireEmail">{t('requirements.email')}</Label>
                    <p className="text-sm text-muted-foreground">{t('requirements.emailDescription')}</p>
                  </div>
                </div>
                <Switch
                  id="requireEmail"
                  checked={formData.requireAccount ? true : formData.requireEmail}
                  onCheckedChange={(checked) => setFormData({ ...formData, requireEmail: checked })}
                  disabled={formData.requireAccount}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Cake className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="requireBirthday">{t('requirements.birthday')}</Label>
                    <p className="text-sm text-muted-foreground">{t('requirements.birthdayDescription')}</p>
                  </div>
                </div>
                <Switch
                  id="requireBirthday"
                  checked={formData.requireAccount ? true : formData.requireBirthday}
                  onCheckedChange={(checked) => setFormData({ ...formData, requireBirthday: checked })}
                  disabled={formData.requireAccount}
                />
              </div>
            </CardContent>
          </Card>
          </div>
        </div>

        {/* Footer fixe */}
        <DialogFooter className="flex-shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? t('actions.saving') : t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
