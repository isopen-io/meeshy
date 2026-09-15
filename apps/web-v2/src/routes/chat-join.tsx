import { useEffect, useState } from 'react';
import { useStore } from 'zustand/react';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { AuthColumn } from '@/components/auth-column';
import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import {
  joinLinkAsMember,
  linkRefusalOf,
  loadLinkInvitation,
  type InvitationKind,
  type LinkInvitation,
  type LinkJoined,
  type LinkRefusal,
} from '@/lib/api/link-join';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { initialsOf } from '@/lib/view/conversation';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * `/chat/:link` — LA JONCTION PAR LIEN (#5561, bascule #6702).
 *
 * L'adresse PUBLIQUE d'une conversation : la seule qui sert quelqu'un sans
 * compte, et donc la seule où une invitation se lit. Son pendant privé,
 * `/c/:conversation`, fait l'inverse — sans compte, rien n'y est révélé.
 *
 * CE QUE L'ÉCRAN MONTRE AVANT LE CHOIX : qui invite, le titre, le type, ce que
 * le nouveau membre pourra lire. RIEN d'autre — ni message, ni membre, ni
 * compteur (`link-join.ts § projection`).
 *
 * DEUX PUBLICS, UNE ADRESSE :
 *  - un compte CONNECTÉ rejoint en un geste, puis arrive dans le fil ;
 *  - un visiteur SANS session voit la même invitation et deux sorties — se
 *    connecter ou créer un compte — qui le RAMÈNENT ici par `next`, où il
 *    rejoint alors en un geste. La participation ANONYME (session invitée)
 *    reste l'objet de #5561 après la bascule : aucun bouton ne la promet.
 *
 * LES EFFETS DE BORD SONT INJECTÉS (`ChatJoinDeps`) — même dispositif que
 * `MagicLinkValidation` (`validate`, `go`) : le témoin monte l'écran sans
 * routeur ni passerelle, et mesure ce que chaque geste déclenche.
 */

export type ChatJoinDeps = {
  readonly load: (link: string, signal: AbortSignal) => Promise<ApiResult<LinkInvitation>>;
  readonly join: (link: string, language: string | null) => Promise<ApiResult<LinkJoined>>;
  readonly go: (url: string, replace: boolean) => void;
  /** Ce qui suit une jonction réussie : la liste doit compter la conversation
   * rejointe, que le cache persisté ignore encore. */
  readonly joined: () => void;
  /** Fermer une session que la passerelle n'a pas reconnue — le MÊME geste que
   * `onUnauthorized` (`api/client.ts`), qu'un 401 aurait déclenché si la porte
   * de jonction en rendait un. */
  readonly expireSession: () => void;
};

const DEFAULT_DEPS: ChatJoinDeps = {
  load: (link, signal) => loadLinkInvitation({ ...apiDeps, link, signal }),
  join: (link, language) => joinLinkAsMember(apiDeps, { link, language }),
  go: navigate,
  joined: () => {
    void appQueryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  },
  expireSession: () => sessionStore.getState().clearSession(),
};

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly invitation: LinkInvitation }
  | { readonly kind: 'refused'; readonly refusal: LinkRefusal };

type JoinState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'joining' }
  | { readonly kind: 'joined' }
  | { readonly kind: 'refused'; readonly refusal: LinkRefusal };

const LOADING: LoadState = { kind: 'loading' };
const IDLE: JoinState = { kind: 'idle' };

/**
 * LES REFUS QU'UN REJEU À L'IDENTIQUE PEUT LEVER — sans que l'utilisateur agisse
 * ailleurs. Eux seuls gardent « Réessayer » (et « Rejoindre ») : proposer de
 * rejouer un lien expiré ou un bannissement serait un contrôle sans effet.
 */
const PASSING_REFUSALS: ReadonlySet<LinkRefusal> = new Set<LinkRefusal>(['rate-limited', 'offline', 'unavailable']);

/** Chaque cause, dite. Un `Record` exhaustif : un refus ajouté au port sans
 * phrase ici ne compile pas. */
const REFUSAL_CAUSE: Readonly<Record<LinkRefusal, string>> = {
  'not-found': 'Cette invitation est introuvable. Le lien est peut-être incomplet.',
  revoked: 'Ce lien a été désactivé par la personne qui l’a partagé.',
  expired: 'Ce lien a expiré ou n’est plus actif.',
  closed: 'Cette conversation est terminée : elle ne peut plus être rejointe.',
  full: 'Ce lien a atteint sa limite de participants.',
  language: 'Cette invitation n’accepte pas votre langue.',
  banned: 'Vous ne pouvez plus rejoindre cette conversation.',
  region: 'Cette invitation n’est pas accessible depuis votre réseau.',
  'account-required': 'Un compte Meeshy est nécessaire pour rejoindre cette conversation.',
  'session-expired': 'Votre session a expiré. Reconnectez-vous pour rejoindre.',
  'rate-limited': 'Trop de tentatives. Réessayez dans un instant.',
  offline: 'Vous êtes hors ligne. L’invitation s’affichera au retour du réseau.',
  unavailable: 'L’invitation est indisponible pour le moment.',
};

