import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import type { ConversationCard } from '@meeshy/shared/types/conversation-card';

import { LiveAnnouncement } from '@/components/live-announcement';
import { endRevokedSession } from '@/lib/api/account-caches';
import { publicWebOrigin } from '@/lib/links/public-origin';
import { cardWithMembership, conversationCardQueryKey, conversationCardsFilter, leaveConversation, loadConversationCard } from '@/lib/api/conversation-card';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { guestAccessEndedOf, type GuestAccessEnd } from '@/lib/api/guest-access-end';
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
  type LinkGuestJoined,
  type LinkInvitation,
  type LinkJoined,
  type LinkRefusal,
} from '@/lib/api/link-join';
import { appQueryClient } from '@/lib/api/query-client';
import { heldAccountOf, sessionStore, type GuestIdentity } from '@/lib/api/session';
import { translateInvite, type InviteCatalogKey } from '@/lib/i18n-invite-catalog';
import { currentInterfaceLanguage, interfaceLanguageOf, setInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { ANONYMOUS_MODE, joinChoicesOf } from '@/lib/links/invitation-view';
import { copyLinkText, LINK_ANNOUNCE_MS, type CopyOutcome } from '@/lib/links/link-copy';
import { shareLinkUrl } from '@/lib/links/web-origin';
import { useOnline } from '@/lib/net/online';
import { useParams, useSearch } from '@/lib/router';
import { partagerLien, portailDuNavigateur, type ResultatInvitation } from '@/lib/view/invitation';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { defaultGuestLanguage, GuestForm, guestEntryOf, guestLanguageOptions, GuestSubmit, type GuestEntry } from '@/routes/chat-join-guest';
import { GuestAccessEndedNotice } from '@/routes/chat-join-ended';
import { takeLandingHandoff, type HandoffStorage } from '@/routes/chat-join-handoff';
import { focusGuestOf } from '@/lib/view/guest-focus';
import { MemberActions, MembershipPending, useLinkMembership, type MembershipDeps } from '@/routes/chat-join-member';
import {
  GroupCard,
  INK,
  INK_2,
  INVITE_ACTION_BACKGROUND,
  INVITE_ACTION_FLOOR,
  INVITE_OUTLINE_BUTTON,
  INVITE_OUTLINE_STYLE,
  InvitationFigures,
  InvitationPending,
  InviteHeader,
  InviterBlock,
  isolated,
  RefusalBanner,
  RightsCard,
} from '@/routes/chat-join-parts';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * `/chat/:link` — LA JONCTION PAR LIEN (#5561, bascule #6702).
 *
 * L'adresse PUBLIQUE d'une conversation : la seule qui sert quelqu'un sans
 * compte, et donc la seule où une invitation se lit. Son pendant privé,
 * `/c/:conversation`, fait l'inverse — sans compte, rien n'y est révélé.
 *
 * CE QUE L'ÉCRAN MONTRE AVANT LE CHOIX (#7796, maquette validée) : qui invite
 * et son message, le groupe (bannière, logo, nom, type, date, description, son
 * lien avec Copier et Repartager), le nombre de personnes et les langues
 * parlées, ce qu'on pourra faire en anonyme. RIEN qui identifie un membre — ni
 * visage, ni nom, ni message (`link-join.ts § projection`). La lecture passe
 * par `GET /anonymous/link/:identifier`, jamais par `GET /links/:identifier`
 * qui SERT jusqu'à cinquante messages à un visiteur sans session dès que le
 * lien autorise l'historique.
 *
 * TROIS PUBLICS, UNE ADRESSE :
 *  - un compte CONNECTÉ rejoint en un geste, puis arrive dans le fil — ou,
 *    sur un lien qui l'accepte, choisit « Continuer en anonyme »
 *    (`?mode=anonymous`, #8816) : l'identité anonyme est TENUE à côté du
 *    compte, qui n'est ni remplacé ni fermé ;
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
 * **L'ACTION PRIMAIRE TIENT DANS LE PREMIER ÉCRAN, DANS TOUS SES ÉTATS**
 * (#5561, `check-join-first-screen.mjs`). Sous 768 px la page est une colonne
 * que la maquette termine par les choix ; ils sont donc COLLÉS au bas de
 * l'écran (`sticky`) tant que la page défile au-dessus d'eux. Au-delà, deux
 * colonnes : le groupe à gauche, les chiffres, les droits et les choix à
 * droite, tous dans le premier écran d'un bureau.
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
   * créance DÉJÀ posée quand il monte, sinon sa première requête part nue.
   * Sous un compte, l'identité est TENUE à côté de lui (#8816) — jamais à sa
   * place. */
  readonly adoptGuest: (sessionToken: string, guest: GuestIdentity) => void;
  /** La langue choisie en rejoignant devient la langue d'INTERFACE d'un
   * invité sans compte (#9710) — un choix explicite, persisté comme celui des
   * Réglages, que l'invité peut changer ensuite. */
  readonly adoptInterfaceLanguage: (language: string) => void;
  readonly go: (url: string, replace: boolean) => void;
  /** Ce qui suit une jonction réussie : la liste doit compter la conversation
   * rejointe, que le cache persisté ignore encore. */
  readonly joined: () => void;
  /** Fermer une session que la passerelle n'a pas reconnue — le MÊME geste que
   * `onUnauthorized` (`api/client.ts`), qu'un 401 aurait déclenché si la porte
   * de jonction en rendait un. */
  readonly expireSession: () => void;
  /** Copier l'adresse du lien (#7796) — le presse-papiers du navigateur ou de la coque. */
  readonly copyText: (url: string) => Promise<CopyOutcome>;
  /** Repartager (#7796) — la feuille native (`navigator.share`, pont `MeeshyShare`
   * de la coque), sinon une copie, dite. */
  readonly shareUrl: (data: { readonly title: string; readonly text: string; readonly url: string }) => Promise<ResultatInvitation>;
  /** L'origine PUBLIQUE des adresses partagées (`web-origin.ts`) — jamais
   * l'origine virtuelle d'une coque. */
  readonly origin: () => string;
  readonly now: () => Date;
  /** L'onglet où la landing pose son jeton de passage (#10094) — `sessionStorage`,
   * dont l'accès peut LEVER (navigation privée) : la jonction le lit sous garde. */
  readonly handoff: () => HandoffStorage;
} & MembershipDeps;

const shareCardKey = (link: string) => conversationCardQueryKey({ kind: 'share-link', identifier: link });

const DEFAULT_DEPS: ChatJoinDeps = {
  load: (link, signal) => loadLinkInvitation({ ...apiDeps, link, signal }),
  /* Rejoindre sous son compte une conversation déjà rejointe en anonyme
     (#8816) : le fil s'ouvre sous le COMPTE, l'identité anonyme est oubliée. */
  join: async (link, language) => {
    const result = await joinLinkAsMember(apiDeps, { link, language });
    if (result.ok) sessionStore.getState().dropAnonymous(result.data.conversationId);
    return result;
  },
  joinGuest: (link, body) => joinLinkAsGuest(apiDeps, { link, body }),
  adoptGuest: (sessionToken, guest) => sessionStore.getState().adoptAnonymous({ sessionToken, guest }),
  adoptInterfaceLanguage: (code) => {
    const language = interfaceLanguageOf(code);
    /* Un catalogue qui ne se charge pas laisse l'interface telle qu'elle est :
       le fil s'ouvre quand même, dans la langue d'avant. */
    if (language !== null) setInterfaceLanguage(language).catch(() => undefined);
  },
  go: navigate,
  joined: () => {
    void appQueryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  },
  expireSession: () => endRevokedSession(sessionStore),
  copyText: (url) => copyLinkText(url, portailDuNavigateur()),
  shareUrl: (data) => partagerLien(data),
  origin: () => publicWebOrigin(window.location.origin),
  now: () => new Date(),
  handoff: () => window.sessionStorage,
  /* La carte du lien, celle des bulles (#10282) : même clé de cache, donc une
     carte déjà vue dans un fil peint les gestes d'un membre sans attendre. */
  cachedCard: (link) => appQueryClient.getQueryData<ConversationCard | null>(shareCardKey(link)),
  loadCard: async (link, signal) => {
    const result = await loadConversationCard({ ...apiDeps, target: { kind: 'share-link', identifier: link }, signal });
    if (result.ok) appQueryClient.setQueryData(shareCardKey(link), result.data);
    return result;
  },
  leave: (conversationId) => leaveConversation(apiDeps, conversationId),
  left: (link, conversationId) => {
    appQueryClient.setQueryData<ConversationCard | null>(shareCardKey(link), (card) =>
      card === undefined || card === null ? card : cardWithMembership(card, { isMember: false, conversationId: null }),
    );
    void appQueryClient.invalidateQueries(conversationCardsFilter(conversationId));
    void appQueryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  },
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

export default function ChatJoinScreen() {
  const { link } = useParams<'/chat/$link'>();
  const [search] = useSearch();
  return (
    <ChatJoin
      link={link}
      anonymousRequested={search.get('mode') === ANONYMOUS_MODE}
      entry={guestEntryOf(search)}
      ended={guestAccessEndedOf(search.get('ended'))}
    />
  );
}

const MISSING_KEY: Readonly<Record<GuestField, Extract<InviteCatalogKey, `invite.missing.${GuestField}`>>> = {
  nickname: 'invite.missing.nickname',
  email: 'invite.missing.email',
  birthday: 'invite.missing.birthday',
  language: 'invite.missing.language',
};

const REFUSED_KEY: Readonly<Record<GuestField, Extract<InviteCatalogKey, `invite.refused.${GuestField}`>>> = {
  nickname: 'invite.refused.nickname',
  email: 'invite.refused.email',
  birthday: 'invite.refused.birthday',
  language: 'invite.refused.language',
};

const COPIED_MS = 2000;

/** Le fond de la page — la lueur indigo de la maquette, sur la surface du schéma. */
const PAGE_BACKGROUND =
  'radial-gradient(60% 30% at 12% 0%, color-mix(in srgb, var(--ios-indigo-500) 14%, transparent), transparent), radial-gradient(50% 30% at 90% 90%, color-mix(in srgb, var(--ios-purple-500) 10%, transparent), transparent), var(--color-ios-surface)';

export function ChatJoin({
  link,
  anonymousRequested = false,
  entry = null,
  ended = null,
  deps = DEFAULT_DEPS,
}: {
  readonly link: string;
  /** `?mode=anonymous` (#8816) — un compte connecté a choisi « Anonyme ». */
  readonly anonymousRequested?: boolean;
  /** Le nom et la langue choisis sur la landing (#10003, `guestEntryOf`). */
  readonly entry?: GuestEntry | null;
  /** `?ended=` (#10442) — l'accès d'invité que ce lien ouvrait vient de finir. */
  readonly ended?: GuestAccessEnd | null;
  readonly deps?: ChatJoinDeps;
}) {
  const language = currentInterfaceLanguage();
  const session = useStore(sessionStore, (s) => s.session);
  const online = useOnline();
  const announcer = useLiveAnnouncer(LINK_ANNOUNCE_MS);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [load, setLoad] = useState<LoadState>(LOADING);
  const [join, setJoin] = useState<JoinState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<GuestDraft>(EMPTY_DRAFT);
  const [focused, setFocused] = useState<GuestField | null>(null);
  const [input, setInput] = useState<InputRefusal | null>(null);
  /* L'ENTRÉE de la landing est lue UNE fois, au montage : l'adresse qui la
     porte ne change pas, et une revalidation ne doit jamais la rejouer. Son
     JETON DE PASSAGE aussi (#10094) — lu et effacé au montage, une seule fois :
     sans lui, l'adresse ne fait que PRÉ-REMPLIR le formulaire. */
  const [arrival] = useState(entry);
  const [handedOff] = useState(() => arrival !== null && takeLandingHandoff({ storage: deps.handoff, link, entry: arrival, now: deps.now().getTime() }));
  const [entering, setEntering] = useState(arrival !== null);
  /* L'INVITÉ DÉJÀ ENTRÉ PAR CE LIEN (#10100) — un ancien lien rouvert ne lui
     repropose pas d'entrer : il rouvre son fil, en focus. Lu au montage : une
     jonction réussie ici navigue d'elle-même. */
  const [returning] = useState(() => {
    const held = focusGuestOf(sessionStore.getState().session);
    return held !== null && held.link === link ? held.conversationId : null;
  });
  useEffect(() => {
    if (returning !== null) deps.go(href('thread', { conversation: returning }), true);
  }, [deps, returning]);

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
        ? { ...current, language: defaultGuestLanguage(invitation.guest, language) }
        : current,
    );
  }, [load, language]);

  const isAccount = session.status === 'authenticated';
  /* L'ADHÉSION (#10282) — un membre ouvre ou quitte, il ne rejoint pas. */
  const member = useLinkMembership({ link, deps, active: isAccount && !anonymousRequested, online });
  const { membership } = member;

  /**
   * L'ENTRÉE DEPUIS LA LANDING (#10003, D-186) — le nom et la langue y sont
   * déjà choisis : l'invité est CRÉÉ sans autre geste, et l'invitation n'est
   * pas peinte entre-temps. Un lien qui exige plus (e-mail, date de naissance),
   * un nom refusé ou un refus du lien rendent la main au formulaire, PRÉ-REMPLI,
   * avec la cause dite — jamais une garde contournée.
   *
   * SANS JETON DE PASSAGE (#10094) — adresse forgée, ancien gabarit, autre
   * onglet, jeton périmé ou stockage refusé — rien ne part : le formulaire
   * s'ouvre PRÉ-REMPLI du nom et de la langue de l'adresse, et attend le geste.
   */
  useEffect(() => {
    if (!entering || arrival === null || load.kind === 'loading') return;
    const guestDoor = joinChoicesOf({ signedIn: isAccount, guestAllowed: load.kind === 'ready' && load.invitation.guest.allowed, anonymousRequested }).guest;
    if (load.kind !== 'ready' || !guestDoor || !online) {
      setDraft((current) => (current.nickname === '' ? { ...current, nickname: arrival.nickname } : current));
      setEntering(false);
      return;
    }
    const terms = load.invitation.guest;
    const chosen = arrival.language !== null && guestLanguageOptions(terms).includes(arrival.language) ? arrival.language : defaultGuestLanguage(terms, language);
    const seeded: GuestDraft = { ...EMPTY_DRAFT, nickname: arrival.nickname, language: chosen };
    setDraft(seeded);
    if (!handedOff) {
      setEntering(false);
      return;
    }
    void handleGuestJoin(seeded).finally(() => setEntering(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- l'entrée part une fois, quand l'invitation arrive
  }, [load]);

  const accountLanguage = session.status === 'authenticated' ? (session.user.systemLanguage ?? null) : null;

  async function handleJoin() {
    if (join.kind === 'joining' || join.kind === 'joined' || !online) return;
    setJoin({ kind: 'joining' });
    const result = await deps.join(link, accountLanguage);
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

  async function handleGuestJoin(submitted: GuestDraft = draft) {
    if (load.kind !== 'ready' || join.kind === 'joining' || join.kind === 'joined' || !online) return;

    const validated = validateGuestDraft(submitted, load.invitation.guest);
    if (!validated.ok) {
      setInput({ field: validated.field, message: translateInvite(language, MISSING_KEY[validated.field]) });
      /* Le bouton vit dans la barre collée, loin des champs : un formulaire
         incomplet MÈNE au champ fautif plutôt que de s'y refuser en silence. */
      const target = document.getElementById(`chat-join-${validated.field}`);
      target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      target?.focus({ preventScroll: true });
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
            ? translateInvite(language, 'invite.refused.none')
            : refusal.suggestion !== null
              ? translateInvite(language, 'invite.refused.taken', { suggestion: refusal.suggestion })
              : translateInvite(language, REFUSED_KEY[refusal.field]),
      });
      setJoin(IDLE);
      return;
    }

    setJoin({ kind: 'joined' });
    deps.adoptGuest(result.data.sessionToken, {
      participantId: result.data.participantId,
      nickname: result.data.nickname ?? validated.body.nickname ?? '',
      conversationId: result.data.conversationId,
      link,
      mayWrite: result.data.mayWrite,
      language: validated.body.language,
      ...(result.data.attachmentKinds === undefined ? {} : { attachmentKinds: result.data.attachmentKinds }),
    });
    /* LA LANGUE CHOISIE EST CELLE DE L'INVITÉ (#9710) : elle vient de passer au
       rang 1 de son Prisme avec son identité ; elle devient aussi la langue de
       son interface. Un COMPTE qui rejoint en anonyme garde la sienne (#8816). */
    const guestOnly = heldAccountOf(session) === null;
    if (guestOnly) deps.adoptInterfaceLanguage(validated.body.language);
    /* LA LANDING NE FAIT ENTRER QUE DANS WORLD WIDE, qui se lit sur `/world`
       (#10100) : une entrée portée par son jeton y mène, même par l'ancienne
       adresse de jonction qu'une page de la landing en cache vise encore. Pas
       un COMPTE entré sous son identité anonyme : `/world` le renverrait à la
       jonction, il ouvre le fil rejoint, dans son application. */
    deps.go(handedOff && guestOnly ? href('world') : href('thread', { conversation: result.data.conversationId }), true);
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

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const { announce } = announcer;
  const invitation = load.kind === 'ready' ? load.invitation : null;
  const url = shareLinkUrl(deps.origin(), encodeURIComponent(invitation?.linkId ?? link));
  const title = invitation?.title ?? translateInvite(language, 'invite.group.fallbackTitle');

  const copy = useCallback(() => {
    void deps.copyText(url).then((outcome) => {
      if (outcome !== 'copied') {
        announce(translateInvite(language, 'invite.announce.copyFailed'), 'error');
        return;
      }
      announce(translateInvite(language, 'invite.announce.copied'));
      setCopied(true);
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  }, [announce, deps, language, url]);

  const reshare = useCallback(() => {
    void deps.shareUrl({ title, text: translateInvite(language, 'invite.share.text', { name: title }), url }).then((outcome) => {
      if (outcome === 'copie') announce(translateInvite(language, 'invite.announce.copied'));
      if (outcome === 'indisponible') announce(translateInvite(language, 'invite.announce.shareUnavailable'), 'error');
    });
  }, [announce, deps, language, title, url]);

  const joinRefusedForGood = join.kind === 'refused' && !PASSING_REFUSALS.has(join.refusal);
  const choices = joinChoicesOf({ signedIn: isAccount, guestAllowed: invitation?.guest.allowed === true, anonymousRequested });
  const open = join.kind !== 'joined' && !joinRefusedForGood;
  const next = href('chatJoin', { link });
  const primary: ReactNode =
    membership.kind === 'member' ? (
      <MemberActions language={language} title={title} conversationId={membership.conversationId} failed={member.leaveFailed} onLeave={() => void member.leave()} />
    ) : membership.kind === 'checking' ? (
      <MembershipPending />
    ) : choices.account && open ? (
      <JoinAction language={language} joining={join.kind === 'joining'} held={member.leaving} online={online} onJoin={() => void handleJoin()} />
    ) : choices.guest && open ? (
      <GuestSubmit language={language} busy={join.kind === 'joining'} online={online} />
    ) : choices.accountRequired ? (
      <GuestExits language={language} next={next} withSeparator={false} accountRequired />
    ) : null;

  if (returning !== null) return <InvitationPending language={language} />;

  return (
    <div className="relative flex h-dvh flex-col overflow-y-auto pt-safe" style={{ background: PAGE_BACKGROUND }} lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <InviteHeader language={language} next={isAccount ? null : next} />
      <main id="contenu" className="mx-auto grid w-full max-w-[1280px] flex-1 content-start px-4 md:px-12 md:pb-12">
        {ended !== null ? (
          <div className="mx-auto grid w-full max-w-md content-center py-8">
            <GuestAccessEndedNotice language={language} ended={ended} onOpen={(path) => deps.go(path, false)} />
          </div>
        ) : null}

        {ended === null && (load.kind === 'loading' || (entering && load.kind === 'ready')) ? <InvitationPending language={language} /> : null}

        {ended === null && load.kind === 'refused' ? (
          <div className="mx-auto grid w-full max-w-md content-center py-8">
            <RefusalBanner language={language} refusal={load.refusal} {...(PASSING_REFUSALS.has(load.refusal) && online ? { onRetry: retryLoad } : {})} />
          </div>
        ) : null}

        {ended !== null || invitation === null || entering ? null : (
          <div
            data-invite-layout
            className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:grid-rows-[auto_auto_auto_1fr] md:items-start md:gap-x-8 md:gap-y-4"
          >
            <div className="grid gap-5 md:row-span-4">
              <InviterBlock language={language} invitation={invitation} />
              <GroupCard language={language} invitation={invitation} url={url} copied={copied} onCopy={copy} onReshare={reshare} />
            </div>
            <div className="grid gap-4 md:col-start-2">
              <InvitationFigures language={language} invitation={invitation} />
              <RightsCard language={language} invitation={invitation} now={deps.now()} />
            </div>
            {membership.kind === 'guest' ? (
              <JoinPanel language={language} title={title}>
                {join.kind === 'refused' ? <RefusalBanner language={language} refusal={join.refusal} /> : null}

                {join.kind === 'joined' ? (
                  <p role="status" className="text-center text-body font-semibold" style={{ color: INK }}>
                    {translateInvite(language, 'invite.join.joined')}
                  </p>
                ) : null}

                {choices.guest && open ? (
                  <GuestForm
                    language={language}
                    terms={invitation.guest}
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
              </JoinPanel>
            ) : null}

            {(choices.anonymousOffer || choices.accountOffer) && open && membership.kind === 'guest' ? (
              <div data-invite-identity-switch className="md:order-2 md:col-start-2">
                <IdentitySwitch language={language} link={link} toAnonymous={choices.anonymousOffer} />
              </div>
            ) : null}

            {choices.signIn && !choices.accountRequired ? (
              <div data-invite-exits className="md:order-2 md:col-start-2">
                <GuestExits language={language} next={next} withSeparator={choices.guest && open} accountRequired={false} />
              </div>
            ) : null}

            {primary === null ? null : <PrimaryBar>{primary}</PrimaryBar>}
          </div>
        )}
      </main>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20" style={{ height: 0 }}>
        <LiveAnnouncement text={announcer.text} tone={announcer.tone} marker="invite" />
      </div>
    </div>
  );
}

/**
 * LES CHOIX (#7796 § 5) — les champs de l'invité, dans le FIL de la page :
 * sous 768 px après la carte des droits, au-delà dans la colonne de droite,
 * titrés « Rejoindre <groupe> ». L'action primaire n'y est PAS : elle vit
 * dans `PrimaryBar`.
 */
function JoinPanel({ language, title, children }: { readonly language: InterfaceLanguage; readonly title: string; readonly children: ReactNode }) {
  return (
    <section
      aria-labelledby="invite-join-title"
      data-invite-join
      className="grid gap-3 rounded-hero p-4 md:col-start-2 md:rounded-sheet md:p-6"
      style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)' }}
    >
      <h2 id="invite-join-title" className="text-thread font-extrabold" style={{ color: INK }}>
        {translateInvite(language, 'invite.join.title', { name: isolated(title) })}
      </h2>
      {children}
    </section>
  );
}

/**
 * L'ACTION PRIMAIRE, SEULE (#7796, revue) — sous 768 px, une barre COLLÉE au
 * bas de l'écran qui ne porte QUE le bouton primaire (« Continuer en
 * anonyme », « Rejoindre avec mon compte », ou « Se connecter » quand le lien
 * exige un compte) : l'action reste dans le premier écran sans cacher le
 * groupe. Enfant DIRECT de la grille de la page : un élément `sticky` ne sort
 * jamais de son parent. Au-delà de 768 px, elle reprend sa place sous les
 * champs (`order`), sans rien coller.
 */
function PrimaryBar({ children }: { readonly children: ReactNode }) {
  return (
    <div
      data-invite-primary-bar
      className="sticky bottom-0 z-10 -mx-4 border-t border-[color-mix(in_srgb,var(--color-ios-ink-3)_22%,transparent)] bg-[color:var(--color-ios-card)] px-4 pt-3 pb-safe shadow-[0_-8px_24px_color-mix(in_srgb,var(--ios-indigo-900)_8%,transparent)] md:static md:order-1 md:col-start-2 md:mx-0 md:border-t-0 md:bg-transparent md:p-0 md:shadow-none"
    >
      {children}
    </div>
  );
}

function JoinAction({
  language,
  joining,
  held,
  online,
  onJoin,
}: {
  readonly language: InterfaceLanguage;
  readonly joining: boolean;
  /** Un départ en cours (#10282) : Rejoindre est revenu, inerte jusqu'à la réponse. */
  readonly held: boolean;
  readonly online: boolean;
  readonly onJoin: () => void;
}) {
  const disabled = joining || held || !online;
  return (
    <div className="grid w-full gap-2">
      <button
        type="button"
        data-invite-join-account
        onClick={onJoin}
        disabled={disabled}
        aria-busy={joining}
        className="grid w-full place-items-center rounded-bubble text-body font-extrabold text-ios-on-brand transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 54, backgroundColor: INVITE_ACTION_FLOOR, backgroundImage: INVITE_ACTION_BACKGROUND, opacity: disabled ? 0.6 : 1, outlineColor: 'var(--color-ios-brand)' }}
      >
        {translateInvite(language, joining ? 'invite.join.joining' : 'invite.join.account')}
      </button>
      {online ? null : (
        <p className="text-center text-caption" style={{ color: INK_2 }}>
          {translateInvite(language, 'invite.join.offline')}
        </p>
      )}
    </div>
  );
}

/**
 * L'AUTRE IDENTITÉ D'UN COMPTE CONNECTÉ (#8816) — une ANCRE (un vrai `href`),
 * secondaire : « Continuer en anonyme » sous son compte, « Rejoindre avec mon
 * compte » sous le formulaire d'invité. La même adresse, le mode seul change.
 */
function IdentitySwitch({ language, link, toAnonymous }: { readonly language: InterfaceLanguage; readonly link: string; readonly toAnonymous: boolean }) {
  return toAnonymous ? (
    <Link to="chatJoin" params={{ link }} search={{ mode: ANONYMOUS_MODE }} data-invite-anonymous-offer className={INVITE_OUTLINE_BUTTON} style={INVITE_OUTLINE_STYLE}>
      {translateInvite(language, 'invite.guest.continue')}
    </Link>
  ) : (
    <Link to="chatJoin" params={{ link }} data-invite-account-offer className={INVITE_OUTLINE_BUTTON} style={INVITE_OUTLINE_STYLE}>
      {translateInvite(language, 'invite.join.account')}
    </Link>
  );
}

const DIVIDER = { backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)' } as const;

/**
 * LES DEUX SORTIES D'UN VISITEUR SANS SESSION — des ANCRES, jamais des boutons
 * qui naviguent : un vrai `href`, ouvrable dans un autre onglet. `next` est
 * l'adresse de CETTE invitation ; `/login` et `/signup` la clampent
 * (`session-guard.ts § safeNextPath`) avant de s'en servir.
 *
 * Quand le formulaire d'invité est offert, elles deviennent SECONDAIRES et un
 * séparateur le dit ; quand le lien EXIGE un compte, « Se connecter » est
 * l'action primaire et la phrase l'explique — jamais une porte anonyme offerte
 * puis refusée.
 */
function GuestExits({
  language,
  next,
  withSeparator,
  accountRequired,
}: {
  readonly language: InterfaceLanguage;
  readonly next: string;
  readonly withSeparator: boolean;
  readonly accountRequired: boolean;
}) {
  return (
    <div className="grid w-full gap-3">
      {accountRequired ? (
        <p data-invite-account-required className="text-center text-caption" style={{ color: INK_2 }}>
          {translateInvite(language, 'invite.exits.accountRequired')}
        </p>
      ) : null}
      {withSeparator ? (
        <p className="flex items-center gap-3 text-caption font-semibold" style={{ color: INK_2 }}>
          <span aria-hidden="true" className="h-px flex-1" style={DIVIDER} />
          {translateInvite(language, 'invite.exits.separator')}
          <span aria-hidden="true" className="h-px flex-1" style={DIVIDER} />
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          to="login"
          search={{ next }}
          data-invite-sign-in
          className={
            withSeparator
              ? INVITE_OUTLINE_BUTTON
              : 'flex items-center justify-center rounded-card px-3 text-body font-extrabold text-ios-on-brand focus-visible:outline-2 focus-visible:outline-offset-2'
          }
          style={withSeparator ? INVITE_OUTLINE_STYLE : { minHeight: 48, backgroundColor: INVITE_ACTION_FLOOR, backgroundImage: INVITE_ACTION_BACKGROUND, outlineColor: 'var(--color-ios-brand)' }}
        >
          {translateInvite(language, 'invite.exits.signIn')}
        </Link>
        <Link to="signup" search={{ next }} data-invite-sign-up className={INVITE_OUTLINE_BUTTON} style={INVITE_OUTLINE_STYLE}>
          {translateInvite(language, 'invite.exits.signUp')}
        </Link>
      </div>
    </div>
  );
}
