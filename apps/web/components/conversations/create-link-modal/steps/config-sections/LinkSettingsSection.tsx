'use client';

import { Link2, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/hooks/useI18n';
import { InfoIcon } from '../../components/InfoIcon';
import { DURATION_OPTIONS, LIMIT_OPTIONS } from '../../constants';

interface LinkSettingsSectionProps {
  expirationDays: number;
  setExpirationDays: (days: number) => void;
  maxUses: number | undefined;
  setMaxUses: (uses: number | undefined) => void;
  requireAccount: boolean;
  setRequireAccount: (require: boolean) => void;
}

export function LinkSettingsSection({
  expirationDays,
  setExpirationDays,
  maxUses,
  setMaxUses,
  requireAccount,
  setRequireAccount
}: LinkSettingsSectionProps) {
  const { t } = useI18n('modals');

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="bg-primary/5">
        <CardTitle className="text-lg flex items-center">
          <Link2 className="h-5 w-5 mr-2" />
          {t('createLinkModal.linkDetails.title')}
        </CardTitle>
        <CardDescription>
          {t('createLinkModal.linkConfiguration.validityDurationInfo')}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-blue-600" />
                <Label className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  {t('createLinkModal.linkDetails.requireAccount.label')}
                </Label>
                <InfoIcon content={t('createLinkModal.linkDetails.requireAccount.info')} />
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {t('createLinkModal.linkDetails.requireAccount.description')}
              </p>
            </div>
            <Switch
              checked={requireAccount}
              onCheckedChange={setRequireAccount}
              className="data-[state=checked]:bg-blue-600"
            />
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label className="text-sm font-medium">
                {t('createLinkModal.linkConfiguration.validityDuration')}
              </Label>
              <InfoIcon content={t('createLinkModal.linkConfiguration.validityDurationInfo')} />
            </div>
            <Select
              value={expirationDays.toString()}
              onValueChange={(value) => setExpirationDays(parseInt(value))}
            >
              <SelectTrigger className="w-full h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    <div>
                      <div className="font-medium">{t(option.labelKey)}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(option.descriptionKey)}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Label className="text-sm font-medium">
                {t('createLinkModal.linkConfiguration.usageLimit')}
              </Label>
              <InfoIcon content={t('createLinkModal.linkConfiguration.usageLimitInfo')} />
            </div>
            <Select
              value={maxUses?.toString() || 'unlimited'}
              onValueChange={(value) =>
                setMaxUses(value === 'unlimited' ? undefined : parseInt(value))
              }
            >
              <SelectTrigger className="w-full h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value || 'unlimited'}
                    value={option.value?.toString() || 'unlimited'}
                  >
                    <div>
                      <div className="font-medium">{t(option.labelKey)}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(option.descriptionKey)}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