const KIND_LABEL: Readonly<Record<InvitationKind, string>> = {
  direct: 'Conversation privée',
  group: 'Conversation de groupe',
  public: 'Conversation publique',
  global: 'Conversation ouverte à tous',
  broadcast: 'Canal de diffusion',
};

/** Le dégradé d'action des pages d'accès — celui du lien par e-mail
 * (`MagicLinkView.swift:156-162`), pas celui de la connexion : rejoindre n'est
 * pas s'authentifier. */
const ACTION_BACKGROUND = 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))';
const SUBTLE_BORDER = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)';

export default function ChatJoinScreen() {
  const { link } = useParams<'/chat/$link'>();
  return <ChatJoin link={link} />;
}

export function ChatJoin({ link, deps = DEFAULT_DEPS }: { readonly link: string; readonly deps?: ChatJoinDeps }) {
  const session = useStore(sessionStore, (s) => s.session);
  const online = useOnline();
  const [load, setLoad] = useState<LoadState>(LOADING);
  const [join, setJoin] = useState<JoinState>(IDLE);
  const [attempt, setAttempt] = useState(0);

  /**
   * LA LECTURE — relancée au retour du réseau.
   *
   * `navigator.onLine === false` est FIABLE (`net/online.ts`) : aucune requête
   * ne part, le bandeau hors ligne s'affiche, et le retour de `online` relance
   * la lecture sans geste. Une invitation déjà lue n'est jamais remplacée par
   * un refus PASSAGER : couper le réseau ne doit pas effacer ce qu'on a vu.
   */
  useEffect(() => {
    if (!online) {
      setLoad((current) => (current.kind === 'ready' ? current : { kind: 'refused', refusal: 'offline' }));
      return undefined;
    }
    const controller = new AbortController();
    void deps.load(link, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setLoad({ kind: 'ready', invitation: result.data });
        return;
      }
      const refusal = linkRefusalOf(result);
      setLoad((current) => (current.kind === 'ready' && PASSING_REFUSALS.has(refusal) ? current : { kind: 'refused', refusal }));
    });
    return () => controller.abort();
  }, [deps, link, online, attempt]);

  const isAccount = session.status === 'authenticated';
  const language = session.status === 'authenticated' ? (session.user.systemLanguage ?? null) : null;

  async function handleJoin() {
    if (join.kind === 'joining' || join.kind === 'joined' || !online) return;
    setJoin({ kind: 'joining' });
    const result = await deps.join(link, language);
    if (!result.ok) {
      const refusal = linkRefusalOf(result);
      if (refusal === 'session-expired') deps.expireSession();
      setJoin({ kind: 'refused', refusal });
      return;
    }
    setJoin({ kind: 'joined' });
    /* `replace` : « retour » depuis le fil ne doit pas rendre l'invitation à
       quelqu'un qui est désormais membre. L'invalidation SUIT la navigation —
       la liste se recharge quand on y revient, jamais avant que le fil ne
       s'ouvre. */
    deps.go(href('thread', { conversation: result.data.conversationId }), true);
    deps.joined();
  }

  function retryLoad() {
    setLoad(LOADING);
    setAttempt((count) => count + 1);
  }

  const joinRefusedForGood = join.kind === 'refused' && !PASSING_REFUSALS.has(join.refusal);
  const canOfferJoin = isAccount && join.kind !== 'joined' && !joinRefusedForGood;

  return (
    <AuthColumn className="items-center justify-center gap-6 px-6 py-10">
      {load.kind === 'loading' ? <InvitationPending /> : null}

      {load.kind === 'refused' ? (
        <RefusalBanner refusal={load.refusal} {...(PASSING_REFUSALS.has(load.refusal) && online ? { onRetry: retryLoad } : {})} />
      ) : null}

      {load.kind === 'ready' ? (
        <>
          <InvitationCard invitation={load.invitation} />

          {join.kind === 'refused' ? <RefusalBanner refusal={join.refusal} /> : null}

          {join.kind === 'joined' ? (
            <p role="status" className="text-center text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              Vous avez rejoint la conversation. Ouverture du fil…
            </p>
          ) : null}

          {canOfferJoin ? <JoinAction joining={join.kind === 'joining'} online={online} onJoin={() => void handleJoin()} /> : null}

          {isAccount ? null : <GuestExits next={href('chatJoin', { link })} />}
        </>
      ) : null}
    </AuthColumn>
  );
}

