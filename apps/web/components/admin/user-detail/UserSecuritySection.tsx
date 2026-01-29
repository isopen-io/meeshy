'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Key, CheckCircle, XCircle, Unlock } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';

interface UserSecuritySectionProps {
  user: any;
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
  const formatDate = (date: Date | string | null) => {
    if (!date) return 'Jamais';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  const handleUnlockAccount = async () => {
    try {
      await apiService.post(`/admin/users/${userId}/unlock`);
      toast.success('Compte déverrouillé avec succès');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du déverrouillage');
    }
  };

  const handleToggle2FA = async () => {
    try {
      const has2FA = !!user.twoFactorEnabledAt;
      await apiService.post(`/admin/users/${userId}/${has2FA ? 'disable' : 'enable'}-2fa`);
      toast.success(`2FA ${has2FA ? 'désactivé' : 'activé'} avec succès`);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la modification 2FA');
    }
  };

  const isAccountLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  const has2FA = !!user.twoFactorEnabledAt;

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <Shield className="h-5 w-5" />
          <span>Sécurité & Authentification</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Account Lock Status */}
        <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm dark:text-gray-100">État du compte</h4>
            {isAccountLocked ? (
              <Badge variant="destructive" className="flex items-center space-x-1">
                <Lock className="h-3 w-3" />
                <span>Verrouillé</span>
              </Badge>
            ) : (
              <Badge variant="default" className="flex items-center space-x-1">
                <CheckCircle className="h-3 w-3" />
                <span>Déverrouillé</span>
              </Badge>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Tentatives échouées:</span>
              <span className="font-medium dark:text-gray-200">
                {user.failedLoginAttempts || 0}
              </span>
            </div>

            {isAccountLocked && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Verrouillé jusqu'à:</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {formatDate(user.lockedUntil)}
                  </span>
                </div>
                {user.lockedReason && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Raison:</span>
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
                  Déverrouiller le compte
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 2FA Status */}
        <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm dark:text-gray-100">
              Authentification à deux facteurs (2FA)
            </h4>
            {has2FA ? (
              <Badge variant="default" className="flex items-center space-x-1">
                <CheckCircle className="h-3 w-3" />
                <span>Activé</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center space-x-1">
                <XCircle className="h-3 w-3" />
                <span>Désactivé</span>
              </Badge>
            )}
          </div>

          {has2FA && (
            <div className="space-y-2 text-sm mb-3">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Activé le:</span>
                <span className="font-medium dark:text-gray-200">
                  {formatDate(user.twoFactorEnabledAt)}
                </span>
              </div>
              {user.twoFactorBackupCodes?.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Codes de secours:</span>
                  <span className="font-medium dark:text-gray-200">
                    {user.twoFactorBackupCodes.length} restants
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
            {has2FA ? 'Désactiver 2FA' : 'Activer 2FA'}
          </Button>
        </div>

        {/* Password Management */}
        <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
          <h4 className="font-semibold text-sm mb-3 dark:text-gray-100">Gestion du mot de passe</h4>

          <div className="space-y-2 text-sm mb-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Dernier changement:</span>
              <span className="font-medium dark:text-gray-200">
                {formatDate(user.lastPasswordChange)}
              </span>
            </div>

            {user.passwordResetAttempts > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Tentatives de reset:</span>
                  <span className="font-medium dark:text-gray-200">
                    {user.passwordResetAttempts}
                  </span>
                </div>
                {user.lastPasswordResetAttempt && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Dernière tentative:</span>
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
            Réinitialiser le mot de passe
          </Button>
        </div>

        {/* Device & Login Info */}
        {(user.lastLoginIp || user.lastLoginDevice || user.lastLoginLocation) && (
          <div className="p-4 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
            <h4 className="font-semibold text-sm mb-3 dark:text-gray-100">Dernière connexion</h4>

            <div className="space-y-2 text-sm">
              {user.lastLoginIp && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Adresse IP:</span>
                  <span className="font-mono text-xs font-medium dark:text-gray-200">
                    {user.lastLoginIp}
                  </span>
                </div>
              )}
              {user.lastLoginLocation && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Localisation:</span>
                  <span className="font-medium dark:text-gray-200">{user.lastLoginLocation}</span>
                </div>
              )}
              {user.lastLoginDevice && (
                <div className="flex flex-col space-y-1">
                  <span className="text-gray-600 dark:text-gray-400 text-xs">Appareil:</span>
                  <span className="font-mono text-xs text-gray-900 dark:text-gray-200 break-all">
                    {user.lastLoginDevice}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
