'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Key, CheckCircle, XCircle, Unlock } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';

interface UserSecuritySectionProps {
  user: unknown;
  userId: string;
  onUpdate: () => void;
  onResetPassword: () => void;
}

export function UserSecuritySection({
  user,
  userId,
  onUpdate,
  onResetPassword
}: UserSecuritySectionProps) {
  const { t, locale } = useI18n('admin');
  const { t: tCommon } = useI18n('common');

  const formatDate = (date: Date | string | null) => {
    if (!date) return tCommon('never');
    try {
      return new Date(date).toLocaleDateString(locale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } /* istanbul ignore next -- toLocaleDateString never throws in practice */ catch {
      return 'N/A';
    }
  };

  const handleUnlockAccount = async () => {
    try {
      await apiService.post(`/admin/users/${userId}/unlock`);
      toast.success(t('security.accountUnlocked'));
      onUpdate();
    } catch (error: unknown) {
      toast.error(error.message || t('usersDetail.statusChangeError'));
    }
  };

  const handleToggle2FA = async () => {
    try {
      const has2FA = !!user.twoFactorEnabledAt;
      await apiService.post(`/admin/users/${userId}/${has2FA ? 'disable' : 'enable'}-2fa`);
      toast.success(t(has2FA ? 'security.twoFactorDisabled' : 'security.twoFactorEnabled'));
      onUpdate();
    } catch (error: unknown) {
      toast.error(error.message || t('usersDetail.statusChangeError'));
    }
  };

  const isAccountLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  const has2FA = !!user.twoFactorEnabledAt;

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <Shield className="h-5 w-5" />
          <span>{t('usersDetail.securityTitle')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Account Lock Status */}
        <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm dark:text-gray-100">{t('usersDetail.accountStateTitle')}</h4>
            {isAccountLocked ? (
              <Badge variant="destructive" className="flex items-center space-x-1">
                <Lock className="h-3 w-3" />
                <span>{t('usersDetail.lockedBadge')}</span>
              </Badge>
            ) : (
              <Badge variant="default" className="flex items-center space-x-1">
                <CheckCircle className="h-3 w-3" />
                <span>{t('usersDetail.unlockedBadge')}</span>
              </Badge>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.failedAttempts')}</span>
              <span className="font-medium dark:text-gray-200">
                {user.failedLoginAttempts || 0}
              </span>
            </div>

            {isAccountLocked && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.lockedUntil')}</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {formatDate(user.lockedUntil)}
                  </span>
                </div>
                {user.lockedReason && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.lockedReason')}</span>
                    <span className="font-medium dark:text-gray-200">{user.lockedReason}</span>
                  </div>
                )}
                <Button
                  onClick={handleUnlockAccount}
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-200"
                >
                  <Unlock className="h-4 w-4 mr-2" />
                  {t('usersDetail.unlockButton')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 2FA Status */}
        <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm dark:text-gray-100">
              {t('usersDetail.twoFactorTitle')}
            </h4>
            {has2FA ? (
              <Badge variant="default" className="flex items-center space-x-1">
                <CheckCircle className="h-3 w-3" />
                <span>{t('usersDetail.twoFactorEnabledBadge')}</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center space-x-1">
                <XCircle className="h-3 w-3" />
                <span>{t('security.disabled')}</span>
              </Badge>
            )}
          </div>

          {has2FA && (
            <div className="space-y-2 text-sm mb-3">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.twoFactorEnabledDate')}</span>
                <span className="font-medium dark:text-gray-200">
                  {formatDate(user.twoFactorEnabledAt)}
                </span>
              </div>
              {user.twoFactorBackupCodes?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.backupCodesLabel')}</span>
                  <span className="font-medium dark:text-gray-200">
                    {t('usersDetail.backupCodesRemaining', { count: String(user.twoFactorBackupCodes.length) })}
                  </span>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleToggle2FA}
            variant="outline"
            size="sm"
            className="w-full dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-200"
          >
            <Key className="h-4 w-4 mr-2" />
            {has2FA ? t('security.disable2FA') : t('security.enable2FA')}
          </Button>
        </div>

        {/* Password Management */}
        <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
          <h4 className="font-semibold text-sm mb-3 dark:text-gray-100">{t('usersDetail.passwordTitle')}</h4>

          <div className="space-y-2 text-sm mb-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.lastPasswordChange')}</span>
              <span className="font-medium dark:text-gray-200">
                {formatDate(user.lastPasswordChange)}
              </span>
            </div>

            {user.passwordResetAttempts > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.resetAttempts')}</span>
                  <span className="font-medium dark:text-gray-200">
                    {user.passwordResetAttempts}
                  </span>
                </div>
                {user.lastPasswordResetAttempt && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.lastResetAttempt')}</span>
                    <span className="font-medium dark:text-gray-200">
                      {formatDate(user.lastPasswordResetAttempt)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <Button
            onClick={onResetPassword}
            variant="outline"
            size="sm"
            className="w-full dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-200"
          >
            <Key className="h-4 w-4 mr-2" />
            {t('usersDetail.resetPasswordButton')}
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}
