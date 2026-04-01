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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { InfoIcon } from './InfoIcon';
import { agentAdminService, type AgentConfigData, type AgentConfigUpsert } from '@/services/agent-admin.service';
import { AgentRolesSection } from './AgentRolesSection';
import dynamic from 'next/dynamic';

const AgentScheduleTimeline = dynamic(() => import('./AgentScheduleTimeline'), {
  loading: () => <div className="h-24 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});
import { UserDisplay } from './UserDisplay';
import { UserPicker } from './UserPicker';
import { ConversationPicker } from './ConversationPicker';
import { conversationsCrudService } from '@/services/conversations/crud.service';
import type { Conversation } from '@meeshy/shared/types';
import { toast } from 'sonner';

interface AgentConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AgentConfigData | null;
  onSave: () => void;
}

const DEFAULTS: AgentConfigUpsert = {
  enabled: true,
  autoPickupEnabled: true,
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
  const [convMeta, setConvMeta] = useState<Conversation | null>(null);

  useEffect(() => {
    if (config) {
      setConversationId(config.conversationId);
      const { id, conversationId: _cid, conversation, configuredBy, controlledUserIds: _cu, analytics: _an, createdAt, updatedAt, ...upsertFields } = config;
      setForm(upsertFields);
    } else {
      setConversationId('');
      setForm({ ...DEFAULTS });
      setConvMeta(null);
    }
  }, [config, open]);

  useEffect(() => {
    if (!isNew && conversationId && open) {
      conversationsCrudService.getConversation(conversationId)
        .then(setConvMeta)
        .catch(() => setConvMeta(null));
    }
  }, [isNew, conversationId, open]);

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
      <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
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

        <div className="space-y-6 py-4 px-1 overflow-y-auto flex-1 min-h-0">
          {/* Conversation ID */}
          {isNew && (
            <div className="p-4 rounded-lg bg-indigo-50/30 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30">
              <ConversationPicker
                label="Conversation à configurer"
                selectedId={conversationId || null}
                onSelect={setConversationId}
                onClear={() => setConversationId('')}
                placeholder="Rechercher un groupe, un canal ou une discussion..."
              />
            </div>
          )}

          {/* Conversation Metadata */}
          {!isNew && convMeta && (
            <div className="p-4 rounded-lg bg-indigo-50/30 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 space-y-2">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Conversation</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="block text-[10px] text-gray-400">ID</span>
                  <button
                    className="font-mono text-gray-600 dark:text-gray-300 hover:text-indigo-600 transition-colors truncate max-w-full text-left"
                    title="Copier"
                    onClick={() => { navigator.clipboard.writeText(convMeta.id); toast.success('ID copie'); }}
                  >
                    {convMeta.id}
                  </button>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">Type</span>
                  <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <span className="capitalize">{convMeta.type}</span>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span className="capitalize">{convMeta.visibility}</span>
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">Participants</span>
                  <span className="font-mono text-gray-600 dark:text-gray-300">{convMeta.memberCount}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">Messages</span>
                  <span className="font-mono text-gray-600 dark:text-gray-300">{convMeta.messageCount ?? '-'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">Cree le</span>
                  <span className="text-gray-600 dark:text-gray-300">
                    {new Date(convMeta.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">Createur</span>
                  {convMeta.createdBy ? (
                    <UserDisplay userId={convMeta.createdBy} size="sm" showUsername />
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">Derniere activite</span>
                  <span className="text-gray-600 dark:text-gray-300">
                    {convMeta.lastMessageAt
                      ? new Date(convMeta.lastMessageAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '-'}
                  </span>
                </div>
                {convMeta.identifier && (
                  <div>
                    <span className="block text-[10px] text-gray-400">Identifiant</span>
                    <span className="font-mono text-gray-600 dark:text-gray-300">{convMeta.identifier}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Général */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Général</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Agent activé</Label>
                <InfoIcon content="Interrupteur principal. Si désactivé, l'agent n'analysera aucun message et ne répondra jamais, libérant les ressources serveur." />
              </div>
              <Switch checked={form.enabled} onCheckedChange={v => updateField('enabled', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Auto-pickup</Label>
                <InfoIcon content="Mode dynamique : l'agent détecte les utilisateurs qui ne répondent plus (voir Seuil d'inactivité) et prend leur identité pour maintenir la conversation active." />
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
                <InfoIcon content="Impacte le 'System Prompt' injecté : 'SAV' priorise la résolution de problèmes, 'Animateur' cherche à poser des questions et relancer le débat, 'Personnel' imite un utilisateur standard." />
              </div>
              <select
                className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 text-sm"
                value={form.agentType}
                onChange={e => updateField('agentType', e.target.value as 'personal' | 'support' | 'faq' | 'animator')}
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
                <InfoIcon content="Nombre de messages historiques envoyés au LLM. Plus c'est haut, meilleure est la mémoire, mais le coût en tokens et la latence augmentent significativement." />
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
                <InfoIcon content="Force l'agent à lire toute la conversation disponible. Indispensable pour des résumés longs ou des suivis de dossiers complexes sur plusieurs jours." />
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
                <InfoIcon content="Déclenchement proactif : l'agent 'relance' la conversation si personne n'a parlé pendant le délai imparti. Idéal pour l'animation de groupes." />
              </div>
              <Switch checked={form.triggerOnTimeout} onCheckedChange={v => updateField('triggerOnTimeout', v)} />
            </div>
            {form.triggerOnTimeout && (
              <div className="space-y-2 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <div className="flex items-center">
                  <Label>Timeout (secondes)</Label>
                  <InfoIcon content="Délai exact avant déclenchement. Une valeur trop courte (30s) peut donner l'impression que l'agent coupe la parole. Recommandé : 300s (5min)." />
                </div>
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
                <InfoIcon content="Mode 'Chatbot' : chaque message entrant déclenche une analyse. Très réactif mais peut coûter cher et paraître envahissant si non bridé." />
              </div>
              <Switch checked={form.triggerOnUserMessage} onCheckedChange={v => updateField('triggerOnUserMessage', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Trigger sur reply-to</Label>
                <InfoIcon content="Ciblage direct : l'agent ne répond que s'il est explicitement interpellé. Mode le plus discret et économique pour du support technique." />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Inactivité (heures)</Label>
                  <InfoIcon content="Seuil critique pour l'Auto-pickup. Si un utilisateur n'a pas posté depuis X heures, l'agent peut prendre sa place." />
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
                  <InfoIcon content="Filtre de sécurité : empêche l'agent d'intervenir dans des salons vides ou trop récents pour avoir un contexte de ton suffisant." />
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
                  <InfoIcon content="Impact sur la diversité : définit combien d'identités différentes l'agent peut assumer dans ce salon. Trop d'identités peut nuire à la cohérence globale." />
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

              {config && (() => {
                const manualSet = new Set(form.manualUserIds ?? []);
                const autoPickedIds = (config.controlledUserIds ?? []).filter(id => !manualSet.has(id));
                if (autoPickedIds.length === 0) return null;
                return (
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs text-gray-500">
                      Auto-d&eacute;tect&eacute;s ({autoPickedIds.length})
                    </Label>
                    <div className="flex flex-wrap gap-2 p-2 rounded-md border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                      {autoPickedIds.map(id => (
                        <UserDisplay key={id} userId={id} size="sm" showUsername={false} />
                      ))}
                    </div>
                  </div>
                );
              })()}

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
                <InfoIcon content="Battement de coeur du système : définit à quelle fréquence l'agent 'se réveille' pour voir s'il doit agir (Triggers/Timeouts)." />
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
                  <InfoIcon content="Garantit une activité minimale quand l'agent se déclenche. Utile pour simuler une vraie discussion plutôt qu'un message isolé." />
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
                  <InfoIcon content="Pare-feu anti-flood : plafonne le nombre de messages consécutifs. Crucial pour limiter les coûts API en cas de boucle infinie." />
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
                <InfoIcon content="Humanisation : autorise l'agent à 'liker' ou réagir avec des emojis. Consomme moins de tokens qu'une réponse textuelle." />
              </div>
              <Switch checked={form.reactionsEnabled ?? true} onCheckedChange={v => updateField('reactionsEnabled', v)} />
            </div>
            {form.reactionsEnabled !== false && (
              <div className="space-y-2 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <div className="flex items-center">
                  <Label>Max réactions/cycle</Label>
                  <InfoIcon content="Limite le nombre d'emojis posés lors d'un même scan. Évite que l'agent ne réagisse à absolument tous les messages en une fois." />
                </div>
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
                <InfoIcon content="Le 'Cerveau' de l'agent : décrivez ici sa mission, les infos à ne pas divulguer, ou des faits spécifiques à ce salon. Outre-passe les réglages globaux." />
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
                  <InfoIcon content="Connexion temps réel : permet à l'agent d'aller sur Google/Perplexity. Indispensable pour parler de l'actualité ou de météo, mais augmente le temps de réponse." />
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
                  <InfoIcon content="Contrôle du style : force l'agent à être plus loquace. Évite les réponses trop brèves type 'OK' ou 'D'accord'." />
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
                  <InfoIcon content="Économie de tokens : empêche l'agent de générer des pavés illisibles. Une limite basse (50-80) est recommandée pour du chat standard." />
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
                <InfoIcon content="Curseur de créativité : à 0 l'agent est répétitif et factuel, à 1.5+ il peut devenir poétique ou commencer à halluciner." />
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
                <div className="flex items-center">
                  <Label>Vérification LLM activée</Label>
                  <InfoIcon content="Auto-censure intelligente : un second passage vérifie si le message respecte le ton et ne révèle pas qu'il est une IA. Rejette les messages non conformes." />
                </div>
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
                <div className="flex items-center">
                  <Label>Score minimum ({Math.round((form.qualityGateMinScore ?? 0.5) * 100)}%)</Label>
                  <InfoIcon content="Barrière de qualité : à 80%, seuls les messages parfaits passent. À 20%, l'agent est beaucoup plus libre mais peut faire des erreurs de style." />
                </div>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>Messages/jour (semaine)</Label>
                  <InfoIcon content="Quota quotidien global pour ce salon. Une fois atteint, l'agent se met en veille jusqu'au lendemain." />
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
                  <InfoIcon content="Quota weekend. Souvent plus élevé pour compenser l'absence de support humain le samedi/dimanche." />
                </div>
                <Input
                  type="number"
                  value={form.weekendMaxMessages ?? 25}
                  onChange={e => updateField('weekendMaxMessages', Math.max(1, Math.min(200, parseInt(e.target.value) || 25)))}
                  min={1}
                  max={200}
                />
              </div>
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
                  <InfoIcon content="Simulateur humain : au lieu de répondre 1 par 1, l'agent envoie plusieurs messages (Taille burst) puis s'arrête (Pause min) pour paraître moins robotique." />
                </div>
                <p className="text-xs text-gray-500 mt-1">Groupe les messages en rafales avec des pauses entre elles</p>
              </div>
              <Switch checked={form.burstEnabled ?? true} onCheckedChange={v => updateField('burstEnabled', v)} />
            </div>

            {(form.burstEnabled ?? true) && (
              <div className="space-y-4 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <Label className="text-[10px] uppercase font-bold text-gray-400">Taille burst</Label>
                      <InfoIcon content="Nb de messages envoyés d'affilée." />
                    </div>
                    <Input
                      type="number"
                      value={form.burstSize ?? 4}
                      onChange={e => updateField('burstSize', Math.max(1, Math.min(10, parseInt(e.target.value) || 4)))}
                      min={1}
                      max={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <Label className="text-[10px] uppercase font-bold text-gray-400">Intervalle (min)</Label>
                      <InfoIcon content="Temps entre 2 msgs du burst." />
                    </div>
                    <Input
                      type="number"
                      value={form.burstIntervalMinutes ?? 5}
                      onChange={e => updateField('burstIntervalMinutes', Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
                      min={1}
                      max={30}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <Label className="text-[10px] uppercase font-bold text-gray-400">Pause (min)</Label>
                      <InfoIcon content="Silence radio entre 2 rafales." />
                    </div>
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
                <InfoIcon content="Nettoyage du pool : si l'utilisateur contrôlé ne s'est pas connecté manuellement depuis X jours, l'agent arrête de l'utiliser pour éviter les situations étranges." />
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
                <InfoIcon content="Impact sur la pertinence sociale : l'agent réagit en priorité aux mentions (@username). Très efficace pour le SAV." />
              </div>
              <Switch checked={form.prioritizeTaggedUsers ?? true} onCheckedChange={v => updateField('prioritizeTaggedUsers', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>Prioriser les réponses</Label>
                <InfoIcon content="Maintien du fil : l'agent favorise les discussions où il a déjà un échange en cours plutôt que d'entamer de nouveaux sujets au hasard." />
              </div>
              <Switch checked={form.prioritizeRepliedUsers ?? true} onCheckedChange={v => updateField('prioritizeRepliedUsers', v)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center">
                <Label>Boost réactions ({(form.reactionBoostFactor ?? 1.5).toFixed(1)}x)</Label>
                <InfoIcon content="Probabilité d'emoji : un facteur élevé (>2) rendra l'agent très expressif via les réactions, ce qui réduit la 'fatigue' textuelle dans le salon." />
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

          {/* Timeline planificateur (existing configs only) */}
          {!isNew && conversationId && (
            <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Planificateur — Timeline 24h</h3>
              <AgentScheduleTimeline conversationId={conversationId} />
            </div>
          )}

          {/* Rôles (only for existing configs) */}
          {!isNew && (
            <div className="space-y-4 p-4 rounded-lg bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Rôles utilisateurs</h3>
              <AgentRolesSection conversationId={conversationId} />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 border-t border-slate-200 dark:border-slate-700 pt-4 mt-0 shrink-0">
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
