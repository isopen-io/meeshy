'use client';

import { CheckCircle, ExternalLink, LogIn, UserPlus, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LoginForm } from '@/components/auth/login-form';
import { useI18n } from '@/hooks/useI18n';
import { User } from '@meeshy/shared/types';
import { AuthMode } from '@/types';

interface JoinActionsProps {
  currentUser: User | null;
  isJoining: boolean;
  authMode: AuthMode;
  requireAccount?: boolean;
  onAuthModeChange: (mode: AuthMode) => void;
  onJoinConversation: () => void;
  onShowAnonymousForm: () => void;
  onAuthSuccess: (user: User, token: string) => void;
}

export function JoinActions({
  currentUser,
  isJoining,
  authMode,
  requireAccount,
  onAuthModeChange,
  onJoinConversation,
  onShowAnonymousForm,
  onAuthSuccess
}: JoinActionsProps) {
  const { t } = useI18n('joinPage');

  if (currentUser) {
    return (
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
          onClick={onJoinConversation}
          disabled={isJoining}
          size="lg"
          className="w-full"
        >
          {isJoining ? `${t('joinButton')}...` : t('joinButton')}
          <ExternalLink className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center text-gray-600 dark:text-gray-400">
        <p className="mb-4">{t('chooseHowToJoin')}</p>
      </div>

      <div className="space-y-4">
        {!requireAccount && (
          <>
            <div className="grid grid-cols-1 gap-3">
              <Button
                size="lg"
                className="w-full"
                onClick={onShowAnonymousForm}
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

        {requireAccount && (
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
          <Dialog open={authMode === 'login'} onOpenChange={(open) => onAuthModeChange(open ? 'login' : 'welcome')}>
            <DialogTrigger asChild>
              <Button variant="outline" size="lg">
                <LogIn className="h-4 w-4 mr-2" />
                {t('signIn')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b shrink-0">
                <DialogHeader>
                  <DialogTitle>{t('signIn')}</DialogTitle>
                  <DialogDescription>
                    {t('signInToJoin')}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="flex-1 overflow-y-auto px-6 min-h-0 py-4">
                <LoginForm onSuccess={onAuthSuccess} />
              </div>
            </DialogContent>
          </Dialog>

          <Button size="lg" asChild>
            <a href="/signup">
              <UserPlus className="h-4 w-4 mr-2" />
              {t('signUp')}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
