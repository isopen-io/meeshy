import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from 'zustand/react';

import {
  conversationMembersQueryOptions,
  flattenConversationMembers,
  memberFromParticipant,
} from '@/lib/api/conversation-members';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { sessionStore } from '@/lib/api/session';
import type { Conversation } from '@/lib/api/types';
import { departureKindsOf, type DepartureKind } from '@/lib/conversation-departure';
import { conversationStore, effectiveFlagsOf } from '@/lib/conversation-store';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { translateConversationManage } from '@/lib/i18n-conversation-manage-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { managementOf } from '@/lib/view/conversation-management';
import { shareConversationLink, type ConversationShareOutcome } from '@/lib/view/conversation-share-link';
import type { PortailPartage } from '@/lib/view/invitation';
import { canCreateShareLink } from '@/lib/view/share-link-eligibility';
import type { StoryRingOf } from '@/lib/view/use-author-story-rings';
import { useConversationManageCatalog } from '@/lib/view/use-conversation-manage-catalog';

import { ConversationDetailsAvatar } from './conversation-details-avatar';
import { ConversationMembersSection } from './conversation-details-members';
import { ConversationAppearanceEntry } from './conversation-appearance-entry';
import { ConversationMediaSection } from './conversation-media-section';
import { ConversationOptionsSection } from './conversation-options-section';
import { ConversationSettingsSection } from './conversation-settings-section';
import { Glyph, GlyphSvg } from './glyph';
import { CALLS_GLYPHS } from './glyphs-calls';
import { SETTINGS_GLYPHS } from './glyphs-settings';
import { Sheet } from './sheet';

/**
 * LA SECTION « STATISTIQUES », À LA DEMANDE (#7835) — ni ses calculs ni son
 * catalogue ne voyagent avec la feuille tant qu'elle n'est pas montrée.
 */
const ConversationStatsSection = lazy(() => import('./conversation-stats-section').then((m) => ({ default: m.ConversationStatsSection })));

/**
 * **LES DÉTAILS D'UNE CONVERSATION** (#7829) — premier incrément de
 * `ConversationInfoSheet.swift` : l'EN-TÊTE (photo, nom, description, type,
 * nombre de membres), l'action « Partager un lien », la section « Médias »
 * (#7834, #8103 — l'aperçu et l'entrée vers l'écran « Médias, liens et
 * documents »), la section « Statistiques » (#7835, réservée à un membre
 * inscrit : la passerelle la refuse à un visiteur sans compte, la feuille ne
 * la demande donc pas) et l'onglet « Membres », que celui qui en a le rang
 * GÈRE (#10613 : promouvoir, rétrograder, expulser, bannir, ajouter —
 * `conversation-details-members.tsx`). Les réglages du groupe (#7836 : photo,
 * titre, description, permissions — `conversation-settings-section.tsx`) et les
 * options du lecteur (nom personnel, épingler, sourdine, archiver —
 * `conversation-options-section.tsx`) suivent ; « Quitter » et « Supprimer pour
 * moi » sont portés (#7837, #7285). Les mots de la gestion vivent dans leur
 * propre catalogue, chargé avec la feuille (`i18n-conversation-manage-catalog.ts`).
 *
 * Une FEUILLE du fil, pas une adresse (D-118) : comme sur iOS, elle se pose
 * au-dessus du fil qui garde son défilement, le retour matériel la referme
 * (`Sheet` → `useBackDismiss`), et tout ce qu'elle peint d'abord est DÉJÀ dans
 * la mémoire du fil — la conversation et ses participants en cache.
 *
 * CACHE D'ABORD : les participants que la conversation porte (cinq au plus
 * dans la liste) se peignent à l'ouverture ; la page de la passerelle les
 * remplace quand elle arrive. Le squelette ne paraît que si le cache est VIDE.
 */
type TypeKey = Extract<InterfaceCatalogKey, `conversation.details.type.${string}`>;

const TYPE_KEYS: Readonly<Record<Conversation['type'], TypeKey>> = {
  direct: 'conversation.details.type.direct',
  group: 'conversation.details.type.group',
  public: 'conversation.details.type.public',
  global: 'conversation.details.type.global',
  broadcast: 'conversation.details.type.broadcast',
};

type ShareState = { readonly busy: boolean; readonly feedback: string | null };

const feedbackOf = (outcome: ConversationShareOutcome, language: ReturnType<typeof currentInterfaceLanguage>): string | null => {
  switch (outcome.kind) {
    case 'shared':
    case 'cancelled':
      return null;
    case 'copied':
      return translate(language, 'conversation.details.share.copied');
    case 'failed':
      return translate(language, 'conversation.details.share.failed');
    case 'unavailable':
      return translate(language, 'conversation.details.share.unavailable', { url: outcome.url });
  }
};

