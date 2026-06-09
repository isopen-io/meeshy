'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, UserPlus, Save, AlertCircle } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';

export default function NewUserPage() {
  const router = useRouter();
  const { t } = useI18n('admin');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    bio: '',
    phoneNumber: '',
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'fr'
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Username validation
    if (!formData.username || formData.username.length < 3) {
      newErrors.username = t('users.newUser.errorUsernameMinLength');
    }

    // Email validation
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('users.newUser.errorEmailInvalid');
    }

    // Name validation
    if (!formData.firstName) {
      newErrors.firstName = t('users.newUser.errorFirstNameRequired');
    }
    if (!formData.lastName) {
      newErrors.lastName = t('users.newUser.errorLastNameRequired');
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = t('users.newUser.errorPasswordRequired');
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('users.newUser.errorPasswordMismatch');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error(t('users.newUser.toastFormErrors'));
      return;
    }

    try {
      setLoading(true);

      // Préparer les données pour l'API
      const userData = {
        username: formData.username.toLowerCase().trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        displayName: formData.displayName.trim() || undefined,
        bio: formData.bio.trim() || undefined,
        phoneNumber: formData.phoneNumber.trim() || undefined,
        role: formData.role,
        systemLanguage: formData.systemLanguage,
        regionalLanguage: formData.regionalLanguage
      };

      const response = await apiService.post('/admin/users', userData);

      if ((response.data as unknown)?.success) {
        toast.success(t('users.newUser.toastSuccess'));
        router.push('/admin/users');
      }
    } catch (error: unknown) {
      console.error('Erreur création utilisateur:', error);
      toast.error(error.message || t('users.newUser.toastError'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <AdminLayout currentPage="/admin/users">
      <div className="space-y-6 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => router.push('/admin/users')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{t('users.newUser.back')}</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('users.newUser.title')}</h1>
              <p className="text-sm text-gray-600">{t('users.newUser.subtitle')}</p>
            </div>
          </div>
          <Badge className="bg-blue-600 text-white">
            <UserPlus className="h-4 w-4 mr-1" />
            {t('users.newUser.badgeCreation')}
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informations principales */}
          <Card>
            <CardHeader>
  <CardTitle>{t('users.newUser.cardMainInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('users.newUser.labelUsername')} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="johndoe"
                    value={formData.username}
                    onChange={(e) => handleChange('username', e.target.value)}
                    className={errors.username ? 'border-red-500' : ''}
                  />
                  {errors.username && (
                    <p className="text-xs text-red-500 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {errors.username}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">{t('users.newUser.hintUsername')}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('users.newUser.labelEmail')} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="john.doe@example.com"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={errors.email ? 'border-red-500' : ''}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-500 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {errors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('users.newUser.labelFirstName')} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) => handleChange('firstName', e.target.value)}
                    className={errors.firstName ? 'border-red-500' : ''}
                  />
                  {errors.firstName && (
                    <p className="text-xs text-red-500 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {errors.firstName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('users.newUser.labelLastName')} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={(e) => handleChange('lastName', e.target.value)}
                    className={errors.lastName ? 'border-red-500' : ''}
                  />
                  {errors.lastName && (
                    <p className="text-xs text-red-500 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {errors.lastName}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sécurité */}
          <Card>
            <CardHeader>
  <CardTitle>{t('users.newUser.cardSecurity')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('users.newUser.labelPassword')} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="password"
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    className={errors.password ? 'border-red-500' : ''}
                  />
                  {errors.password && (
                    <p className="text-xs text-red-500 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {errors.password}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">{t('users.newUser.hintPassword')}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('users.newUser.labelConfirmPassword')} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="password"
                    placeholder="••••••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    className={errors.confirmPassword ? 'border-red-500' : ''}
                  />
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-500 flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informations complémentaires */}
          <Card>
            <CardHeader>
  <CardTitle>{t('users.newUser.cardExtra')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('users.newUser.labelDisplayName')}</label>
                  <Input
                    placeholder="John Doe"
                    value={formData.displayName}
                    onChange={(e) => handleChange('displayName', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('users.newUser.labelPhone')}</label>
                  <Input
                    placeholder="+33612345678"
                    value={formData.phoneNumber}
                    onChange={(e) => handleChange('phoneNumber', e.target.value)}
                  />
                  <p className="text-xs text-gray-500">{t('users.newUser.hintPhone')}</p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">{t('users.newUser.labelBio')}</label>
                  <textarea
                    className="w-full p-2 border rounded-md text-sm min-h-[80px]"
                    placeholder="À propos de cet utilisateur..."
                    value={formData.bio}
                    onChange={(e) => handleChange('bio', e.target.value)}
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500">{t('users.newUser.hintBioLength', { count: formData.bio.length })}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rôle et langues */}
          <Card>
            <CardHeader>
  <CardTitle>{t('users.newUser.cardRolePrefs')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('users.newUser.labelRole')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full p-2 border rounded-md text-sm bg-white"
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                  >
                    <option value="USER">{t('users.newUser.roleUser')}</option>
                    <option value="ADMIN">{t('users.newUser.roleAdmin')}</option>
                    <option value="MODO">{t('users.newUser.roleModo')}</option>
                    <option value="AUDIT">{t('users.newUser.roleAudit')}</option>
                    <option value="ANALYST">{t('users.newUser.roleAnalyst')}</option>
                    <option value="BIGBOSS">{t('users.newUser.roleBigboss')}</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('users.newUser.labelSystemLang')}</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm bg-white"
                    value={formData.systemLanguage}
                    onChange={(e) => handleChange('systemLanguage', e.target.value)}
                  >
                    <option value="en">{t('users.newUser.langEn')}</option>
                    <option value="fr">{t('users.newUser.langFr')}</option>
                    <option value="pt">{t('users.newUser.langPt')}</option>
                    <option value="es">{t('users.newUser.langEs')}</option>
                    <option value="de">{t('users.newUser.langDe')}</option>
                    <option value="it">{t('users.newUser.langIt')}</option>
                    <option value="zh">{t('users.newUser.langZh')}</option>
                    <option value="ja">{t('users.newUser.langJa')}</option>
                    <option value="ar">{t('users.newUser.langAr')}</option>
                    <option value="ru">{t('users.newUser.langRu')}</option>
                    <option value="ko">{t('users.newUser.langKo')}</option>
                    <option value="hi">{t('users.newUser.langHi')}</option>
                    <option value="tr">{t('users.newUser.langTr')}</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('users.newUser.labelRegionalLang')}</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm bg-white"
                    value={formData.regionalLanguage}
                    onChange={(e) => handleChange('regionalLanguage', e.target.value)}
                  >
                    <option value="en">{t('users.newUser.langEn')}</option>
                    <option value="fr">{t('users.newUser.langFr')}</option>
                    <option value="pt">{t('users.newUser.langPt')}</option>
                    <option value="es">{t('users.newUser.langEs')}</option>
                    <option value="de">{t('users.newUser.langDe')}</option>
                    <option value="it">{t('users.newUser.langIt')}</option>
                    <option value="zh">{t('users.newUser.langZh')}</option>
                    <option value="ja">{t('users.newUser.langJa')}</option>
                    <option value="ar">{t('users.newUser.langAr')}</option>
                    <option value="ru">{t('users.newUser.langRu')}</option>
                    <option value="ko">{t('users.newUser.langKo')}</option>
                    <option value="hi">{t('users.newUser.langHi')}</option>
                    <option value="tr">{t('users.newUser.langTr')}</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/admin/users')}
              disabled={loading}
            >
              {t('users.newUser.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('users.newUser.submitting')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t('users.newUser.submit')}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
