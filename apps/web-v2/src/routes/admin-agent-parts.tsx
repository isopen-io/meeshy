import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import { Sheet } from '@/components/sheet';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_AGENT_PAGE_SIZE,
  agentLiveQueryKey,
  agentOverviewQueryKey,
  agentScanLogQueryKey,
  agentScanLogsQueryKey,
  agentTrackedQueryKey,
  loadAgentLive,
  loadAgentOverview,
  loadAgentScanLog,
  loadAgentScanLogs,
  loadAgentTracked,
  relancerAgent,
  stopperScanAgent,
  type AgentScanLogRow,
  type AgentTrackedConversation,
} from '@/lib/api/admin-agent';
import { ADMIN_SOUVERAIN_PREFIXE } from '@/lib/api/souverain';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';

import { AdminAnnouncement, AdminCounter, AdminSkeleton } from './admin-parts';

/**
 * **LA SECTION AGENT DE L'ADMINISTRATION** (#6733) — vue d'ensemble,
 * conversations suivies, relance / arrêt, journal des scans.
 *
 * Le périmètre est celui que le porteur a tranché. Les onglets LLM, sujets,
 * rôles et file de livraison sont HORS de ce lot : leurs routes existent, mais
 * un écran qui les montrerait à moitié vaudrait moins que leur absence.
 *
 * ## LE LIBELLÉ DE LA RELANCE NE MENT PAS, ET C'EST LE CŒUR DU LOT
 *
 * `POST /admin/agent/configs/:id/trigger` ne relance pas « l'analyse ». Il
 * remet `agent:last-scan` à zéro et publie `agent:trigger-scan` ; le service
 * agent rejoue alors le cycle **COMPLET** du graphe LangGraph — `observer` →
 * `strategist` → `generator` → `qualityGate` — et peut donc faire **PUBLIER un
 * message par l'agent dans la vraie conversation**.
 *
 * Le contrôle s'appelle donc « Relancer l'agent », et la phrase
 * `admin.agent.effect` est rendue À CÔTÉ de lui, jamais rangée dans
 * une bulle d'aide : un effet qu'il faut découvrir n'est pas annoncé. La loi 4
 * du chantier interdit un contrôle sans effet ; ceci en est la face inverse —
 * un contrôle dont l'effet DÉPASSE ce que son nom promet, et qu'on ne
 * rattrape pas après coup, puisqu'un message publié a été lu.
 *
 * ## CE QUI EST REPLIÉ EST DÉMONTÉ
 *
 * `CollapsibleSection` ne rend ses enfants que dépliés : une section fermée ne
 * garde donc aucune requête vivante. Les deux listes sont dépliées par défaut
 * — ce sont elles qu'on vient voir (dimension 7).
 *
 * ## CACHE-FIRST, ET UNE COUPURE SE DIT
 *
 * Aucun squelette sur un cache non vide : les données déjà connues restent
 * peintes pendant le rafraîchissement. `navigator.onLine === false` est le seul
 * signal FIABLE de coupure (`lib/net/online.ts`) ; il ne se substitue pas à un
 * échec de requête, il explique une absence que rien d'autre n'expliquerait.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';

const CARTE = { backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' } as const;

const BOUTON_PLEIN = 'rounded-chip px-4 text-body font-semibold disabled:opacity-40';
const BOUTON_SOURD = {
  minHeight: 44,
  backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)',
  color: INK,
} as const;

const nombre = (valeur: number, langue: string): string => new Intl.NumberFormat(langue).format(valeur);

const secondes = (ms: number, langue: string): string =>
  `${new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(ms / 1000)} s`;

const moment = (iso: string | null, langue: string): string =>
  iso === null ? '—' : new Intl.DateTimeFormat(langue, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

/**
 * **LE GESTE DE RELANCE, ÉCRIT UNE FOIS** — la section Agent et l'écran de
 * lecture d'une conversation le posent tous les deux, et deux rédactions du
 * même avertissement divergeraient au premier lot qui n'en relit qu'une. Un
 * avertissement qui diverge est un avertissement dont on ne sait plus ce qu'il
 * couvre.
 *
 * ## FEEDBACK IMMÉDIAT, PUIS LA VÉRITÉ
 *
 * L'annonce part AVANT la réponse (dimension 4 : chaque action a un retour
 * instantané) ; un refus la REMPLACE par son échec. On n'annonce jamais un
 * succès qui n'a pas eu lieu — `triggered` est lu tel que le handler le dit,
 * et une relance refusée le dit.
 *
 * ## L'ÉTAT VIVANT EST RELU APRÈS LE GESTE
 *
 * Les clés de l'agent sont invalidées en bloc : la pastille « scan en cours »
 * et le nœud du graphe viennent du serveur, jamais d'un état local qui
 * prétendrait savoir ce que le service agent a fait de la demande.
 */
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
  readonly onAnnounce: (texte: string) => void;
}) {
  const queryClient = useQueryClient();
  const [envoi, setEnvoi] = useState<'repos' | 'relance' | 'arret'>('repos');

  const relire = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: [ADMIN_SOUVERAIN_PREFIXE, 'agent'] });
  };

  const relancer = async (): Promise<void> => {
    setEnvoi('relance');
    onAnnounce(translateAdmin(language, 'admin.agent.done'));
    const resultat = await relancerAgent({ ...deps, conversationId });
    if (!resultat.ok || !resultat.data.triggered) {
      onAnnounce(translateAdmin(language, 'admin.agent.failed'));
    }
    setEnvoi('repos');
    await relire();
  };

  const stopper = async (): Promise<void> => {
    setEnvoi('arret');
    const resultat = await stopperScanAgent({ ...deps, conversationId });
    onAnnounce(
      !resultat.ok
        ? translateAdmin(language, 'admin.agent.failed')
        : resultat.data.agentUnavailable
          ? // Le marqueur est effacé, mais le service n'a pas été joint : le
            // dire, plutôt que d'annoncer un arrêt franc qui n'a pas eu lieu
            // en aval.
            translateAdmin(language, 'admin.agent.down')
          : translateAdmin(language, 'admin.agent.halted'),
    );
    setEnvoi('repos');
    await relire();
  };

  return (
    <div className="grid gap-2 pt-2">
      {isScanning ? (
        <p className="text-caption" style={{ color: BRAND }} data-agent-scanning={conversationId}>
          {translateAdmin(language, 'admin.agent.scan', { node: currentNode ?? '…' })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-agent-relaunch={conversationId}
          disabled={envoi !== 'repos'}
          onClick={() => {
            void relancer();
          }}
          className={`${BOUTON_PLEIN} text-white`}
          style={{ minHeight: 44, backgroundColor: BRAND }}
        >
          {translateAdmin(language, 'admin.agent.relaunch')}
        </button>

        {/* Un contrôle SANS OBJET ne se peint pas : hors scan, l'arrêt n'aurait
            rien à arrêter, et un bouton grisé en permanence est un contrôle
            qu'on apprend à ignorer. */}
        {isScanning ? (
          <button
            type="button"
            data-agent-stop={conversationId}
            disabled={envoi !== 'repos'}
            onClick={() => {
              void stopper();
            }}
            className={BOUTON_PLEIN}
            style={BOUTON_SOURD}
          >
            {translateAdmin(language, 'admin.agent.stop')}
          </button>
        ) : null}
      </div>

      {/* L'EFFET RÉEL, SERVI À CÔTÉ DU BOUTON — jamais dans une bulle d'aide :
          un effet qu'il faut découvrir n'est pas annoncé. */}
      <p className="text-caption" style={{ color: INK2 }} data-agent-relaunch-effect={conversationId}>
        {translateAdmin(language, 'admin.agent.effect')}
      </p>
    </div>
  );
}

/**
 * **LA RELANCE POSÉE SUR UNE CONVERSATION D'ADMINISTRATION** (#6733) — l'écran
 * de lecture souveraine (#6862) la porte aussi, avec le MÊME libellé honnête.
 *
 * Elle lit l'état VIVANT (`GET /configs/:id/live`) plutôt que de supposer :
 * cet écran-là n'a pas de liste d'où tenir `isScanning`, et un bouton d'arrêt
 * peint au hasard serait un contrôle qui ment dans les deux sens.
 *
 * Une conversation SANS agent configuré n'a rien à relancer : la requête
 * échoue, et le bloc ne se peint pas du tout. C'est la bonne réponse — poser
 * le geste quand même ne rendrait que des 404.
 */
export function AgentConversationControl({
  conversationId,
  language,
  deps,
}: {
  readonly conversationId: string;
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
}) {
  const [annonce, setAnnonce] = useState('');

  const live = useQuery({
    queryKey: agentLiveQueryKey(conversationId),
    queryFn: async ({ signal }) => {
      const resultat = await loadAgentLive({ ...deps, conversationId, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
    gcTime: 0,
  });

  if (live.data === undefined) return null;

  return (
    <section className="grid gap-1 rounded-card p-4" style={CARTE} data-agent-conversation-control={conversationId}>
      <h2 className="text-body font-semibold" style={{ color: INK }}>
        {translateAdmin(language, 'admin.agent.title')}
      </h2>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.agent.users')} {nombre(live.data.controlledUsersCount, language)}
      </p>
      <AgentRelaunchControl
        conversationId={conversationId}
        language={language}
        deps={deps}
        isScanning={live.data.isScanning}
        currentNode={live.data.currentNode}
        onAnnounce={setAnnonce}
      />
      <AdminAnnouncement text={annonce} />
    </section>
  );
}

function AgentTrackedRow({
  conversation,
  language,
  deps,
  onAnnounce,
}: {
  readonly conversation: AgentTrackedConversation;
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
  readonly onAnnounce: (texte: string) => void;
}) {
  return (
    <li className="grid gap-1 px-4 py-3" data-agent-tracked={conversation.conversationId}>
      <p className="truncate text-body" style={{ color: INK }}>
        {/* Un DIRECT n'a pas de titre propre (D-75) : il porte le nom de
            l'autre, que cette route ne sert pas. On montre son identifiant
            plutôt qu'une ligne vide. */}
        {conversation.title ?? conversation.conversationId}
      </p>
      <p className="truncate text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, conversation.enabled ? 'admin.user.enabled' : 'admin.users.inactive')}
        {' · '}
        {translateAdmin(language, 'admin.agent.users')} {nombre(conversation.controlledUsersCount, language)}
        {' · '}
        {translateAdmin(language, 'admin.counters.messages')} {nombre(conversation.messagesSent, language)}
        {' · '}
        {moment(conversation.lastResponseAt, language)}
      </p>
      <AgentRelaunchControl
        conversationId={conversation.conversationId}
        language={language}
        deps={deps}
        isScanning={conversation.isScanning}
        currentNode={conversation.currentNode}
        onAnnounce={onAnnounce}
      />
    </li>
  );
}

/**
 * LE DÉTAIL D'UN SCAN — une modale, parce que le journal est une LISTE qu'on
 * parcourt : ouvrir un détail à sa propre adresse ferait perdre la place dans
 * la liste au retour, et le journal se lit ligne après ligne.
 *
 * Il sert ce que la ligne NE PORTE PAS (jetons consommés, membres joués) :
 * sinon le geste n'apprendrait rien, et ouvrir serait un contrôle sans effet.
 */
function AgentLogDetailSheet({
  logId,
  language,
  deps,
  onClose,
}: {
  readonly logId: string;
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
  readonly onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: agentScanLogQueryKey(logId),
    queryFn: async ({ signal }) => {
      const resultat = await loadAgentScanLog({ ...deps, logId, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
    gcTime: 0,
  });

  return (
    <Sheet title={translateAdmin(language, 'admin.agent.logs')} bodyAs="div" onClose={onClose}>
      <div className="grid gap-3 px-4 pb-6" data-agent-log-detail={logId}>
        {detail.isPending ? (
          <AdminSkeleton rows={3} />
        ) : detail.data === undefined ? (
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.convList.unavailable')}
          </p>
        ) : (
          <>
            <p className="text-body" style={{ color: INK }}>
              {detail.data.title ?? detail.data.conversationId}
            </p>
            {/* CE QUE LA LIGNE NE PORTE PAS, et rien d'autre : l'issue, le
                déclencheur, la durée et l'horodatage sont DÉJÀ sur la ligne du
                journal. Les redire ici ferait du détail une redite, et ouvrir
                une ligne n'apprendrait rien — un geste sans effet (loi 4). */}
            <div className="grid grid-cols-2 gap-3">
              <AdminCounter
                label={translateAdmin(language, 'admin.counters.messages')}
                value={nombre(detail.data.messagesSent, language)}
              />
              <AdminCounter
                label={translateAdmin(language, 'admin.agent.users')}
                value={nombre(detail.data.userIdsUsed.length, language)}
              />
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/**
 * LA LIGNE DU JOURNAL EST UN BOUTON — le clavier y arrive, pas seulement la
 * souris. Un `<li onClick>` aurait la même apparence et ne serait atteignable
 * par aucun autre chemin : c'est le défaut que la fiche d'un membre a payé au
 * lot C, sous sa forme la plus discrète (une liste qui ne relie rien).
 */
function AgentLogRow({
  log,
  language,
  onOpen,
}: {
  readonly log: AgentScanLogRow;
  readonly language: InterfaceLanguage;
  readonly onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-agent-log-open={log.id}
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
        style={{ minHeight: 44 }}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body" style={{ color: INK }}>
            {log.title ?? log.conversationId}
          </span>
          <span className="block truncate text-caption" style={{ color: INK2 }}>
            {log.outcome} · {log.trigger} · {secondes(log.durationMs, language)} · {moment(log.startedAt, language)}
          </span>
        </span>
      </button>
    </li>
  );
}

function Pagination({
  language,
  page,
  hasMore,
  onPage,
}: {
  readonly language: InterfaceLanguage;
  readonly page: number;
  readonly hasMore: boolean;
  readonly onPage: (valeur: number) => void;
}) {
  return (
    <div className="flex justify-between gap-2 pt-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(Math.max(1, page - 1))}
        className={BOUTON_PLEIN}
        style={BOUTON_SOURD}
      >
        {translateAdmin(language, 'admin.users.previous')}
      </button>
      <button type="button" disabled={!hasMore} onClick={() => onPage(page + 1)} className={BOUTON_PLEIN} style={BOUTON_SOURD}>
        {translateAdmin(language, 'admin.users.next')}
      </button>
    </div>
  );
}

/**
 * LE PANNEAU — séparé de l'écran routé pour qu'un témoin puisse le monter avec
 * son propre transport, sans routeur ni session. C'est le motif de
 * `AdminUserConversationsSection` (#6819), et la raison est la même : un écran
 * qui lit `apiDeps` au niveau du module n'est mesurable que par un gate au
 * navigateur.
 */
export function AdminAgentPanel({
  language,
  deps,
}: {
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
}) {
  const online = useOnline();
  const [annonce, setAnnonce] = useState('');
  const [pageSuivies, setPageSuivies] = useState(1);
  const [pageJournal, setPageJournal] = useState(1);
  const [logOuvert, setLogOuvert] = useState<string | null>(null);

  const apercu = useQuery({
    queryKey: agentOverviewQueryKey(),
    queryFn: async ({ signal }) => {
      const resultat = await loadAgentOverview({ ...deps, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
    gcTime: 0,
  });

  const suivies = useQuery({
    queryKey: agentTrackedQueryKey(pageSuivies, ''),
    queryFn: async ({ signal }) => {
      const resultat = await loadAgentTracked({ ...deps, page: pageSuivies, search: '', signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
    gcTime: 0,
  });

  const journal = useQuery({
    queryKey: agentScanLogsQueryKey(pageJournal, ''),
    queryFn: async ({ signal }) => {
      const resultat = await loadAgentScanLogs({ ...deps, page: pageJournal, conversationId: '', signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
    gcTime: 0,
  });

  /** Une absence s'EXPLIQUE : hors ligne, c'est la coupure qu'on nomme ; en
   * ligne, c'est la passerelle qui n'a pas répondu. Les confondre ferait
   * chercher une panne là où il n'y a qu'un tunnel. */
  const absence = (): string =>
    translateAdmin(language, online ? 'admin.convList.unavailable' : 'admin.agent.offline');

  return (
    <div className="grid gap-6" data-admin-agent-panel>
      <section aria-labelledby="admin-agent-overview" className="grid gap-3">
        <h2 id="admin-agent-overview" className="text-body font-semibold" style={{ color: INK }}>
          {translateAdmin(language, 'admin.counters.title')}
        </h2>
        {apercu.isPending ? (
          <AdminSkeleton rows={2} />
        ) : apercu.data === undefined ? (
          <p className="text-caption" style={{ color: INK2 }} data-agent-overview-absent>
            {absence()}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* « actives / total » en UNE tuile : `activeConfigs` était décodé
                et rendu nulle part, ce qui est du poids déguisé en feature. Le
                rapport dit davantage que l'un ou l'autre des deux nombres pris
                seul, et ne coûte aucune clé de catalogue de plus. */}
            <AdminCounter
              label={translateAdmin(language, 'admin.agent.tracked')}
              value={`${nombre(apercu.data.activeConfigs, language)} / ${nombre(apercu.data.totalConfigs, language)}`}
            />
            <AdminCounter
              label={translateAdmin(language, 'admin.agent.users')}
              value={nombre(apercu.data.totalControlledUsers, language)}
            />
            <AdminCounter
              label={translateAdmin(language, 'admin.counters.messages')}
              value={nombre(apercu.data.totalMessagesSent, language)}
            />
          </div>
        )}
      </section>

      <CollapsibleSection id="admin-agent-tracked" title={translateAdmin(language, 'admin.agent.tracked')} card={false}>
        {suivies.isPending ? (
          <AdminSkeleton rows={3} />
        ) : suivies.data === undefined ? (
          <p className="text-caption" style={{ color: INK2 }} data-agent-tracked-absent>
            {absence()}
          </p>
        ) : suivies.data.conversations.length === 0 ? (
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agent.empty')}
          </p>
        ) : (
          <>
            <ul className="grid divide-y overflow-hidden rounded-card" style={{ ...CARTE, borderColor: 'var(--color-edge)' }}>
              {suivies.data.conversations.map((conversation) => (
                <AgentTrackedRow
                  key={conversation.conversationId}
                  conversation={conversation}
                  language={language}
                  deps={deps}
                  onAnnounce={setAnnonce}
                />
              ))}
            </ul>
            {suivies.data.total > ADMIN_AGENT_PAGE_SIZE ? (
              <Pagination language={language} page={pageSuivies} hasMore={suivies.data.hasMore} onPage={setPageSuivies} />
            ) : null}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="admin-agent-logs" title={translateAdmin(language, 'admin.agent.logs')} card={false}>
        {journal.isPending ? (
          <AdminSkeleton rows={3} />
        ) : journal.data === undefined ? (
          <p className="text-caption" style={{ color: INK2 }} data-agent-logs-absent>
            {absence()}
          </p>
        ) : journal.data.logs.length === 0 ? (
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agent.empty')}
          </p>
        ) : (
          <>
            <ul className="grid divide-y overflow-hidden rounded-card" style={{ ...CARTE, borderColor: 'var(--color-edge)' }}>
              {journal.data.logs.map((log) => (
                <AgentLogRow key={log.id} log={log} language={language} onOpen={() => setLogOuvert(log.id)} />
              ))}
            </ul>
            {journal.data.total > ADMIN_AGENT_PAGE_SIZE ? (
              <Pagination language={language} page={pageJournal} hasMore={journal.data.hasMore} onPage={setPageJournal} />
            ) : null}
          </>
        )}
      </CollapsibleSection>

      {logOuvert === null ? null : (
        <AgentLogDetailSheet logId={logOuvert} language={language} deps={deps} onClose={() => setLogOuvert(null)} />
      )}

      <AdminAnnouncement text={annonce} />
    </div>
  );
}
