import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { LiveAnnouncement } from '@/components/live-announcement';
import { apiConfig } from '@/lib/api/config';
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
  type LinkGuestJoined,
  type LinkInvitation,
  type LinkJoined,
  type LinkRefusal,
} from '@/lib/api/link-join';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore, type GuestIdentity } from '@/lib/api/session';
import { translateInvite, type InviteCatalogKey } from '@/lib/i18n-invite-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { joinChoicesOf } from '@/lib/links/invitation-view';
import { copyLinkText, LINK_ANNOUNCE_MS, type CopyOutcome } from '@/lib/links/link-copy';
import { shareLinkUrl, webOriginOf } from '@/lib/links/web-origin';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { partagerLien, portailDuNavigateur, type ResultatInvitation } from '@/lib/view/invitation';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { defaultGuestLanguage, GuestForm } from '@/routes/chat-join-guest';
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
  /** Copier l'adresse du lien (#7796) — le presse-papiers du navigateur ou de la coque. */
  readonly copyText: (url: string) => Promise<CopyOutcome>;
  /** Repartager (#7796) — la feuille native (`navigator.share`, pont `MeeshyShare`
   * de la coque), sinon une copie, dite. */
  readonly shareUrl: (data: { readonly title: string; readonly text: string; readonly url: string }) => Promise<ResultatInvitation>;
  /** L'origine PUBLIQUE des adresses partagées (`web-origin.ts`) — jamais
   * l'origine virtuelle d'une coque. */
  readonly origin: () => string;
  readonly now: () => Date;
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
  copyText: (url) => copyLinkText(url, portailDuNavigateur()),
  shareUrl: (data) => partagerLien(data),
  origin: () => webOriginOf(apiConfig.base, window.location.origin),
  now: () => new Date(),
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
  return <ChatJoin link={link} />;
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

export function ChatJoin({ link, deps = DEFAULT_DEPS }: { readonly link: string; readonly deps?: ChatJoinDeps }) {
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

  async function handleGuestJoin() {
    if (load.kind !== 'ready' || join.kind === 'joining' || join.kind === 'joined' || !online) return;

    const validated = validateGuestDraft(draft, load.invitation.guest);
    if (!validated.ok) {
      setInput({ field: validated.field, message: translateInvite(language, MISSING_KEY[validated.field]) });
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
  const choices = joinChoicesOf({ signedIn: isAccount, guestAllowed: invitation?.guest.allowed === true });
  const open = join.kind !== 'joined' && !joinRefusedForGood;
  const next = href('chatJoin', { link });

  return (
    <div className="relative flex h-dvh flex-col overflow-y-auto pt-safe" style={{ background: PAGE_BACKGROUND }} lang={language}>
      <InviteHeader language={language} next={isAccount ? null : next} />
      <main id="contenu" className="mx-auto grid w-full max-w-[1280px] flex-1 content-start px-4 md:px-12 md:pb-12">
        {load.kind === 'loading' ? <InvitationPending language={language} /> : null}

        {load.kind === 'refused' ? (
          <div className="mx-auto grid w-full max-w-md content-center py-8">
            <RefusalBanner language={language} refusal={load.refusal} {...(PASSING_REFUSALS.has(load.refusal) && online ? { onRetry: retryLoad } : {})} />
          </div>
        ) : null}

        {invitation === null ? null : (
          <div
            data-invite-layout
            className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:items-start md:gap-x-8 md:gap-y-4"
          >
            <div className="grid gap-5 md:row-span-2">
              <InviterBlock language={language} invitation={invitation} />
              <GroupCard language={language} invitation={invitation} url={url} copied={copied} onCopy={copy} onReshare={reshare} />
            </div>
            <div className="grid gap-4 md:col-start-2">
              <InvitationFigures language={language} invitation={invitation} />
              <RightsCard language={language} invitation={invitation} now={deps.now()} />
            </div>
            <JoinPanel language={language} title={title}>
              {join.kind === 'refused' ? <RefusalBanner language={language} refusal={join.refusal} /> : null}

              {join.kind === 'joined' ? (
                <p role="status" className="text-center text-body font-semibold" style={{ color: INK }}>
                  {translateInvite(language, 'invite.join.joined')}
                </p>
              ) : null}

              {choices.account && open ? (
                <JoinAction language={language} joining={join.kind === 'joining'} online={online} onJoin={() => void handleJoin()} />
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

              {choices.signIn ? (
                <GuestExits language={language} next={next} withSeparator={choices.guest && open} accountRequired={choices.accountRequired} />
              ) : null}
            </JoinPanel>
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
 * LES CHOIX (#7796 § 5) — sous 768 px, un panneau COLLÉ au bas de l'écran
 * (l'action primaire reste dans le premier écran quel que soit ce qui la
 * précède) ; au-delà, une carte dans la colonne de droite, titrée « Rejoindre
 * <groupe> ». Collé au bas de la GRILLE entière, pas de sa colonne : un élément
 * `sticky` ne sort jamais de son parent.
 */
function JoinPanel({ language, title, children }: { readonly language: InterfaceLanguage; readonly title: string; readonly children: ReactNode }) {
  return (
    <section
      aria-labelledby="invite-join-title"
      data-invite-join
      className="sticky bottom-0 z-10 -mx-4 grid gap-3 px-4 pt-4 pb-[calc(var(--safe-bottom)+16px)] md:static md:col-start-2 md:mx-0 md:rounded-[26px] md:p-6"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 94%, transparent)',
        borderTop: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)',
        boxShadow: '0 -8px 24px color-mix(in srgb, var(--ios-indigo-900) 8%, transparent)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <h2 id="invite-join-title" className="sr-only text-thread font-extrabold md:not-sr-only" style={{ color: INK }}>
        {translateInvite(language, 'invite.join.title', { name: title })}
      </h2>
      {children}
    </section>
  );
}

function JoinAction({
  language,
  joining,
  online,
  onJoin,
}: {
  readonly language: InterfaceLanguage;
  readonly joining: boolean;
  readonly online: boolean;
  readonly onJoin: () => void;
}) {
  const disabled = joining || !online;
  return (
    <div className="grid w-full gap-2">
      <button
        type="button"
        data-invite-join-account
        onClick={onJoin}
        disabled={disabled}
        aria-busy={joining}
        className="grid w-full place-items-center rounded-[18px] text-body font-extrabold text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2"
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
              : 'flex items-center justify-center rounded-[16px] px-3 text-body font-extrabold text-white focus-visible:outline-2 focus-visible:outline-offset-2'
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
