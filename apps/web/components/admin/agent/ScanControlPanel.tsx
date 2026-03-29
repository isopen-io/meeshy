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

type Scope = 'global' | 'conversation';

export default memo(function ScanControlPanel() {
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
          toast.success('Config globale mise a jour');
          fetchGlobal();
        } else {
          toast.error('Erreur');
        }
      } else if (selectedConvId) {
        const res = await agentAdminService.upsertConfig(selectedConvId, convForm);
        if (res.success) {
          toast.success('Config conversation mise a jour');
          fetchConv(selectedConvId);
        } else {
          toast.error('Erreur');
        }
      }
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setSaving(false);
    }
  };

  const CONV_TYPES = ['direct', 'group', 'channel', 'public', 'global'];

  // suppress unused variable warning — globalConfig is retained for future use
  void globalConfig;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4 text-indigo-500" />
            Controles
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
                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Scope par cycle</h4>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label>Conversations max/cycle</Label>
                    <InfoIcon content="0 = illimite. Nombre max de conversations scannees par cycle global." />
                  </div>
                  <Input
                    type="number"
                    value={globalForm.maxConversationsPerCycle ?? 0}
                    onChange={e => updateGlobal('maxConversationsPerCycle', Math.max(0, parseInt(e.target.value) || 0))}
                    min={0}
                    max={200}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label>Fraicheur messages ({globalForm.messageFreshnessHours ?? 22}h)</Label>
                    <InfoIcon content="Ignore les conversations sans message recent." />
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
                    <Label>Types eligibles</Label>
                    <InfoIcon content="Types de conversations que l'agent peut scanner." />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CONV_TYPES.map(t => {
                      const active = (globalForm.eligibleConversationTypes ?? []).includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => {
                            const current = globalForm.eligibleConversationTypes ?? [];
                            updateGlobal(
                              'eligibleConversationTypes',
                              active ? current.filter(x => x !== t) : [...current, t],
                            );
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-all ${active ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-gray-500'}`}
                        >
                          {t}
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
                      <Clock className="h-3 w-3" /> Cadence
                    </h4>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Label>Actif</Label>
                        <InfoIcon content="Active/desactive l'agent pour cette conversation." />
                      </div>
                      <Switch checked={convForm.enabled ?? true} onCheckedChange={v => updateConv('enabled', v)} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Label>Intervalle de scan ({convForm.scanIntervalMinutes ?? 3}min)</Label>
                        <InfoIcon content="Frequence des scans automatiques." />
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
                        <Label>Burst</Label>
                        <InfoIcon content="Mode rafale : plusieurs messages rapides." />
                      </div>
                      <Switch checked={convForm.burstEnabled ?? true} onCheckedChange={v => updateConv('burstEnabled', v)} />
                    </div>
                    {convForm.burstEnabled ? (
                      <div className="pl-4 border-l-2 border-indigo-100 dark:border-indigo-900 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]">Taille</Label>
                            <Input
                              type="number"
                              value={convForm.burstSize ?? 4}
                              onChange={e => updateConv('burstSize', Math.max(1, Math.min(10, parseInt(e.target.value) || 4)))}
                              min={1}
                              max={10}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Intervalle (min)</Label>
                            <Input
                              type="number"
                              value={convForm.burstIntervalMinutes ?? 5}
                              onChange={e => updateConv('burstIntervalMinutes', Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
                              min={1}
                              max={30}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Quiet (min)</Label>
                            <Input
                              type="number"
                              value={convForm.quietIntervalMinutes ?? 90}
                              onChange={e => updateConv('quietIntervalMinutes', Math.max(10, Math.min(480, parseInt(e.target.value) || 90)))}
                              min={10}
                              max={480}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Scope par cycle */}
                  <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="h-3 w-3" /> Reponses par cycle
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Min msgs</Label>
                        <Input
                          type="number"
                          value={convForm.minResponsesPerCycle ?? 2}
                          onChange={e => updateConv('minResponsesPerCycle', Math.max(0, parseInt(e.target.value) || 0))}
                          min={0}
                          max={50}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Max msgs</Label>
                        <Input
                          type="number"
                          value={convForm.maxResponsesPerCycle ?? 12}
                          onChange={e => updateConv('maxResponsesPerCycle', Math.max(1, parseInt(e.target.value) || 1))}
                          min={1}
                          max={50}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Max reactions</Label>
                        <Input
                          type="number"
                          value={convForm.maxReactionsPerCycle ?? 8}
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
                      <Users className="h-3 w-3" /> Participants
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Max users controles</Label>
                        <Input
                          type="number"
                          value={convForm.maxControlledUsers ?? 5}
                          onChange={e => updateConv('maxControlledUsers', Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                          min={1}
                          max={50}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px]">Auto-pickup</Label>
                        <Switch
                          checked={convForm.autoPickupEnabled ?? true}
                          onCheckedChange={v => updateConv('autoPickupEnabled', v)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Msgs/jour (semaine)</Label>
                        <Input
                          type="number"
                          value={convForm.weekdayMaxMessages ?? 10}
                          onChange={e => updateConv('weekdayMaxMessages', Math.max(1, parseInt(e.target.value) || 10))}
                          min={1}
                          max={100}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Msgs/jour (weekend)</Label>
                        <Input
                          type="number"
                          value={convForm.weekendMaxMessages ?? 25}
                          onChange={e => updateConv('weekendMaxMessages', Math.max(1, parseInt(e.target.value) || 25))}
                          min={1}
                          max={200}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Users/jour (semaine)</Label>
                        <Input
                          type="number"
                          value={convForm.weekdayMaxUsers ?? 4}
                          onChange={e => updateConv('weekdayMaxUsers', Math.max(1, parseInt(e.target.value) || 4))}
                          min={1}
                          max={20}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Users/jour (weekend)</Label>
                        <Input
                          type="number"
                          value={convForm.weekendMaxUsers ?? 6}
                          onChange={e => updateConv('weekendMaxUsers', Math.max(1, parseInt(e.target.value) || 6))}
                          min={1}
                          max={30}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Label>Seuil inactivite ({convForm.inactivityThresholdHours ?? 72}h)</Label>
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
                <div className="text-sm text-gray-400 text-center py-8">Aucune config pour cette conversation</div>
              )
            ) : (
              <div className="text-sm text-gray-400 text-center py-8">Selectionnez une conversation</div>
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
            Appliquer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
