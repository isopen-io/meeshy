import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';
import type { WorldEntry } from '@meeshy/shared/types/world';

import { apiDeps } from '@/lib/api/deps';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { ApiResult } from '@/lib/api/http';
import { guestRefusalOf, joinLinkAsGuest, linkRefusalOf, type GuestJoinBody, type LinkGuestJoined, type LinkRefusal } from '@/lib/api/link-join';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore, type GuestIdentity } from '@/lib/api/session';
import { loadWorldEntry, WORLD_FALLBACK_TITLE, WORLD_UNAVAILABLE } from '@/lib/api/world';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import { resolveInterfaceLanguageCode, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage, interfaceLanguageOf, setInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useSearch } from '@/lib/router';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { INK, INK_2, INVITE_ACTION_BACKGROUND, INVITE_ACTION_FLOOR, isolated, RefusalBanner } from '@/routes/chat-join-parts';
import { href, navigate } from '@/routes/route-table';

/**
 * `/world` — ENTRER DANS WORLD WIDE SANS COMPTE (#10003, planche « Onboarding »).
 *
 * Trois temps, un geste chacun : le NOM, un glissement vers la LANGUE
 * principale (celle de l'appareil proposée parmi les sept), puis le FIL. La
 * landing y mène avec le nom déjà saisi (`?name=`, `landing/world-entry.ts`) :
 * l'écran s'ouvre alors sur la langue, et « retour » rend le nom.
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
 * LES EFFETS DE BORD SONT INJECTÉS (`WorldEntryDeps`), même dispositif que
 * `ChatJoinDeps` : le témoin monte l'écran sans routeur ni passerelle.
 */

export type WorldEntryDeps = {
  readonly loadWorld: (signal: AbortSignal) => Promise<ApiResult<WorldEntry>>;
  readonly joinGuest: (link: string, body: GuestJoinBody) => Promise<ApiResult<LinkGuestJoined>>;
  readonly adoptGuest: (sessionToken: string, guest: GuestIdentity) => void;
  readonly adoptInterfaceLanguage: (language: string) => void;
  /** L'identité d'invité déjà tenue, s'il y en a une — un retour par ce lien rouvre son fil. */
  readonly heldGuest: () => GuestIdentity | null;
  /** Un compte connecté rejoint par la jonction de lien, jamais par ce formulaire. */
  readonly signedIn: () => boolean;
  readonly deviceLanguages: () => readonly string[];
  readonly go: (url: string, replace: boolean) => void;
  readonly joined: () => void;
};

const DEFAULT_DEPS: WorldEntryDeps = {
  loadWorld: (signal) => loadWorldEntry({ ...apiDeps, signal }),
  joinGuest: (link, body) => joinLinkAsGuest(apiDeps, { link, body }),
  adoptGuest: (sessionToken, guest) => sessionStore.getState().adoptAnonymous({ sessionToken, guest }),
  adoptInterfaceLanguage: (code) => {
    const language = interfaceLanguageOf(code);
    if (language !== null) setInterfaceLanguage(language).catch(() => undefined);
  },
  heldGuest: () => {
    const session = sessionStore.getState().session;
    return session.status === 'guest' ? session.guest : null;
  },
  signedIn: () => sessionStore.getState().session.status === 'authenticated',
  deviceLanguages: () => (typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])),
  go: navigate,
  joined: () => {
    void appQueryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  },
};

type Step = 'name' | 'language';

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
const STEPS_TOTAL = 3;

export default function WorldEntryScreen() {
  const [search] = useSearch();
  return <WorldGuestEntry initialName={search.get('name') ?? ''} />;
}

const endonym = (code: string): string => {
  const info = getLanguageInfo(code);
  return info.nativeName ?? info.name ?? code;
};

const PAGE_BACKGROUND =
  'radial-gradient(60% 40% at 50% 20%, color-mix(in srgb, var(--ios-indigo-500) 18%, transparent), transparent), var(--color-ios-surface)';

const PRIMARY_CLASS =
  'grid w-full place-items-center rounded-field text-body font-bold text-ios-on-brand transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2';

