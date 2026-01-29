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

export default function NewUserPage() {
  const router = useRouter();
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
      newErrors.username = 'Le nom d\'utilisateur doit contenir au moins 3 caractères';
    }

    // Email validation
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalide';
    }

    // Name validation
    if (!formData.firstName) {
      newErrors.firstName = 'Le prénom est requis';
    }
    if (!formData.lastName) {
      newErrors.lastName = 'Le nom est requis';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Le mot de passe est requis';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Veuillez corriger les erreurs du formulaire');
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

      if (response.data?.success) {
        toast.success('Utilisateur créé avec succès!');
        router.push('/admin/users');
      }
    } catch (error: any) {
      console.error('Erreur création utilisateur:', error);
      toast.error(error.message || 'Erreur lors de la création de l\'utilisateur');
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
              <span>Retour</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Nouvel utilisateur</h1>
              <p className="text-sm text-gray-600">Créer un nouveau compte utilisateur</p>
            </div>
          </div>
          <Badge className="bg-blue-600 text-white">
            <UserPlus className="h-4 w-4 mr-1" />
            Création
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informations principales */}
          <Card>
            <CardHeader>
              <CardTitle>Informations principales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Nom d'utilisateur <span className="text-red-500">*</span>
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
                  <p className="text-xs text-gray-500">3-32 caractères, lettres, chiffres, tirets et underscores</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Email <span className="text-red-500">*</span>
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
                    Prénom <span className="text-red-500">*</span>
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
                    Nom <span className="text-red-500">*</span>
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
              <CardTitle>Sécurité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Mot de passe <span className="text-red-500">*</span>
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
                  <p className="text-xs text-gray-500">Aucune contrainte de longueur ou de complexité</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Confirmer le mot de passe <span className="text-red-500">*</span>
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
              <CardTitle>Informations complémentaires</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nom d'affichage</label>
                  <Input
                    placeholder="John Doe"
                    value={formData.displayName}
                    onChange={(e) => handleChange('displayName', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Téléphone</label>
                  <Input
                    placeholder="+33612345678"
                    value={formData.phoneNumber}
                    onChange={(e) => handleChange('phoneNumber', e.target.value)}
                  />
                  <p className="text-xs text-gray-500">Format international E.164</p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Biographie</label>
                  <textarea
                    className="w-full p-2 border rounded-md text-sm min-h-[80px]"
                    placeholder="À propos de cet utilisateur..."
                    value={formData.bio}
                    onChange={(e) => handleChange('bio', e.target.value)}
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500">{formData.bio.length}/500 caractères</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rôle et langues */}
          <Card>
            <CardHeader>
              <CardTitle>Rôle et préférences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Rôle <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full p-2 border rounded-md text-sm bg-white"
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                  >
                    <option value="USER">Utilisateur</option>
                    <option value="ADMIN">Administrateur</option>
                    <option value="MODO">Modérateur</option>
                    <option value="AUDIT">Auditeur</option>
                    <option value="ANALYST">Analyste</option>
                    <option value="BIGBOSS">Super Admin</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Langue système</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm bg-white"
                    value={formData.systemLanguage}
                    onChange={(e) => handleChange('systemLanguage', e.target.value)}
                  >
                    <option value="en">Anglais</option>
                    <option value="fr">Français</option>
                    <option value="pt">Portugais</option>
                    <option value="es">Espagnol</option>
                    <option value="de">Allemand</option>
                    <option value="it">Italien</option>
                    <option value="zh">Chinois</option>
                    <option value="ja">Japonais</option>
                    <option value="ar">Arabe</option>
                    <option value="ru">Russe</option>
                    <option value="ko">Coréen</option>
                    <option value="hi">Hindi</option>
                    <option value="tr">Turc</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Langue régionale</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm bg-white"
                    value={formData.regionalLanguage}
                    onChange={(e) => handleChange('regionalLanguage', e.target.value)}
                  >
                    <option value="en">Anglais</option>
                    <option value="fr">Français</option>
                    <option value="pt">Portugais</option>
                    <option value="es">Espagnol</option>
                    <option value="de">Allemand</option>
                    <option value="it">Italien</option>
                    <option value="zh">Chinois</option>
                    <option value="ja">Japonais</option>
                    <option value="ar">Arabe</option>
                    <option value="ru">Russe</option>
                    <option value="ko">Coréen</option>
                    <option value="hi">Hindi</option>
                    <option value="tr">Turc</option>
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
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Création en cours...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Créer l'utilisateur
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
