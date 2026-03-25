'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Save, Key, HelpCircle } from 'lucide-react';
import { agentAdminService, type LlmConfigData, type LlmConfigUpdate } from '@/services/agent-admin.service';
import { toast } from 'sonner';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
] as const;

const MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  ],
};

export function AgentLlmTab() {
  const [config, setConfig] = useState<LlmConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<LlmConfigUpdate>({
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKeyEncrypted: '',
    maxTokens: 1024,
    temperature: 0.7,
    dailyBudgetUsd: 20,
    maxCostPerCall: 0.05,
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await agentAdminService.getLlmConfig();
        if (response.success && response.data) {
          const cfg = response.data;
          setConfig(cfg);
          setForm({
            provider: cfg.provider,
            model: cfg.model,
            maxTokens: cfg.maxTokens,
            temperature: cfg.temperature,
            dailyBudgetUsd: cfg.dailyBudgetUsd,
            maxCostPerCall: cfg.maxCostPerCall,
            fallbackProvider: cfg.fallbackProvider,
            fallbackModel: cfg.fallbackModel,
          });
        }
      } catch {
        toast.error('Erreur lors du chargement de la config LLM');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.apiKeyEncrypted) {
        delete payload.apiKeyEncrypted;
      }
      const response = await agentAdminService.updateLlmConfig(payload);
      if (response.success && response.data) {
        setConfig(response.data ?? null);
        setForm(prev => ({ ...prev, apiKeyEncrypted: '' }));
        toast.success('Configuration LLM mise à jour');
      }
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const InfoIcon = ({ content }: { content: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-gray-400 cursor-help hover:text-indigo-500 transition-colors inline ml-1.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const providerModels = MODELS[form.provider ?? 'openai'] ?? MODELS.openai;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Configuration LLM</CardTitle>
        {config?.hasApiKey && (
          <Badge variant="outline" className="text-green-600 border-green-200">
            <Key className="h-3 w-3 mr-1" />
            Clé configurée
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider & Model */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={form.provider}
              onValueChange={v => {
                setForm(prev => ({
                  ...prev,
                  provider: v,
                  model: MODELS[v]?.[0]?.value ?? 'gpt-4o-mini',
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Modèle</Label>
            <Select value={form.model} onValueChange={v => setForm(prev => ({ ...prev, model: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerModels.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label>Clé API {config?.hasApiKey && '(laisser vide pour conserver)'}</Label>
          <Input
            type="password"
            value={form.apiKeyEncrypted ?? ''}
            onChange={e => setForm(prev => ({ ...prev, apiKeyEncrypted: e.target.value }))}
            placeholder={config?.hasApiKey ? '********' : 'sk-...'}
          />
        </div>

        <Separator />

        {/* Parameters */}
        <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Paramètres de génération</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Température</Label>
                <InfoIcon content="Définit l'aspect aléatoire : 0 est déterministe, 0.7-1 est créatif mais cohérent, >1.5 peut devenir incohérent." />
              </div>
              <span className="text-sm text-gray-500 font-mono">{form.temperature?.toFixed(1)}</span>
            </div>
            <Slider
              value={[form.temperature ?? 0.7]}
              onValueChange={([v]) => setForm(prev => ({ ...prev, temperature: v }))}
              min={0}
              max={2}
              step={0.1}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center">
              <Label>Max Tokens</Label>
              <InfoIcon content="Limite la longueur maximale de la réponse générée par le modèle." />
            </div>
            <Input
              type="number"
              value={form.maxTokens}
              onChange={e => setForm(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 1024 }))}
              min={64}
              max={16384}
            />
          </div>
        </div>

        <Separator />

        {/* Budget */}
        <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Gestion du Budget</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Budget quotidien (USD)</Label>
                <InfoIcon content="Limite de dépenses cumulées par jour pour ce provider." />
              </div>
              <Input
                type="number"
                value={form.dailyBudgetUsd}
                onChange={e => setForm(prev => ({ ...prev, dailyBudgetUsd: parseFloat(e.target.value) || 20 }))}
                min={0}
                step={0.5}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Coût max par appel (USD)</Label>
                <InfoIcon content="Sécurité pour bloquer les requêtes qui dépasseraient ce coût (contexte trop large)." />
              </div>
              <Input
                type="number"
                value={form.maxCostPerCall}
                onChange={e => setForm(prev => ({ ...prev, maxCostPerCall: parseFloat(e.target.value) || 0.05 }))}
                min={0}
                step={0.01}
              />
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
