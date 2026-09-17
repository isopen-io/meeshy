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
  guestRefusalOf,
  joinLinkAsGuest,
  joinLinkAsMember,
  linkRefusalOf,
  loadLinkInvitation,
  validateGuestDraft,
  type GuestDraft,
  type GuestField,
  type GuestJoinBody,
  type InvitationKind,
  type LinkGuestJoined,
  type LinkInvitation,
  type LinkJoined,
  type LinkRefusal,
} from '@/lib/api/link-join';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore, type GuestIdentity } from '@/lib/api/session';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { initialsOf } from '@/lib/view/conversation';
import { defaultGuestLanguage, GuestForm } from '@/routes/chat-join-guest';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * `/chat/:link` — LA JONCTION PAR LIEN (#5561, bascule #6702).
 *
 * L'adresse PUBLIQUE d'une conversation : la seule qui sert quelqu'un sans
 * compte, et donc la seule où une invitation se lit. Son pendant privé,
 * `/c/:conversation`, fait l'inverse — sans compte, rien n'y est révélé.
 *
 * CE QUE L'ÉCRAN MONTRE AVANT LE CHOIX : qui invite, le titre, le type, ce que
 * le nouveau membre pourra lire et faire. RIEN d'autre — ni message, ni membre,
 * ni compteur (`link-join.ts § projection`). La lecture passe par
 * `GET /anonymous/link/:identifier`, jamais par `GET /links/:identifier` qui
 * SERT jusqu'à cinquante messages à un visiteur sans session dès que le lien
 * autorise l'historique.
 *
 * TROIS PUBLICS, UNE ADRESSE :
 *  - un compte CONNECTÉ rejoint en un geste, puis arrive dans le fil ;
 *  - un visiteur SANS session, sur un lien qui l'accepte, entre EN INVITÉ :
 *    pseudo et langue, « Continuer en anonyme », et la conversation s'ouvre ;
 *  - sur un lien qui exige un compte, il ne voit que les deux sorties — se
 *    connecter ou créer un compte — qui le RAMÈNENT ici par `next`.
 *
 * **LES DEUX FAMILLES DE REFUS NE SE CONFONDENT PAS** (`link-join.ts §
 * GuestJoinRefusal`) : un refus de SAISIE garde le formulaire et se pose sur son
 * champ ; un refus du LIEN le retire et pose un bandeau, les deux sorties
 * conservées. Les confondre fait réessayer quelqu'un dont le lien est mort, ou
 * abandonner quelqu'un dont le pseudo était juste pris.
 *
 * **L'ACTION PRIMAIRE TIENT DANS LE PREMIER ÉCRAN, DANS TOUS SES ÉTATS.** C'est
 * pourquoi le détail des droits vit dans un `<details>` REPLIÉ, pourquoi pseudo
 * et langue partagent une rangée, et pourquoi e-mail et date de naissance ne
 * paraissent que si le lien les exige.
 *
 * LES EFFETS DE BORD SONT INJECTÉS (`ChatJoinDeps`) — même dispositif que
 * `MagicLinkValidation` (`validate`, `go`) : le témoin monte l'écran sans
 * routeur ni passerelle, et mesure ce que chaque geste déclenche.
 */

export type ChatJoinDeps = {
  readonly load: (link: string, signal: AbortSignal) => Promise<ApiResult<LinkInvitation>>;
  readonly join: (link: string, language: string | null) => Promise<ApiResult<LinkJoined>>;
  /** Rejoindre SANS compte — la même porte, un autre corps (#5561). */
  readonly joinGuest: (link: string, body: GuestJoinBody) => Promise<ApiResult<LinkGuestJoined>>;
  /** Ouvrir la session d'invité. Séparée de `go` : le fil doit trouver la
   * créance DÉJÀ posée quand il monte, sinon sa première requête part nue. */
  readonly adoptGuest: (sessionToken: string, guest: GuestIdentity) => void;
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
  joinGuest: (link, body) => joinLinkAsGuest(apiDeps, { link, body }),
  adoptGuest: (sessionToken, guest) => sessionStore.getState().establishGuest({ sessionToken, guest }),
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

/** Un refus de SAISIE — le formulaire est gardé. `field: null` ⇒ le message se
 * pose au-dessus du formulaire, jamais sous un champ deviné. */
type InputRefusal = { readonly field: GuestField | null; readonly message: string };

const LOADING: LoadState = { kind: 'loading' };
const IDLE: JoinState = { kind: 'idle' };
const EMPTY_DRAFT: GuestDraft = { nickname: '', email: '', birthday: '', language: '' };

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

/** Ce qui MANQUE — dit avant que rien ne parte (`validateGuestDraft`). */
const MISSING_FIELD: Readonly<Record<GuestField, string>> = {
  nickname: 'Choisissez un pseudo pour cette conversation.',
  email: 'Ce lien demande une adresse e-mail valide.',
  birthday: 'Ce lien demande votre date de naissance.',
  language: 'Choisissez une langue parmi celles que ce lien accepte.',
};

/** Ce que la PASSERELLE a refusé — distinct de ce qui manquait. */
const REFUSED_FIELD: Readonly<Record<GuestField, string>> = {
  nickname: 'Ce pseudo est déjà pris dans cette conversation.',
  email: 'Cette adresse e-mail a été refusée.',
  birthday: 'Cette date de naissance a été refusée.',
  language: 'Cette invitation n’accepte pas cette langue.',
};

const REFUSED_WITHOUT_FIELD = 'Une information demandée manque ou a été refusée.';

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
  const [draft, setDraft] = useState<GuestDraft>(EMPTY_DRAFT);
  const [focused, setFocused] = useState<GuestField | null>(null);
  const [input, setInput] = useState<InputRefusal | null>(null);

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

  /**
   * LA LANGUE PRÉ-CHOISIE ARRIVE AVEC L'INVITATION — un `<select>` qui
   * s'ouvrirait sur une langue que le lien refuse ferait échouer le premier
   * envoi sans que rien ne l'ait annoncé. Semée UNE fois : une frappe de
   * l'utilisateur n'est jamais recouverte par une revalidation.
   */
  useEffect(() => {
    if (load.kind !== 'ready') return;
    const invitation = load.invitation;
    setDraft((current) =>
      current.language === ''
        ? { ...current, language: defaultGuestLanguage(invitation.guest, currentInterfaceLanguage()) }
        : current,
    );
  }, [load]);

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

  async function handleGuestJoin() {
    if (load.kind !== 'ready' || join.kind === 'joining' || join.kind === 'joined' || !online) return;

    const validated = validateGuestDraft(draft, load.invitation.guest);
    if (!validated.ok) {
      setInput({ field: validated.field, message: MISSING_FIELD[validated.field] });
      return;
    }

    setInput(null);
    setJoin({ kind: 'joining' });
    const result = await deps.joinGuest(link, validated.body);

    if (!result.ok) {
      const refusal = guestRefusalOf(result);
      if (refusal.on === 'link') {
        setJoin({ kind: 'refused', refusal: refusal.refusal });
        return;
      }
      /* REFUS DE SAISIE — le formulaire reste, et un pseudo libre proposé par
         la passerelle est PRÉ-REMPLI : constater le problème et offrir le
         remède ont coûté le même aller-retour. */
      if (refusal.suggestion !== null) setDraft((current) => ({ ...current, nickname: refusal.suggestion ?? '' }));
      setInput({
        field: refusal.field,
        message:
          refusal.field === null
            ? REFUSED_WITHOUT_FIELD
            : refusal.suggestion !== null
              ? `Ce pseudo est déjà pris — « ${refusal.suggestion} » est libre.`
              : REFUSED_FIELD[refusal.field],
      });
      setJoin(IDLE);
      return;
    }

    setJoin({ kind: 'joined' });
    deps.adoptGuest(result.data.sessionToken, {
      participantId: result.data.participantId,
      nickname: validated.body.nickname ?? '',
      conversationId: result.data.conversationId,
      link,
      mayWrite: result.data.mayWrite,
    });
    deps.go(href('thread', { conversation: result.data.conversationId }), true);
    deps.joined();
  }

  function retryLoad() {
    setLoad(LOADING);
    setAttempt((count) => count + 1);
  }

  function editDraft(field: GuestField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (input?.field === field) setInput(null);
  }

  const joinRefusedForGood = join.kind === 'refused' && !PASSING_REFUSALS.has(join.refusal);
  const canOfferJoin = isAccount && join.kind !== 'joined' && !joinRefusedForGood;
  const offersGuest =
    load.kind === 'ready' && !isAccount && load.invitation.guest.allowed && join.kind !== 'joined' && !joinRefusedForGood;

  return (
    <AuthColumn className="items-center justify-center gap-5 px-6 py-8">
      {load.kind === 'loading' ? <InvitationPending /> : null}

      {load.kind === 'refused' ? (
        <RefusalBanner refusal={load.refusal} {...(PASSING_REFUSALS.has(load.refusal) && online ? { onRetry: retryLoad } : {})} />
      ) : null}

      {load.kind === 'ready' ? (
        <>
          <InvitationCard invitation={load.invitation} />
          <RightsDetails invitation={load.invitation} />

          {join.kind === 'refused' ? <RefusalBanner refusal={join.refusal} /> : null}

          {join.kind === 'joined' ? (
            <p role="status" className="text-center text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              Vous avez rejoint la conversation. Ouverture du fil…
            </p>
          ) : null}

          {canOfferJoin ? <JoinAction joining={join.kind === 'joining'} online={online} onJoin={() => void handleJoin()} /> : null}

          {offersGuest ? (
            <GuestForm
              terms={load.invitation.guest}
              draft={draft}
              busy={join.kind === 'joining'}
              online={online}
              refusedField={input?.field ?? null}
              refusalMessage={input?.message ?? null}
              focused={focused}
              onEdit={editDraft}
              onFocus={setFocused}
              onSubmit={() => void handleGuestJoin()}
            />
          ) : null}

          {isAccount ? null : (
            <GuestExits next={href('chatJoin', { link })} withSeparator={offersGuest} accountRequired={!load.invitation.guest.allowed} />
          )}
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
    <section aria-labelledby="chat-join-title" className="grid w-full justify-items-center gap-2 text-center">
      {inviter === null ? (
        <span
          aria-hidden="true"
          className="grid place-items-center rounded-full"
          style={{ width: 64, height: 64, backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink-2)' }}
        >
          <Glyph name="users" size={32} />
        </span>
      ) : (
        <Avatar
          initials={initialsOf(inviter.name)}
          color={colorForName(inviter.name)}
          size={64}
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
    </section>
  );
}

/**
 * LE DÉTAIL DES DROITS, REPLIÉ (#5561). Il répond à « qu'est-ce que
 * j'accepte ? » sans coûter la hauteur qui pousserait l'action primaire hors
 * du premier écran. `<details>` natif : ouvrable au clavier, annoncé par les
 * lecteurs d'écran, aucun script.
 */
function RightsDetails({ invitation }: { readonly invitation: LinkInvitation }) {
  const { guest, readsHistory } = invitation;
  return (
    <details data-join-rights className="w-full rounded-[14px] px-4 py-2" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <summary className="cursor-pointer text-caption font-semibold" style={{ color: 'var(--color-ios-ink)', minHeight: 44, lineHeight: '44px' }}>
        Ce que vous pourrez faire
      </summary>
      <ul className="grid gap-1.5 pb-3 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        <li>{readsHistory ? 'Lire les messages déjà échangés.' : 'Lire les messages publiés après votre arrivée.'}</li>
        <li>{guest.mayWrite ? 'Écrire dans la conversation.' : 'Lire seulement : l’écriture n’est pas ouverte aux invités.'}</li>
        <li>Repartir quand vous voulez — une participation n’est pas un compte.</li>
      </ul>
    </details>
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
 *
 * Quand le formulaire d'invité est offert, elles deviennent SECONDAIRES et un
 * séparateur le dit ; quand le lien EXIGE un compte, elles sont la seule voie
 * et la phrase l'explique — jamais une porte anonyme offerte puis refusée.
 */
function GuestExits({
  next,
  withSeparator,
  accountRequired,
}: {
  readonly next: string;
  readonly withSeparator: boolean;
  readonly accountRequired: boolean;
}) {
  return (
    <div className="grid w-full gap-3">
      {accountRequired ? (
        <p className="text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          Cette conversation demande un compte Meeshy.
        </p>
      ) : null}
      {withSeparator ? (
        <p className="text-center text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
          ou gardez votre identité
        </p>
      ) : null}
      <Link
        to="login"
        search={{ next }}
        className={`grid w-full place-items-center rounded-[14px] px-6 ${withSeparator ? 'font-semibold' : 'font-bold text-white'}`}
        style={
          withSeparator
            ? { minHeight: 44, border: SUBTLE_BORDER, color: 'var(--color-ios-ink)' }
            : { minHeight: 52, background: ACTION_BACKGROUND }
        }
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
