import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaRow, AdminMomentText } from '@/components/admin/meta';
import { agentNodeLabel } from '@/lib/admin/agent-model';
import { languageName, sentenceCase } from '@/lib/admin/interpret/language';
import { personLabel, personSecondary } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import {
  AGENT_ROOT_KEY,
  agentLiveQueryKey,
  loadAgentLive,
  relancerAgent,
  stopperScanAgent,
  type AgentControlledUser,
} from '@/lib/api/admin-agent';
import { unwrap } from '@/lib/api/client';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useLiveAnnouncer, type AnnouncementTone } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement } from '@/routes/admin-parts';

/**
 * **LE GESTE DE RELANCE, ÉCRIT UNE FOIS** (#6733, #8876) — la section Agent et la
 * fiche d'une conversation le posent tous les deux, et deux rédactions du même
 * avertissement divergeraient au premier lot qui n'en relit qu'une.
 *
 * ## LE LIBELLÉ DE LA RELANCE NE MENT PAS
 *
 * `POST /admin/agent/configs/:id/trigger` ne relance pas « l'analyse » : il
 * rejoue le cycle COMPLET du graphe (observer → strategist → generator →
 * qualityGate) et peut faire **PUBLIER un message par l'agent dans la vraie
 * conversation**. Le contrôle s'appelle « Relancer l'agent », et la phrase
 * `admin.agent.effect` est rendue À CÔTÉ de lui — jamais dans une bulle d'aide.
 *
 * ## ET IL SE CONFIRME
 *
 * Un message publié a été lu : le geste est irréversible. Il passe donc par
 * `AdminConfirmSheet`, qui redit l'effet avant de partir. L'ARRÊT d'un scan, lui,
 * défait plutôt qu'il ne fait : il part directement.
 *
 * ## FEEDBACK IMMÉDIAT, PUIS LA VÉRITÉ
 *
 * L'annonce part AVANT la réponse ; un refus la REMPLACE par son échec. On
 * n'annonce jamais un succès qui n'a pas eu lieu — `triggered` est lu tel que le
 * handler le dit. Tout l'état de l'agent est relu après le geste (`AGENT_ROOT_KEY`) :
 * la pastille « scan en cours » et l'étape du graphe viennent du serveur, jamais
 * d'un état local qui prétendrait savoir ce que le service agent a fait.
 */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const BRAND = 'var(--color-ios-brand)';

/**
 * L'ANCRE D'UN BOUTON N'EST PORTÉE QU'UNE FOIS PAR PAGE, SUR L'EXEMPLAIRE VISIBLE —
 * la liste du kit peint le tableau ET les cartes dans le DOM (l'un des deux est
 * masqué par le CSS, selon la largeur `md`) : une cellule y est rendue deux fois,
 * et un sélecteur d'unicité stricte (la recette navigateur
 * `check-admin-souverain`) refuserait de choisir entre deux boutons identiques —
 * ou se poserait sur celui qui est masqué. L'ancre va donc à l'exemplaire que la
 * largeur courante montre : le tableau dès `md`, la carte en dessous ; hors d'une
 * liste (la fiche d'une conversation), elle est toujours portée.
 */
const WIDE_LAYOUT = '(min-width: 48rem)';

const isWideLayout = (): boolean => typeof matchMedia !== 'function' || matchMedia(WIDE_LAYOUT).matches;

type Placement = 'unknown' | 'table' | 'card' | 'plain';

function useAnchorOnVisibleInstance() {
  const host = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement>('unknown');
  const [wide, setWide] = useState(isWideLayout);

  useLayoutEffect(() => {
    const element = host.current;
    if (element === null) return;
    setPlacement(element.closest('[data-admin-card]') !== null ? 'card' : element.closest('table') !== null ? 'table' : 'plain');
  }, []);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const query = matchMedia(WIDE_LAYOUT);
    const follow = () => setWide(query.matches);
    query.addEventListener?.('change', follow);
    return () => query.removeEventListener?.('change', follow);
  }, []);

  const anchored = placement === 'plain' || (placement === 'table' && wide) || (placement === 'card' && !wide);
  return { host, anchored };
}