export function ConversationDetailsSheet({
  conversation,
  title,
  accent,
  viewerId,
  storyRingOf,
  deps,
  origin,
  portail,
  onClose,
  onJumpToMessage,
  canJumpTo,
  onRequestDeparture,
  focus,
}: {
  readonly conversation: Conversation;
  readonly title: string;
  readonly accent: string;
  readonly viewerId: string;
  readonly storyRingOf?: StoryRingOf | undefined;
  readonly deps: ConversationsDeps;
  readonly origin: string;
  readonly portail?: PortailPartage | undefined;
  readonly onClose: () => void;
  /** « Aller au message » depuis l'écran des médias — le fil referme la feuille et y saute. */
  readonly onJumpToMessage?: ((messageId: string) => void) | undefined;
  readonly canJumpTo?: ((messageId: string) => boolean) | undefined;
  /**
   * QUITTER, SUPPRIMER POUR MOI (#7837, #7285) — l'hôte qui sait partir : il
   * DEMANDE le geste, que la coquille confirme (`requestDeparture`). Absent
   * (visiteur sans compte), aucun des deux n'est rendu.
   */
  readonly onRequestDeparture?: ((kind: DepartureKind) => void) | undefined;
  /**
   * OÙ LA FICHE S'OUVRE (revue #11211) — « Inviter » depuis le menu d'une
   * ligne ouvre l'ajout de membres, « Gérer les membres » amène la liste en
   * vue. Absent, la fiche s'ouvre sur sa tête.
   */
  readonly focus?: 'invite' | 'members' | undefined;
}) {
  const language = currentInterfaceLanguage();
  const queryClient = useQueryClient();
  const manageReady = useConversationManageCatalog(language);
  const management = managementOf(conversation);
  const muted = useStore(conversationStore, (state) => effectiveFlagsOf(conversation, state.overrides).isMuted);
  const query = useInfiniteQuery(conversationMembersQueryOptions(deps, conversation.id));
  useMembersLive({ deps, queryClient, conversationId: conversation.id, viewerId });
  const served = flattenConversationMembers(query.data);
  const members = served ?? conversation.participants.map(memberFromParticipant);
  const total = query.data?.pages[0]?.totalCount ?? conversation.memberCount;
  const capped = query.data === undefined && conversation.memberCountCapped === true;
  const countLabel = translate(language, total === 1 ? 'conversation.details.members.one' : 'conversation.details.members.other', {
    count: `${total}${capped ? '+' : ''}`,
  });
  const description = conversation.description?.trim() ?? '';

  /**
   * LES STATISTIQUES (#7835) — un compte INSCRIT seulement : `GET
   * /conversations/:id/stats` refuse un invité ou un visiteur (`requiredAuth`,
   * `allowAnonymous: false`). Pour eux, rien n'est demandé ni montré.
   */
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated') || deps.source === 'fixtures';
  const canViewStats = signedIn;
  const createdOn = createdOnOf(conversation.createdAt, language);

  const departures = onRequestDeparture === undefined ? [] : departureKindsOf(conversation);
  const canLeave = departures.includes('leave');
  const canShare = canCreateShareLink(conversation);
  const [share, setShare] = useState<ShareState>({ busy: false, feedback: null });
  const onShare = async () => {
    setShare({ busy: true, feedback: null });
    const outcome = await shareConversationLink({
      deps,
      conversationId: conversation.id,
      origin,
      ...(portail === undefined ? {} : { portail }),
    });
    setShare({ busy: false, feedback: feedbackOf(outcome, language) });
  };

  return (
    <Sheet title={translate(language, 'conversation.details.title')} bodyAs="div" onClose={onClose}>
      <div className="flex-1 overflow-y-auto" data-conversation-details>
        <header className="flex flex-col items-center gap-2 px-4 pt-4 pb-6 text-center">
          <ConversationDetailsAvatar conversation={conversation} viewerId={viewerId} title={title} accent={accent} />
          <h3 className="text-section font-bold" style={{ color: 'var(--color-ios-ink)' }} data-conversation-details-name>
            {title}
          </h3>
          {description === '' ? null : (
            <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-details-description>
              {description}
            </p>
          )}
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-details-meta>
            {translate(language, TYPE_KEYS[conversation.type])} · {countLabel}
          </p>
          {manageReady && createdOn !== null ? (
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-details-created>
              {translateConversationManage(language, 'conversationManage.header.created_on', { date: createdOn })}
            </p>
          ) : null}
          {manageReady && muted ? (
            <p className="flex items-center gap-1 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-details-muted>
              <Glyph name="bellSlash" size={14} />
              {translateConversationManage(language, 'conversationManage.header.muted')}
            </p>
          ) : null}
        </header>

        {canShare || canLeave ? (
          <div className="flex flex-col items-center gap-2 px-4 pb-6">
            <div className="flex flex-wrap justify-center gap-2">
              {canShare ? (
                <button
                  type="button"
                  disabled={share.busy}
                  aria-busy={share.busy}
                  onClick={() => void onShare()}
                  data-conversation-details-share
                  className="flex items-center gap-2 rounded-chip px-4 font-semibold disabled:opacity-50"
                  style={{ minHeight: 44, color: 'var(--color-ios-on-brand)', backgroundColor: 'var(--accent)' }}
                >
                  <Glyph name="linkSimple" size={18} />
                  {share.busy ? translate(language, 'conversation.details.share.busy') : translate(language, 'conversation.details.share')}
                </button>
              ) : null}
              {canLeave ? (
                <DepartureButton kind="leave" language={language} onPress={() => onRequestDeparture?.('leave')} />
              ) : null}
            </div>
            <p role="status" aria-live="polite" className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {share.feedback ?? ''}
            </p>
          </div>
        ) : null}

        <ConversationMediaSection
          conversationId={conversation.id}
          viewerId={viewerId}
          accent={accent}
          deps={deps}
          {...(onJumpToMessage === undefined ? {} : { onJumpToMessage })}
          {...(canJumpTo === undefined ? {} : { canJumpTo })}
        />

        {canViewStats ? (
          <Suspense fallback={null}>
            <ConversationStatsSection conversationId={conversation.id} deps={deps} />
          </Suspense>
        ) : null}

        <ConversationMembersSection
          conversation={conversation}
          members={members}
          pending={query.isPending}
          failed={query.isError}
          onRetry={() => void query.refetch()}
          hasMore={query.hasNextPage === true}
          loadingMore={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
          viewerId={viewerId}
          accent={accent}
          deps={deps}
          language={language}
          manageReady={manageReady}
          {...(focus === undefined ? {} : { focus })}
          {...(storyRingOf === undefined ? {} : { storyRingOf })}
        />

        {manageReady && management.editIdentity ? (
          <ConversationSettingsSection conversation={conversation} title={title} accent={accent} deps={deps} language={language} management={management} />
        ) : null}

        {manageReady && signedIn ? <ConversationOptionsSection conversation={conversation} viewerId={viewerId} deps={deps} language={language} /> : null}

        {signedIn ? <ConversationAppearanceEntry conversation={conversation} accent={accent} deps={deps} language={language} /> : null}

        {departures.includes('delete') ? (
          <div className="flex justify-center px-4 pb-8">
            <DepartureButton kind="delete" language={language} onPress={() => onRequestDeparture?.('delete')} />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * UN GESTE DE DÉPART — à la place qu'iOS lui donne : « Quitter » à côté de
 * « Partager » (`ConversationInfoSheet.swift`, rangée d'actions), « Supprimer
 * pour moi » en bas (`ConversationPreferencesTab.swift`). Texte rouge, jamais du
 * blanc sur du rouge (`ConfirmDialog`) ; 44 px au moins.
 */
function DepartureButton({
  kind,
  language,
  onPress,
}: {
  readonly kind: DepartureKind;
  readonly language: ReturnType<typeof currentInterfaceLanguage>;
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      data-conversation-departure={kind}
      className="flex items-center gap-2 rounded-chip px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 44,
        color: 'var(--color-error)',
        border: '1.5px solid color-mix(in srgb, var(--color-error) 55%, transparent)',
        outlineColor: 'var(--color-error)',
      }}
    >
      <span aria-hidden className="grid place-items-center">
        <GlyphSvg glyph={kind === 'leave' ? SETTINGS_GLYPHS.signOut : CALLS_GLYPHS.trash} size={18} />
      </span>
      {translate(language, kind === 'leave' ? 'conversation.departure.leave' : 'conversation.departure.delete')}
    </button>
  );
}

/** « Créé le … » (iOS `conversation.info.created-on`) — la date dans la langue d'interface, ou rien si elle est illisible. */
function createdOnOf(createdAt: Date | string | undefined, language: string): string | null {
  if (createdAt === undefined) return null;
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/**
 * LA FEUILLE OUVERTE ÉCOUTE LES MEMBRES (#10613) — `participant:role-updated`,
 * départs, bannissements et arrivées, sur la socket vivante, le temps où elle
 * est montée (`watchLiveSocket`). Le temps réel se charge à la demande : la
 * feuille n'en importe rien statiquement.
 */
function useMembersLive(params: {
  readonly deps: ConversationsDeps;
  readonly queryClient: ReturnType<typeof useQueryClient>;
  readonly conversationId: string;
  readonly viewerId: string;
}): void {
  const { deps, queryClient, conversationId, viewerId } = params;
  useEffect(() => {
    if (deps.source !== 'gateway') return undefined;
    let live = true;
    let stop: (() => void) | null = null;
    void Promise.all([import('@/lib/api/realtime'), import('@/lib/api/conversation-members-live')]).then(
      ([{ watchLiveSocket }, { bindConversationMembersLive }]) => {
        if (!live) return;
        stop = watchLiveSocket((socket) => bindConversationMembersLive({ socket, queryClient, conversationId, viewerId }));
      },
      () => undefined,
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [deps.source, queryClient, conversationId, viewerId]);
}
