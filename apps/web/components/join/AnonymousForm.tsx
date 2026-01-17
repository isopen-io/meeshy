'use client';

import { ExternalLink, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/hooks/useI18n';
import type { AnonymousFormData } from '@/hooks/use-join-flow';
import type { UsernameCheckStatus } from '@/hooks/use-link-validation';

const ANONYMOUS_LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' }
];

interface AnonymousFormProps {
  formData: AnonymousFormData;
  usernameCheckStatus: UsernameCheckStatus;
  requireNickname?: boolean;
  requireEmail?: boolean;
  requireBirthday?: boolean;
  isJoining: boolean;
  onUpdateForm: (field: keyof AnonymousFormData, value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function AnonymousForm({
  formData,
  usernameCheckStatus,
  requireNickname,
  requireEmail,
  requireBirthday,
  isJoining,
  onUpdateForm,
  onSubmit,
  onBack
}: AnonymousFormProps) {
  const { t } = useI18n('joinPage');

  const isFormValid = () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) return false;
    if (requireNickname && !formData.username.trim()) return false;
    if (requireEmail && !formData.email.trim()) return false;
    if (requireBirthday && !formData.birthday.trim()) return false;
    if (usernameCheckStatus === 'checking') return false;
    if (formData.username.trim() && usernameCheckStatus === 'taken') return false;
    return true;
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('anonymousAccess')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('createTemporaryIdentity')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t('firstName')} *</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => onUpdateForm('firstName', e.target.value)}
            placeholder="John"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t('lastName')} *</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => onUpdateForm('lastName', e.target.value)}
            placeholder="Doe"
            required
          />
        </div>
      </div>

      {requireNickname ? (
        <div className="space-y-2">
          <Label htmlFor="username">
            {t('username')} <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => onUpdateForm('username', e.target.value)}
              placeholder={t('username')}
              required
              className="pr-10"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {usernameCheckStatus === 'checking' && (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              )}
              {usernameCheckStatus === 'available' && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              {usernameCheckStatus === 'taken' && (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>
          {usernameCheckStatus === 'taken' && (
            <p className="text-xs text-red-500">Ce pseudo est déjà utilisé</p>
          )}
          {usernameCheckStatus === 'available' && (
            <p className="text-xs text-green-600">Ce pseudo est disponible</p>
          )}
          {usernameCheckStatus === 'idle' && (
            <>
              <p className="text-xs text-red-500">{t('usernameRequired')}</p>
              <p className="text-xs text-gray-500">{t('usernameWarning')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="username">{t('usernameOptional')}</Label>
          <div className="relative">
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => onUpdateForm('username', e.target.value)}
              placeholder={t('autoGenerated')}
              className="pr-10"
            />
            {formData.username.trim() && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameCheckStatus === 'checking' && (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                )}
                {usernameCheckStatus === 'available' && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {usernameCheckStatus === 'taken' && (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            )}
          </div>
          {usernameCheckStatus === 'taken' && (
            <p className="text-xs text-red-500">Ce pseudo est déjà utilisé</p>
          )}
          {usernameCheckStatus === 'available' && (
            <p className="text-xs text-green-600">Ce pseudo est disponible</p>
          )}
          {usernameCheckStatus === 'idle' && (
            <>
              <p className="text-xs text-gray-500">{t('leaveEmpty')}</p>
              <p className="text-xs text-gray-500">{t('customUsernameWarning')}</p>
            </>
          )}
        </div>
      )}

      {requireEmail && (
        <div className="space-y-2">
          <Label htmlFor="email">
            {t('email')} <span className="text-red-500">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => onUpdateForm('email', e.target.value)}
            placeholder="john.doe@example.com"
            required
          />
          <p className="text-xs text-red-500">{t('emailRequired')}</p>
        </div>
      )}

      {requireBirthday && (
        <div className="space-y-2">
          <Label htmlFor="birthday">
            {t('birthday')} <span className="text-red-500">*</span>
          </Label>
          <Input
            id="birthday"
            type="date"
            value={formData.birthday}
            onChange={(e) => onUpdateForm('birthday', e.target.value)}
            required
            max={new Date().toISOString().split('T')[0]}
          />
          <p className="text-xs text-red-500">{t('birthdayRequired')}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="language">{t('spokenLanguage')}</Label>
        <Select
          value={formData.language}
          onValueChange={(value) => onUpdateForm('language', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANONYMOUS_LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="flex items-center">
                  <span className="mr-2">{lang.flag}</span>
                  {lang.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex space-x-3 pt-4">
        <Button
          onClick={onSubmit}
          disabled={!isFormValid() || isJoining}
          size="lg"
          className="flex-1"
        >
          {isJoining ? t('joining') : t('join')}
          <ExternalLink className="h-4 w-4 ml-2" />
        </Button>
        <Button
          onClick={onBack}
          variant="outline"
          size="lg"
        >
          {t('back')}
        </Button>
      </div>
    </div>
  );
}
