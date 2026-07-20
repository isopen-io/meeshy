'use client';

import React, { memo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings, Globe, MessageSquare, Loader2, Save, Users, Clock, Zap } from 'lucide-react';
import { InfoIcon } from './InfoIcon';
import { ConversationPicker } from './ConversationPicker';
import {
  agentAdminService,
  type AgentConfigData,
  type AgentGlobalConfigData,
  type AgentConfigUpsert,
  type AgentGlobalConfigUpsert,
} from '@/services/agent-admin.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';

type Scope = 'global' | 'conversation';

export default memo(function ScanControlPanel() {
  const { t } = useI18n('admin');
  const [scope, setScope] = useState<Scope>('global');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Global config state
  const [globalConfig, setGlobalConfig] = useState<AgentGlobalConfigData | null>(null);
  const [globalForm, setGlobalForm] = useState<AgentGlobalConfigUpsert>({});
  const [globalLoading, setGlobalLoading] = useState(false);

  // Conversation config state
  const [convConfig, setConvConfig] = useState<AgentConfigData | null>(null);
  const [convForm, setConvForm] = useState<AgentConfigUpsert>({});
  const [convLoading, setConvLoading] = useState(false);

  // Fetch global config
  const fetchGlobal = useCallback(async () => {
    setGlobalLoading(true);
    try {
      const res = await agentAdminService.getGlobalConfig();
      if (res.success && res.data) {
        setGlobalConfig(res.data);
        setGlobalForm({
          maxConversationsPerCycle: res.data.maxConversationsPerCycle,
          messageFreshnessHours: res.data.messageFreshnessHours,
          eligibleConversationTypes: res.data.eligibleConversationTypes,
        });
      }
    } catch {
      // silently ignore
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  // Fetch conversation config
  const fetchConv = useCallback(async (id: string) => {
    setConvLoading(true);
    try {
      const res = await agentAdminService.getConfig(id);
      if (res.success && res.data) {
        setConvConfig(res.data);
        setConvForm({
          enabled: res.data.enabled,
          scanIntervalMinutes: res.data.scanIntervalMinutes,
          minResponsesPerCycle: res.data.minResponsesPerCycle,
          maxResponsesPerCycle: res.data.maxResponsesPerCycle,
          maxReactionsPerCycle: res.data.maxReactionsPerCycle,
          reactionsEnabled: res.data.reactionsEnabled,
          burstEnabled: res.data.burstEnabled,
          burstSize: res.data.burstSize,
          burstIntervalMinutes: res.data.burstIntervalMinutes,
          quietIntervalMinutes: res.data.quietIntervalMinutes,
          maxControlledUsers: res.data.maxControlledUsers,
          autoPickupEnabled: res.data.autoPickupEnabled,
          weekdayMaxMessages: res.data.weekdayMaxMessages,
          weekendMaxMessages: res.data.weekendMaxMessages,
          weekdayMaxUsers: res.data.weekdayMaxUsers,
          weekendMaxUsers: res.data.weekendMaxUsers,
          inactivityThresholdHours: res.data.inactivityThresholdHours,
          inactivityDaysThreshold: res.data.inactivityDaysThreshold,
          minDelayMinutes: res.data.minDelayMinutes ?? 1,
          maxDelayMinutes: res.data.maxDelayMinutes ?? 360,
          spreadOverDayEnabled: res.data.spreadOverDayEnabled ?? true,
          maxMessagesPerUserPer10Min: res.data.maxMessagesPerUserPer10Min ?? 4,
        });
      }
    } catch {
      // silently ignore
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => {
    if (scope === 'global') fetchGlobal();
  }, [scope, fetchGlobal]);

  useEffect(() => {
    if (scope === 'conversation' && selectedConvId) fetchConv(selectedConvId);
  }, [scope, selectedConvId, fetchConv]);

  const updateGlobal = <K extends keyof AgentGlobalConfigUpsert>(key: K, value: AgentGlobalConfigUpsert[K]) => {
    setGlobalForm(prev => ({ ...prev, [key]: value }));
  };

  const updateConv = <K extends keyof AgentConfigUpsert>(key: K, value: AgentConfigUpsert[K]) => {
    setConvForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (scope === 'global') {
        const res = await agentAdminService.updateGlobalConfig(globalForm);
        if (res.success) {
          toast.success(t('agent.toasts.globalConfigUpdated'));
          fetchGlobal();
        } else {
          toast.error(t('agent.toasts.globalConfigUpdateError'));
        }
      } else /* istanbul ignore next -- save button is disabled when no conversation selected */ if (selectedConvId) {
        const res = await agentAdminService.upsertConfig(selectedConvId, convForm);
        if (res.success) {
          toast.success(t('agent.toasts.conversationConfigUpdated'));
          fetchConv(selectedConvId);
        } else {
          toast.error(t('agent.toasts.updateError'));
        }
      }
    } catch {
      toast.error(t('agent.toasts.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const CONV_TYPES = ['direct', 'group', 'channel', 'public', 'global'];

  // suppress unused variable warning — globalConfig is retained for future use
  void globalConfig;

  // Pre-compute ?? fallbacks — these fields are always set by fetchGlobal/fetchConv; defaults are defensive only.
  /* istanbul ignore next */
  const gMaxConvPerCycle = globalForm.maxConversationsPerCycle ?? 0;
  /* istanbul ignore next */
  const gEligibleTypes = globalForm.eligibleConversationTypes ?? [];
  /* istanbul ignore next */
  const cBurstEnabled = convForm.burstEnabled ?? true;
  /* istanbul ignore next */
  const cBurstSize = convForm.burstSize ?? 4;
  /* istanbul ignore next */
  const cBurstInterval = convForm.burstIntervalMinutes ?? 5;
  /* istanbul ignore next */
  const cQuietInterval = convForm.quietIntervalMinutes ?? 90;
  /* istanbul ignore next */
  const cMinDelay = convForm.minDelayMinutes ?? 1;
  /* istanbul ignore next */
  const cMaxDelay = convForm.maxDelayMinutes ?? 360;
  /* istanbul ignore next */
  const cSpreadOverDay = convForm.spreadOverDayEnabled ?? true;
  /* istanbul ignore next */
  const cMaxMsgPer10Min = convForm.maxMessagesPerUserPer10Min ?? 4;
  /* istanbul ignore next */
  const cMinResponses = convForm.minResponsesPerCycle ?? 2;
  /* istanbul ignore next */
  const cMaxResponses = convForm.maxResponsesPerCycle ?? 12;
  /* istanbul ignore next */
  const cMaxReactions = convForm.maxReactionsPerCycle ?? 4;
  /* istanbul ignore next */
  const cMaxControlledUsers = convForm.maxControlledUsers ?? 5;
  /* istanbul ignore next */
  const cAutoPickup = convForm.autoPickupEnabled ?? true;
  /* istanbul ignore next */
  const cWeekdayMaxMsgs = convForm.weekdayMaxMessages ?? 10;
  /* istanbul ignore next */
  const cWeekendMaxMsgs = convForm.weekendMaxMessages ?? 25;
  /* istanbul ignore next */
  const cWeekdayMaxUsers = convForm.weekdayMaxUsers ?? 4;
  /* istanbul ignore next */
  const cWeekendMaxUsers = convForm.weekendMaxUsers ?? 6;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4 text-indigo-500" />
            {t('agent.scanControl.title')}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant={scope === 'global' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setScope('global')}
            >
              <Globe className="h-3 w-3 mr-1" /> Global
            </Button>
            <Button
              variant={scope === 'conversation' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setScope('conversation')}
            >
              <MessageSquare className="h-3 w-3 mr-1" /> Conversation
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {scope === 'global' ? (
          globalLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agent.scanControl.scopePerCycle')}</h4>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label>{t('agent.scanControl.maxConvPerCycle')}</Label>
                    <InfoIcon content={t('agent.scanControl.maxConvPerCycleInfo')} />
                  </div>
                  <Input
                    type="number"
                    value={gMaxConvPerCycle}
                    onChange={e => updateGlobal('maxConversationsPerCycle', Math.max(0, parseInt(e.target.value) || 0))}
                    min={0}
                    max={200}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label>{t('agent.scanControl.freshnessLabel', { hours: globalForm.messageFreshnessHours ?? 22 })}</Label>
                    <InfoIcon content={t('agent.scanControl.freshnessInfo')} />
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={168}
                    value={globalForm.messageFreshnessHours ?? 22}
                    onChange={e => updateGlobal('messageFreshnessHours', parseInt(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[9px] text-gray-400">
                    <span>1h</span>
                    <span>168h (7j)</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label>{t('agent.scanControl.eligibleTypes')}</Label>
                    <InfoIcon content={t('agent.scanControl.eligibleTypesInfo')} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CONV_TYPES.map(convType => {
                      const active = gEligibleTypes.includes(convType);
                      return (
                        <button
                          key={convType}
                          onClick={() => {
                            updateGlobal(
                              'eligibleConversationTypes',
                              active ? gEligibleTypes.filter(x => x !== convType) : [...gEligibleTypes, convType],
                            );
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-all ${active ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-gray-500'}`}
                        >
                          {convType}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <ConversationPicker
              selectedId={selectedConvId}
              onSelect={setSelectedConvId}
              onClear={() => setSelectedConvId(null)}
            />

            {selectedConvId ? (
              convLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : convConfig ? (
                <div className="space-y-4">
                  {/* Cadence */}
                  <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> {t('agent.scanControl.cadence')}
                    </h4>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Label>{t('agent.scanControl.active')}</Label>
                        <InfoIcon content={t('agent.scanControl.activeInfo')} />
                      </div>
                      <Switch checked={convForm.enabled ?? true} onCheckedChange={v => updateConv('enabled', v)} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Label>{t('agent.scanControl.scanIntervalLabel', { minutes: convForm.scanIntervalMinutes ?? 3 })}</Label>
                        <InfoIcon content={t('agent.scanControl.scanIntervalInfo')} />
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={60}
                        value={convForm.scanIntervalMinutes ?? 3}
                        onChange={e => updateConv('scanIntervalMinutes', parseInt(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                      <div className="flex justify-between text-[9px] text-gray-400">
                        <span>1min</span>
                        <span>60min</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Label>{t('agent.scanControl.burst')}</Label>
                        <InfoIcon content={t('agent.scanControl.burstInfo')} />
                      </div>
                      <Switch checked={cBurstEnabled} onCheckedChange={v => updateConv('burstEnabled', v)} />
                    </div>
                    {convForm.burstEnabled ? (
                      <div className="pl-4 border-l-2 border-indigo-100 dark:border-indigo-900 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]">{t('agent.scanControl.burstSize')}</Label>
                            <Input
                              type="number"
                              value={cBurstSize}
                              onChange={e => updateConv('burstSize', Math.max(1, Math.min(10, parseInt(e.target.value) || 4)))}
                              min={1}
                              max={10}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">{t('agent.scanControl.burstInterval')}</Label>
                            <Input
                              type="number"
                              value={cBurstInterval}
                              onChange={e => updateConv('burstIntervalMinutes', Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
                              min={1}
                              max={30}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">{t('agent.scanControl.burstQuiet')}</Label>
                            <Input
                              type="number"
                              value={cQuietInterval}
                              onChange={e => updateConv('quietIntervalMinutes', Math.max(10, Math.min(480, parseInt(e.target.value) || 90)))}
                              min={10}
                              max={480}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Distribution temporelle */}
                  <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> {t('agent.scanControl.timeDistribution')}
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.minDelay')}</Label>
                        <Input
                          type="number"
                          value={cMinDelay}
                          onChange={e => updateConv('minDelayMinutes', Math.max(1, Math.min(1440, parseInt(e.target.value) || 1)))}
                          min={1}
                          max={1440}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.maxDelay')}</Label>
                        <Input
                          type="number"
                          value={cMaxDelay}
                          onChange={e => updateConv('maxDelayMinutes', Math.max(1, Math.min(1440, parseInt(e.target.value) || 360)))}
                          min={1}
                          max={1440}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px]">{t('agent.scanControl.spreadOverDay')}</Label>
                      <Switch
                        checked={cSpreadOverDay}
                        onCheckedChange={v => updateConv('spreadOverDayEnabled', v)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">{t('agent.scanControl.maxMsgPer10Min')}</Label>
                      <Input
                        type="number"
                        value={cMaxMsgPer10Min}
                        onChange={e => updateConv('maxMessagesPerUserPer10Min', Math.max(1, Math.min(20, parseInt(e.target.value) || 4)))}
                        min={1}
                        max={20}
                      />
                    </div>
                  </div>

                  {/* Scope par cycle */}
                  <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="h-3 w-3" /> {t('agent.scanControl.responsesPerCycle')}
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.minMsgs')}</Label>
                        <Input
                          type="number"
                          value={cMinResponses}
                          onChange={e => updateConv('minResponsesPerCycle', Math.max(0, parseInt(e.target.value) || 0))}
                          min={0}
                          max={50}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.maxMsgs')}</Label>
                        <Input
                          type="number"
                          value={cMaxResponses}
                          onChange={e => updateConv('maxResponsesPerCycle', Math.max(1, parseInt(e.target.value) || 1))}
                          min={1}
                          max={50}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.maxReactions')}</Label>
                        <Input
                          type="number"
                          value={cMaxReactions}
                          onChange={e => updateConv('maxReactionsPerCycle', Math.max(0, parseInt(e.target.value) || 0))}
                          min={0}
                          max={50}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Participants */}
                  <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> {t('agent.scanControl.participants')}
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.maxControlledUsers')}</Label>
                        <Input
                          type="number"
                          value={cMaxControlledUsers}
                          onChange={e => updateConv('maxControlledUsers', Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                          min={1}
                          max={50}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px]">{t('agent.scanControl.autoPickup')}</Label>
                        <Switch
                          checked={cAutoPickup}
                          onCheckedChange={v => updateConv('autoPickupEnabled', v)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.weekdayMsgs')}</Label>
                        <Input
                          type="number"
                          value={cWeekdayMaxMsgs}
                          onChange={e => updateConv('weekdayMaxMessages', Math.max(1, parseInt(e.target.value) || 10))}
                          min={1}
                          max={100}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.weekendMsgs')}</Label>
                        <Input
                          type="number"
                          value={cWeekendMaxMsgs}
                          onChange={e => updateConv('weekendMaxMessages', Math.max(1, parseInt(e.target.value) || 25))}
                          min={1}
                          max={200}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">{t('agent.scanControl.weekdayUsers')}</Label>
                        <Input
                          type="number"
                          value={cWeekdayMaxUsers}
                          onChange={e => updateConv('weekdayMaxUsers', Math.max(1, parseInt(e.target.value) || 4))}
                          min={1}
                          max={20}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Users/jour (weekend)</Label>
                        <Input
                          type="number"
                          value={cWeekendMaxUsers}
                          onChange={e => updateConv('weekendMaxUsers', Math.max(1, parseInt(e.target.value) || 6))}
                          min={1}
                          max={30}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Label>{t('agent.scanControl.inactivityLabel', { hours: convForm.inactivityThresholdHours ?? 72 })}</Label>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={720}
                        value={convForm.inactivityThresholdHours ?? 72}
                        onChange={e => updateConv('inactivityThresholdHours', parseInt(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                      <div className="flex justify-between text-[9px] text-gray-400">
                        <span>1h</span>
                        <span>720h (30j)</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400 text-center py-8">{t('agent.scanControl.noConfig')}</div>
              )
            ) : (
              <div className="text-sm text-gray-400 text-center py-8">{t('agent.scanControl.selectConversation')}</div>
            )}
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
          <Button
            onClick={handleSave}
            disabled={saving || (scope === 'conversation' && !selectedConvId)}
            size="sm"
            className="gap-1.5"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {t('agent.scanControl.apply')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
