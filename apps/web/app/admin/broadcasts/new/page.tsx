'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Francais' },
  { code: 'es', label: 'Espanol' },
  { code: 'pt', label: 'Portugues' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ar', label: 'العربية' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ru', label: 'Русский' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'tr', label: 'Turkce' },
];

const COUNTRIES = [
  'FR', 'US', 'GB', 'DE', 'ES', 'IT', 'PT', 'BR', 'CA', 'AU',
  'JP', 'KR', 'CN', 'IN', 'RU', 'TR', 'MX', 'AR', 'CO', 'CL',
  'MA', 'TN', 'DZ', 'SA', 'AE', 'EG', 'NG', 'ZA', 'KE', 'GH',
];

export default function NewBroadcastPage() {
  const router = useRouter();
  const { t } = useI18n('admin');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Content fields
  const [name, setName] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('fr');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Targeting fields
  const [activityStatus, setActivityStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [inactiveDays, setInactiveDays] = useState(30);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages(prev =>
      prev.includes(code)
        ? prev.filter(l => l !== code)
        : [...prev, code]
    );
  };

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const buildPayload = () => {
    const targeting: unknown = {
      activityStatus,
    };
    if (activityStatus === 'inactive') {
      targeting.inactiveDays = inactiveDays;
    }
    if (selectedLanguages.length > 0) {
      targeting.languages = selectedLanguages;
    }
    if (selectedCountries.length > 0) {
      targeting.countries = selectedCountries;
    }

    return {
      name,
      subject,
      body,
      sourceLanguage,
      targeting,
    };
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      toast.error(t('broadcasts.newValidateName'));
      return false;
    }
    if (!subject.trim()) {
      toast.error(t('broadcasts.newValidateSubject'));
      return false;
    }
    if (!body.trim()) {
      toast.error(t('broadcasts.newValidateBody'));
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await adminService.createBroadcast(buildPayload());
      toast.success(t('broadcasts.newDraftSaved'));
      router.push('/admin/broadcasts');
    } catch (error) {
      console.error('Erreur sauvegarde brouillon:', error);
      toast.error(t('broadcasts.newSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewAndTranslate = async () => {
    if (!validate()) return;
    setPreviewing(true);
    try {
      const createRes = await adminService.createBroadcast(buildPayload());
      const created = createRes.data?.data || createRes.data;
      const broadcastId = created?.id || created?.broadcast?.id;
      if (!broadcastId) {
        toast.error(t('broadcasts.newBroadcastIdMissing'));
        return;
      }
      await adminService.previewBroadcast(broadcastId);
      toast.success(t('broadcasts.newTranslationStarted'));
      router.push(`/admin/broadcasts/${broadcastId}`);
    } catch (error) {
      console.error('Erreur preview:', error);
      toast.error(t('broadcasts.newPreviewError'));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <AdminLayout currentPage="/admin/broadcasts">
      <div className="space-y-4 sm:space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => router.push('/admin/broadcasts')}
            className="flex items-center space-x-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
            size="sm"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('broadcasts.newBack')}</span>
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t('broadcasts.newPageTitle')}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 hidden sm:block">{t('broadcasts.newPageSubtitle')}</p>
          </div>
        </div>

        {/* Section 1: Content */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg dark:text-gray-100">{t('broadcasts.newContentTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('broadcasts.newNameLabel')}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('broadcasts.newNamePlaceholder')}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('broadcasts.newSourceLanguageLabel')}
              </label>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.label} ({lang.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('broadcasts.newSubjectLabel')}
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('broadcasts.newSubjectPlaceholder')}
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('broadcasts.newBodyLabel')}
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('broadcasts.newBodyPlaceholder')}
                rows={10}
                className="w-full p-3 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-200 resize-y"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Targeting */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg dark:text-gray-100">{t('broadcasts.newTargetingTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('broadcasts.newActivityLabel')}
              </label>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                value={activityStatus}
                onChange={(e) => setActivityStatus(e.target.value as 'all' | 'active' | 'inactive')}
              >
                <option value="all">{t('broadcasts.newActivityAll')}</option>
                <option value="active">{t('broadcasts.newActivityActive')}</option>
                <option value="inactive">{t('broadcasts.newActivityInactive')}</option>
              </select>
            </div>

            {activityStatus === 'inactive' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('broadcasts.newInactiveDaysLabel')}
                </label>
                <Input
                  type="number"
                  value={inactiveDays}
                  onChange={(e) => setInactiveDays(Number(e.target.value))}
                  min={1}
                  className="w-48 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('broadcasts.newLanguagesLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map(lang => (
                  <label
                    key={lang.code}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 border rounded-md cursor-pointer text-sm transition-colors ${
                      selectedLanguages.includes(lang.code)
                        ? 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900 dark:border-blue-600 dark:text-blue-200'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLanguages.includes(lang.code)}
                      onChange={() => toggleLanguage(lang.code)}
                      className="sr-only"
                    />
                    <span>{lang.label}</span>
                  </label>
                ))}
              </div>
              {selectedLanguages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedLanguages([])}
                  className="text-xs text-blue-600 dark:text-blue-400 mt-1 hover:underline"
                >
                  {t('broadcasts.newDeselectAll')}
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('broadcasts.newCountriesLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map(code => (
                  <label
                    key={code}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 border rounded-md cursor-pointer text-sm transition-colors ${
                      selectedCountries.includes(code)
                        ? 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900 dark:border-blue-600 dark:text-blue-200'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCountries.includes(code)}
                      onChange={() => toggleCountry(code)}
                      className="sr-only"
                    />
                    <span>{code}</span>
                  </label>
                ))}
              </div>
              {selectedCountries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCountries([])}
                  className="text-xs text-blue-600 dark:text-blue-400 mt-1 hover:underline"
                >
                  {t('broadcasts.newDeselectAll')}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={saving || previewing}
            className="flex items-center space-x-2 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? t('broadcasts.newSaving') : t('broadcasts.newSaveDraft')}</span>
          </Button>
          <Button
            onClick={handlePreviewAndTranslate}
            disabled={saving || previewing}
            className="flex items-center space-x-2 dark:bg-blue-700 dark:hover:bg-blue-800"
          >
            <Eye className="h-4 w-4" />
            <span>{previewing ? t('broadcasts.newPreviewing') : t('broadcasts.newPreviewButton')}</span>
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
