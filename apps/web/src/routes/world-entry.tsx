import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorldEntry } from '@meeshy/shared/types/world';

import '@/styles/site-chrome.css';
import { LanguageSelect } from '@/landing/site-chrome';

import { ThreadSkeleton } from '@/components/thread-states';
import { apiDeps } from '@/lib/api/deps';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { ApiResult } from '@/lib/api/http';
import { guestRefusalOf, joinLinkAsGuest, linkRefusalOf, type GuestJoinBody, type LinkGuestJoined, type LinkRefusal } from '@/lib/api/link-join';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore, type GuestIdentity } from '@/lib/api/session';
import { loadWorldEntry, WORLD_FALLBACK_TITLE, WORLD_UNAVAILABLE } from '@/lib/api/world';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import { currentInterfaceLanguage, interfaceLanguageOf, setInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { ANONYMOUS_MODE } from '@/lib/links/invitation-view';
import { useOnline } from '@/lib/net/online';
import { currentHistory, reelsExitOf } from '@/lib/reels/exit';
import { useSearch } from '@/lib/router';
import { useFocusGuest } from '@/lib/view/guest-focus';
import { takeLandingHandoff, type HandoffStorage } from '@/routes/chat-join-handoff';
import { INK, INK_2, INVITE_ACTION_BACKGROUND, INVITE_ACTION_FLOOR, isolated, RefusalBanner } from '@/routes/chat-join-parts';
import { href, navigate } from '@/routes/route-table';

/**
 * `/world` — ENTRER DANS WORLD WIDE SANS COMPTE (#10003, #10098).
 *
 * UNE vue, UN clic (décision porteur 2026-10-11, #10098) : le NOM, la LANGUE
 * de lecture — la liste déroulante de l'en-tête de meeshy.me (`LanguageSelect`,
 * `purpose: 'reading'`), la langue de l'interface proposée —, puis « Entrer »,
 * qui ouvre le FIL. Une adresse qui porte `?name=` pré-remplit le nom.
 *
 * La porte est celle de tous les liens : la clé de jonction SERVIE par
 * `GET /world` (jamais écrite ici), `POST /links/:key/members` en invité, et la
 * session `X-Session-Token` existante. La langue choisie devient le rang 1 du
 * Prisme de l'invité ET la langue de son interface (#9710) ; les familles de
 * pièces jointes que le lien lui ouvre voyagent avec son identité.
 *
 * Le nom se tape PENDANT que l'entrée se lit : aucun écran d'attente devant un
 * champ qui n'a besoin d'aucun réseau. Seul « Entrer » attend la clé.
 *
 * L'INVITÉ RESTE SUR `/world` (#10100, décision porteur du 2026-10-11) — sans
 * compte, la structure de l'application n'a rien à lui montrer. Une fois entré,
 * le fil de World Wide s'ouvre ICI, en FOCUS (`ThreadScreen` en `focus`) :
 * l'en-tête de la conversation, ses messages, son composeur — ni liste, ni
 * panneau, ni navigation. Rafraîchir rouvre le fil depuis la session TENUE,
 * sans attendre le réseau ; une session retirée ou expirée rend l'entrée. La
 * landing y mène aussi : son jeton de passage (#10094) fait entrer sans autre
 * geste, comme il le faisait sur la jonction par lien. Un COMPTE garde son
 * application : il suit la jonction par lien, puis son fil, dans son cadre.
 *
 * LES EFFETS DE BORD SONT INJECTÉS (`WorldEntryDeps`), même dispositif que
 * `ChatJoinDeps` : le témoin monte l'écran sans routeur ni passerelle.
 */

export type WorldEntryDeps = {
  readonly loadWorld: (signal: AbortSignal) => Promise<ApiResult<WorldEntry>>;
  readonly joinGuest: (link: string, body: GuestJoinBody) => Promise<ApiResult<LinkGuestJoined>>;
  readonly adoptGuest: (sessionToken: string, guest: GuestIdentity) => void;
  readonly adoptInterfaceLanguage: (language: string) => void;
  /** Un compte connecté rejoint par la jonction de lien, jamais par ce formulaire. */
  readonly signedIn: () => boolean;
  readonly go: (url: string, replace: boolean) => void;
  readonly joined: () => void;
  /** Une page de Meeshy précède-t-elle celle-ci ? `history.length` ne le sait
   * pas : il compte les pages des autres sites (`lib/reels/exit.ts`). */
  readonly canGoBack: () => boolean;
  readonly back: () => void;
  /** L'onglet où la landing pose son jeton de passage (#10094). */
  readonly handoff: () => HandoffStorage;
  readonly now: () => number;
  /** Charge le fil pendant que le nom se tape : « Entrer » n'attend plus que le réseau. */
  readonly warmFocus?: () => void;
};

const DEFAULT_DEPS: WorldEntryDeps = {
  loadWorld: (signal) => loadWorldEntry({ ...apiDeps, signal }),
  joinGuest: (link, body) => joinLinkAsGuest(apiDeps, { link, body }),
  adoptGuest: (sessionToken, guest) => sessionStore.getState().adoptAnonymous({ sessionToken, guest }),
  adoptInterfaceLanguage: (code) => {
    const language = interfaceLanguageOf(code);
    if (language !== null) setInterfaceLanguage(language).catch(() => undefined);
  },
  signedIn: () => sessionStore.getState().session.status === 'authenticated',
  go: navigate,
  joined: () => {
    void appQueryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  },
  canGoBack: () => reelsExitOf(currentHistory()) === 'back',
  back: () => window.history.back(),
  handoff: () => window.sessionStorage,
  now: () => Date.now(),
  warmFocus: () => {
    void threadModule().catch(() => undefined);
  },
};

const threadModule = () => import('@/routes/thread');
const FocusThread = lazy(threadModule);

/** Le fil de l'invité, en focus — le squelette du fil pendant que son chunk arrive. */
function focusThread(conversationId: string): ReactNode {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <FocusThread focus={{ conversationId }} />
    </Suspense>
  );
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly entry: WorldEntry }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' };

