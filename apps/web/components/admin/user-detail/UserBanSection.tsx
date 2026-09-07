'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Ban as BanIcon, Loader2, Unlock } from 'lucide-react';
import { apiService } from '@/services/api.service';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';

interface AdminBan {
  id: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  liftedAt: string | null;
  liftReason: string | null;
  active: boolean;
}

interface UserBanSectionProps {
  userId: string;
  /** Rafraîchit le compte affiché — un ban change `isActive`. */
  onUpdate: () => void;
}

const DURATIONS: Array<{ key: string; hours: number | null }> = [
  { key: 'ban.duration24h', hours: 24 },
  { key: 'ban.duration7d', hours: 24 * 7 },
  { key: 'ban.duration30d', hours: 24 * 30 },
  { key: 'ban.durationPermanent', hours: null },
];

export function UserBanSection({ userId, onUpdate }: UserBanSectionProps) {
  const { t } = useI18n('admin');
  const locale = useCurrentInterfaceLanguage();
  const [bans, setBans] = useState<AdminBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [durationHours, setDurationHours] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [liftingId, setLiftingId] = useState<string | null>(null);

  const formatDate = useCallback(
    (date: string | null) => {
      if (!date) return '—';
      try {
        return new Date(date).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } /* istanbul ignore next -- toLocaleDateString never throws in practice */ catch {
        return '—';
      }
    },
    [locale]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // `apiService.get` enveloppe le corps ENTIER du gateway (`{success,
      // data}`) dans SON PROPRE `.data` — la liste est donc à `.data.data`,
      // jamais à `.data` (apps/web/CLAUDE.md § « Une liste paginée se lit… »,
      // qui vaut aussi hors pagination : c'est le même double enveloppement).
      const response = await apiService.get<{ success: boolean; data: AdminBan[] }>(
        API_ENDPOINTS.admin.usersByUserIdBans(userId)
      );
      setBans(response.data?.data ?? []);
    } catch {
      toast.error(t('ban.loadError'));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBan = async () => {
    if (reason.trim().length < 3) {
      toast.error(t('ban.reasonTooShort'));
      return;
    }
    try {
      setSaving(true);
      const expiresAt = durationHours === null ? null : new Date(Date.now() + durationHours * 3_600_000).toISOString();
      await apiService.post(API_ENDPOINTS.admin.usersByUserIdBan(userId), { reason: reason.trim(), expiresAt });
      toast.success(t('ban.banSuccess'));
      setFormOpen(false);
      setReason('');
      setDurationHours(null);
      await load();
      onUpdate();
    } catch (error: unknown) {
      toast.error((error as { message?: string })?.message || t('ban.banError'));
    } finally {
      setSaving(false);
    }
  };

  const handleLift = async (banId: string) => {
    try {
      setLiftingId(banId);
      await apiService.post(API_ENDPOINTS.admin.usersByUserIdBansByBanIdLift(userId, banId), {});
      toast.success(t('ban.liftSuccess'));
      await load();
      onUpdate();
    } catch (error: unknown) {
      toast.error((error as { message?: string })?.message || t('ban.liftError'));
    } finally {
      setLiftingId(null);
    }
  };

  return (
    <Card className="dark:bg-gray-900 dark:border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
          <BanIcon className="h-5 w-5" />
          <span>{t('ban.title')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : bans.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('ban.noBans')}</p>
        ) : (
          <ul className="space-y-3">
            {bans.map((ban) => (
              <li key={ban.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant={ban.active ? 'destructive' : 'secondary'}>
                    {ban.active ? t('ban.statusActive') : t('ban.statusLifted')}
                  </Badge>
                  {ban.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={liftingId === ban.id}
                      onClick={() => handleLift(ban.id)}
                    >
                      {liftingId === ban.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Unlock className="h-3.5 w-3.5 mr-1" />}
                      {t('ban.liftButton')}
                    </Button>
                  )}
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200">{ban.reason}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('ban.createdAt')}: {formatDate(ban.createdAt)} ·{' '}
                  {ban.expiresAt ? `${t('ban.expiresAt')}: ${formatDate(ban.expiresAt)}` : t('ban.durationPermanent')}
                </p>
              </li>
            ))}
          </ul>
        )}

        {!formOpen ? (
          <Button
            variant="outline"
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 dark:border-red-800"
            onClick={() => setFormOpen(true)}
          >
            <BanIcon className="h-4 w-4 mr-2" />
            {t('ban.banButton')}
          </Button>
        ) : (
          <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/30 space-y-3">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('ban.reasonPlaceholder')}
              rows={2}
            />
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <Button
                  key={d.key}
                  type="button"
                  variant={durationHours === d.hours ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDurationHours(d.hours)}
                >
                  {t(d.key)}
                </Button>
              ))}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setFormOpen(false)} disabled={saving}>
                {t('ban.cancelButton')}
              </Button>
              <Button variant="destructive" size="sm" className="flex-1" onClick={handleBan} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('ban.confirmButton')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
