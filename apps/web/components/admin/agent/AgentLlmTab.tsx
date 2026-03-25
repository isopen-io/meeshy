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
import { Loader2, Save, Key } from 'lucide-react';
import { InfoIcon } from './InfoIcon';
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
            <div className="flex items-center">
              <Label>Provider</Label>
              <InfoIcon content="Source d'intelligence. OpenAI (GPT) est rapide et polyvalent. Anthropic (Claude) est excellent pour le raisonnement logique et le respect strict des consignes de sécurité." />
            </div>
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
            <div className="flex items-center">
              <Label>Modèle</Label>
              <InfoIcon content="Version spécifique. Les modèles 'Mini' ou 'Haiku' sont optimisés pour le coût et la vitesse. Les versions complètes (4o, Sonnet) offrent une meilleure personnalité mais coûtent plus cher." />
            </div>
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
                <InfoIcon content="Contrôle l'audace du modèle. À 0, le modèle est conservateur et répétitif (parfait pour la FAQ). À 0.8+, il devient inventif et fluide (idéal pour l'animation). Attention : au-delà de 1.5, les réponses peuvent perdre leur sens." />
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
              <InfoIcon content="Taille maximale de la réponse (incluant la ponctuation). Une valeur de 1024 correspond à environ 750 mots. Limiter cette valeur permet de contrôler directement les coûts et d'éviter les réponses interminables." />
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
                <InfoIcon content="Arrêt d'urgence financier : si le coût cumulé des appels atteint ce montant, le provider est désactivé jusqu'à minuit. Prévoyez une marge de 20% par rapport à l'usage normal." />
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
                <InfoIcon content="Protection contre les contextes explosifs : refuse de générer une réponse si l'historique est si long que le coût unitaire dépasse ce seuil. Évite les factures surprises sur un seul message." />
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
