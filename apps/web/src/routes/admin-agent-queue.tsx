import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { AdminBadge } from '@/components/admin/badges';
import { AdminButton } from '@/components/admin/button';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminEmptyState, AdminErrorState } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import { agentQueueQueryKey, cancelAgentQueueItem, editAgentQueueItem, loadAgentQueue, type AgentQueueItem } from '@/lib/api/admin-agent-topics';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import { AdminSkeleton } from '@/routes/admin-parts';

import { useAgentConfirm, useAgentGesture, type AgentGesture } from './admin-agent-form';

/**
 * **LA MODALE « FILE DE LIVRAISON »** (lot Agent complet) — ce que l'agent a
 * rédigé et s'apprête à publier (`GET /delivery-queue`), l'heure prévue de chaque
 * élément, et deux gestes :
 *
 * - **corriger le texte** d'un MESSAGE (`PATCH /delivery-queue/:id`, `{ content }`,
 *   1 à 5 000 caractères) — une réaction n'a pas de texte, la passerelle la refuse ;
 * - **annuler la publication** (`DELETE /delivery-queue/:id`), confirmée.
 *
 * La route ne REPROGRAMME pas (son corps n'a que `content`) : l'écran le dit, au
 * lieu d'offrir un champ d'heure que la passerelle ignorerait.
 *
 * La file vit dans le service agent (Redis) : s'il est injoignable, la passerelle
 * répond 502/503 et l'état d'erreur le dit avec « Réessayer ».
 */
export function AgentQueueDetail({ language, deps, now }: { readonly language: AdminLanguage; readonly deps: AdminDeps; readonly now: () => Date }) {
  const gesture = useAgentGesture(language);
  const confirm = useAgentConfirm(language, gesture);
  const queue = useQuery({
    queryKey: agentQueueQueryKey(),
    queryFn: async ({ signal }) => unwrap(await loadAgentQueue({ ...deps, signal })),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5_000,
  });
  const items = queue.data;

  return (
    <AdminFicheSection id="agent-queue" title={translateAdmin(language, 'admin.agentPanel.card.queue')}>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.agentPanel.queue.note')}
      </p>
      {items === undefined ? (
        queue.isPending ? (
          <AdminSkeleton rows={3} />
        ) : (
          <AdminErrorState language={language} onRetry={() => void queue.refetch()} />
        )
      ) : items.length === 0 ? (
        <AdminEmptyState title={translateAdmin(language, 'admin.agentPanel.queue.empty')} hint={translateAdmin(language, 'admin.agentPanel.queue.emptyHint')} glyph="hourglass" />
      ) : (
        <div className="grid gap-3">
          <p className="text-caption font-medium" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agentPanel.queue.count', { count: formatCount(items.length, language) })}
          </p>
          <ul className="grid gap-3" data-agent-queue>
            {items.map((item) => (
              <QueueRow key={item.id} language={language} deps={deps} item={item} now={now} gesture={gesture} ask={confirm.ask} />
            ))}
          </ul>
        </div>
      )}
      {confirm.node}
      {gesture.announcement}
    </AdminFicheSection>
  );
}

function QueueRow({
  language,
  deps,
  item,
  now,
  gesture,
  ask,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly item: AgentQueueItem;
  readonly now: () => Date;
  readonly gesture: AgentGesture;
  readonly ask: ReturnType<typeof useAgentConfirm>['ask'];
}) {
  const online = useOnline();
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.content);
  const editId = `edit:${item.id}`;
  const trimmed = text.trim();
  const moment = adminMomentOf(item.scheduledAt, now(), language);

  return (
    <li data-agent-queue-item={item.id} className="grid gap-2 rounded-card p-3" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <AdminBadge tone={item.kind === 'message' ? 'brand' : 'neutral'}>
          {item.kind === 'message'
            ? translateAdmin(language, 'admin.agentPanel.queue.message')
            : translateAdmin(language, 'admin.agentPanel.queue.reaction', { emoji: item.content })}
        </AdminBadge>
        {item.conversationId === '' ? null : (
          <AdminEntityChip
            language={language}
            size="sm"
            entity={{ kind: 'conversation', id: item.conversationId, label: translateAdmin(language, 'admin.agentPanel.queue.conversation') }}
          />
        )}
      </div>
      {moment === null ? null : (
        <time dateTime={moment.iso} title={moment.absolute} className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.agentPanel.queue.at', { when: moment.relative })}
        </time>
      )}

      {item.kind === 'message' ? (
        editing ? (
          <div className="grid gap-2">
            <label htmlFor={fieldId} className="text-caption font-medium" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.agentPanel.queue.editLabel')}
            </label>
            <textarea
              id={fieldId}
              data-agent-queue-text={item.id}
              rows={4}
              maxLength={5000}
              value={text}
              onInput={(event) => setText(event.currentTarget.value)}
              onChange={() => undefined}
              className="w-full rounded-chip px-3 py-2 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND }}
            />
            {gesture.errorOf(editId) === null ? null : (
              <p role="alert" className="text-caption font-medium" style={{ color: 'var(--color-danger)' }}>
                {gesture.errorOf(editId)}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <AdminButton
                onClick={() => {
                  setEditing(false);
                  setText(item.content);
                }}
              >
                {translateAdmin(language, 'admin.kit.cancel')}
              </AdminButton>
              <AdminButton
                tone="primary"
                disabled={trimmed === '' || trimmed === item.content || !online}
                busy={gesture.busy === editId}
                data={{ 'data-agent-queue-save': item.id }}
                onClick={() =>
                  void gesture
                    .run(editId, () => editAgentQueueItem({ ...deps, id: item.id, content: trimmed }), translateAdmin(language, 'admin.agentPanel.queue.saved'))
                    .then((done) => (done ? setEditing(false) : undefined))
                }
              >
                {translateAdmin(language, 'admin.agentPanel.queue.save')}
              </AdminButton>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-line break-words text-body" style={{ color: INK }}>
            {item.content}
          </p>
        )
      ) : null}

      <div className="flex flex-wrap gap-2">
        {item.kind === 'message' && !editing ? (
          <AdminButton disabled={!online} data={{ 'data-agent-queue-edit': item.id }} onClick={() => setEditing(true)}>
            {translateAdmin(language, 'admin.agentPanel.queue.edit')}
          </AdminButton>
        ) : null}
        <AdminButton
          tone="danger"
          disabled={!online}
          data={{ 'data-agent-queue-cancel': item.id }}
          onClick={() =>
            ask({
              id: `cancel:${item.id}`,
              title: translateAdmin(language, 'admin.agentPanel.queue.cancel'),
              body: translateAdmin(language, 'admin.agentPanel.queue.cancelBody'),
              confirmLabel: translateAdmin(language, 'admin.agentPanel.queue.cancel'),
              tone: 'danger',
              act: () => cancelAgentQueueItem({ ...deps, id: item.id }),
              success: translateAdmin(language, 'admin.agentPanel.queue.cancelled'),
            })
          }
        >
          {translateAdmin(language, 'admin.agentPanel.queue.cancel')}
        </AdminButton>
      </div>
    </li>
  );
}
