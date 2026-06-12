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
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { InfoIcon } from './InfoIcon';
import { agentAdminService, type AgentConfigData, type AgentConfigUpsert, type TopicCatalogItem } from '@/services/agent-admin.service';
import { AgentRolesSection } from './AgentRolesSection';
import dynamic from 'next/dynamic';

const AgentScheduleTimeline = dynamic(() => import('./AgentScheduleTimeline'), {
  loading: () => <div className="h-24 animate-pulse bg-slate-200 dark:bg-slate-700 rounded" />,
});
import { UserDisplay } from './UserDisplay';
import { UserPicker } from './UserPicker';
import { ConversationPicker } from './ConversationPicker';
import { mergeDefinedFields } from './config-form-merge';
import { conversationsCrudService } from '@/services/conversations/crud.service';
import type { Conversation } from '@meeshy/shared/types';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';

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
  maxReactionsPerCycle: 4,
  agentInstructions: null,
  // Matches Prisma default (true). Required for the freshTopicProbability
  // path to ever fire on freshly-created configs; admins can still toggle off.
  webSearchEnabled: true,
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
  prioritizeTaggedUsers: true,
  prioritizeRepliedUsers: true,
  reactionBoostFactor: 1.5,
  freshTopicProbability: 0.2,
  freshTopicCategoryHints: [],
  freshTopicBlockedSlugs: [],
};

