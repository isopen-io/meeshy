'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Phone, Globe, Clock, MapPin, Edit2, Save, X } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';

interface UserContactInfoProps {
  user: any;
  userId: string;
  onUpdate: () => void;
}

interface AdminApiResponse<T> {
  success: boolean;
  data: T;
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Brussels',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney'
];

const COUNTRIES = [
  { code: 'US', name: 'États-Unis', phoneCode: '+1' },
  { code: 'CA', name: 'Canada', phoneCode: '+1' },
  { code: 'FR', name: 'France', phoneCode: '+33' },
  { code: 'GB', name: 'Royaume-Uni', phoneCode: '+44' },
  { code: 'DE', name: 'Allemagne', phoneCode: '+49' },
  { code: 'IT', name: 'Italie', phoneCode: '+39' },
  { code: 'ES', name: 'Espagne', phoneCode: '+34' },
  { code: 'BE', name: 'Belgique', phoneCode: '+32' },
  { code: 'CH', name: 'Suisse', phoneCode: '+41' },
  { code: 'PT', name: 'Portugal', phoneCode: '+351' },
  { code: 'NL', name: 'Pays-Bas', phoneCode: '+31' },
  { code: 'JP', name: 'Japon', phoneCode: '+81' },
  { code: 'CN', name: 'Chine', phoneCode: '+86' },
  { code: 'AU', name: 'Australie', phoneCode: '+61' }
];

export function UserContactInfoSection({
  user,
  userId,
  onUpdate
}: UserContactInfoProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: user.email || '',
    phoneNumber: user.phoneNumber || '',
    phoneCountryCode: (user as any).phoneCountryCode || 'FR',
    timezone: (user as any).timezone || 'Europe/Paris'
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    setFormData({
      email: user.email || '',
      phoneNumber: user.phoneNumber || '',
      phoneCountryCode: (user as any).phoneCountryCode || 'FR',
      timezone: (user as any).timezone || 'Europe/Paris'
    });
    setEditing(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await apiService.patch<AdminApiResponse<any>>(`/admin/users/${userId}`, {
        email: formData.email,
        phoneNumber: formData.phoneNumber || null,
        phoneCountryCode: formData.phoneCountryCode,
        timezone: formData.timezone
      });

      if (response.data?.success) {
        toast.success('Informations de contact mises à jour');
        setEditing(false);
        onUpdate();
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const getCountryName = (code: string) => {
    return COUNTRIES.find(c => c.code === code)?.name || code;
  };

  const getPhoneCode = (code: string) => {
    return COUNTRIES.find(c => c.code === code)?.phoneCode || '';
  };

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
            <Mail className="h-5 w-5" />
            <span>Contact & Localisation</span>
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
              <label className="text-sm font-medium dark:text-gray-200">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">Pays</label>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.phoneCountryCode}
                onChange={(e) => handleChange('phoneCountryCode', e.target.value)}
              >
                {COUNTRIES.map(country => (
                  <option key={country.code} value={country.code}>
                    {country.name} ({country.phoneCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">
                Téléphone {getPhoneCode(formData.phoneCountryCode)}
              </label>
              <Input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => handleChange('phoneNumber', e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                placeholder="6 12 34 56 78"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">Fuseau horaire</label>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.timezone}
                onChange={(e) => handleChange('timezone', e.target.value)}
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center text-sm">
              <span className="w-40 text-gray-600 dark:text-gray-400 flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                Email:
              </span>
              <span className="font-medium dark:text-gray-200">{user.email}</span>
            </div>
            {user.phoneNumber && (
              <div className="flex items-center text-sm">
                <span className="w-40 text-gray-600 dark:text-gray-400 flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  Téléphone:
                </span>
                <span className="font-medium dark:text-gray-200">
                  {getPhoneCode((user as any).phoneCountryCode || 'FR')} {user.phoneNumber}
                </span>
              </div>
            )}
            <div className="flex items-center text-sm">
              <span className="w-40 text-gray-600 dark:text-gray-400 flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                Pays:
              </span>
              <span className="font-medium dark:text-gray-200">
                {getCountryName((user as any).phoneCountryCode || 'FR')}
              </span>
            </div>
            {(user as any).timezone && (
              <div className="flex items-center text-sm">
                <span className="w-40 text-gray-600 dark:text-gray-400 flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  Fuseau horaire:
                </span>
                <span className="font-medium dark:text-gray-200">{(user as any).timezone}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
