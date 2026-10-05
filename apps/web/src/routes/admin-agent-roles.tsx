import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { AdminBadge } from '@/components/admin/badges';
import { AdminButton } from '@/components/admin/button';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminErrorState } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { personLabel, personSecondary } from '@/lib/admin/interpret/labels';
import { formatPercent } from '@/lib/admin/interpret/numbers';
import type { AdminDeps } from '@/lib/api/admin';
import { agentLiveQueryKey, loadAgentLive, type AgentControlledUser } from '@/lib/api/admin-agent';
import {
  agentArchetypesQueryKey,
  agentRolesQueryKey,
  assignAgentArchetype,
  loadAgentArchetypes,
  loadAgentRoles,
  resetAgentUser,
  unlockAgentRole,
  type AgentArchetype,
  type AgentRole,
} from '@/lib/api/admin-agent-conversation';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, translateAdminMaybe, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import { AdminSkeleton } from '@/routes/admin-parts';

import type { AgentGesture, useAgentConfirm } from './admin-agent-form';

/**
 * **LES MEMBRES PILOTÉS ET LEUR RÔLE** (lot Agent complet) — dans la fiche de
 * l'agent sur une conversation : chaque rôle (`GET /configs/:id/roles`), NOMMÉ
 * par la vue en direct (`GET /configs/:id/live`, la seule lecture qui résout les
 * comptes), avec son origine, sa confiance et son verrou.
 *
 * Trois gestes par membre :
 * - **poser un archétype** (`POST /roles/:id/:userId/assign`) — le catalogue vient
 *   de `GET /archetypes`, ses noms se disent dans la langue d'administration ;
 * - **déverrouiller** (`POST …/unlock`) — offert seulement sur un rôle verrouillé,
 *   confirmé : la confiance repart de zéro ;
 * - **remettre le membre à zéro** (`DELETE /reset/user/:userId`) — confirmé en ton
 *   danger, parce qu'il efface ses rôles dans TOUTES les conversations.
 */
export function archetypeLabel(id: string | null, served: readonly AgentArchetype[], language: AdminLanguage): string {
  if (id === null) return translateAdmin(language, 'admin.value.unrecognized');
  return translateAdminMaybe(language, `admin.agentPanel.archetype.${id}`) ?? (served.find((entry) => entry.id === id)?.name || translateAdmin(language, 'admin.value.unrecognized'));
}

function roleOrigin(role: AgentRole, archetypes: readonly AgentArchetype[], language: AdminLanguage): string {
  if (role.origin === 'observed') return translateAdmin(language, 'admin.agentPanel.conv.roles.observed');
  if (role.origin === 'archetype') return translateAdmin(language, 'admin.agentPanel.conv.roles.archetype', { name: archetypeLabel(role.archetypeId, archetypes, language) });
  return translateAdmin(language, 'admin.agentPanel.conv.roles.unknown');
}

