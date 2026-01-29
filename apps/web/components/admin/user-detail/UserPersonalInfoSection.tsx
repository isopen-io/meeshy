'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Edit2, Save, X } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';

interface UserPersonalInfoProps {
  user: any;
  userId: string;
  onUpdate: () => void;
}

interface AdminApiResponse<T> {
  success: boolean;
  data: T;
}

export function UserPersonalInfoSection({
  user,
  userId,
  onUpdate
}: UserPersonalInfoProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    displayName: user.displayName || '',
    username: user.username || '',
    bio: user.bio || ''
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    setFormData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      displayName: user.displayName || '',
      username: user.username || '',
      bio: user.bio || ''
    });
    setEditing(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await apiService.patch<AdminApiResponse<any>>(`/admin/users/${userId}`, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        displayName: formData.displayName || null,
        username: formData.username,
        bio: formData.bio
      });

      if (response.data?.success) {
        toast.success('Informations personnelles mises à jour');
        setEditing(false);
        onUpdate();
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
            <User className="h-5 w-5" />
            <span>Informations Personnelles</span>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium dark:text-gray-200">Prénom</label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium dark:text-gray-200">Nom</label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">Nom d'affichage</label>
              <Input
                value={formData.displayName || ''}
                onChange={(e) => handleChange('displayName', e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                placeholder="Optionnel"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">Nom d'utilisateur (username)</label>
              <Input
                value={formData.username}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                  handleChange('username', value);
                }}
                className="font-mono dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                placeholder="nom-utilisateur"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Uniquement lettres, chiffres, tirets et underscores
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">Biographie</label>
              <textarea
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm min-h-[80px] dark:bg-gray-800 dark:text-gray-100"
                value={formData.bio}
                onChange={(e) => handleChange('bio', e.target.value)}
                maxLength={500}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formData.bio?.length || 0}/500 caractères
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center text-sm">
              <span className="w-40 text-gray-600 dark:text-gray-400">Nom complet:</span>
              <span className="font-medium dark:text-gray-200">
                {user.firstName} {user.lastName}
              </span>
            </div>
            {user.displayName && (
              <div className="flex items-center text-sm">
                <span className="w-40 text-gray-600 dark:text-gray-400">Nom d'affichage:</span>
                <span className="font-medium dark:text-gray-200">{user.displayName}</span>
              </div>
            )}
            <div className="flex items-center text-sm">
              <span className="w-40 text-gray-600 dark:text-gray-400">Username:</span>
              <span className="font-medium font-mono flex items-center dark:text-gray-200">
                <User className="h-4 w-4 mr-2 text-gray-400 dark:text-gray-500" />
                @{user.username}
              </span>
            </div>
            {user.bio && (
              <div className="text-sm">
                <span className="text-gray-600 dark:text-gray-400 block mb-1">Biographie:</span>
                <p className="text-gray-900 dark:text-gray-200">{user.bio}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
