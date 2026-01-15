'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSelector } from '@/components/translation/language-selector';
import { JoinConversationResponse } from '@/types/frontend';
import { toast } from 'sonner';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { useI18n } from '@/hooks/useI18n';

interface CreateAccountFormProps {
  linkId: string;
  onSuccess: (userData: JoinConversationResponse) => void;
}

export function CreateAccountForm({ linkId, onSuccess }: CreateAccountFormProps) {
  const { t } = useI18n('auth');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    spokenLanguage: '',
    receiveLanguage: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Générer un username sécurisé à partir de l'email (uniquement lettres, chiffres, tirets et underscores)
      const emailUsername = formData.email.split('@')[0];
      const cleanUsername = emailUsername.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Utiliser l'endpoint d'inscription standard avec les bonnes clés de langue
      const response = await fetch(buildApiUrl(API_ENDPOINTS.AUTH.REGISTER), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: cleanUsername,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          phoneNumber: formData.phoneNumber,
          systemLanguage: formData.spokenLanguage,
          regionalLanguage: formData.receiveLanguage,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(t('createAccount.success'));
        onSuccess(result.data);
      } else {
        toast.error(result.message || t('createAccount.error'));
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error(t('createAccount.serverError'));
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{t('createAccount.title')}</CardTitle>
        <CardDescription>
          {t('createAccount.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="create-account-firstName">{t('createAccount.firstNameRequired')}</Label>
              <Input
                id="create-account-firstName"
                value={formData.firstName}
                onChange={(e) => updateFormData('firstName', e.target.value)}
                required
                placeholder={t('register.firstNamePlaceholder')}
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-account-lastName">{t('createAccount.lastNameRequired')}</Label>
              <Input
                id="create-account-lastName"
                value={formData.lastName}
                onChange={(e) => updateFormData('lastName', e.target.value)}
                required
                placeholder={t('register.lastNamePlaceholder')}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-account-email">{t('createAccount.emailRequired')}</Label>
            <Input
              id="create-account-email"
              type="email"
              value={formData.email}
              onChange={(e) => updateFormData('email', e.target.value)}
              required
              placeholder={t('register.emailPlaceholder')}
              autoComplete="email"
              spellCheck={false}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-account-phoneNumber">{t('createAccount.phoneOptional')}</Label>
            <Input
              id="create-account-phoneNumber"
              type="tel"
              inputMode="tel"
              value={formData.phoneNumber}
              onChange={(e) => updateFormData('phoneNumber', e.target.value)}
              placeholder={t('register.phonePlaceholder')}
              autoComplete="tel"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-account-password">{t('createAccount.passwordRequired')}</Label>
            <Input
              id="create-account-password"
              type="password"
              value={formData.password}
              onChange={(e) => updateFormData('password', e.target.value)}
              required
              placeholder={t('register.passwordPlaceholder')}
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-500">
              {t('register.passwordHelp')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spokenLanguage">{t('createAccount.spokenLanguageLabel')}</Label>
            <LanguageSelector
              value={formData.spokenLanguage}
              onValueChange={(value) => updateFormData('spokenLanguage', value)}
              placeholder={t('createAccount.spokenLanguagePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receiveLanguage">{t('createAccount.receiveLanguageLabel')}</Label>
            <LanguageSelector
              value={formData.receiveLanguage}
              onValueChange={(value) => updateFormData('receiveLanguage', value)}
              placeholder={t('createAccount.receiveLanguagePlaceholder')}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={loading || !formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.spokenLanguage || !formData.receiveLanguage}
          >
            {loading ? t('createAccount.submitting') : t('createAccount.submitButton')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
