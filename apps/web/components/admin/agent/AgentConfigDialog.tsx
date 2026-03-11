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
import { Loader2 } from 'lucide-react';
import { agentAdminService, type AgentConfigData, type AgentConfigUpsert } from '@/services/agent-admin.service';
import { AgentRolesSection } from './AgentRolesSection';
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
      toast.error('ID de conversation invalide (24 caract\u00e8res hexad\u00e9cimaux)');
      return;
    }

    setSaving(true);
    try {
      await agentAdminService.upsertConfig(conversationId, form);
      toast.success(isNew ? 'Configuration cr\u00e9\u00e9e' : 'Configuration mise \u00e0 jour');
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

        <div className="space-y-6 py-4">
          {/* Conversation ID */}
          {isNew && (
            <div className="space-y-2">
              <Label>ID Conversation</Label>
              <Input
                value={conversationId}
                onChange={e => setConversationId(e.target.value)}
                placeholder="ObjectId (24 hex chars)"
                className="font-mono"
              />
            </div>
          )}

          {/* G\u00e9n\u00e9ral */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">G\u00e9n\u00e9ral</h3>
            <div className="flex items-center justify-between">
              <Label>Agent activ\u00e9</Label>
              <Switch checked={form.enabled} onCheckedChange={v => updateField('enabled', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Auto-pickup</Label>
              <Switch checked={form.autoPickupEnabled} onCheckedChange={v => updateField('autoPickupEnabled', v)} />
            </div>
          </div>

          <Separator />

          {/* Comportement */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Comportement & Contexte</h3>
            <div className="space-y-2">
              <Label>Type d&apos;agent</Label>
              <select
                className="w-full p-2 border rounded-md bg-transparent text-sm"
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
              <Label>Taille fen\u00eatre contextuelle (messages)</Label>
              <Input
                type="number"
                value={form.contextWindowSize}
                onChange={e => updateField('contextWindowSize', parseInt(e.target.value) || 50)}
                min={10}
                max={250}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Utiliser l&apos;historique complet (Max 250)</Label>
              <Switch checked={form.useFullHistory} onCheckedChange={v => updateField('useFullHistory', v)} />
            </div>
          </div>

          <Separator />

          {/* Triggers */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Triggers</h3>
            <div className="flex items-center justify-between">
              <Label>Trigger sur timeout</Label>
              <Switch checked={form.triggerOnTimeout} onCheckedChange={v => updateField('triggerOnTimeout', v)} />
            </div>
            {form.triggerOnTimeout && (
              <div className="space-y-2 pl-4">
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
              <Label>Trigger sur message utilisateur</Label>
              <Switch checked={form.triggerOnUserMessage} onCheckedChange={v => updateField('triggerOnUserMessage', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Trigger sur reply-to</Label>
              <Switch checked={form.triggerOnReplyTo} onCheckedChange={v => updateField('triggerOnReplyTo', v)} />
            </div>
          </div>

          <Separator />

          {/* Seuils */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Seuils</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Inactivit\u00e9 (heures)</Label>
                <Input
                  type="number"
                  value={form.inactivityThresholdHours}
                  onChange={e => updateField('inactivityThresholdHours', parseInt(e.target.value) || 72)}
                  min={1}
                  max={720}
                />
              </div>
              <div className="space-y-2">
                <Label>Messages min.</Label>
                <Input
                  type="number"
                  value={form.minHistoricalMessages}
                  onChange={e => updateField('minHistoricalMessages', parseInt(e.target.value) || 0)}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>Max utilisateurs contr\u00f4l\u00e9s</Label>
                <Input
                  type="number"
                  value={form.maxControlledUsers}
                  onChange={e => updateField('maxControlledUsers', parseInt(e.target.value) || 5)}
                  min={1}
                  max={50}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Planificateur */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Planificateur</h3>
            <div className="space-y-2">
              <Label>Fr\u00e9quence de scan</Label>
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
                <Label>Min r\u00e9ponses/cycle</Label>
                <Input
                  type="number"
                  value={form.minResponsesPerCycle ?? 2}
                  onChange={e => updateField('minResponsesPerCycle', Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={50}
                />
              </div>
              <div className="space-y-2">
                <Label>Max r\u00e9ponses/cycle</Label>
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
              <Label>R\u00e9actions activ\u00e9es</Label>
              <Switch checked={form.reactionsEnabled ?? true} onCheckedChange={v => updateField('reactionsEnabled', v)} />
            </div>
            {form.reactionsEnabled !== false && (
              <div className="space-y-2 pl-4">
                <Label>Max r\u00e9actions/cycle</Label>
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

          <Separator />

          {/* Instructions Agent */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Instructions Agent</h3>
            <div className="space-y-2">
              <Label>Instructions sp\u00e9cifiques</Label>
              <Textarea
                rows={4}
                maxLength={5000}
                value={form.agentInstructions ?? ''}
                onChange={e => updateField('agentInstructions', e.target.value || null)}
                placeholder="Instructions personnalis\u00e9es pour l'agent dans cette conversation..."
              />
              <p className="text-xs text-gray-500">{(form.agentInstructions ?? '').length}/5000</p>
            </div>
          </div>

          <Separator />

          {/* Recherche Web */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recherche Web</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label>Recherche web activ\u00e9e</Label>
                <p className="text-xs text-gray-500 mt-1">Permet \u00e0 l&apos;agent de rechercher des informations actuelles</p>
              </div>
              <Switch checked={form.webSearchEnabled ?? false} onCheckedChange={v => updateField('webSearchEnabled', v)} />
            </div>
          </div>

          <Separator />

          {/* G\u00e9n\u00e9ration */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">G\u00e9n\u00e9ration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mots min. par message</Label>
                <Input
                  type="number"
                  value={form.minWordsPerMessage ?? 3}
                  onChange={e => updateField('minWordsPerMessage', Math.max(1, Math.min(200, parseInt(e.target.value) || 3)))}
                  min={1}
                  max={200}
                />
              </div>
              <div className="space-y-2">
                <Label>Mots max. par message</Label>
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
              <Label>Temp\u00e9rature de g\u00e9n\u00e9ration ({((form.generationTemperature ?? 0.8) * 100).toFixed(0)}%)</Label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-10">Pr\u00e9cis</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={Math.round((form.generationTemperature ?? 0.8) * 100)}
                  onChange={e => updateField('generationTemperature', parseInt(e.target.value) / 100)}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12">Cr\u00e9atif</span>
              </div>
              <p className="text-xs text-gray-500">0 = d\u00e9terministe, 1 = \u00e9quilibr\u00e9, 2 = tr\u00e8s cr\u00e9atif</p>
            </div>
          </div>

          <Separator />

          {/* Quality Gate */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Quality Gate</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label>V\u00e9rification LLM activ\u00e9e</Label>
                <p className="text-xs text-gray-500 mt-1">
                  V\u00e9rifie la coh\u00e9rence du ton, registre et langue. Les checks d\u00e9terministes (@@, longueur, r\u00e9v\u00e9lation IA) s&apos;appliquent toujours.
                </p>
              </div>
              <Switch
                checked={form.qualityGateEnabled ?? true}
                onCheckedChange={v => updateField('qualityGateEnabled', v)}
              />
            </div>
            {(form.qualityGateEnabled ?? true) && (
              <div className="space-y-2 pl-4">
                <Label>Score minimum ({Math.round((form.qualityGateMinScore ?? 0.5) * 100)}%)</Label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-10">Laxiste</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((form.qualityGateMinScore ?? 0.5) * 100)}
                    onChange={e => updateField('qualityGateMinScore', parseInt(e.target.value) / 100)}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-400 w-10">Strict</span>
                </div>
                <p className="text-xs text-gray-500">
                  Score en dessous duquel le message est rejet\u00e9. 50% = \u00e9quilibr\u00e9, 80% = tr\u00e8s strict.
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Scheduling & Rythme */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Scheduling & Rythme</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Messages/jour (semaine)</Label>
                <Input
                  type="number"
                  value={form.weekdayMaxMessages ?? 10}
                  onChange={e => updateField('weekdayMaxMessages', Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                  min={1}
                  max={100}
                />
              </div>
              <div className="space-y-2">
                <Label>Messages/jour (weekend)</Label>
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
                <Label>Utilisateurs/jour (semaine)</Label>
                <Input
                  type="number"
                  value={form.weekdayMaxUsers ?? 4}
                  onChange={e => updateField('weekdayMaxUsers', Math.max(1, Math.min(20, parseInt(e.target.value) || 4)))}
                  min={1}
                  max={20}
                />
              </div>
              <div className="space-y-2">
                <Label>Utilisateurs/jour (weekend)</Label>
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
                <Label>Mode burst</Label>
                <p className="text-xs text-gray-500 mt-1">Groupe les messages en rafales avec des pauses entre elles</p>
              </div>
              <Switch checked={form.burstEnabled ?? true} onCheckedChange={v => updateField('burstEnabled', v)} />
            </div>

            {(form.burstEnabled ?? true) && (
              <div className="space-y-4 pl-4">
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
              <Label>Seuil d&apos;inactivit\u00e9 (jours)</Label>
              <Input
                type="number"
                value={form.inactivityDaysThreshold ?? 3}
                onChange={e => updateField('inactivityDaysThreshold', Math.max(1, Math.min(30, parseInt(e.target.value) || 3)))}
                min={1}
                max={30}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Prioriser les utilisateurs tagg\u00e9s</Label>
              <Switch checked={form.prioritizeTaggedUsers ?? true} onCheckedChange={v => updateField('prioritizeTaggedUsers', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Prioriser les r\u00e9ponses</Label>
              <Switch checked={form.prioritizeRepliedUsers ?? true} onCheckedChange={v => updateField('prioritizeRepliedUsers', v)} />
            </div>

            <div className="space-y-2">
              <Label>Boost r\u00e9actions ({(form.reactionBoostFactor ?? 1.5).toFixed(1)}x)</Label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-8">0.5x</span>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={Math.round((form.reactionBoostFactor ?? 1.5) * 10)}
                  onChange={e => updateField('reactionBoostFactor', parseInt(e.target.value) / 10)}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-8">5.0x</span>
              </div>
            </div>
          </div>

          {/* R\u00f4les (only for existing configs) */}
          {!isNew && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">R\u00f4les utilisateurs</h3>
                <AgentRolesSection conversationId={conversationId} />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isNew ? 'Cr\u00e9er' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
