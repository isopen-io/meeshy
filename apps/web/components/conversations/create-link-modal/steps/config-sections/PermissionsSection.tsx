'use client';

import {
  MessageSquare,
  Shield,
  Image,
  FileText,
  Eye,
  UserPlus,
  Users,
  Settings,
  Calendar,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/hooks/useI18n';
import { SelectableSquare } from '../../components/SelectableSquare';

interface PermissionsSectionProps {
  isPermissionsOpen: boolean;
  setIsPermissionsOpen: (open: boolean) => void;
  requireAccount: boolean;
  allowAnonymousMessages: boolean;
  setAllowAnonymousMessages: (allow: boolean) => void;
  allowAnonymousImages: boolean;
  setAllowAnonymousImages: (allow: boolean) => void;
  allowAnonymousFiles: boolean;
  setAllowAnonymousFiles: (allow: boolean) => void;
  allowViewHistory: boolean;
  setAllowViewHistory: (allow: boolean) => void;
  setRequireAccount: (require: boolean) => void;
  requireNickname: boolean;
  setRequireNickname: (require: boolean) => void;
  requireEmail: boolean;
  setRequireEmail: (require: boolean) => void;
  requireBirthday: boolean;
  setRequireBirthday: (require: boolean) => void;
}

export function PermissionsSection({
  isPermissionsOpen,
  setIsPermissionsOpen,
  requireAccount,
  allowAnonymousMessages,
  setAllowAnonymousMessages,
  allowAnonymousImages,
  setAllowAnonymousImages,
  allowAnonymousFiles,
  setAllowAnonymousFiles,
  allowViewHistory,
  setAllowViewHistory,
  setRequireAccount,
  requireNickname,
  setRequireNickname,
  requireEmail,
  setRequireEmail,
  requireBirthday,
  setRequireBirthday
}: PermissionsSectionProps) {
  const { t } = useI18n('modals');

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsPermissionsOpen(!isPermissionsOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <MessageSquare className="h-4 w-4 mr-2" />
            <CardTitle className="text-lg">{t('createLinkModal.permissions.title')}</CardTitle>
          </div>
          {isPermissionsOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
        <CardDescription>{t('createLinkModal.permissions.description')}</CardDescription>
      </CardHeader>
      {isPermissionsOpen && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectableSquare
              checked={requireAccount ? true : allowAnonymousMessages}
              onChange={setAllowAnonymousMessages}
              label={t('createLinkModal.permissions.sendMessages.label')}
              description={t('createLinkModal.permissions.sendMessages.description')}
              icon={<MessageSquare className="w-4 h-4" />}
              disabled={requireAccount}
            />

            <SelectableSquare
              checked={requireAccount ? true : allowAnonymousImages}
              onChange={setAllowAnonymousImages}
              label={t('createLinkModal.permissions.shareImages.label')}
              description={t('createLinkModal.permissions.shareImages.description')}
              icon={<Image className="w-4 h-4" />}
              disabled={requireAccount}
            />

            <SelectableSquare
              checked={requireAccount ? true : allowAnonymousFiles}
              onChange={setAllowAnonymousFiles}
              label={t('createLinkModal.permissions.shareFiles.label')}
              description={t('createLinkModal.permissions.shareFiles.description')}
              icon={<FileText className="w-4 h-4" />}
              disabled={requireAccount}
            />

            <SelectableSquare
              checked={requireAccount ? true : allowViewHistory}
              onChange={setAllowViewHistory}
              label={t('createLinkModal.permissions.viewHistory.label')}
              description={t('createLinkModal.permissions.viewHistory.description')}
              icon={<Eye className="w-4 h-4" />}
              disabled={requireAccount}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center dark:text-gray-200">
              <Shield className="h-4 w-4 mr-2" />
              {t('createLinkModal.permissions.title')}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectableSquare
                checked={requireAccount}
                onChange={setRequireAccount}
                label={t('createLinkModal.permissions.requireAccount.label')}
                description={t('createLinkModal.permissions.requireAccount.description')}
                icon={<UserPlus className="w-4 h-4" />}
              />

              <SelectableSquare
                checked={requireAccount ? true : requireNickname}
                onChange={setRequireNickname}
                label={t('createLinkModal.permissions.requireNickname.label')}
                description={t('createLinkModal.permissions.requireNickname.description')}
                icon={<Users className="w-4 h-4" />}
                disabled={requireAccount}
              />

              <SelectableSquare
                checked={requireAccount ? true : requireEmail}
                onChange={setRequireEmail}
                label={t('createLinkModal.permissions.requireEmail.label')}
                description={t('createLinkModal.permissions.requireEmail.description')}
                icon={<Settings className="w-4 h-4" />}
                disabled={requireAccount}
              />

              <SelectableSquare
                checked={requireAccount ? true : requireBirthday}
                onChange={setRequireBirthday}
                label={t('createLinkModal.permissions.requireBirthday.label')}
                description={t('createLinkModal.permissions.requireBirthday.description')}
                icon={<Calendar className="w-4 h-4" />}
                disabled={requireAccount}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
