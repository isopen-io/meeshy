import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useStore } from 'zustand/react';

import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminLink } from '@/components/admin/entity-chip';
import { AdminFiche, AdminFicheSection, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminOfflineNotice } from '@/components/admin/states';
import { agentAccess } from '@/lib/admin/agent-access';
import { conversationStateOf, ficheNameOf, sheetConversationOf } from '@/lib/admin/conversation-model';
import { interpretConversationType, interpretEncryption } from '@/lib/admin/interpret/enums';
import { personInitials } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { adminConversationFicheKey, loadAdminConversationFiche } from '@/lib/api/admin-conversation-fiche';
import { ADMIN_CONVERSATIONS_ROOT_KEY } from '@/lib/api/admin-conversations';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { AgentConversationControl } from '@/routes/admin-agent-parts';
import { ConversationMembers } from '@/routes/admin-conversation-members';
import { ConversationMeta } from '@/routes/admin-conversation-meta';
import { AdminConversationReading } from '@/routes/admin-conversation-reading';
import { AdminConversationSettingsSheet } from '@/routes/admin-conversation-settings-sheet';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LA FICHE D'UNE CONVERSATION** (#6862, #8876) — `/admin/conversations/$conversation`.
 *
 * De quoi comprendre la conversation sans quitter la page : qui elle est (son
 * nom, son type, son état, son chiffrement), ses chiffres (membres, messages,
 * liens de partage, agent), ses métadonnées INTERPRÉTÉES, ses membres nommés —
 * puis de quoi agir : changer un rôle, retirer un membre, configurer la
 * conversation, piloter son agent, et la LIRE.
 *
 * ## La lecture souveraine ne dépend pas de la fiche
 *
 * `GET …/messages` n'a besoin que de l'identifiant de la conversation, et son
 * motif écrit est le seul chemin vers le CONTENU. Si la fiche échoue (panne,
 * charge illisible), la lecture reste offerte sous l'avis d'erreur : perdre les
 * métadonnées ne doit pas fermer la seule porte qui montre ce qui s'est dit. Un
 * 403 ou un 404, eux, ferment tout — rien à lire pour qui n'en a pas le droit,
 * ou pour une conversation qui n'existe plus.
 *
 * ## Le prisme de QUI, sur cette page
 *
 * Celui de l'ADMINISTRATEUR, seule réponse honnête : cette adresse ouvre une
 * conversation de la plateforme sans membre administré, donc personne dont on
 * puisse emprunter la langue. La fenêtre de lecture de la fiche d'un membre, elle,
 * sert SA langue (`lib/admin/prisme-membre.ts`). Le viewer suit la même logique :
 * `resolveViewer` rend l'administrateur lui-même.
 *
 * ## Fail-closed comme l'inventaire
 *
 * `canManageConversations` ET le rang d'administration (`AdminSectionScreen`) ; un
 * 403 malgré tout se rend comme un refus, un 404 comme « cette conversation
 * n'existe plus » — jamais comme une panne.
 */
const defaultNow = (): Date => new Date();

