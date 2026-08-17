'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, CheckCircle2, LogIn, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoginForm } from '@/components/auth/login-form';
import { RegisterForm } from '@/components/auth/register-form';
import { AnonymousForm } from '@/components/join';
import { useI18n } from '@/hooks/useI18n';
import { useJoinFlow } from '@/hooks/use-join-flow';
import { useUsernameValidation } from '@/hooks/use-link-validation';
import { useConversationJoin } from '@/hooks/use-conversation-join';
import { useAuth } from '@/hooks/use-auth';
import type { LinkConversationData } from '@/services/link-conversation.service';

/**
 * La modale qui remplace la page `/join/:linkId`.
 *
 * Le lien de partage n'envoie plus vers un écran d'accueil séparé : il ouvre la
 * conversation, et c'est CETTE modale qui se pose par-dessus quand le visiteur
 * n'a pas encore d'identité. Tout le contenu de l'ancienne page vit ici —
 * connexion, création de compte, et le formulaire de compte anonyme avec ses
 * règles `require*`.
 *
 * Trois portes, dans cet ordre de friction croissante :
 *   1. rejoindre en anonyme (sauf si le lien exige un compte) ;
 *   2. se connecter ;
 *   3. créer un compte.
 *
 * Un compte DÉJÀ connecté mais non membre ne voit aucune de ces portes : juste
 * « Rejoindre » sous son identité.
 */
type JoinStep = 'choice' | 'login' | 'signup' | 'anonymous';

interface JoinConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkId: string;
  link: LinkConversationData['link'];
  conversation: LinkConversationData['conversation'];
  /** `registered` = compte connecté non encore membre. */
  identity: 'none' | 'registered';
  currentUserName?: string;
  /** Le lien autorise-t-il de lire la conversation sans rejoindre ? */
  canDismiss: boolean;
  onJoined: () => void;
}

export function JoinConversationModal({
  open,
  onOpenChange,
  linkId,
  link,
  conversation,
  identity,
  currentUserName,
  canDismiss,
  onJoined,
}: JoinConversationModalProps) {
  const { t } = useI18n('joinPage');
  const { isAnonymous, joinAnonymously: registerAnonymousSession } = useAuth();
  const [step, setStep] = useState<JoinStep>('choice');

  const {
    anonymousForm,
    updateAnonymousForm,
    generateUsername,
  } = useJoinFlow();
  const usernameCheckStatus = useUsernameValidation(anonymousForm.username);
  const { isJoining, joinAnonymously, joinAsAuthenticated } = useConversationJoin(linkId);

  const handleJoinAnonymously = useCallback(async () => {
    await joinAnonymously(
      anonymousForm,
      registerAnonymousSession,
      generateUsername,
      link.requireNickname,
      link.requireEmail,
      link.requireBirthday
    );
  }, [
    anonymousForm,
    joinAnonymously,
    registerAnonymousSession,
    generateUsername,
    link.requireNickname,
    link.requireEmail,
    link.requireBirthday,
  ]);

  const handleJoinAsMember = useCallback(async () => {
    const sessionToken =
      typeof window !== 'undefined'
        ? (JSON.parse(localStorage.getItem('anonymous_session') || 'null') as { token?: string } | null)
            ?.token ?? null
        : null;

    await joinAsAuthenticated(isAnonymous, sessionToken);
    onJoined();
  }, [isAnonymous, joinAsAuthenticated, onJoined]);

  const handleAuthSuccess = useCallback(() => {
    // Le compte existe désormais : on repasse par la résolution d'accès, qui
    // décidera « membre » (vue complète) ou « visiteur identifié » (bouton
    // Rejoindre). Aucune navigation — on reste sur /chat/:linkId.
    setStep('choice');
    onJoined();
  }, [onJoined]);

  const title = conversation.title || link.name || t('joinConversation', 'Rejoindre la conversation');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !canDismiss) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] w-[min(100vw-2rem,32rem)] flex-col gap-0 overflow-hidden p-0"
        showCloseButton={canDismiss}
        onEscapeKeyDown={(event) => { if (!canDismiss) event.preventDefault(); }}
        onInteractOutside={(event) => { if (!canDismiss) event.preventDefault(); }}
      >
        <div className="shrink-0 border-b px-6 pb-4 pt-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {link.description || t('chooseHowToJoin')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step !== 'choice' && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-3 -ml-2"
              onClick={() => setStep('choice')}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t('back', 'Retour')}
            </Button>
          )}

          {step === 'choice' && identity === 'registered' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  {t('connectedAs')} {currentUserName}
                </p>
              </div>
              <Button size="lg" className="w-full" disabled={isJoining} onClick={handleJoinAsMember}>
                {isJoining ? `${t('joinButton')}…` : t('joinButton')}
              </Button>
            </div>
          )}

          {step === 'choice' && identity === 'none' && (
            <div className="space-y-4">
              {link.requireAccount ? (
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 text-center dark:border-blue-800 dark:bg-blue-950/20">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {t('accountRequired')}
                  </p>
                  <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                    {t('accountRequiredDescription')}
                  </p>
                </div>
              ) : (
                <Button size="lg" className="w-full" onClick={() => setStep('anonymous')}>
                  <UserMinus className="mr-2 h-4 w-4" />
                  {t('joinAnonymously')}
                </Button>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t('orWithAccount')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="lg" onClick={() => setStep('login')}>
                  <LogIn className="mr-2 h-4 w-4" />
                  {t('signIn')}
                </Button>
                <Button size="lg" onClick={() => setStep('signup')}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t('signUp')}
                </Button>
              </div>
            </div>
          )}

          {step === 'login' && <LoginForm onSuccess={handleAuthSuccess} />}

          {step === 'signup' && (
            <RegisterForm
              linkId={linkId}
              onSuccess={handleAuthSuccess}
              onJoinSuccess={handleAuthSuccess}
              formPrefix="join-modal-register"
            />
          )}

          {step === 'anonymous' && (
            <AnonymousForm
              formData={anonymousForm}
              usernameCheckStatus={usernameCheckStatus}
              requireNickname={link.requireNickname}
              requireEmail={link.requireEmail}
              requireBirthday={link.requireBirthday}
              isJoining={isJoining}
              onUpdateForm={updateAnonymousForm}
              onSubmit={handleJoinAnonymously}
              onBack={() => setStep('choice')}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
