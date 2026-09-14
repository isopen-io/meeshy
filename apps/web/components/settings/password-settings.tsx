'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { SoundFeedback } from '@/hooks/use-accessibility';
import { buildApiUrl } from '@/lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { authManager } from '@/services/auth-manager.service';

/**
 * LE PREMIER MOT DE PASSE N'EN A PAS D'ANCIEN (#6424).
 *
 * Un compte né d'une inscription par e-mail seul n'a pas de mot de passe : sa
 * seule porte est le lien magique, et l'e-mail qui le porte renvoie ICI pour
 * en poser un. Ce formulaire réclamait un mot de passe « actuel » dont
 * l'absence est justement la raison de la visite — un cul-de-sac.
 *
 * `hasPassword` est LU au serveur (`GET /me?expand=security`), jamais deviné :
 * un défaut prudent côté client rendrait le champ obligatoire pour tout le
 * monde en cas d'erreur réseau, c'est-à-dire refermerait le cul-de-sac
 * exactement quand la personne y est. `null` = pas encore su ⇒ le champ est
 * proposé sans être exigé.
 */
export function PasswordSettings() {

  const { t } = useI18n('settings');
  /** `null` tant que la réponse n'est pas là — ni « en a un », ni « n'en a pas ». */
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let vivant = true;

    void (async () => {
      try {
        const reponse = await fetch(`${buildApiUrl(API_ENDPOINTS.me.root)}?expand=security`, {
          headers: { Authorization: `Bearer ${authManager.getAuthToken()}` },
        });
        if (!reponse.ok) return;
        const charge = await reponse.json();
        const valeur = charge?.data?.user?.security?.hasPassword;
        if (vivant && typeof valeur === 'boolean') setHasPassword(valeur);
      } catch {
        // Silencieux À DESSEIN : l'échec laisse `hasPassword` à `null`, donc le
        // champ « mot de passe actuel » proposé mais non exigé. C'est le seul
        // état qui ne ferme la porte à personne — ni à qui en a un (il le
        // saisit), ni à qui n'en a pas (il le laisse vide).
      }
    })();

    return () => {
      vivant = false;
    };
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
    const newValue = !showPasswords[field];
    setShowPasswords(prev => ({
      ...prev,
      [field]: newValue
    }));
    if (newValue) {
      SoundFeedback.playToggleOn();
    } else {
      SoundFeedback.playToggleOff();
    }
  };

  const validateForm = (): boolean => {
    // L'ancien mot de passe n'est exigé que s'il EXISTE. Le serveur applique la
    // même règle sur l'état lu en base (`PATCH /users/me/password`) : ce test
    // n'est qu'une politesse, il ne garde rien.
    if (hasPassword !== false && !formData.currentPassword) {
      toast.error(t('security.password.errors.currentRequired'));
      return false;
    }

    if (!formData.newPassword) {
      toast.error(t('security.password.errors.newRequired'));
      return false;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error(t('security.password.errors.mismatch'));
      return false;
    }

    if (formData.currentPassword && formData.currentPassword === formData.newPassword) {
      toast.error(t('security.password.errors.samePassword'));
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(buildApiUrl(API_ENDPOINTS.users.mePassword), {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authManager.getAuthToken()}`
        },
        // `currentPassword` n'est envoyé que s'il a été saisi : la clé absente
        // dit « il n'y en a pas », là où une chaîne vide dirait « en voici un,
        // et il est vide » — que le serveur refuserait.
        body: JSON.stringify({
          ...(formData.currentPassword ? { currentPassword: formData.currentPassword } : {}),
          newPassword: formData.newPassword,
          confirmPassword: formData.confirmPassword
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || t('security.password.errors.updateFailed'));
      }

      toast.success(responseData.message || t('security.password.updateSuccess'));
      
      // Réinitialiser le formulaire
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Erreur lors du changement de mot de passe:', error);
      toast.error(error instanceof Error ? error.message : t('security.password.errors.updateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <CardTitle className="text-lg sm:text-xl">{t('security.password.title')}</CardTitle>
        </div>
        <CardDescription className="text-sm sm:text-base">
          {t('security.password.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {hasPassword === false && (
          <p className="rounded-md bg-indigo-50 p-3 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">
            {t(
              'security.password.firstPasswordNotice',
              "Votre compte n'a pas encore de mot de passe : vous vous connectez par lien magique. Définissez-en un pour vous connecter aussi avec votre e-mail, votre pseudo ou votre numéro.",
            )}
          </p>
        )}

        {/* Mot de passe actuel — masqué quand le compte n'en a pas (#6424) */}
        {hasPassword !== false && (
        <div className="space-y-2">
          <Label htmlFor="current-password" className="text-sm sm:text-base">
            {t('security.password.currentPassword')}
          </Label>
          <div className="relative">
            <Input
              id="current-password"
              type={showPasswords.current ? 'text' : 'password'}
              value={formData.currentPassword}
              onChange={(e) => handleInputChange('currentPassword', e.target.value)}
              placeholder={t('security.password.currentPasswordPlaceholder')}
              className="w-full pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('current')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
              aria-label={showPasswords.current ? t('security.password.hidePassword', 'Masquer le mot de passe') : t('security.password.showPassword', 'Afficher le mot de passe')}
              aria-pressed={showPasswords.current}
            >
              {showPasswords.current ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        )}

        {/* Nouveau mot de passe */}
        <div className="space-y-2">
          <Label htmlFor="new-password" className="text-sm sm:text-base">
            {t('security.password.newPassword')}
          </Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showPasswords.new ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={(e) => handleInputChange('newPassword', e.target.value)}
              placeholder={t('security.password.newPasswordPlaceholder')}
              className="w-full pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('new')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
              aria-label={showPasswords.new ? t('security.password.hidePassword', 'Masquer le mot de passe') : t('security.password.showPassword', 'Afficher le mot de passe')}
              aria-pressed={showPasswords.new}
            >
              {showPasswords.new ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t('security.password.requirements')}
          </p>
        </div>

        {/* Confirmation du nouveau mot de passe */}
        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-sm sm:text-base">
            {t('security.password.confirmPassword')}
          </Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showPasswords.confirm ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              placeholder={t('security.password.confirmPasswordPlaceholder')}
              className="w-full pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('confirm')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm outline-none"
              aria-label={showPasswords.confirm ? t('security.password.hidePassword', 'Masquer le mot de passe') : t('security.password.showPassword', 'Afficher le mot de passe')}
              aria-pressed={showPasswords.confirm}
            >
              {showPasswords.confirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-4 pt-4">
          <Button
            variant="outline"
            className="w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            onClick={() => {
              SoundFeedback.playClick();
              setFormData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
              });
            }}
            disabled={isLoading}
          >
            {t('security.password.cancel')}
          </Button>
          <Button
            onClick={() => {
              SoundFeedback.playClick();
              handleSave();
            }}
            // Le mot de passe ACTUEL n'entre dans la condition que si le
            // compte en a un (#6424) : sans cette garde, le bouton restait
            // gris pour un compte né d'une inscription par e-mail seul —
            // c'est-à-dire pour la personne que ce formulaire vient
            // précisément servir. Un champ masqué qui désactive quand même le
            // bouton est la forme la plus silencieuse du contrôle inerte.
            disabled={
              isLoading ||
              (hasPassword !== false && !formData.currentPassword) ||
              !formData.newPassword ||
              !formData.confirmPassword
            }
            className="w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isLoading ? t('security.password.updating') : t('security.password.update')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
