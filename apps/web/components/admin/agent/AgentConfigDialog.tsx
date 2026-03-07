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

export function AgentConfigDialog({ open, onOpenChange, config, onSave }: AgentConfigDialogProps) {
  const isNew = !config;
  const [saving, setSaving] = useState(false);
  const [conversationId, setConversationId] = useState('');

  const [form, setForm] = useState<AgentConfigUpsert>({
    enabled: false,
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
  });

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
      });
    } else {
      setConversationId('');
      setForm({
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
      });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Nouvelle configuration agent' : 'Modifier la configuration'}</DialogTitle>
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

          {/* Général */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Général</h3>
            <div className="flex items-center justify-between">
              <Label>Agent activé</Label>
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
                className="w-full p-2 border rounded-md bg-transparent"
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
              <Label>Taille fenêtre contextuelle (messages)</Label>
              <Input
                type="number"
                value={form.contextWindowSize}
                onChange={e => updateField('contextWindowSize', parseInt(e.target.value) || 50)}
                min={10}
                max={200}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Inactivité (heures)</Label>
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
                <Label>Max utilisateurs contrôlés</Label>
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
              <Label>Fréquence de scan</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min réponses/cycle</Label>
                <Input
                  type="number"
                  value={form.minResponsesPerCycle ?? 2}
                  onChange={e => updateField('minResponsesPerCycle', Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={50}
                />
              </div>
              <div className="space-y-2">
                <Label>Max réponses/cycle</Label>
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
              <Label>Réactions activées</Label>
              <Switch checked={form.reactionsEnabled ?? true} onCheckedChange={v => updateField('reactionsEnabled', v)} />
            </div>
            {form.reactionsEnabled !== false && (
              <div className="space-y-2 pl-4">
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

          <Separator />

          {/* Instructions Agent */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Instructions Agent</h3>
            <div className="space-y-2">
              <Label>Instructions spécifiques</Label>
              <Textarea
                rows={4}
                maxLength={5000}
                value={form.agentInstructions ?? ''}
                onChange={e => updateField('agentInstructions', e.target.value || null)}
                placeholder="Instructions personnalisées pour l'agent dans cette conversation..."
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
                <Label>Recherche web activée</Label>
                <p className="text-xs text-gray-500 mt-1">Permet à l&apos;agent de rechercher des informations actuelles</p>
              </div>
              <Switch checked={form.webSearchEnabled ?? false} onCheckedChange={v => updateField('webSearchEnabled', v)} />
            </div>
          </div>

          {/* Rôles (only for existing configs) */}
          {!isNew && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Rôles utilisateurs</h3>
                <AgentRolesSection conversationId={conversationId} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
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