type JoinState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'joining' }
  | { readonly kind: 'refused'; readonly refusal: LinkRefusal }
  | { readonly kind: 'failed'; readonly offline: boolean };

const NAME_MAX = 40;

export default function WorldEntryScreen() {
  const [search] = useSearch();
  const held = useFocusGuest();
  return <WorldGuestEntry initialName={search.get('name') ?? ''} initialLanguage={search.get('language')} held={held} />;
}

const PAGE_BACKGROUND =
  'radial-gradient(60% 40% at 50% 20%, color-mix(in srgb, var(--ios-indigo-500) 18%, transparent), transparent), var(--color-ios-surface)';

const PRIMARY_CLASS =
  'grid w-full place-items-center rounded-field text-body font-bold text-ios-on-brand transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2';

export function WorldGuestEntry({
  initialName,
  initialLanguage = null,
  held = null,
  deps = DEFAULT_DEPS,
  focus = focusThread,
}: {
  readonly initialName: string;
  /** La langue choisie sur la landing (`?language=`), pré-sélectionnée. */
  readonly initialLanguage?: string | null;
  /** L'invité sans compte TENU (`useFocusGuest`) — son fil s'ouvre ici. */
  readonly held?: GuestIdentity | null;
  readonly deps?: WorldEntryDeps;
  readonly focus?: (conversationId: string) => ReactNode;
}) {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const [name, setName] = useState(() => initialName.trim().slice(0, NAME_MAX));
  const [nameRefusal, setNameRefusal] = useState<string | null>(null);
  const [reading, setReading] = useState<InterfaceLanguage>(() => interfaceLanguageOf(initialLanguage ?? '') ?? language);
  const handoffRead = useRef(false);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [join, setJoin] = useState<JoinState>({ kind: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void deps.loadWorld(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setLoad(result.code === WORLD_UNAVAILABLE ? { kind: 'unavailable' } : { kind: 'failed' });
        return;
      }
      if (deps.signedIn()) {
        deps.go(href('chatJoin', { link: result.data.shareLinkIdentifier }, accountEntryOf(initialName, initialLanguage)), true);
        return;
      }
      setLoad({ kind: 'ready', entry: result.data });
    });
    return () => controller.abort();
  }, [deps, attempt]);

  useEffect(() => {
    if (held === null) deps.warmFocus?.();
  }, [deps, held]);

  /* Une lecture échouée se relance au retour du réseau, sans geste. */
  useEffect(() => {
    if (online && load.kind === 'failed') setAttempt((count) => count + 1);
  }, [online]);

  const refuseName = (refusal: string) => {
    setNameRefusal(refusal);
    nameField.current?.focus();
  };

  const retryLoad = () => {
    setLoad({ kind: 'loading' });
    setAttempt((count) => count + 1);
  };

  const enter = async (nickname: string = name.trim(), chosen: InterfaceLanguage = reading) => {
    if (nickname === '') {
      refuseName(translateInvite(language, 'world.name.missing'));
      return;
    }
    setNameRefusal(null);
    if (load.kind === 'failed') {
      retryLoad();
      return;
    }
    if (load.kind !== 'ready' || join.kind === 'joining' || !online) return;
    const link = load.entry.shareLinkIdentifier;
    setName(nickname);
    setJoin({ kind: 'joining' });
    const result = await deps.joinGuest(link, { language: chosen, nickname });
    if (!result.ok) {
      const refusal = guestRefusalOf(result);
      if (refusal.on === 'input') {
        if (refusal.suggestion !== null) setName(refusal.suggestion);
        setJoin({ kind: 'idle' });
        refuseName(
          refusal.suggestion !== null
            ? translateInvite(language, 'invite.refused.taken', { suggestion: refusal.suggestion })
            : translateInvite(language, refusal.field === 'nickname' ? 'invite.refused.nickname' : 'world.error.enter'),
        );
        return;
      }
      const linkRefusal = linkRefusalOf(result);
      setJoin(linkRefusal === 'offline' || linkRefusal === 'unavailable' || linkRefusal === 'rate-limited'
        ? { kind: 'failed', offline: linkRefusal === 'offline' }
        : { kind: 'refused', refusal: linkRefusal });
      return;
    }
    deps.adoptGuest(result.data.sessionToken, {
      participantId: result.data.participantId,
      nickname: result.data.nickname ?? nickname,
      conversationId: result.data.conversationId,
      link,
      mayWrite: result.data.mayWrite,
      language: chosen,
      ...(result.data.attachmentKinds === undefined ? {} : { attachmentKinds: result.data.attachmentKinds }),
    });
    deps.adoptInterfaceLanguage(chosen);
    setJoin({ kind: 'idle' });
    /* L'invité RESTE sur `/world` (#10100) : l'adresse perd seulement le nom
       et la langue qui l'avaient amené, et l'entrée ne revient pas au retour. */
    deps.go(href('world'), true);
    deps.joined();
  };

  /**
   * L'ENTRÉE DEPUIS LA LANDING (#10094, #10100) — le nom et la langue y sont
   * déjà choisis : avec le jeton de passage de l'onglet, l'invité entre sans
   * autre geste. Le jeton est lu et effacé UNE fois, quand la clé est connue ;
   * sans lui (adresse forgée, périmée, autre onglet), le formulaire attend le
   * geste, pré-rempli.
   */
  useEffect(() => {
    if (load.kind !== 'ready' || handoffRead.current) return;
    handoffRead.current = true;
    const nickname = initialName.trim().slice(0, NAME_MAX);
    if (nickname === '' || initialLanguage === null) return;
    const link = load.entry.shareLinkIdentifier;
    const handedOff = takeLandingHandoff({ storage: deps.handoff, link, entry: { nickname, language: initialLanguage }, now: deps.now() });
    const chosen = interfaceLanguageOf(initialLanguage);
    if (!handedOff || chosen === null || (held !== null && held.link === link)) return;
    void enter(nickname, chosen);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- l'entrée part une fois, quand la clé arrive
  }, [load]);

  if (held !== null && (load.kind !== 'ready' || held.link === load.entry.shareLinkIdentifier)) return focus(held.conversationId);

  const title = load.kind === 'ready' ? load.entry.title : WORLD_FALLBACK_TITLE;
  const blocked = load.kind === 'loading' || join.kind === 'joining' || !online;

  return (
    <div
      data-world-entry-screen
      className="relative flex h-app flex-col overflow-hidden pt-safe"
      style={{ background: PAGE_BACKGROUND, color: INK }}
      lang={language}
      dir={direction}
    >
      <header className="flex items-center px-4 pt-2">
        <button
          type="button"
          data-world-back
          aria-label={translateInvite(language, 'world.back')}
          onClick={() => leave(deps)}
          className="grid size-11 place-items-center rounded-full focus-visible:outline-2"
          style={{ color: 'var(--color-ios-brand)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      </header>

      <section aria-labelledby="world-name-title" className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-8 pt-6 pb-8 text-center">
        <form
          data-world-form
          noValidate
          className="flex h-full w-full max-w-md flex-col items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void enter();
          }}
        >
          <span
            aria-hidden="true"
            className="grid size-[100px] place-items-center rounded-[28px] text-ios-on-brand shadow-lg"
            style={{ background: 'linear-gradient(135deg, var(--ios-indigo-500), var(--ios-indigo-700))' }}
          >
            <GlobeGlyph size={48} />
          </span>
          <h1 id="world-name-title" className="mt-3 text-[28px] font-bold" style={{ color: 'var(--color-ios-brand)' }}>
            {title}
          </h1>
          <p className="text-[17px]" style={{ color: INK_2 }}>
            {translateInvite(language, 'world.name.prompt')}
          </p>
          <label className="mt-4 flex w-full flex-col gap-1.5 text-start text-[14px]" style={{ color: INK_2 }}>
            {translateInvite(language, 'world.name.label')}
            <input
              ref={nameField}
              data-world-name
              type="text"
              name="name"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="nickname"
              enterKeyHint="go"
              placeholder={translateInvite(language, 'world.name.placeholder')}
              aria-invalid={nameRefusal !== null}
              aria-describedby={nameRefusal === null ? undefined : 'world-name-refusal'}
              onInput={(event) => {
                setName(event.currentTarget.value);
                setNameRefusal(null);
              }}
              className="h-12 rounded-field border-2 bg-[color:var(--color-ios-card)] px-3.5 text-[16px] outline-none"
              style={{ borderColor: 'var(--color-ios-brand)', color: INK }}
            />
          </label>
          {nameRefusal === null ? null : (
            <p id="world-name-refusal" role="alert" className="w-full text-start text-caption font-semibold" style={{ color: 'var(--ios-error)' }}>
              {nameRefusal}
            </p>
          )}
          <div className="flex w-full flex-col items-start gap-1.5 text-start">
            <LanguageSelect
              language={reading}
              label={translateInvite(language, 'world.language.group')}
              purpose="reading"
              describedBy="world-language-hint"
              onSelect={setReading}
            />
            <p id="world-language-hint" className="text-caption" style={{ color: INK_2 }}>
              {translateInvite(language, 'world.language.hint')}
            </p>
          </div>
          <span className="flex-1" />
          <EntryOutcome language={language} load={load} join={join} online={online} />
          {load.kind === 'unavailable' ? null : (
            <button
              type="submit"
              data-world-enter
              disabled={blocked}
              aria-busy={join.kind === 'joining'}
              className={PRIMARY_CLASS}
              style={{
                minHeight: 52,
                backgroundColor: INVITE_ACTION_FLOOR,
                backgroundImage: INVITE_ACTION_BACKGROUND,
                outlineColor: 'var(--color-ios-brand)',
                opacity: blocked ? 0.6 : 1,
              }}
            >
              {load.kind === 'loading'
                ? translateInvite(language, 'world.loading')
                : load.kind === 'failed'
                  ? translateInvite(language, 'invite.retry')
                : join.kind === 'joining'
                  ? translateInvite(language, 'world.entering')
                  : translateInvite(language, 'world.enter', { title: isolated(title) })}
            </button>
          )}
        </form>
      </section>
    </div>
  );
}

