'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { agentAdminService, type AgentGlobalConfigUpsert } from '@/services/agent-admin.service';
import { toast } from 'sonner';

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
        toast.success('Configuration globale mise à jour');
      } else {
        toast.error('Erreur lors de la mise à jour');
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AgentGlobalConfigUpsert>(key: K, value: AgentGlobalConfigUpsert[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Agent Global</h3>
          <p className="text-xs text-gray-500 mt-1">Kill switch global et paramètres par défaut</p>
        </div>
        <Switch checked={form.enabled ?? true} onCheckedChange={v => updateField('enabled', v)} />
      </div>

      <div className="space-y-2">
        <Label>System Prompt Global</Label>
        <Textarea
          rows={6}
          maxLength={10000}
          value={form.systemPrompt ?? ''}
          onChange={e => updateField('systemPrompt', e.target.value)}
          placeholder="Prompt système global pour tous les agents..."
        />
        <p className="text-xs text-gray-500">{(form.systemPrompt ?? '').length}/10000</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Provider par défaut</Label>
          <select
            className="w-full p-2 border rounded-md bg-transparent"
            value={form.defaultProvider ?? 'openai'}
            onChange={e => updateField('defaultProvider', e.target.value)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Modèle par défaut</Label>
          <Input
            value={form.defaultModel ?? 'gpt-4o-mini'}
            onChange={e => updateField('defaultModel', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Provider fallback</Label>
          <Input
            value={form.fallbackProvider ?? ''}
            onChange={e => updateField('fallbackProvider', e.target.value || null)}
            placeholder="Aucun"
          />
        </div>
        <div className="space-y-2">
          <Label>Modèle fallback</Label>
          <Input
            value={form.fallbackModel ?? ''}
            onChange={e => updateField('fallbackModel', e.target.value || null)}
            placeholder="Aucun"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
          <Label>Max appels simultanés</Label>
          <Input
            type="number"
            value={form.maxConcurrentCalls ?? 5}
            onChange={e => updateField('maxConcurrentCalls', Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
            min={1}
            max={50}
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Enregistrer
      </Button>
    </div>
  );
}
