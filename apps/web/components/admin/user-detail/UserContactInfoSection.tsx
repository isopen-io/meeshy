'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Phone, Clock, MapPin, Edit2, Save, X } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import {
  COUNTRY_CODES,
  getDialCode,
  getCountryName,
  formatPhoneWithDialCode,
  flagForCountry,
  resolveCountry,
  nationalNumber,
  toE164,
} from '@/constants/countries';

interface UserContactInfoProps {
  user: unknown;
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

export function UserContactInfoSection({
  user,
  userId,
  onUpdate
}: UserContactInfoProps) {
  const { t } = useI18n('admin');
  const resolvedCountry = resolveCountry(user.phoneNumber, (user as unknown).phoneCountryCode);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: user.email || '',
    phoneNumber: nationalNumber(user.phoneNumber),
    phoneCountryCode: resolvedCountry.code,
    timezone: (user as unknown).timezone || 'Europe/Paris'
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCancel = () => {
    setFormData({
      email: user.email || '',
      phoneNumber: nationalNumber(user.phoneNumber),
      phoneCountryCode: resolveCountry(user.phoneNumber, (user as unknown).phoneCountryCode).code,
      timezone: (user as unknown).timezone || 'Europe/Paris'
    });
    setEditing(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const e164 = formData.phoneNumber
        ? toE164(formData.phoneNumber, formData.phoneCountryCode) ?? formData.phoneNumber
        : null;
      const response = await apiService.patch<AdminApiResponse<unknown>>(`/admin/users/${userId}`, {
        email: formData.email,
        phoneNumber: e164,
        phoneCountryCode: formData.phoneCountryCode,
        timezone: formData.timezone
      });

      if (response.data?.success) {
        toast.success(t('userDetail.contactUpdated'));
        setEditing(false);
        onUpdate();
      }
    } catch (error: unknown) {
      toast.error(error.message || t('userDetail.contactUpdateError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
            <Mail className="h-5 w-5" />
            <span>{t('userDetail.contactTitle')}</span>
          </CardTitle>
          {!editing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              {t('usersDetail.editButton')}
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
                {t('usersDetail.cancelButton')}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="dark:bg-blue-700 dark:hover:bg-blue-800"
              >
                <Save className="h-4 w-4 mr-1" />
                {saving ? t('userDetail.saving') : t('usersDetail.saveButton')}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">{t('userDetail.emailLabel')}</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">{t('userDetail.countryLabel')}</label>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                value={formData.phoneCountryCode}
                onChange={(e) => handleChange('phoneCountryCode', e.target.value)}
              >
                {COUNTRY_CODES.map(country => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name} ({country.dial})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium dark:text-gray-200">
                {t('userDetail.phoneLabel')} {getDialCode(formData.phoneCountryCode)}
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
              <label className="text-sm font-medium dark:text-gray-200">{t('userDetail.timezoneLabel')}</label>
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
                {t('userDetail.emailLabel')}:
              </span>
              <span className="font-medium dark:text-gray-200">{user.email}</span>
            </div>
            {user.phoneNumber && (
              <div className="flex items-center text-sm">
                <span className="w-40 text-gray-600 dark:text-gray-400 flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  {t('userDetail.phoneLabel')}:
                </span>
                <span className="font-medium dark:text-gray-200">
                  {flagForCountry(resolveCountry(user.phoneNumber, (user as unknown).phoneCountryCode).code)}{' '}
                  {formatPhoneWithDialCode(user.phoneNumber, (user as unknown).phoneCountryCode)}
                </span>
              </div>
            )}
            <div className="flex items-center text-sm">
              <span className="w-40 text-gray-600 dark:text-gray-400 flex items-center">
                <MapPin className="h-4 w-4 mr-2" />
                {t('userDetail.countryLabel')}:
              </span>
              <span className="font-medium dark:text-gray-200">
                {flagForCountry(resolveCountry(user.phoneNumber, (user as unknown).phoneCountryCode).code)}{' '}
                {getCountryName(resolveCountry(user.phoneNumber, (user as unknown).phoneCountryCode).code)}
              </span>
            </div>
            {(user as unknown).timezone && (
              <div className="flex items-center text-sm">
                <span className="w-40 text-gray-600 dark:text-gray-400 flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  {t('userDetail.timezoneLabel')}:
                </span>
                <span className="font-medium dark:text-gray-200">{(user as unknown).timezone}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
