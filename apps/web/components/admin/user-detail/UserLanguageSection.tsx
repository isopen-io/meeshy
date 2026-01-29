'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Languages, Edit2, Save, X } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';

interface UserLanguageSectionProps {
  user: any;
  userId: string;
  onUpdate: () => void;
}

interface AdminApiResponse<T> {
  success: boolean;
  data: T;
}

const LANGUAGES = [
  { code: 'en', name: 'Anglais' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Espagnol' },
  { code: 'pt', name: 'Portugais' },
  { code: 'de', name: 'Allemand' },
  { code: 'it', name: 'Italien' },
  { code: 'nl', name: 'Néerlandais' },
  { code: 'pl', name: 'Polonais' },
  { code: 'ru', name: 'Russe' },
  { code: 'zh', name: 'Chinois' },
  { code: 'ja', name: 'Japonais' },
  { code: 'ko', name: 'Coréen' },
  { code: 'ar', name: 'Arabe' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turc' },
];

export function UserLanguageSection({
  user,
  userId,
  onUpdate
}: UserLanguageSectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    systemLanguage: user.systemLanguage || 'fr',
    regionalLanguage: user.regionalLanguage || 'fr',
    customDestinationLanguage: user.customDestinationLanguage || ''
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    setFormData({
      systemLanguage: user.systemLanguage || 'fr',
      regionalLanguage: user.regionalLanguage || 'fr',
      customDestinationLanguage: user.customDestinationLanguage || ''
    });
    setEditing(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await apiService.patch<AdminApiResponse<any>>(`/admin/users/${userId}`, {
        systemLanguage: formData.systemLanguage,
        regionalLanguage: formData.regionalLanguage || null,
        customDestinationLanguage: formData.customDestinationLanguage || null
      });

      if (response.data?.success) {
        toast.success('Préférences de langue mises à jour');
        setEditing(false);
        onUpdate();
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const getLanguageName = (code: string) => {
    return LANGUAGES.find(l => l.code === code)?.name || code;
  };

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
            <Languages className="h-5 w-5" />
            <span>Préférences de Langue</span>
          </CardTitle>
          {!editing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Modifier
            </Button>
          ) : (
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={saving}
                className="dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
              >
                <X className="h-4 w-4 mr-1" />
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="dark:bg-blue-700 dark:hover:bg-blue-800"
              >
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">Langue système</label>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.systemLanguage}
                onChange={(e) => handleChange('systemLanguage', e.target.value)}
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Langue principale de l'interface
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">Langue régionale</label>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.regionalLanguage}
                onChange={(e) => handleChange('regionalLanguage', e.target.value)}
              >
                <option value="">Aucune</option>
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Langue secondaire pour le contenu régional
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">
                Langue destination personnalisée
              </label>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.customDestinationLanguage}
                onChange={(e) => handleChange('customDestinationLanguage', e.target.value)}
              >
                <option value="">Aucune</option>
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Langue de destination pour la traduction personnalisée
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center text-sm">
              <span className="w-48 text-gray-600 dark:text-gray-400">Langue système:</span>
              <span className="font-medium dark:text-gray-200">
                {getLanguageName(user.systemLanguage)}
              </span>
            </div>
            {user.regionalLanguage && (
              <div className="flex items-center text-sm">
                <span className="w-48 text-gray-600 dark:text-gray-400">Langue régionale:</span>
                <span className="font-medium dark:text-gray-200">
                  {getLanguageName(user.regionalLanguage)}
                </span>
              </div>
            )}
            {user.customDestinationLanguage && (
              <div className="flex items-center text-sm">
                <span className="w-48 text-gray-600 dark:text-gray-400">Langue destination:</span>
                <span className="font-medium dark:text-gray-200">
                  {getLanguageName(user.customDestinationLanguage)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