export function WorldGuestEntry({ initialName, deps = DEFAULT_DEPS }: { readonly initialName: string; readonly deps?: WorldEntryDeps }) {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const firstName = initialName.trim().slice(0, NAME_MAX);
  const [step, setStep] = useState<Step>(firstName === '' ? 'name' : 'language');
  const [name, setName] = useState(firstName);
  const [nameRefusal, setNameRefusal] = useState<string | null>(null);
  const [reading, setReading] = useState(() => resolveInterfaceLanguageCode(null, deps.deviceLanguages()));
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [join, setJoin] = useState<JoinState>({ kind: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const nameField = useRef<HTMLInputElement>(null);
  const languageHeading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void deps.loadWorld(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setLoad(result.code === WORLD_UNAVAILABLE ? { kind: 'unavailable' } : { kind: 'failed' });
        return;
      }
      const link = result.data.shareLinkIdentifier;
      const held = deps.heldGuest();
      if (held !== null && held.link === link) {
        deps.go(href('thread', { conversation: held.conversationId }), true);
        return;
      }
      if (deps.signedIn()) {
        deps.go(href('chatJoin', { link }), true);
        return;
      }
      setLoad({ kind: 'ready', entry: result.data });
    });
    return () => controller.abort();
  }, [deps, attempt]);

  /* Une lecture échouée se relance au retour du réseau, sans geste. */
  useEffect(() => {
    if (online && load.kind === 'failed') setAttempt((count) => count + 1);
  }, [online]);

  useEffect(() => {
    if (!moved.current) return;
    if (step === 'language') languageHeading.current?.focus({ preventScroll: true });
    else nameField.current?.focus({ preventScroll: true });
  }, [step]);

  const toStep = (next: Step) => {
    moved.current = true;
    setStep(next);
  };

  const submitName = () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setNameRefusal(translateInvite(language, 'world.name.missing'));
      nameField.current?.focus();
      return;
    }
    setNameRefusal(null);
    setName(trimmed);
    toStep('language');
  };

  const retryLoad = () => {
    setLoad({ kind: 'loading' });
    setAttempt((count) => count + 1);
  };

  const enter = async () => {
    if (load.kind === 'failed') {
      retryLoad();
      return;
    }
    if (load.kind !== 'ready' || join.kind === 'joining' || !online) return;
    const link = load.entry.shareLinkIdentifier;
    const nickname = name.trim();
    setJoin({ kind: 'joining' });
    const result = await deps.joinGuest(link, { language: reading, nickname });
    if (!result.ok) {
      const refusal = guestRefusalOf(result);
      if (refusal.on === 'input') {
        if (refusal.suggestion !== null) setName(refusal.suggestion);
        setNameRefusal(
          refusal.suggestion !== null
            ? translateInvite(language, 'invite.refused.taken', { suggestion: refusal.suggestion })
            : translateInvite(language, refusal.field === 'nickname' ? 'invite.refused.nickname' : 'world.error.enter'),
        );
        setJoin({ kind: 'idle' });
        toStep('name');
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
      nickname,
      conversationId: result.data.conversationId,
      link,
      mayWrite: result.data.mayWrite,
      language: reading,
      ...(result.data.attachmentKinds === undefined ? {} : { attachmentKinds: result.data.attachmentKinds }),
    });
    deps.adoptInterfaceLanguage(reading);
    deps.go(href('thread', { conversation: result.data.conversationId }), true);
    deps.joined();
  };

  const title = load.kind === 'ready' ? load.entry.title : WORLD_FALLBACK_TITLE;
  const stepIndex = step === 'name' ? 1 : 2;
  const blocked = load.kind === 'loading' || join.kind === 'joining' || !online;
  const offset = step === 'name' ? '0%' : direction === 'rtl' ? '50%' : '-50%';

  return (
    <div
      data-world-entry-screen
      className="relative flex h-dvh flex-col overflow-hidden pt-safe"
      style={{ background: PAGE_BACKGROUND, color: INK }}
      lang={language}
      dir={direction}
    >
      <header className="flex items-center px-4 pt-2">
        <button
          type="button"
          data-world-back
          aria-label={translateInvite(language, 'world.back')}
          onClick={() => (step === 'language' ? toStep('name') : leave(deps))}
          className="grid size-11 place-items-center rounded-full focus-visible:outline-2"
          style={{ color: 'var(--color-ios-brand)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="flex flex-1 justify-center gap-1.5">
          <span className="sr-only">{translateInvite(language, 'world.step', { index: String(stepIndex), total: String(STEPS_TOTAL) })}</span>
          {[1, 2, 3].map((dot) => (
            <span
              key={dot}
              aria-hidden="true"
              className="h-1 w-6 rounded-full"
              style={{ backgroundColor: dot <= stepIndex ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink-2) 25%, transparent)' }}
            />
          ))}
        </div>
        <span className="size-11" aria-hidden="true" />
      </header>

      {step === 'language' ? <LanguageStepBack onBack={() => toStep('name')} /> : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          data-world-step={step}
          className="flex h-full w-[200%] transition-transform duration-[420ms] ease-[cubic-bezier(0.2,0.9,0.25,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${offset})` }}
        >
          <section
            aria-labelledby="world-name-title"
            inert={step !== 'name'}
            className="mx-auto flex h-full w-1/2 flex-col items-center gap-3 overflow-y-auto px-8 pt-10 pb-8 text-center"
          >
            <form
              data-world-name-form
              noValidate
              className="flex h-full w-full max-w-md flex-col items-center gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitName();
              }}
            >
              <span
                aria-hidden="true"
                className="grid size-[100px] place-items-center rounded-[28px] text-white shadow-lg"
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
                  enterKeyHint="next"
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
              <span className="flex-1" />
              <button
                type="submit"
                data-world-continue
                className={PRIMARY_CLASS}
                style={{ minHeight: 52, backgroundColor: INVITE_ACTION_FLOOR, backgroundImage: INVITE_ACTION_BACKGROUND, outlineColor: 'var(--color-ios-brand)' }}
              >
                {translateInvite(language, 'world.continue')}
              </button>
            </form>
          </section>

          <section
            aria-labelledby="world-language-title"
            inert={step !== 'language'}
            className="flex h-full w-1/2 flex-col gap-2.5 overflow-y-auto px-6 pt-7 pb-8"
          >
            <div className="mx-auto flex h-full w-full max-w-md flex-col gap-2.5">
              <h1 id="world-language-title" ref={languageHeading} tabIndex={-1} className="text-[28px] font-bold leading-tight outline-none">
                {translateInvite(language, 'world.language.greeting', { name: isolated(name.trim()) })}
              </h1>
              <p className="text-[15px]" style={{ color: INK_2 }}>
                {translateInvite(language, 'world.language.hint')}
              </p>
              <LanguageChoice
                label={translateInvite(language, 'world.language.group')}
                value={reading}
                direction={direction}
                onChange={setReading}
              />
              <span className="flex-1" />
              <EntryOutcome language={language} load={load} join={join} online={online} />
              {load.kind === 'unavailable' ? null : (
                <button
                  type="button"
                  data-world-enter
                  disabled={blocked}
                  aria-busy={join.kind === 'joining'}
                  onClick={() => void enter()}
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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Quitter depuis le nom : la page d'avant (la landing, l'écran de connexion),
 * ou l'accueil quand l'adresse a été ouverte seule. */
function leave(deps: WorldEntryDeps): void {
  if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
  else deps.go(href('home'), true);
}

/** Le retour MATÉRIEL (Android, navigateur) ramène de la langue au nom, comme le bouton. */
function LanguageStepBack({ onBack }: { readonly onBack: () => void }) {
  useBackDismiss(onBack);
  return null;
}

function GlobeGlyph({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

/**
 * LA LANGUE PRINCIPALE — un groupe de boutons radio (planche), parcouru aux
 * flèches avec un seul arrêt de tabulation (WAI-ARIA « radio group ») ; en
 * arabe, gauche et droite s'inversent.
 */
function LanguageChoice({
  label,
  value,
  direction,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly direction: 'ltr' | 'rtl';
  readonly onChange: (code: string) => void;
}) {
  const codes: readonly string[] = SUPPORTED_INTERFACE_LANGUAGES;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const delta = event.key === 'ArrowDown' || event.key === forward ? 1 : event.key === 'ArrowUp' || event.key === backward ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (codes.indexOf(value) + delta + codes.length) % codes.length;
    const code = codes[next];
    if (code === undefined) return;
    onChange(code);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="mt-2 flex flex-col overflow-hidden rounded-card"
      style={{ backgroundColor: 'var(--color-ios-card)' }}
    >
      {codes.map((code, index) => {
        const selected = code === value;
        return (
          <button
            key={code}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-world-language={code}
            lang={code}
            onClick={() => onChange(code)}
            className="flex min-h-[50px] items-center gap-3 border-b px-4 text-start text-[17px] last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-ios-ink-2) 12%, transparent)',
              backgroundColor: selected ? 'color-mix(in srgb, var(--ios-indigo-500) 14%, transparent)' : 'transparent',
              color: INK,
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            <span className="flex-1">{endonym(code)}</span>
            <span aria-hidden="true" className="text-[13px]" style={{ color: INK_2 }}>
              {code.toUpperCase()}
            </span>
            <span aria-hidden="true" className="grid size-[18px] place-items-center">
              {selected ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ios-brand)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
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