export function AgentConfigDialog({ open, onOpenChange, config, onSave }: AgentConfigDialogProps) {
  const isNew = !config;
  const { t, locale } = useI18n('admin');
  const { t: tCommon } = useI18n('common');
  const [saving, setSaving] = useState(false);
  const [conversationId, setConversationId] = useState('');

  const [form, setForm] = useState<AgentConfigUpsert>({ ...DEFAULTS });
  const [convMeta, setConvMeta] = useState<Conversation | null>(null);
  const [availableTopics, setAvailableTopics] = useState<TopicCatalogItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    agentAdminService.listTopics({ activeOnly: true })
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setAvailableTopics(res.data);
        }
      })
      .catch((err) => console.error('[AgentConfigDialog] Failed to load topics:', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (config) {
      setConversationId(config.conversationId);
      const {
        id: _id,
        conversationId: _conversationId,
        conversation: _conversation,
        isScanning: _isScanning,
        currentNode: _currentNode,
        configuredBy: _configuredBy,
        controlledUserIds: _controlledUserIds,
        analytics: _analytics,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...upsertFields
      } = config;
      // Merge onto DEFAULTS so fields absent from older records (e.g.
      // freshTopicProbability) keep a defined value and are never dropped from
      // the PUT payload on save.
      setForm(mergeDefinedFields(DEFAULTS, upsertFields));
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
      toast.error(t('agent.toasts.invalidConversationId'));
      return;
    }

    setSaving(true);
    try {
      const res = await agentAdminService.upsertConfig(conversationId, form);
      const invalidation = (res as unknown as { cacheInvalidation?: { anyChannelSucceeded?: boolean } })
        .cacheInvalidation;
      if (invalidation && invalidation.anyChannelSucceeded === false) {
        toast.warning(t('agentConfig.pendingPropagation'));
      } else {
        toast.success(isNew ? t('agentConfig.created') : t('agentConfig.updated'));
      }
      onSave();
    } catch {
      toast.error(t('agentConfig.saveError'));
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
            {isNew ? t('agentConfig.titleNew') : t('agentConfig.titleEdit')}
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
                label={t('agentConfig.conversationToConfigure')}
                selectedId={conversationId || null}
                onSelect={setConversationId}
                onClear={() => setConversationId('')}
                placeholder={t('agentConfig.searchPlaceholder')}
              />
            </div>
          )}

          {/* Conversation Metadata */}
          {!isNew && convMeta && (
            <div className="p-4 rounded-lg bg-indigo-50/30 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 space-y-2">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('agentConfig.conversationSection')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="block text-[10px] text-gray-400">ID</span>
                  <button
                    className="font-mono text-gray-600 dark:text-gray-300 hover:text-indigo-600 transition-colors truncate max-w-full text-left"
                    title={tCommon('copy')}
                    onClick={() => { navigator.clipboard.writeText(convMeta.id); toast.success(tCommon('copied')); }}
                  >
                    {convMeta.id}
                  </button>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">{t('agentConfig.metaType')}</span>
                  <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <span className="capitalize">{convMeta.type}</span>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span className="capitalize">{convMeta.visibility}</span>
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">{t('agentConfig.metaParticipants')}</span>
                  <span className="font-mono text-gray-600 dark:text-gray-300">{convMeta.memberCount}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">{t('agentConfig.metaMessages')}</span>
                  <span className="font-mono text-gray-600 dark:text-gray-300">{convMeta.messageCount ?? '-'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">{t('agentConfig.createdOn')}</span>
                  <span className="text-gray-600 dark:text-gray-300">
                    {new Date(convMeta.createdAt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">{t('agentConfig.creator')}</span>
                  {convMeta.createdBy ? (
                    <UserDisplay userId={convMeta.createdBy} size="sm" showUsername />
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] text-gray-400">{t('agentConfig.lastActivity')}</span>
                  <span className="text-gray-600 dark:text-gray-300">
                    {convMeta.lastMessageAt
                      ? new Date(convMeta.lastMessageAt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '-'}
                  </span>
                </div>
                {convMeta.identifier && (
                  <div>
                    <span className="block text-[10px] text-gray-400">{t('agentConfig.identifier')}</span>
                    <span className="font-mono text-gray-600 dark:text-gray-300">{convMeta.identifier}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Général */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.general')}</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>{t('agentConfig.agentEnabled')}</Label>
                <InfoIcon content={t('agentConfig.agentEnabledHelp')} />
              </div>
              <Switch checked={form.enabled} onCheckedChange={v => updateField('enabled', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>{t('agentConfig.autoPickup')}</Label>
                <InfoIcon content={t('agentConfig.autoPickupHelp')} />
              </div>
              <Switch checked={form.autoPickupEnabled} onCheckedChange={v => updateField('autoPickupEnabled', v)} />
            </div>
          </div>

          {/* Comportement */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.behaviorContext')}</h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('agentConfig.agentType')}</Label>
                <InfoIcon content={t('agentConfig.agentTypeHelp')} />
              </div>
              <select
                className="w-full p-2 border rounded-md bg-white dark:bg-gray-800 text-sm"
                value={form.agentType}
                onChange={e => updateField('agentType', e.target.value as 'personal' | 'support' | 'faq' | 'animator')}
              >
                <option value="personal">{t('agentConfig.agentTypePersonal')}</option>
                <option value="support">{t('agentConfig.agentTypeSupport')}</option>
                <option value="faq">{t('agentConfig.agentTypeFaq')}</option>
                <option value="animator">{t('agentConfig.agentTypeAnimator')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('agentConfig.contextWindow')}</Label>
                <InfoIcon content={t('agentConfig.contextWindowHelp')} />
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
                <Label>{t('agentConfig.useFullHistory')}</Label>
                <InfoIcon content={t('agentConfig.useFullHistoryHelp')} />
              </div>
              <Switch checked={form.useFullHistory} onCheckedChange={v => updateField('useFullHistory', v)} />
            </div>
          </div>

          {/* Triggers */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.triggersSection')}</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>{t('agentConfig.triggerOnTimeout')}</Label>
                <InfoIcon content={t('agentConfig.triggerOnTimeoutHelp')} />
              </div>
              <Switch checked={form.triggerOnTimeout} onCheckedChange={v => updateField('triggerOnTimeout', v)} />
            </div>
            {form.triggerOnTimeout && (
              <div className="space-y-2 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <div className="flex items-center">
                  <Label>{t('agentConfig.timeoutSeconds')}</Label>
                  <InfoIcon content={t('agentConfig.timeoutSecondsHelp')} />
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
                <Label>{t('agentConfig.triggerOnUserMessage')}</Label>
                <InfoIcon content={t('agentConfig.triggerOnUserMessageHelp')} />
              </div>
              <Switch checked={form.triggerOnUserMessage} onCheckedChange={v => updateField('triggerOnUserMessage', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>{t('agentConfig.triggerOnReplyTo')}</Label>
                <InfoIcon content={t('agentConfig.triggerOnReplyToHelp')} />
              </div>
              <Switch checked={form.triggerOnReplyTo} onCheckedChange={v => updateField('triggerOnReplyTo', v)} />
            </div>

            <UserPicker
              label={t('agentConfig.triggerFromUsers')}
              userIds={form.triggerFromUserIds || []}
              onAdd={id => updateField('triggerFromUserIds', [...(form.triggerFromUserIds || []), id])}
              onRemove={id => updateField('triggerFromUserIds', (form.triggerFromUserIds || []).filter(u => u !== id))}
              placeholder={t('agentConfig.triggerFromUsersPlaceholder')}
            />
          </div>

          {/* Seuils */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.thresholdsSection')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>{t('agentConfig.inactivityHours')}</Label>
                  <InfoIcon content={t('agentConfig.inactivityHoursHelp')} />
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
                  <Label>{t('agentConfig.minMessages')}</Label>
                  <InfoIcon content={t('agentConfig.minMessagesHelp')} />
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
                  <Label>{t('agentConfig.maxControlledUsers')}</Label>
                  <InfoIcon content={t('agentConfig.maxControlledUsersHelp')} />
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
                label={t('agentConfig.manualUsers')}
                userIds={form.manualUserIds || []}
                onAdd={id => updateField('manualUserIds', [...(form.manualUserIds || []), id])}
                onRemove={id => updateField('manualUserIds', (form.manualUserIds || []).filter(u => u !== id))}
                placeholder={t('agentConfig.manualUsersPlaceholder')}
              />

              {config && (() => {
                const manualSet = new Set(form.manualUserIds ?? []);
                const autoPickedIds = (config.controlledUserIds ?? []).filter(id => !manualSet.has(id));
                if (autoPickedIds.length === 0) return null;
                return (
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs text-gray-500">
                      {t('agentConfig.autoDetected', { count: autoPickedIds.length })}
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
                label={t('agentConfig.excludedUsers')}
                userIds={form.excludedUserIds || []}
                onAdd={id => updateField('excludedUserIds', [...(form.excludedUserIds || []), id])}
                onRemove={id => updateField('excludedUserIds', (form.excludedUserIds || []).filter(u => u !== id))}
                placeholder={t('agentConfig.excludedUsersPlaceholder')}
              />

              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>{t('agentConfig.excludedRoles')}</Label>
                  <InfoIcon content={t('agentConfig.excludedRolesHelp')} />
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
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.schedulerSection')}</h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('agentConfig.scanFrequency')}</Label>
                <InfoIcon content={t('agentConfig.scanFrequencyHelp')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">{t('agentConfig.hours')}</Label>
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
                  <Label className="text-xs text-gray-500">{t('agentConfig.minutes')}</Label>
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
                  <Label>{t('agentConfig.minResponsesPerCycle')}</Label>
                  <InfoIcon content={t('agentConfig.minResponsesPerCycleHelp')} />
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
                  <Label>{t('agentConfig.maxResponsesPerCycle')}</Label>
                  <InfoIcon content={t('agentConfig.maxResponsesPerCycleHelp')} />
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
                <Label>{t('agentConfig.reactionsEnabled')}</Label>
                <InfoIcon content={t('agentConfig.reactionsEnabledHelp')} />
              </div>
              <Switch checked={form.reactionsEnabled ?? true} onCheckedChange={v => updateField('reactionsEnabled', v)} />
            </div>
            {form.reactionsEnabled !== false && (
              <div className="space-y-2 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <div className="flex items-center">
                  <Label>{t('agentConfig.maxReactionsPerCycle')}</Label>
                  <InfoIcon content={t('agentConfig.maxReactionsPerCycleHelp')} />
                </div>
                <Input
                  type="number"
                  value={form.maxReactionsPerCycle ?? 4}
                  onChange={e => updateField('maxReactionsPerCycle', Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={50}
                />
              </div>
            )}
          </div>

          {/* Instructions Agent */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.instructionsSection')}</h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('agentConfig.specificInstructions')}</Label>
                <InfoIcon content={t('agentConfig.specificInstructionsHelp')} />
              </div>
              <Textarea
                rows={4}
                maxLength={5000}
                value={form.agentInstructions ?? ''}
                onChange={e => updateField('agentInstructions', e.target.value || null)}
                placeholder={t('agentConfig.instructionsPlaceholder')}
                className="bg-white dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500">{(form.agentInstructions ?? '').length}/5000</p>
            </div>
          </div>

          {/* Recherche Web */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.webSearchSection')}</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center">
                  <Label>{t('agentConfig.webSearchEnabled')}</Label>
                  <InfoIcon content={t('agentConfig.webSearchEnabledHelp')} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{t('agentConfig.webSearchSubtitle')}</p>
              </div>
              <Switch checked={form.webSearchEnabled ?? false} onCheckedChange={v => updateField('webSearchEnabled', v)} />
            </div>
          </div>

          {/* Sujets neufs & actualité */}
          <div className="space-y-4 p-4 rounded-lg bg-amber-50/40 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
            <div className="flex items-center">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.freshTopicsSection')}</h3>
              <InfoIcon content={t('agentConfig.freshTopicsSectionHelp')} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('agentConfig.freshTopicProbability')}</Label>
                <span className="text-xs font-mono text-gray-600 dark:text-gray-300">
                  {Math.round((form.freshTopicProbability ?? 0.2) * 100)}%
                </span>
              </div>
              <Input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round((form.freshTopicProbability ?? 0.2) * 100)}
                onChange={e => updateField('freshTopicProbability', Math.max(0, Math.min(1, (parseInt(e.target.value) || 0) / 100)))}
              />
              <p className="text-xs text-gray-500">
                {t('agentConfig.freshTopicProbabilityHint')}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('agentConfig.topicCategories')}</Label>
                <InfoIcon content={t('agentConfig.topicCategoriesHelp')} />
              </div>
              <Input
                value={(form.freshTopicCategoryHints ?? []).join(', ')}
                onChange={e => updateField(
                  'freshTopicCategoryHints',
                  e.target.value
                    .split(',')
                    .map(s => s.trim().toLowerCase())
                    .filter(Boolean)
                    .slice(0, 20),
                )}
                placeholder={t('agentConfig.topicCategoriesPlaceholder')}
                className="bg-white dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500">
                <strong className="text-amber-600 dark:text-amber-400">@deprecated</strong> — {t('agentConfig.topicCategoriesDeprecated')}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center">
                <Label>{t('agentConfig.eligibleTopics')}</Label>
                <InfoIcon content={t('agentConfig.eligibleTopicsHelp')} />
              </div>
              {availableTopics.length === 0 ? (
                <p className="text-xs text-gray-500 italic">{t('agentConfig.topicsLoading')}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  {availableTopics.map((topic) => {
                    const blockedSlugs = form.freshTopicBlockedSlugs ?? [];
                    const isChecked = !blockedSlugs.includes(topic.slug);
                    return (
                      <label
                        key={topic.slug}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded p-1"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? blockedSlugs.filter((s) => s !== topic.slug)
                              : [...blockedSlugs, topic.slug];
                            updateField('freshTopicBlockedSlugs', next);
                          }}
                          className="h-4 w-4"
                        />
                        <span title={topic.description ?? undefined}>{topic.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-500">
                {(form.freshTopicBlockedSlugs ?? []).length === 0
                  ? t('agentConfig.topicsAllEligible', { total: availableTopics.length })
                  : t('agentConfig.topicsPartialEligible', {
                      active: availableTopics.length - (form.freshTopicBlockedSlugs ?? []).length,
                      total: availableTopics.length,
                      excluded: (form.freshTopicBlockedSlugs ?? []).length,
                    })}
              </p>
            </div>
          </div>

          {/* Génération */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.generationSection')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>{t('agentConfig.minWords')}</Label>
                  <InfoIcon content={t('agentConfig.minWordsHelp')} />
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
                  <Label>{t('agentConfig.maxWords')}</Label>
                  <InfoIcon content={t('agentConfig.maxWordsHelp')} />
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
                <Label>{t('agentConfig.temperature', { percent: ((form.generationTemperature ?? 0.8) * 100).toFixed(0) })}</Label>
                <InfoIcon content={t('agentConfig.temperatureHelp')} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-10 text-right">{t('agentConfig.temperaturePrecise')}</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={Math.round((form.generationTemperature ?? 0.8) * 100)}
                  onChange={e => updateField('generationTemperature', parseInt(e.target.value) / 100)}
                  className="flex-1 accent-indigo-600"
                />
                <span className="text-xs text-gray-400 w-12">{t('agentConfig.temperatureCreative')}</span>
              </div>
              <p className="text-xs text-gray-500">{t('agentConfig.temperatureScaleHint')}</p>
            </div>
          </div>

          {/* Quality Gate */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.qualityGateSection')}</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center">
                  <Label>{t('agentConfig.qualityGateEnabled')}</Label>
                  <InfoIcon content={t('agentConfig.qualityGateEnabledHelp')} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t('agentConfig.qualityGateSubtitle')}
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
                  <Label>{t('agentConfig.qualityGateMinScore', { percent: Math.round((form.qualityGateMinScore ?? 0.5) * 100) })}</Label>
                  <InfoIcon content={t('agentConfig.qualityGateMinScoreHelp')} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-10 text-right">{t('agentConfig.qualityGateLenient')}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((form.qualityGateMinScore ?? 0.5) * 100)}
                    onChange={e => updateField('qualityGateMinScore', parseInt(e.target.value) / 100)}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="text-xs text-gray-400 w-10">{t('agentConfig.qualityGateStrict')}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {t('agentConfig.qualityGateScoreHint')}
                </p>
              </div>
            )}
          </div>

          {/* Scheduling & Rythme */}
          <div className="space-y-4 p-4 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.schedulingSection')}</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label>{t('agentConfig.weekdayMaxMessages')}</Label>
                  <InfoIcon content={t('agentConfig.weekdayMaxMessagesHelp')} />
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
                  <Label>{t('agentConfig.weekendMaxMessages')}</Label>
                  <InfoIcon content={t('agentConfig.weekendMaxMessagesHelp')} />
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
                  <Label>{t('agentConfig.weekdayMaxUsers')}</Label>
                  <InfoIcon content={t('agentConfig.weekdayMaxUsersHelp')} />
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
                  <Label>{t('agentConfig.weekendMaxUsers')}</Label>
                  <InfoIcon content={t('agentConfig.weekendMaxUsersHelp')} />
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
                  <Label>{t('agentConfig.burstMode')}</Label>
                  <InfoIcon content={t('agentConfig.burstModeHelp')} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{t('agentConfig.burstModeSubtitle')}</p>
              </div>
              <Switch checked={form.burstEnabled ?? true} onCheckedChange={v => updateField('burstEnabled', v)} />
            </div>

            {(form.burstEnabled ?? true) && (
              <div className="space-y-4 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <Label className="text-[10px] uppercase font-bold text-gray-400">{t('agentConfig.burstSize')}</Label>
                      <InfoIcon content={t('agentConfig.burstSizeHelp')} />
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
                      <Label className="text-[10px] uppercase font-bold text-gray-400">{t('agentConfig.burstInterval')}</Label>
                      <InfoIcon content={t('agentConfig.burstIntervalHelp')} />
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
                      <Label className="text-[10px] uppercase font-bold text-gray-400">{t('agentConfig.quietInterval')}</Label>
                      <InfoIcon content={t('agentConfig.quietIntervalHelp')} />
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
                <Label>{t('agentConfig.inactivityDays')}</Label>
                <InfoIcon content={t('agentConfig.inactivityDaysHelp')} />
              </div>
              <div className="flex h-10 items-center gap-2 rounded-md border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-3 text-sm text-gray-600 dark:text-gray-300">
                <span className="font-mono">
                  {Math.max(1, Math.round((form.inactivityThresholdHours ?? 72) / 24))}
                </span>
                <span className="text-gray-400">{t('agentConfig.inactivityDaysUnit')}</span>
                <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-gray-400">
                  {t('agentConfig.inactivityDaysAuto', { hours: form.inactivityThresholdHours ?? 72 })}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>{t('agentConfig.prioritizeTagged')}</Label>
                <InfoIcon content={t('agentConfig.prioritizeTaggedHelp')} />
              </div>
              <Switch checked={form.prioritizeTaggedUsers ?? true} onCheckedChange={v => updateField('prioritizeTaggedUsers', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label>{t('agentConfig.prioritizeReplied')}</Label>
                <InfoIcon content={t('agentConfig.prioritizeRepliedHelp')} />
              </div>
              <Switch checked={form.prioritizeRepliedUsers ?? true} onCheckedChange={v => updateField('prioritizeRepliedUsers', v)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center">
                <Label>{t('agentConfig.reactionBoost', { factor: (form.reactionBoostFactor ?? 1.5).toFixed(1) })}</Label>
                <InfoIcon content={t('agentConfig.reactionBoostHelp')} />
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
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.timelineSection')}</h3>
              <AgentScheduleTimeline conversationId={conversationId} />
            </div>
          )}

          {/* Rôles (only for existing configs) */}
          {!isNew && (
            <div className="space-y-4 p-4 rounded-lg bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">{t('agentConfig.rolesSection')}</h3>
              <AgentRolesSection conversationId={conversationId} />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 border-t border-slate-200 dark:border-slate-700 pt-4 mt-0 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isNew ? t('agentConfig.createButton') : tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