function InvitationPending() {
  return (
    <div aria-busy="true" className="grid w-full justify-items-center gap-3 text-center">
      <span aria-hidden="true" className="rounded-full" style={{ width: 72, height: 72, backgroundColor: 'var(--color-ios-card)' }} />
      <p className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
        Ouverture de l’invitation…
      </p>
    </div>
  );
}

function InvitationCard({ invitation }: { readonly invitation: LinkInvitation }) {
  const { inviter } = invitation;
  return (
    <section aria-labelledby="chat-join-title" className="grid w-full justify-items-center gap-3 text-center">
      {inviter === null ? (
        <span
          aria-hidden="true"
          className="grid place-items-center rounded-full"
          style={{ width: 72, height: 72, backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink-2)' }}
        >
          <Glyph name="users" size={36} />
        </span>
      ) : (
        <Avatar
          initials={initialsOf(inviter.name)}
          color={colorForName(inviter.name)}
          size={72}
          name={inviter.name}
          {...(inviter.avatar === null ? {} : { src: inviter.avatar })}
        />
      )}
      <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
        {inviter === null ? 'Vous êtes invité à rejoindre' : `${inviter.name} vous invite à rejoindre`}
      </p>
      <h1 id="chat-join-title" className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {invitation.title ?? 'Une conversation Meeshy'}
      </h1>
      {invitation.kind === null ? null : (
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {KIND_LABEL[invitation.kind]}
        </p>
      )}
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {invitation.readsHistory ? 'Vous pourrez lire les messages déjà échangés.' : 'Vous lirez les messages publiés après votre arrivée.'}
      </p>
    </section>
  );
}

function JoinAction({ joining, online, onJoin }: { readonly joining: boolean; readonly online: boolean; readonly onJoin: () => void }) {
  const disabled = joining || !online;
  return (
    <div className="grid w-full gap-2">
      <button
        type="button"
        onClick={onJoin}
        disabled={disabled}
        aria-busy={joining}
        className="grid w-full place-items-center rounded-[14px] font-bold text-white transition-opacity"
        style={{ minHeight: 52, background: ACTION_BACKGROUND, opacity: disabled ? 0.6 : 1 }}
      >
        {joining ? 'Entrée dans la conversation…' : 'Rejoindre'}
      </button>
      {online ? null : (
        <p className="text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          Hors ligne — rejoindre attendra le retour du réseau.
        </p>
      )}
    </div>
  );
}

/**
 * LES DEUX SORTIES D'UN VISITEUR SANS SESSION — des ANCRES, jamais des boutons
 * qui naviguent : un vrai `href`, ouvrable dans un autre onglet. `next` est
 * l'adresse de CETTE invitation ; `/login` et `/signup` la clampent
 * (`session-guard.ts § safeNextPath`) avant de s'en servir.
 */
function GuestExits({ next }: { readonly next: string }) {
  return (
    <div className="grid w-full gap-3">
      <Link
        to="login"
        search={{ next }}
        className="grid w-full place-items-center rounded-[14px] px-6 font-bold text-white"
        style={{ minHeight: 52, background: ACTION_BACKGROUND }}
      >
        Se connecter pour rejoindre
      </Link>
      <Link
        to="signup"
        search={{ next }}
        className="grid w-full place-items-center rounded-[14px] px-6 font-semibold"
        style={{ minHeight: 44, border: SUBTLE_BORDER, color: 'var(--color-ios-ink)' }}
      >
        Créer un compte
      </Link>
    </div>
  );
}

function RefusalBanner({ refusal, onRetry }: { readonly refusal: LinkRefusal; readonly onRetry?: () => void }) {
  return (
    <div role="alert" className="grid w-full gap-3 rounded-[14px] p-4 text-center" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {REFUSAL_CAUSE[refusal]}
      </p>
      <div className="grid gap-2">
        {onRetry === undefined ? null : (
          <button
            type="button"
            onClick={onRetry}
            className="grid w-full place-items-center rounded-[14px] px-6 font-semibold"
            style={{ minHeight: 44, border: SUBTLE_BORDER, color: 'var(--color-ios-ink)' }}
          >
            Réessayer
          </button>
        )}
        <Link
          to="list"
          className="grid w-full place-items-center rounded-[14px] px-6 font-semibold"
          style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
        >
          Revenir à l’accueil
        </Link>
      </div>
    </div>
  );
}
