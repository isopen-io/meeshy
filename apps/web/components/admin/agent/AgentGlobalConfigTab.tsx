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
import { Loader2, Save, Shield } from 'lucide-react';
import { agentAdminService, type AgentGlobalConfigUpsert } from '@/services/agent-admin.service';
import { toast } from 'sonner';

const CONVERSATION_TYPES = ['group', 'channel', 'public', 'global', 'broadcast'] as const;
const TYPE_LABELS: Record<string, string> = {
  group: 'Groupe',
  channel: 'Canal',
  public: 'Public',
  global: 'Global',
  broadcast: 'Broadcast',
};

export function AgentGlobalConfigTab() {
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
  });

  useEffect(() => {
    agentAdminService.getGlobalConfig().then((res) => {
      if (res.success && res.data) {
        setForm({
          systemPrompt: res.data.systemPrompt,
          enabled: res.data.enabled,
          defaultProvider: res.data.defaultProvider,
          defaultModel: res.data.defaultModel,
          fallbackProvider: res.data.fallbackProvider,
          fallbackModel: res.data.fallbackModel,
          globalDailyBudgetUsd: res.data.globalDailyBudgetUsd,
          maxConcurrentCalls: res.data.maxConcurrentCalls,
          eligibleConversationTypes: res.data.eligibleConversationTypes ?? ['group', 'public', 'global'],
          messageFreshnessHours: res.data.messageFreshnessHours ?? 22,
          maxConversationsPerCycle: res.data.maxConversationsPerCycle ?? 0,
        });
      }
    }).catch(() => {
      toast.error('Erreur de chargement de la configuration globale');
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await agentAdminService.updateGlobalConfig(form);
      if (res.success) {
        toast.success('Configuration globale mise \u00e0 jour');
      } else {
        toast.error('Erreur lors de la mise \u00e0 jour');
      }
    } catch {
      toast.error('Erreur de connexion au serveur');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AgentGlobalConfigUpsert>(key: K, value: AgentGlobalConfigUpsert[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleConversationType = (type: string) => {
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Configuration Globale</CardTitle>
          <p className="text-xs text-gray-500 mt-1">Kill switch global et param\u00e8tres par d\u00e9faut</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={form.enabled ? 'default' : 'destructive'} className="text-xs">
            <Shield className="h-3 w-3 mr-1" />
            {form.enabled ? 'Actif' : 'D\u00e9sactiv\u00e9'}
          </Badge>
          <Switch checked={form.enabled ?? true} onCheckedChange={v => updateField('enabled', v)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* System Prompt */}
        <div className="space-y-2">
          <Label>System Prompt Global</Label>
          <Textarea
            rows={6}
            maxLength={10000}
            value={form.systemPrompt ?? ''}
            onChange={e => updateField('systemPrompt', e.target.value)}
            placeholder="Prompt syst\u00e8me global pour tous les agents..."
          />
          <p className="text-xs text-gray-500">{(form.systemPrompt ?? '').length}/10000</p>
        </div>

        <Separator />

        {/* Provider & Model */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Provider par d\u00e9faut</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <select
                className="w-full p-2 border rounded-md bg-transparent text-sm"
                value={form.defaultProvider ?? 'openai'}
                onChange={e => updateField('defaultProvider', e.target.value)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Mod\u00e8le</Label>
              <Input
                value={form.defaultModel ?? 'gpt-4o-mini'}
                onChange={e => updateField('defaultModel', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Fallback */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Fallback</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider fallback</Label>
              <Input
                value={form.fallbackProvider ?? ''}
                onChange={e => updateField('fallbackProvider', e.target.value || null)}
                placeholder="Aucun"
              />
            </div>
            <div className="space-y-2">
              <Label>Mod\u00e8le fallback</Label>
              <Input
                value={form.fallbackModel ?? ''}
                onChange={e => updateField('fallbackModel', e.target.value || null)}
                placeholder="Aucun"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Budget & Concurrency */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Budget & Concurrence</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Budget quotidien (USD)</Label>
              <Input
                type="number"
                value={form.globalDailyBudgetUsd ?? 10}
                onChange={e => updateField('globalDailyBudgetUsd', Math.max(0, Math.min(1000, parseFloat(e.target.value) || 10)))}
                min={0}
                max={1000}
                step={0.5}
              />
            </div>
            <div className="space-y-2">
              <Label>Max appels simultan\u00e9s</Label>
              <Input
                type="number"
                value={form.maxConcurrentCalls ?? 5}
                onChange={e => updateField('maxConcurrentCalls', Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                min={1}
                max={50}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Scan Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Param\u00e8tres de scan</h3>

          <div className="space-y-2">
            <Label>Types de conversations \u00e9ligibles</Label>
            <div className="flex flex-wrap gap-2">
              {CONVERSATION_TYPES.map(type => {
                const active = (form.eligibleConversationTypes ?? []).includes(type);
                return (
                  <Badge
                    key={type}
                    variant={active ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleConversationType(type)}
                  >
                    {TYPE_LABELS[type] ?? type}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fra\u00eecheur messages (heures)</Label>
              <Input
                type="number"
                value={form.messageFreshnessHours ?? 22}
                onChange={e => updateField('messageFreshnessHours', Math.max(1, Math.min(168, parseInt(e.target.value) || 22)))}
                min={1}
                max={168}
              />
              <p className="text-xs text-gray-500">Messages plus vieux que cette limite sont ignor\u00e9s</p>
            </div>
            <div className="space-y-2">
              <Label>Max conversations/cycle</Label>
              <Input
                type="number"
                value={form.maxConversationsPerCycle ?? 0}
                onChange={e => updateField('maxConversationsPerCycle', Math.max(0, parseInt(e.target.value) || 0))}
                min={0}
              />
              <p className="text-xs text-gray-500">0 = illimit\u00e9</p>
            </div>
          </div>
        </div>

        <Separator />

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer
        </Button>
      </CardContent>
    </Card>
  );
}