type ConversationPanelProps = {
  readonly language: InterfaceLanguage;
  readonly conversationId: string;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminConversationPanel({ language, conversationId, deps = apiDeps, now = defaultNow }: ConversationPanelProps) {
  const reach = useAdminReach();
  const online = useOnline();
  const announcer = useLiveAnnouncer();
  const queryClient = useQueryClient();
  const reader = useReaderLanguages();
  const session = useStore(sessionStore, (state) => state.session);
  const viewer = resolveViewer({ source: deps.source, session });
  const [configuring, setConfiguring] = useState(false);

  const query = useQuery({
    queryKey: adminConversationFicheKey(conversationId),
    queryFn: async ({ signal }) => unwrap(await loadAdminConversationFiche({ ...deps, conversationId, signal })),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const fiche = query.data;

  const agentControl =
    agentAccess({ permissions: reach.permissions, role: reach.role ?? undefined, chargement: reach.status === 'pending' }) === 'ouvert';

  const listTarget = { kind: 'section', section: 'conversations' } as const;
  const status = query.error instanceof ApiError ? query.error.status : 0;
  const reading = (
    <AdminFicheSection id="reading" title={translateAdmin(language, 'admin.conversation.reading.title')}>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translateAdmin(language, 'admin.conversation.reading.hint')}
      </p>
      <AdminConversationReading
        conversationId={conversationId}
        language={language}
        /* AUCUN membre administré ici : le prisme est celui du LECTEUR, et le bandeau « prisme du membre » n'a donc rien à annoncer. */
        prisme="lecteur"
        readerLanguages={reader.languages}
        readerLocale={reader.locale}
        viewer={viewer}
        deps={deps}
        layout="bounded"
      />
    </AdminFicheSection>
  );

  if (fiche === undefined) {
    const title = translateAdmin(language, 'admin.convDetail.title');
    const crumbs = [
      { label: translateAdmin(language, 'admin.group.exchanges') },
      { label: translateAdmin(language, 'admin.nav.conversations'), target: listTarget },
      { label: title },
    ];

    if (query.isPending) {
      return (
        <div className="grid gap-6" aria-busy="true" aria-label={translateAdmin(language, 'admin.conversation.fiche.loading')} data-admin-conversation-loading>
          <AdminPageHeader language={language} title={title} crumbs={crumbs} />
          <AdminSkeleton rows={4} />
        </div>
      );
    }

    if (status === 403) return <AdminDeniedInline language={language} />;

    if (status === 404) {
      return (
        <AdminEmptyState
          glyph="chats"
          title={translateAdmin(language, 'admin.conversation.fiche.notFound')}
          hint={translateAdmin(language, 'admin.conversation.fiche.notFoundHint')}
          action={
            <AdminLink
              target={listTarget}
              anchor="back-to-list"
              className="inline-flex items-center rounded-chip px-5 text-body font-semibold text-white"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.conversation.fiche.back')}
            </AdminLink>
          }
        />
      );
    }

    return (
      <div className="grid gap-6" data-admin-conversation-fiche-error>
        <AdminPageHeader language={language} title={title} crumbs={crumbs} />
        <AdminErrorState language={language} onRetry={() => void query.refetch()} />
        {reading}
      </div>
    );
  }

  const clock = now();
  const name = ficheNameOf(fiche, language);
  const state = conversationStateOf(fiche, language);
  const encryption = interpretEncryption(fiche.settings.encryptionMode ?? 'none', language);
  const typeLabel = interpretConversationType(fiche.type, language).label;

  const stats = [
    { id: 'members', label: translateAdmin(language, 'admin.conversation.stat.members'), value: formatCount(fiche.memberCount, language) },
    { id: 'messages', label: translateAdmin(language, 'admin.conversation.stat.messages'), value: formatCount(fiche.messageCount, language) },
    { id: 'shareLinks', label: translateAdmin(language, 'admin.conversation.stat.shareLinks'), value: formatCount(fiche.shareLinkCount, language) },
    {
      id: 'agent',
      label: translateAdmin(language, 'admin.conversation.stat.agent'),
      value: translateAdmin(language, fiche.agentEnabled ? 'admin.conversation.stat.agent.on' : 'admin.conversation.stat.agent.off'),
    },
  ];

  const relire = () => {
    void queryClient.invalidateQueries({ queryKey: adminConversationFicheKey(conversationId) });
    void queryClient.invalidateQueries({ queryKey: ADMIN_CONVERSATIONS_ROOT_KEY });
  };

  return (
    <div className="grid gap-6" data-admin-conversation-fiche>
      <AdminPageHeader
        language={language}
        title={name}
        crumbs={[
          { label: translateAdmin(language, 'admin.group.exchanges') },
          { label: translateAdmin(language, 'admin.nav.conversations'), target: listTarget },
          { label: name },
        ]}
      />
      <AdminOfflineNotice language={language} />
      <AdminFiche
        kind="conversation"
        header={
          <AdminIdentityHeader
            language={language}
            title={name}
            secondary={fiche.community === null ? typeLabel : `${typeLabel} · ${fiche.community.name}`}
            {...(fiche.avatar === null
              ? { glyph: 'chats' as const }
              : { avatar: { initials: personInitials(name), color: 'var(--color-ios-brand)', src: fiche.avatar } })}
            badges={
              <>
                <AdminInterpretedBadge value={state} />
                <AdminInterpretedBadge value={encryption} />
                {fiche.agentEnabled ? <AdminBadge tone="info" glyph="robot">{translateAdmin(language, 'admin.conversation.stat.agent.on')}</AdminBadge> : null}
              </>
            }
            actions={
              <button
                type="button"
                data-admin-action="configure"
                disabled={!online}
                onClick={() => setConfiguring(true)}
                className="inline-flex items-center gap-2 rounded-chip px-5 text-body font-semibold text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
              >
                {translateAdmin(language, 'admin.conversation.fiche.configure')}
              </button>
            }
          />
        }
        stats={<AdminStatStrip items={stats} />}
        aside={<ConversationMeta language={language} fiche={fiche} now={clock} onAnnounce={announcer.announce} />}
      >
        <AdminFicheSection id="members" title={translateAdmin(language, 'admin.conversation.members.title')}>
          <ConversationMembers
            language={language}
            conversationId={conversationId}
            conversationType={fiche.type}
            deps={deps}
            online={online}
            now={clock}
            announce={announcer.announce}
          />
        </AdminFicheSection>
        {reading}
        {agentControl ? <AgentConversationControl conversationId={conversationId} language={language} deps={deps} onAnnounce={announcer.announce} now={now} /> : null}
      </AdminFiche>
      {configuring ? (
        <AdminConversationSettingsSheet
          conversation={sheetConversationOf(fiche)}
          language={language}
          deps={deps}
          onClose={() => setConfiguring(false)}
          onAnnounce={announcer.announce}
          onChanged={relire}
        />
      ) : null}
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminConversationScreen() {
  const language = currentInterfaceLanguage();
  const { conversation: conversationId } = useParams<'/admin/conversations/$conversation'>();

  return (
    <AdminSectionScreen section="conversations" language={language} title={translateAdmin(language, 'admin.nav.conversations')}>
      {() => <AdminConversationPanel language={language} conversationId={conversationId} />}
    </AdminSectionScreen>
  );
}
