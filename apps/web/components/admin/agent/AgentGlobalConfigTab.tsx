'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Shield, LayoutGrid } from 'lucide-react';
import { InfoIcon } from './InfoIcon';
import { agentAdminService, type AgentGlobalConfigUpsert } from '@/services/agent-admin.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';

const CONVERSATION_TYPES = ['group', 'channel', 'public', 'global', 'broadcast'] as const;

export function AgentGlobalConfigTab() {
  const { t } = useI18n('admin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AgentGlobalConfigUpsert>({
    systemPrompt: '',
    enabled: true,
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    fallbackProvider: null,
    fallbackModel: null,
    globalDailyBudgetUsd: 10,
    maxConcurrentCalls: 5,
    eligibleConversationTypes: ['group', 'public', 'global'],
    messageFreshnessHours: 22,
    maxConversationsPerCycle: 0,
    weekdayMaxConversations: 50,
    weekendMaxConversations: 100,
    globalScanEnabled: false,
    globalScanMinInterval: 60,
    globalScanMaxInterval: 300,
  });

  useEffect(() => {
    agentAdminService.getGlobalConfig().then((res) => {
      if (res.success && res.data) {
        setForm({
          systemPrompt: res.data.systemPrompt,
          enabled: res.data.enabled,
          globalScanEnabled: res.data.globalScanEnabled ?? false,
          globalScanMinInterval: res.data.globalScanMinInterval ?? 60,
          globalScanMaxInterval: res.data.globalScanMaxInterval ?? 300,
          defaultProvider: res.data.defaultProvider,
          defaultModel: res.data.defaultModel,
          fallbackProvider: res.data.fallbackProvider,
          fallbackModel: res.data.fallbackModel,
          globalDailyBudgetUsd: res.data.globalDailyBudgetUsd,
          maxConcurrentCalls: res.data.maxConcurrentCalls,
          eligibleConversationTypes: res.data.eligibleConversationTypes ?? ['group', 'public', 'global'],
          messageFreshnessHours: res.data.messageFreshnessHours ?? 22,
          maxConversationsPerCycle: res.data.maxConversationsPerCycle ?? 0,
          weekdayMaxConversations: res.data.weekdayMaxConversations ?? 50,
          weekendMaxConversations: res.data.weekendMaxConversations ?? 100,
        });
      }
    }).catch(() => {
      toast.error(t('agent.toasts.globalConfigLoadError'));
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await agentAdminService.updateGlobalConfig(form);
      if (res.success) {
        const invalidation = (res as unknown as { cacheInvalidation?: { anyChannelSucceeded?: boolean } })
          .cacheInvalidation;
        if (invalidation && invalidation.anyChannelSucceeded === false) {
          toast.warning(t('agent.toasts.globalConfigSavedPending'));
        } else {
          toast.success(t('agent.toasts.globalConfigUpdated'));
        }
      } else {
        toast.error(t('agent.toasts.globalConfigUpdateError'));
      }
    } catch {
      toast.error(t('agent.toasts.globalConfigConnectionError'));
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AgentGlobalConfigUpsert>(key: K, value: AgentGlobalConfigUpsert[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleConversationType = (type: string) => {
    /* istanbul ignore next -- form.eligibleConversationTypes is always populated via setForm */
    const current = form.eligibleConversationTypes ?? [];
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    updateField('eligibleConversationTypes', next);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // Pre-compute ?? fallbacks — form is always fully populated via setForm; these defaults are defensive only.
  /* istanbul ignore next */
  const fEnabled = form.enabled ?? true;
  /* istanbul ignore next */
  const fSystemPrompt = form.systemPrompt ?? '';
  /* istanbul ignore next */
  const fDailyBudget = form.globalDailyBudgetUsd ?? 10;
  /* istanbul ignore next */
  const fMaxConcurrent = form.maxConcurrentCalls ?? 5;
  /* istanbul ignore next */
  const fGlobalScanEnabled = form.globalScanEnabled ?? false;
  /* istanbul ignore next */
  const fGlobalScanMin = form.globalScanMinInterval ?? 60;
  /* istanbul ignore next */
  const fGlobalScanMax = form.globalScanMaxInterval ?? 300;
  /* istanbul ignore next */
  const fEligibleTypes = form.eligibleConversationTypes ?? [];
  /* istanbul ignore next */
  const fFreshness = form.messageFreshnessHours ?? 22;
  /* istanbul ignore next */
  const fMaxConvPerCycle = form.maxConversationsPerCycle ?? 0;
  /* istanbul ignore next */
  const fWeekdayMax = form.weekdayMaxConversations ?? 50;
  /* istanbul ignore next */
  const fWeekendMax = form.weekendMaxConversations ?? 100;
  /* istanbul ignore next -- t() always returns a non-null string; ?? type fallback is unreachable */
  const fTypeLabel = (type: string) => t(`agent.overview.conversationType.${type}`) ?? type;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{t('globalConfig.cardTitle')}</CardTitle>
          <p className="text-xs text-gray-500 mt-1">{t('globalConfig.cardSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={form.enabled ? 'default' : 'destructive'} className="text-xs">
            <Shield className="h-3 w-3 mr-1" />
            {form.enabled ? t('globalConfig.active') : t('globalConfig.disabled')}
          </Badge>
          <Switch checked={fEnabled} onCheckedChange={v => updateField('enabled', v)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* System Prompt */}
        <div className="space-y-2 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center">
            <Label className="font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider text-xs">{t('globalConfig.systemPromptLabel')}</Label>
            <InfoIcon content={t('globalConfig.systemPromptHelp')} />
          </div>
          <Textarea
            rows={6}
            maxLength={10000}
            value={fSystemPrompt}
            onChange={e => updateField('systemPrompt', e.target.value)}
            placeholder={t('globalConfig.systemPromptPlaceholder')}
            className="bg-white dark:bg-gray-800"
          />
          <p className="text-xs text-gray-500">{fSystemPrompt.length}/10000</p>
        </div>

        {/* Provider & Model */}
        <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('globalConfig.defaultProvider')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('llm.labelProvider')}</Label>
                <InfoIcon content={t('globalConfig.defaultProviderHelp')} />
              </div>
              <select
                className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 text-sm"
                value={form.defaultProvider ?? 'openai'}
                onChange={e => updateField('defaultProvider', e.target.value)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('llm.labelModel')}</Label>
                <InfoIcon content={t('globalConfig.defaultModelHelp')} />
              </div>
              <Input
                value={form.defaultModel ?? 'gpt-4o-mini'}
                onChange={e => updateField('defaultModel', e.target.value)}
                className="bg-white dark:bg-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Fallback */}
        <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('globalConfig.fallbackSection')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelFallbackProvider')}</Label>
                <InfoIcon content={t('globalConfig.fallbackProviderHelp')} />
              </div>
              <Input
                value={form.fallbackProvider ?? ''}
                onChange={e => updateField('fallbackProvider', e.target.value || null)}
                placeholder={t('globalConfig.none')}
                className="bg-white dark:bg-gray-800"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelFallbackModel')}</Label>
                <InfoIcon content={t('globalConfig.fallbackModelHelp')} />
              </div>
              <Input
                value={form.fallbackModel ?? ''}
                onChange={e => updateField('fallbackModel', e.target.value || null)}
                placeholder={t('globalConfig.none')}
                className="bg-white dark:bg-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Budget & Concurrency */}
        <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('globalConfig.budgetSection')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelDailyBudget')}</Label>
                <InfoIcon content={t('globalConfig.dailyBudgetHelp')} />
              </div>
              <Input
                type="number"
                value={fDailyBudget}
                onChange={e => updateField('globalDailyBudgetUsd', Math.max(0, Math.min(1000, parseFloat(e.target.value) || 10)))}
                min={0}
                max={1000}
                step={0.5}
                className="bg-white dark:bg-gray-800"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelMaxConcurrent')}</Label>
                <InfoIcon content={t('globalConfig.maxConcurrentHelp')} />
              </div>
              <Input
                type="number"
                value={fMaxConcurrent}
                onChange={e => updateField('maxConcurrentCalls', Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                min={1}
                max={50}
                className="bg-white dark:bg-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Global Planner */}
        <div className="space-y-4 p-4 rounded-lg bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('globalConfig.globalScheduler')}</h3>
              <InfoIcon content={t('globalConfig.globalSchedulerHelp')} />
            </div>
            <Switch
              checked={fGlobalScanEnabled}
              onCheckedChange={v => updateField('globalScanEnabled', v)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelMinInterval')}</Label>
                <InfoIcon content={t('globalConfig.minIntervalHelp')} />
              </div>
              <Input
                type="number"
                value={fGlobalScanMin}
                onChange={e => updateField('globalScanMinInterval', parseInt(e.target.value) || 60)}
                className="bg-white dark:bg-gray-800"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelMaxInterval')}</Label>
                <InfoIcon content={t('globalConfig.maxIntervalHelp')} />
              </div>
              <Input
                type="number"
                value={fGlobalScanMax}
                onChange={e => updateField('globalScanMaxInterval', parseInt(e.target.value) || 300)}
                className="bg-white dark:bg-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Scan Settings */}
        <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('globalConfig.scanSection')}</h3>

          <div className="space-y-2">
            <div className="flex items-center">
              <Label>{t('globalConfig.labelEligibleTypes')}</Label>
              <InfoIcon content={t('globalConfig.eligibleTypesHelp')} />
            </div>
            <div className="flex flex-wrap gap-2">
              {CONVERSATION_TYPES.map(type => {
                const active = fEligibleTypes.includes(type);
                return (
                  <Badge
                    key={type}
                    variant={active ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleConversationType(type)}
                  >
                    {fTypeLabel(type)}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelFreshness')}</Label>
                <InfoIcon content={t('globalConfig.freshnessHelp')} />
              </div>
              <Input
                type="number"
                value={fFreshness}
                onChange={e => updateField('messageFreshnessHours', Math.max(1, Math.min(168, parseInt(e.target.value) || 22)))}
                min={1}
                max={168}
                className="bg-white dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500">{t('globalConfig.freshnessHint')}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelMaxConversations')}</Label>
                <InfoIcon content={t('globalConfig.maxConversationsHelp')} />
              </div>
              <Input
                type="number"
                value={fMaxConvPerCycle}
                onChange={e => updateField('maxConversationsPerCycle', Math.max(0, parseInt(e.target.value) || 0))}
                min={0}
                className="bg-white dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500">{t('globalConfig.maxConversationsHint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelWeekdayBudget')}</Label>
                <InfoIcon content={t('globalConfig.weekdayBudgetHelp')} />
              </div>
              <Input
                type="number"
                value={fWeekdayMax}
                onChange={e => updateField('weekdayMaxConversations', Math.max(1, Math.min(500, parseInt(e.target.value) || 50)))}
                min={1}
                max={500}
                className="bg-white dark:bg-gray-800"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('globalConfig.labelWeekendBudget')}</Label>
                <InfoIcon content={t('globalConfig.weekendBudgetHelp')} />
              </div>
              <Input
                type="number"
                value={fWeekendMax}
                onChange={e => updateField('weekendMaxConversations', Math.max(1, Math.min(500, parseInt(e.target.value) || 100)))}
                min={1}
                max={500}
                className="bg-white dark:bg-gray-800"
              />
            </div>
          </div>
        </div>

        <Separator />

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {t('globalConfig.saveButton')}
        </Button>
      </CardContent>
    </Card>
  );
}