/**
 * LE NOM D'UN COMPTE VENU DE LA LANDING (#10100) — elle mène tout le monde à
 * `/world?name=…&language=…`. Un compte y est renvoyé à la jonction par lien :
 * son nom et sa langue l'y suivent, et elle le fait entrer sous son identité
 * anonyme (#8816), comme l'ancienne adresse de la landing le faisait.
 */
function accountEntryOf(initialName: string, initialLanguage: string | null): Record<string, string> | undefined {
  const name = initialName.trim().slice(0, NAME_MAX);
  if (name === '') return undefined;
  return { mode: ANONYMOUS_MODE, name, ...(initialLanguage === null || initialLanguage === '' ? {} : { language: initialLanguage }) };
}

/** Quitter : la page d'avant (la landing, l'écran de connexion),
 * ou l'accueil quand l'adresse a été ouverte seule. */
function leave(deps: WorldEntryDeps): void {
  if (deps.canGoBack()) deps.back();
  else deps.go(href('home'), true);
}

function GlobeGlyph({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

/** Ce qui empêche d'entrer, dit au-dessus du bouton : entrée fermée, lien refusé, réseau. */
function EntryOutcome({
  language,
  load,
  join,
  online,
}: {
  readonly language: InterfaceLanguage;
  readonly load: LoadState;
  readonly join: JoinState;
  readonly online: boolean;
}) {
  if (load.kind === 'unavailable') {
    return (
      <p data-world-unavailable role="status" className="rounded-card p-4 text-center text-body font-semibold" style={{ backgroundColor: 'var(--color-ios-card)' }}>
        {translateInvite(language, 'world.unavailable')}
      </p>
    );
  }
  if (join.kind === 'refused') {
    return (
      <div data-world-refused>
        <RefusalBanner language={language} refusal={join.refusal} />
      </div>
    );
  }
  const failure = !online || (join.kind === 'failed' && join.offline) ? 'world.error.offline' : join.kind === 'failed' || load.kind === 'failed' ? 'world.error.enter' : null;
  return failure === null ? null : (
    <p role="alert" className="text-center text-caption font-semibold" style={{ color: INK_2 }}>
      {translateInvite(language, failure)}
    </p>
  );
}