export function AgentRelaunchControl({
  conversationId,
  language,
  deps,
  isScanning,
  currentNode,
  onAnnounce,
}: {
  readonly conversationId: string;
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
  readonly isScanning: boolean;
  readonly currentNode: string | null;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const [sending, setSending] = useState<'idle' | 'relaunch' | 'stop'>('idle');
  const [confirming, setConfirming] = useState(false);
  const { host, anchored } = useAnchorOnVisibleInstance();

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: AGENT_ROOT_KEY });
  };

  const relaunch = async (): Promise<void> => {
    setSending('relaunch');
    onAnnounce(translateAdmin(language, 'admin.agent.done'));
    const outcome = await relancerAgent({ ...deps, conversationId });
    if (!outcome.ok || !outcome.data.triggered) onAnnounce(translateAdmin(language, 'admin.agent.failed'), 'error');
    setSending('idle');
    setConfirming(false);
    await refresh();
  };

  const stop = async (): Promise<void> => {
    setSending('stop');
    const outcome = await stopperScanAgent({ ...deps, conversationId });
    if (!outcome.ok) onAnnounce(translateAdmin(language, 'admin.agent.failed'), 'error');
    else if (outcome.data.agentUnavailable) onAnnounce(translateAdmin(language, 'admin.agent.down'), 'error');
    else onAnnounce(translateAdmin(language, 'admin.agent.halted'));
    setSending('idle');
    await refresh();
  };

  const idle = sending === 'idle';

  return (
    <div ref={host} className="grid gap-2">
      {isScanning ? (
        <p className="text-caption font-medium" style={{ color: BRAND }} data-agent-scanning={conversationId}>
          {translateAdmin(language, 'admin.agent.scan', { node: agentNodeLabel(currentNode, language) })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          {...(anchored ? { 'data-agent-relaunch': conversationId } : {})}
          disabled={!idle || !online}
          onClick={() => setConfirming(true)}
          className={`inline-flex items-center gap-2 rounded-chip px-4 text-body font-semibold text-ios-on-brand disabled:opacity-40 ${FOCUS}`}
          style={{ minHeight: 44, backgroundColor: BRAND, outlineColor: BRAND }}
        >
          <AdminGlyph name="arrowClockwise" size={16} />
          {translateAdmin(language, 'admin.agent.relaunch')}
        </button>

        {/* Un contrôle SANS OBJET ne se peint pas : hors scan, l'arrêt n'aurait rien à arrêter. */}
        {isScanning ? (
          <button
            type="button"
            {...(anchored ? { 'data-agent-stop': conversationId } : {})}
            disabled={!idle || !online}
            onClick={() => void stop()}
            className={`inline-flex items-center gap-2 rounded-chip px-4 text-body font-semibold disabled:opacity-40 ${FOCUS}`}
            style={{
              minHeight: 44,
              backgroundColor: 'var(--color-ios-surface)',
              border: '1px solid var(--color-edge)',
              color: 'var(--color-ios-ink)',
              outlineColor: BRAND,
            }}
          >
            <AdminGlyph name="prohibit" size={16} />
            {translateAdmin(language, 'admin.agent.stop')}
          </button>
        ) : null}
      </div>

      {/* L'EFFET RÉEL, SERVI À CÔTÉ DU BOUTON — jamais dans une bulle d'aide : un effet qu'il faut découvrir n'est pas annoncé. */}
      <p className="max-w-prose text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-agent-relaunch-effect={conversationId}>
        {translateAdmin(language, 'admin.agent.effect')}
      </p>

      {confirming ? (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, 'admin.agent.relaunch')}
          body={translateAdmin(language, 'admin.agent.effect')}
          confirmLabel={translateAdmin(language, 'admin.agent.relaunch')}
          tone="primary"
          busy={sending === 'relaunch'}
          onConfirm={() => void relaunch()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function ControlledUserChip({ language, user }: { readonly language: InterfaceLanguage; readonly user: AgentControlledUser }) {
  const secondary = user.language === null ? null : sentenceCase(languageName(user.language, language), language);
  const handle = personSecondary(user.username);
  return (
    <AdminEntityChip
      language={language}
      size="sm"
      entity={{
        kind: 'user',
        id: user.userId,
        label: personLabel({ displayName: user.displayName, username: user.username }, language),
        ...(secondary === null ? (handle === null ? {} : { secondary: handle }) : { secondary }),
      }}
    />
  );
}

/**
 * **L'AGENT SUR UNE CONVERSATION** (#6733, #8876) — le bloc que la fiche d'une
 * conversation pose sous ses membres, avec le MÊME geste de relance que la
 * section Agent.
 *
 * Il lit l'état VIVANT (`GET /configs/:id/live`) plutôt que de supposer : cet
 * écran n'a pas de liste d'où tenir `isScanning`, et un bouton d'arrêt peint au
 * hasard serait un contrôle qui ment dans les deux sens. C'est aussi la SEULE
 * lecture de l'agent qui résolve les noms des membres pilotés — ils sont donc
 * NOMMÉS ici (et seulement ici : les listes ne les désignent que par leur nombre).
 *
 * Une conversation SANS agent configuré n'a rien à relancer : la requête échoue,
 * et le bloc ne se peint pas du tout. C'est la bonne réponse — poser le geste
 * quand même ne rendrait que des 404.
 */
export function AgentConversationControl({
  conversationId,
  language,
  deps,
  onAnnounce,
  now = () => new Date(),
}: {
  readonly conversationId: string;
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
  /** L'hôte a déjà sa région vivante (la fiche d'une conversation) : le bloc lui parle au lieu d'en ouvrir une seconde. */
  readonly onAnnounce?: (message: string, tone?: AnnouncementTone) => void;
  readonly now?: () => Date;
}) {
  const announcer = useLiveAnnouncer();

  const live = useQuery({
    queryKey: agentLiveQueryKey(conversationId),
    queryFn: async ({ signal }) => unwrap(await loadAgentLive({ ...deps, conversationId, signal })),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (live.data === undefined) return null;

  const state = live.data;
  const users = state.controlledUsers;

  return (
    <AdminFicheSection id="agent" title={translateAdmin(language, 'admin.agentPanel.conversation.title')}>
      <div className="grid gap-4" data-agent-conversation-control={conversationId}>
        <dl className="grid gap-3 sm:grid-cols-3">
          <AdminMetaRow
            anchor="agent-users"
            label={translateAdmin(language, 'admin.agent.users')}
            value={
              users.length === 0 ? (
                translateAdmin(language, 'admin.agentPanel.conversation.usersNone')
              ) : (
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  {users.map((user) => (
                    <ControlledUserChip key={user.userId} language={language} user={user} />
                  ))}
                </span>
              )
            }
          />
          <AdminMetaRow
            anchor="agent-messages"
            label={translateAdmin(language, 'admin.agentPanel.conversation.messages')}
            value={formatCount(state.messagesSent, language)}
          />
          <AdminMetaRow
            anchor="agent-last-response"
            label={translateAdmin(language, 'admin.agentPanel.conversation.lastResponse')}
            value={
              state.lastResponseAt === null ? (
                translateAdmin(language, 'admin.agentPanel.lastResponse.never')
              ) : (
                <AdminMomentText moment={adminMomentOf(state.lastResponseAt, now(), language)} variant="both" />
              )
            }
          />
        </dl>
        <AgentRelaunchControl
          conversationId={conversationId}
          language={language}
          deps={deps}
          isScanning={state.isScanning}
          currentNode={state.currentNode}
          onAnnounce={onAnnounce ?? announcer.announce}
        />
      </div>
      {onAnnounce === undefined ? <AdminAnnouncement text={announcer.text} /> : null}
    </AdminFicheSection>
  );
}
