'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2, Mail, ArrowLeft } from 'lucide-react';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { useI18n } from '@/hooks/use-i18n';
import Link from 'next/link';

type VerificationStatus = 'loading' | 'success' | 'error' | 'expired' | 'invalid';

export default function VerifyEmailChangePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n('settings');

  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [newEmail, setNewEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('invalid');
      setErrorMessage(t('emailChange.verify.noToken', 'Token de vérification manquant'));
      return;
    }

    verifyEmailChange(token);
  }, [searchParams]);

  const verifyEmailChange = async (token: string) => {
    try {
      const authToken = authManager.getAuthToken();

      if (!authToken) {
        // User not logged in - redirect to login with return URL
        router.push(`/login?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }

      const response = await fetch(buildApiUrl('/users/me/verify-email-change'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ token })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setNewEmail(data.data.newEmail);
      } else {
        // Handle specific error cases
        if (data.error?.includes('expired') || data.error?.includes('expiré')) {
          setStatus('expired');
          setErrorMessage(t('emailChange.verify.expired', 'Le lien de vérification a expiré'));
        } else if (data.error?.includes('invalid') || data.error?.includes('invalide')) {
          setStatus('invalid');
          setErrorMessage(t('emailChange.verify.invalid', 'Le lien de vérification est invalide'));
        } else if (data.error?.includes('No pending') || data.error?.includes('attente')) {
          setStatus('invalid');
          setErrorMessage(t('emailChange.verify.noPending', 'Aucun changement d\'email en attente'));
        } else {
          setStatus('error');
          setErrorMessage(data.error || t('emailChange.verify.error', 'Erreur lors de la vérification'));
        }
      }
    } catch (error) {
      console.error('Error verifying email change:', error);
      setStatus('error');
      setErrorMessage(t('emailChange.verify.networkError', 'Erreur de connexion'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === 'loading' && (
              <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-purple-600 dark:text-purple-400 animate-spin" />
              </div>
            )}
            {status === 'success' && (
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            )}
            {(status === 'error' || status === 'expired' || status === 'invalid') && (
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
            )}
          </div>

          <CardTitle className="text-xl">
            {status === 'loading' && t('emailChange.verify.verifying', 'Vérification en cours...')}
            {status === 'success' && t('emailChange.verify.success', 'Email modifié !')}
            {status === 'expired' && t('emailChange.verify.expiredTitle', 'Lien expiré')}
            {status === 'invalid' && t('emailChange.verify.invalidTitle', 'Lien invalide')}
            {status === 'error' && t('emailChange.verify.errorTitle', 'Erreur')}
          </CardTitle>

          <CardDescription>
            {status === 'loading' && t('emailChange.verify.pleaseWait', 'Veuillez patienter...')}
            {status === 'success' && (
              <>
                {t('emailChange.verify.successMessage', 'Votre adresse email a été modifiée avec succès.')}
                {newEmail && (
                  <span className="block mt-2 font-medium text-green-600 dark:text-green-400">
                    {newEmail}
                  </span>
                )}
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {(status === 'error' || status === 'expired' || status === 'invalid') && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {status === 'success' && (
            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-300">
                {t('emailChange.verify.successInfo', 'Vous pouvez maintenant utiliser votre nouvelle adresse email pour vous connecter.')}
              </AlertDescription>
            </Alert>
          )}

          {status === 'expired' && (
            <p className="text-sm text-muted-foreground text-center">
              {t('emailChange.verify.expiredInfo', 'Le lien de vérification a expiré. Veuillez demander un nouveau changement d\'email depuis vos paramètres.')}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {status === 'success' && (
              <Button asChild className="w-full">
                <Link href="/settings">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('emailChange.verify.backToSettings', 'Retour aux paramètres')}
                </Link>
              </Button>
            )}

            {(status === 'error' || status === 'expired' || status === 'invalid') && (
              <>
                <Button asChild variant="default" className="w-full">
                  <Link href="/settings">
                    <Mail className="h-4 w-4 mr-2" />
                    {t('emailChange.verify.tryAgain', 'Réessayer le changement d\'email')}
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link href="/">
                    {t('emailChange.verify.backToHome', 'Retour à l\'accueil')}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
