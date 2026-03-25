'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, HelpCircle } from 'lucide-react';
import { agentAdminService, type AgentConfigData, type AgentConfigUpsert } from '@/services/agent-admin.service';
import { AgentRolesSection } from './AgentRolesSection';
import { UserPicker } from './UserPicker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface AgentConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AgentConfigData | null;
  onSave: () => void;
}

const DEFAULTS: AgentConfigUpsert = {
  enabled: true,
  autoPickupEnabled: false,
  inactivityThresholdHours: 72,
  minHistoricalMessages: 0,
  maxControlledUsers: 5,
  triggerOnTimeout: true,
  timeoutSeconds: 300,
  triggerOnUserMessage: false,
  triggerOnReplyTo: true,
  agentType: 'personal',
  contextWindowSize: 50,
  useFullHistory: false,
  excludedRoles: [],
  excludedUserIds: [],
  manualUserIds: [],
  triggerFromUserIds: [],
  scanIntervalMinutes: 3,
  minResponsesPerCycle: 2,
  maxResponsesPerCycle: 12,
  reactionsEnabled: true,
  maxReactionsPerCycle: 8,
  agentInstructions: null,
  webSearchEnabled: false,
  minWordsPerMessage: 3,
  maxWordsPerMessage: 400,
  generationTemperature: 0.8,
  qualityGateEnabled: true,
  qualityGateMinScore: 0.5,
  weekdayMaxMessages: 10,
  weekendMaxMessages: 25,
  weekdayMaxUsers: 4,
  weekendMaxUsers: 6,
  burstEnabled: true,
  burstSize: 4,
  burstIntervalMinutes: 5,
  quietIntervalMinutes: 90,
  inactivityDaysThreshold: 3,
  prioritizeTaggedUsers: true,
  prioritizeRepliedUsers: true,
  reactionBoostFactor: 1.5,
};