export function AgentRolesBlock({
  language,
  deps,
  conversationId,
  gesture,
  ask,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly conversationId: string;
  readonly gesture: AgentGesture;
  readonly ask: ReturnType<typeof useAgentConfirm>['ask'];
}) {
  const roles = useQuery({
    queryKey: agentRolesQueryKey(conversationId),
    queryFn: async ({ signal }) => unwrap(await loadAgentRoles({ ...deps, conversationId, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const live = useQuery({
    queryKey: agentLiveQueryKey(conversationId),
    queryFn: async ({ signal }) => unwrap(await loadAgentLive({ ...deps, conversationId, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const archetypes = useQuery({
    queryKey: agentArchetypesQueryKey(),
    queryFn: async ({ signal }) => unwrap(await loadAgentArchetypes({ ...deps, signal })),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    enabled: (roles.data?.rows.length ?? 0) > 0,
  });

  const title = translateAdmin(language, 'admin.agentPanel.conv.roles');
  const rows = roles.data?.rows;

  return (
    <AdminFicheSection id="agent-roles" title={title}>
      {rows === undefined ? (
        roles.isPending ? (
          <AdminSkeleton rows={2} />
        ) : (
          <AdminErrorState language={language} onRetry={() => void roles.refetch()} />
        )
      ) : rows.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.agentPanel.conv.roles.empty')}
        </p>
      ) : (
        <ul className="grid gap-3" data-agent-roles>
          {rows.map((role) => (
            <RoleRow
              key={role.userId}
              language={language}
              deps={deps}
              conversationId={conversationId}
              role={role}
              user={live.data?.controlledUsers.find((entry) => entry.userId === role.userId) ?? null}
              archetypes={archetypes.data ?? []}
              gesture={gesture}
              ask={ask}
            />
          ))}
        </ul>
      )}
    </AdminFicheSection>
  );
}

function RoleRow({
  language,
  deps,
  conversationId,
  role,
  user,
  archetypes,
  gesture,
  ask,
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly conversationId: string;
  readonly role: AgentRole;
  readonly user: AgentControlledUser | null;
  readonly archetypes: readonly AgentArchetype[];
  readonly gesture: AgentGesture;
  readonly ask: ReturnType<typeof useAgentConfirm>['ask'];
}) {
  const online = useOnline();
  const pickId = useId();
  const [picked, setPicked] = useState('');
  const name = personLabel(user === null ? null : { displayName: user.displayName, username: user.username }, language);
  const handle = personSecondary(user?.username ?? null);
  const assignId = `assign:${role.userId}`;

  return (
    <li
      data-agent-role={role.userId}
      className="grid gap-3 rounded-card p-3"
      style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AdminEntityChip
          language={language}
          size="sm"
          entity={{ kind: 'user', id: role.userId, label: name, ...(handle === null || handle === name ? {} : { secondary: handle }) }}
        />
        <AdminBadge tone="neutral">{roleOrigin(role, archetypes, language)}</AdminBadge>
        <AdminBadge tone="info">{translateAdmin(language, 'admin.agentPanel.conv.roles.confidence', { value: formatPercent(role.confidence, 'ratio', language) })}</AdminBadge>
        {role.locked ? (
          <AdminBadge tone="warning" glyph="lock">
            {translateAdmin(language, 'admin.agentPanel.conv.roles.locked')}
          </AdminBadge>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={pickId} className="grid min-w-0 flex-1 gap-1">
          <span className="text-caption font-medium" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agentPanel.conv.roles.pick', { name })}
          </span>
          <select
            id={pickId}
            data-agent-role-archetype={role.userId}
            value={picked}
            onChange={(event) => setPicked(event.currentTarget.value)}
            className="w-full rounded-chip px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND }}
          >
            <option value="">{translateAdmin(language, 'admin.agentPanel.form.notProvided')}</option>
            {archetypes.map((archetype) => (
              <option key={archetype.id} value={archetype.id}>
                {archetypeLabel(archetype.id, archetypes, language)}
              </option>
            ))}
          </select>
        </label>
        <AdminButton
          tone="primary"
          disabled={picked === '' || !online}
          busy={gesture.busy === assignId}
          data={{ 'data-agent-role-assign': role.userId }}
          onClick={() =>
            void gesture
              .run(assignId, () => assignAgentArchetype({ ...deps, conversationId, userId: role.userId, archetypeId: picked }), translateAdmin(language, 'admin.agentPanel.conv.roles.assigned'))
              .then((done) => (done ? setPicked('') : undefined))
          }
        >
          {translateAdmin(language, 'admin.agentPanel.conv.roles.assign')}
        </AdminButton>
      </div>

      <div className="flex flex-wrap gap-2">
        {role.locked ? (
          <AdminButton
            disabled={!online}
            data={{ 'data-agent-role-unlock': role.userId }}
            onClick={() =>
              ask({
                id: `unlock:${role.userId}`,
                title: translateAdmin(language, 'admin.agentPanel.conv.roles.unlock'),
                body: translateAdmin(language, 'admin.agentPanel.conv.roles.unlockBody', { name }),
                confirmLabel: translateAdmin(language, 'admin.agentPanel.conv.roles.unlock'),
                tone: 'primary',
                act: () => unlockAgentRole({ ...deps, conversationId, userId: role.userId }),
                success: translateAdmin(language, 'admin.agentPanel.conv.roles.unlocked'),
              })
            }
          >
            {translateAdmin(language, 'admin.agentPanel.conv.roles.unlock')}
          </AdminButton>
        ) : null}
        <AdminButton
          tone="danger"
          disabled={!online}
          data={{ 'data-agent-role-reset': role.userId }}
          onClick={() =>
            ask({
              id: `reset-user:${role.userId}`,
              title: translateAdmin(language, 'admin.agentPanel.conv.roles.reset'),
              body: translateAdmin(language, 'admin.agentPanel.conv.roles.resetBody', { name }),
              confirmLabel: translateAdmin(language, 'admin.agentPanel.conv.roles.reset'),
              tone: 'danger',
              act: () => resetAgentUser({ ...deps, userId: role.userId }),
              success: translateAdmin(language, 'admin.agentPanel.conv.roles.resetDone'),
            })
          }
        >
          {translateAdmin(language, 'admin.agentPanel.conv.roles.reset')}
        </AdminButton>
      </div>
    </li>
  );
}