export function AgentConfigDialog({ open, onOpenChange, config, onSave }: AgentConfigDialogProps) {
  const isNew = !config;
  const [saving, setSaving] = useState(false);
  const [conversationId, setConversationId] = useState('');

  const [form, setForm] = useState<AgentConfigUpsert>({ ...DEFAULTS });

  useEffect(() => {
    if (config) {
      setConversationId(config.conversationId);
      setForm({
        enabled: config.enabled,
        autoPickupEnabled: config.autoPickupEnabled,
        inactivityThresholdHours: config.inactivityThresholdHours,
        minHistoricalMessages: config.minHistoricalMessages,
        maxControlledUsers: config.maxControlledUsers,
        triggerOnTimeout: config.triggerOnTimeout,
        timeoutSeconds: config.timeoutSeconds,
        triggerOnUserMessage: config.triggerOnUserMessage,
        triggerOnReplyTo: config.triggerOnReplyTo,
        agentType: config.agentType,
        contextWindowSize: config.contextWindowSize,
        useFullHistory: config.useFullHistory,
        excludedRoles: config.excludedRoles,
        excludedUserIds: config.excludedUserIds,
        manualUserIds: config.manualUserIds,
        triggerFromUserIds: config.triggerFromUserIds,
        scanIntervalMinutes: config.scanIntervalMinutes,
        minResponsesPerCycle: config.minResponsesPerCycle,
        maxResponsesPerCycle: config.maxResponsesPerCycle,
        reactionsEnabled: config.reactionsEnabled,
        maxReactionsPerCycle: config.maxReactionsPerCycle,
        agentInstructions: config.agentInstructions,
        webSearchEnabled: config.webSearchEnabled,
        minWordsPerMessage: config.minWordsPerMessage,
        maxWordsPerMessage: config.maxWordsPerMessage,
        generationTemperature: config.generationTemperature,
        qualityGateEnabled: config.qualityGateEnabled,
        qualityGateMinScore: config.qualityGateMinScore,
        weekdayMaxMessages: config.weekdayMaxMessages,
        weekendMaxMessages: config.weekendMaxMessages,
        weekdayMaxUsers: config.weekdayMaxUsers,
        weekendMaxUsers: config.weekendMaxUsers,
        burstEnabled: config.burstEnabled,
        burstSize: config.burstSize,
        burstIntervalMinutes: config.burstIntervalMinutes,
        quietIntervalMinutes: config.quietIntervalMinutes,
        inactivityDaysThreshold: config.inactivityDaysThreshold,
        prioritizeTaggedUsers: config.prioritizeTaggedUsers,
        prioritizeRepliedUsers: config.prioritizeRepliedUsers,
        reactionBoostFactor: config.reactionBoostFactor,
      });
    } else {
      setConversationId('');
      setForm({ ...DEFAULTS });
    }
  }, [config, open]);

  const handleSave = async () => {
    if (!conversationId.match(/^[0-9a-fA-F]{24}$/)) {
      toast.error('ID de conversation invalide (24 caractères hexadécimaux)');
      return;
    }

    setSaving(true);
    try {
      await agentAdminService.upsertConfig(conversationId, form);
      toast.success(isNew ? 'Configuration créée' : 'Configuration mise à jour');
      onSave();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AgentConfigUpsert>(key: K, value: AgentConfigUpsert[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isNew ? 'Nouvelle configuration agent' : 'Modifier la configuration'}
            {!isNew && config?.conversation?.title && (
              <span className="block text-sm font-normal text-gray-500 mt-1">
                {config.conversation.title}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4 px-1">
          {/* Conversation ID */}
          {isNew && (
            <div className="space-y-2 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
              <Label>ID Conversation</Label>
              <Input
                value={conversationId}
                onChange={e => setConversationId(e.target.value)}
                placeholder="ObjectId (24 hex chars)"
                className="font-mono"
              />
            </div>
          )}

          {/* Général */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Général</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Agent activé</Label>
                <InfoIcon content="Active ou désactive complètement l'agent pour cette conversation." />
              </div>
              <Switch checked={form.enabled} onCheckedChange={v => updateField('enabled', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Auto-pickup</Label>
                <InfoIcon content="Permet à l'agent de prendre automatiquement le contrôle d'utilisateurs inactifs." />
              </div>
              <Switch checked={form.autoPickupEnabled} onCheckedChange={v => updateField('autoPickupEnabled', v)} />
            </div>
          </div>

          {/* Comportement */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Comportement & Contexte</h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Type d&apos;agent</Label>
                <InfoIcon content="Définit le rôle de l'agent. Support = formel, Animateur = engageant, FAQ = informatif." />
              </div>
              <select
                className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 text-sm"
                value={form.agentType}
                onChange={e => updateField('agentType', e.target.value)}
              >
                <option value="personal">Personnel</option>
                <option value="support">SAV / Support</option>
                <option value="faq">FAQ</option>
                <option value="animator">Animateur</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Taille fenêtre contextuelle (messages)</Label>
                <InfoIcon content="Nombre de messages récents envoyés au LLM pour comprendre le contexte." />
              </div>
              <Input
                type="number"
                value={form.contextWindowSize}
                onChange={e => updateField('contextWindowSize', parseInt(e.target.value) || 50)}
                min={10}
                max={250}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Utiliser l&apos;historique complet (Max 250)</Label>
                <InfoIcon content="Ignore la fenêtre glissante pour envoyer le maximum de messages possible (limité par le LLM)." />
              </div>
              <Switch checked={form.useFullHistory} onCheckedChange={v => updateField('useFullHistory', v)} />
            </div>
          </div>

          {/* Triggers */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Triggers</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Trigger sur timeout</Label>
                <InfoIcon content="L'agent se déclenche automatiquement après une période d'inactivité." />
              </div>
              <Switch checked={form.triggerOnTimeout} onCheckedChange={v => updateField('triggerOnTimeout', v)} />
            </div>
            {form.triggerOnTimeout && (
              <div className="space-y-2 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <Label>Timeout (secondes)</Label>
                <Input
                  type="number"
                  value={form.timeoutSeconds}
                  onChange={e => updateField('timeoutSeconds', parseInt(e.target.value) || 300)}
                  min={30}
                  max={3600}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Trigger sur message utilisateur</Label>
                <InfoIcon content="L'agent répond dès qu'un utilisateur envoie un message (Attention au flood)." />
              </div>
              <Switch checked={form.triggerOnUserMessage} onCheckedChange={v => updateField('triggerOnUserMessage', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Trigger sur reply-to</Label>
                <InfoIcon content="L'agent répond systématiquement quand on lui répond ou qu'il est cité." />
              </div>
              <Switch checked={form.triggerOnReplyTo} onCheckedChange={v => updateField('triggerOnReplyTo', v)} />
            </div>

            <UserPicker
              label="Trigger seulement pour ces utilisateurs"
              userIds={form.triggerFromUserIds || []}
              onAdd={id => updateField('triggerFromUserIds', [...(form.triggerFromUserIds || []), id])}
              onRemove={id => updateField('triggerFromUserIds', (form.triggerFromUserIds || []).filter(u => u !== id))}
              placeholder="Chercher pour restreindre les triggers..."
            />
          </div>

          {/* Seuils */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Seuils & Contrôle</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Inactivité (heures)</Label>
                  <InfoIcon content="Délai avant qu'un utilisateur soit considéré comme inactif pour l'auto-pickup." />
                </div>
                <Input
                  type="number"
                  value={form.inactivityThresholdHours}
                  onChange={e => updateField('inactivityThresholdHours', parseInt(e.target.value) || 72)}
                  min={1}
                  max={720}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Messages min.</Label>
                  <InfoIcon content="Nombre de messages minimum dans la conversation avant que l'agent ne s'active." />
                </div>
                <Input
                  type="number"
                  value={form.minHistoricalMessages}
                  onChange={e => updateField('minHistoricalMessages', parseInt(e.target.value) || 0)}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Max utilisateurs contrôlés</Label>
                  <InfoIcon content="Limite du nombre d'utilisateurs que l'agent peut piloter simultanément." />
                </div>
                <Input
                  type="number"
                  value={form.maxControlledUsers}
                  onChange={e => updateField('maxControlledUsers', parseInt(e.target.value) || 5)}
                  min={1}
                  max={50}
                />
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <UserPicker
                label="Utilisateurs contrôlés manuellement"
                userIds={form.manualUserIds || []}
                onAdd={id => updateField('manualUserIds', [...(form.manualUserIds || []), id])}
                onRemove={id => updateField('manualUserIds', (form.manualUserIds || []).filter(u => u !== id))}
                placeholder="Ajouter un utilisateur sous contrôle..."
              />

              <UserPicker
                label="Utilisateurs exclus (Blacklist)"
                userIds={form.excludedUserIds || []}
                onAdd={id => updateField('excludedUserIds', [...(form.excludedUserIds || []), id])}
                onRemove={id => updateField('excludedUserIds', (form.excludedUserIds || []).filter(u => u !== id))}
                placeholder="Exclure un utilisateur du contrôle..."
              />

              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Rôles exclus</Label>
                  <InfoIcon content="L'agent ne pourra jamais prendre le contrôle d'utilisateurs ayant ces rôles." />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['USER', 'ADMIN', 'MODO', 'AUDIT', 'ANALYST', 'BIGBOSS'].map(role => {
                    const isExcluded = (form.excludedRoles ?? []).includes(role);
                    return (
                      <Badge
                        key={role}
                        variant={isExcluded ? 'destructive' : 'outline'}
                        className="cursor-pointer select-none py-1 px-3"
                        onClick={() => {
                          const current = form.excludedRoles ?? [];
                          const next = isExcluded ? current.filter(r => r !== role) : [...current, role];
                          updateField('excludedRoles', next);
                        }}
                      >
                        {role}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Planificateur */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Planificateur</h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Fréquence de scan</Label>
                <InfoIcon content="Intervalle de temps entre chaque analyse de la conversation par l'agent." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Heures</Label>
                  <Input
                    type="number"
                    value={Math.floor((form.scanIntervalMinutes ?? 3) / 60)}
                    onChange={e => {
                      const hours = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                      const minutes = (form.scanIntervalMinutes ?? 3) % 60;
                      updateField('scanIntervalMinutes', Math.max(1, hours * 60 + minutes));
                    }}
                    min={0}
                    max={24}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Minutes</Label>
                  <Input
                    type="number"
                    value={(form.scanIntervalMinutes ?? 3) % 60}
                    onChange={e => {
                      const hours = Math.floor((form.scanIntervalMinutes ?? 3) / 60);
                      const minutes = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                      updateField('scanIntervalMinutes', Math.max(1, hours * 60 + minutes));
                    }}
                    min={0}
                    max={59}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Min réponses/cycle</Label>
                  <InfoIcon content="Nombre minimum de messages que l'agent doit envoyer lors d'un cycle de réponse." />
                </div>
                <Input
                  type="number"
                  value={form.minResponsesPerCycle ?? 2}
                  onChange={e => updateField('minResponsesPerCycle', Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={50}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Max réponses/cycle</Label>
                  <InfoIcon content="Limite maximum de messages envoyés par cycle pour éviter le spam." />
                </div>
                <Input
                  type="number"
                  value={form.maxResponsesPerCycle ?? 12}
                  onChange={e => updateField('maxResponsesPerCycle', Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={50}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Réactions activées</Label>
                <InfoIcon content="Permet à l'agent d'ajouter des réactions (emojis) aux messages." />
              </div>
              <Switch checked={form.reactionsEnabled ?? true} onCheckedChange={v => updateField('reactionsEnabled', v)} />
            </div>
            {form.reactionsEnabled !== false && (
              <div className="space-y-2 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <Label>Max réactions/cycle</Label>
                <Input
                  type="number"
                  value={form.maxReactionsPerCycle ?? 8}
                  onChange={e => updateField('maxReactionsPerCycle', Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={50}
                />
              </div>
            )}
          </div>

          {/* Instructions Agent */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Instructions Agent</h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Instructions spécifiques</Label>
                <InfoIcon content="Directives particulières pour le comportement de l'agent dans ce salon précis." />
              </div>
              <Textarea
                rows={4}
                maxLength={5000}
                value={form.agentInstructions ?? ''}
                onChange={e => updateField('agentInstructions', e.target.value || null)}
                placeholder="Instructions personnalisées pour l'agent dans cette conversation..."
                className="bg-white dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500">{(form.agentInstructions ?? '').length}/5000</p>
            </div>
          </div>

          {/* Recherche Web */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Recherche Web</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center">
                  <Label>Recherche web activée</Label>
                  <InfoIcon content="Autorise l'agent à utiliser un moteur de recherche pour les infos en temps réel." />
                </div>
                <p className="text-xs text-gray-500 mt-1">Permet à l&apos;agent de rechercher des informations actuelles</p>
              </div>
              <Switch checked={form.webSearchEnabled ?? false} onCheckedChange={v => updateField('webSearchEnabled', v)} />
            </div>
          </div>

          {/* Génération */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Génération</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Mots min. par message</Label>
                  <InfoIcon content="Longueur minimale souhaitée pour les réponses de l'agent." />
                </div>
                <Input
                  type="number"
                  value={form.minWordsPerMessage ?? 3}
                  onChange={e => updateField('minWordsPerMessage', Math.max(1, Math.min(200, parseInt(e.target.value) || 3)))}
                  min={1}
                  max={200}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Mots max. par message</Label>
                  <InfoIcon content="Longueur maximale pour limiter les réponses trop longues ou coûteuses." />
                </div>
                <Input
                  type="number"
                  value={form.maxWordsPerMessage ?? 400}
                  onChange={e => updateField('maxWordsPerMessage', Math.max(10, Math.min(2000, parseInt(e.target.value) || 400)))}
                  min={10}
                  max={2000}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Température de génération ({((form.generationTemperature ?? 0.8) * 100).toFixed(0)}%)</Label>
                <InfoIcon content="Influence le caractère aléatoire : 0 est prévisible, 1 est équilibré, 2 est très varié." />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-10 text-right">Précis</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={Math.round((form.generationTemperature ?? 0.8) * 100)}
                  onChange={e => updateField('generationTemperature', parseInt(e.target.value) / 100)}
                  className="flex-1 accent-indigo-600"
                />
                <span className="text-xs text-gray-400 w-12">Créatif</span>
              </div>
              <p className="text-xs text-gray-500">0 = déterministe, 1 = équilibré, 2 = très créatif</p>
            </div>
          </div>

          {/* Quality Gate */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Quality Gate</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label>Vérification LLM activée</Label>
                <p className="text-xs text-gray-500 mt-1">
                  Vérifie la cohérence du ton, registre et langue. Les checks déterministes (@@, longueur, révélation IA) s&apos;appliquent toujours.
                </p>
              </div>
              <Switch
                checked={form.qualityGateEnabled ?? true}
                onCheckedChange={v => updateField('qualityGateEnabled', v)}
              />
            </div>
            {(form.qualityGateEnabled ?? true) && (
              <div className="space-y-2 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <Label>Score minimum ({Math.round((form.qualityGateMinScore ?? 0.5) * 100)}%)</Label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-10 text-right">Laxiste</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((form.qualityGateMinScore ?? 0.5) * 100)}
                    onChange={e => updateField('qualityGateMinScore', parseInt(e.target.value) / 100)}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="text-xs text-gray-400 w-10">Strict</span>
                </div>
                <p className="text-xs text-gray-500">
                  Score en dessous duquel le message est rejeté. 50% = équilibré, 80% = très strict.
                </p>
              </div>
            )}
          </div>

          {/* Scheduling & Rythme */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Scheduling & Rythme</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Messages/jour (semaine)</Label>
                  <InfoIcon content="Nombre maximum de messages envoyés par jour en semaine." />
                </div>
                <Input
                  type="number"
                  value={form.weekdayMaxMessages ?? 10}
                  onChange={e => updateField('weekdayMaxMessages', Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                  min={1}
                  max={100}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Messages/jour (weekend)</Label>
                  <InfoIcon content="Limite journalière spécifique pour le weekend." />
                </div>
                <Input
                  type="number"
                  value={form.weekendMaxMessages ?? 25}
                  onChange={e => updateField('weekendMaxMessages', Math.max(1, Math.min(200, parseInt(e.target.value) || 25)))}
                  min={1}
                  max={200}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Utilisateurs/jour (semaine)</Label>
                  <InfoIcon content="Nombre d'utilisateurs distincts que l'agent peut piloter par jour en semaine." />
                </div>
                <Input
                  type="number"
                  value={form.weekdayMaxUsers ?? 4}
                  onChange={e => updateField('weekdayMaxUsers', Math.max(1, Math.min(20, parseInt(e.target.value) || 4)))}
                  min={1}
                  max={20}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Utilisateurs/jour (weekend)</Label>
                  <InfoIcon content="Limite journalière d'utilisateurs distincts pour le weekend." />
                </div>
                <Input
                  type="number"
                  value={form.weekendMaxUsers ?? 6}
                  onChange={e => updateField('weekendMaxUsers', Math.max(1, Math.min(30, parseInt(e.target.value) || 6)))}
                  min={1}
                  max={30}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center">
                  <Label>Mode burst</Label>
                  <InfoIcon content="Regroupe les messages en rafales rapides suivies de pauses pour simuler une activité humaine." />
                </div>
                <p className="text-xs text-gray-500 mt-1">Groupe les messages en rafales avec des pauses entre elles</p>
              </div>
              <Switch checked={form.burstEnabled ?? true} onCheckedChange={v => updateField('burstEnabled', v)} />
            </div>

            {(form.burstEnabled ?? true) && (
              <div className="space-y-4 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Taille burst</Label>
                    <Input
                      type="number"
                      value={form.burstSize ?? 4}
                      onChange={e => updateField('burstSize', Math.max(1, Math.min(10, parseInt(e.target.value) || 4)))}
                      min={1}
                      max={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Intervalle (min)</Label>
                    <Input
                      type="number"
                      value={form.burstIntervalMinutes ?? 5}
                      onChange={e => updateField('burstIntervalMinutes', Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
                      min={1}
                      max={30}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Pause (min)</Label>
                    <Input
                      type="number"
                      value={form.quietIntervalMinutes ?? 90}
                      onChange={e => updateField('quietIntervalMinutes', Math.max(10, Math.min(480, parseInt(e.target.value) || 90)))}
                      min={10}
                      max={480}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Seuil d&apos;inactivité (jours)</Label>
                <InfoIcon content="Nombre de jours d'absence avant qu'un utilisateur soit complètement retiré du pool." />
              </div>
              <Input
                type="number"
                value={form.inactivityDaysThreshold ?? 3}
                onChange={e => updateField('inactivityDaysThreshold', Math.max(1, Math.min(30, parseInt(e.target.value) || 3)))}
                min={1}
                max={30}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Prioriser les utilisateurs taggués</Label>
                <InfoIcon content="Répond en priorité si un utilisateur contrôlé est cité par un autre." />
              </div>
              <Switch checked={form.prioritizeTaggedUsers ?? true} onCheckedChange={v => updateField('prioritizeTaggedUsers', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Prioriser les réponses</Label>
                <InfoIcon content="Répond en priorité si quelqu'un a explicitement répondu à un message de l'agent." />
              </div>
              <Switch checked={form.prioritizeRepliedUsers ?? true} onCheckedChange={v => updateField('prioritizeRepliedUsers', v)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Boost réactions ({(form.reactionBoostFactor ?? 1.5).toFixed(1)}x)</Label>
                <InfoIcon content="Augmente la probabilité de réagir aux messages au lieu de répondre." />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-8">0.5x</span>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={Math.round((form.reactionBoostFactor ?? 1.5) * 10)}
                  onChange={e => updateField('reactionBoostFactor', parseInt(e.target.value) / 10)}
                  className="flex-1 accent-indigo-600"
                />
                <span className="text-xs text-gray-400 w-8">5.0x</span>
              </div>
            </div>
          </div>

          {/* Rôles (only for existing configs) */}
          {!isNew && (
            <div className="space-y-4 p-4 rounded-lg bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Rôles utilisateurs</h3>
              <AgentRolesSection conversationId={conversationId} />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isNew ? 'Créer' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
