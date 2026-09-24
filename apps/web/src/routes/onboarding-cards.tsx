import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import type { OnboardingSuggestion, StoryDefaultVisibility } from '@meeshy/shared/types/onboarding';
import { useId, useRef, useState, type ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { GlyphSvg } from '@/components/glyph';
import { DISCOVER_GLYPHS } from '@/components/glyphs-discover';
import { STORY_AUDIENCE_GLYPHS } from '@/components/glyphs-story-audience';
import { LanguageSheet } from '@/components/language-sheet';
import type { FriendActionOutcome } from '@/lib/api/friend-actions';
import { translateOnboarding } from '@/lib/i18n-onboarding-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { greetingTemplates } from '@/lib/onboarding/greetings';
import { greetingDraft, LEVEL_ONE_POINTS, type GreetingDraft } from '@/lib/onboarding/journey';
import { initialsOf } from '@/lib/view/conversation';

import {
  BellIllustration,
  Chip,
  flagOf,
  FriendsIllustration,
  GlobalIllustration,
  LevelGauge,
  PrimaryButton,
  PrismIllustration,
  SecondaryButton,
  StoryIllustration,
} from './onboarding-visuals';

/**
 * **LES CARTES DE L'ACCUEIL** (#7729) — le miroir web d'`OnboardingCards.swift`.
 *
 * Chaque carte est UN conteneur (`role="group"`, nommé par son titre) lu dans
 * l'ordre titre → phrase → contenu → action → « Plus tard ». Chacune se
 * termine par un geste RÉEL : la langue s'enregistre sur le profil, le salut
 * part dans Meeshy Global par le chemin d'envoi du fil, la story s'ouvre dans
 * le studio, les demandes d'ami partent par le geste de Découvrir. Aucune
 * récompense n'est annoncée avant l'accusé qui la fonde.
 */

export type CardHost = {
  readonly lang: InterfaceLanguage;
  readonly online: boolean;
  readonly points: number;
};

export function CardFrame({
  step,
  title,
  body,
  illustration,
  children,
  actions,
}: {
  readonly step: string;
  readonly title: string;
  readonly body: string;
  readonly illustration: ReactNode;
  readonly children?: ReactNode;
  readonly actions: ReactNode;
}) {
  const titleId = useId();
  return (
    <section data-onb-card={step} role="group" aria-labelledby={titleId} className="onb-card-frame">
      <div className="onb-card-scroll">
        <div className="onb-card glass glass-card">
          {illustration}
          <div className="onb-card-text">
            <h1 id={titleId} className="onb-title">
              {title}
            </h1>
            <p className="onb-body">{body}</p>
          </div>
          {children}
        </div>
      </div>
      <div className="onb-actions">{actions}</div>
    </section>
  );
}

// --- 1. Les langues -----------------------------------------------------------

const SECOND_LANGUAGE_CHOICES = ['en', 'fr', 'es', 'ar', 'pt', 'de', 'it', 'zh'] as const;

export function languageNameIn(lang: InterfaceLanguage, code: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function listIn(lang: InterfaceLanguage, names: readonly string[]): string {
  try {
    return new Intl.ListFormat([lang], { type: 'conjunction' }).format(names);
  } catch {
    return names.join(', ');
  }
}

export type LanguagesSave = 'saved' | 'offline' | 'failed';

export function LanguagesCard({
  host,
  initialPrimary,
  initialSecondary,
  save,
  onDone,
  onLater,
}: {
  readonly host: CardHost;
  readonly initialPrimary: string;
  readonly initialSecondary: string | null;
  readonly save: (patch: { readonly systemLanguage: string; readonly regionalLanguage: string }) => Promise<LanguagesSave>;
  readonly onDone: () => void;
  readonly onLater: () => void;
}) {
  const lang = host.lang;
  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState<string | null>(initialSecondary);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const choices = SECOND_LANGUAGE_CHOICES.filter((code) => code !== primary).slice(0, 6);

  const confirm = async () => {
    const unchanged = primary === initialPrimary && secondary === initialSecondary;
    if (unchanged) return onDone();
    setBusy(true);
    setFailed(false);
    const outcome = await save({ systemLanguage: primary, regionalLanguage: secondary ?? '' });
    setBusy(false);
    if (outcome === 'failed') return setFailed(true);
    onDone();
  };

  return (
    <CardFrame
      step="languages"
      title={translateOnboarding(lang, 'onboarding.languages.title')}
      body={translateOnboarding(lang, 'onboarding.languages.body')}
      illustration={<PrismIllustration lang={host.lang} />}
      actions={
        <>
          <PrimaryButton id="languages.confirm" onClick={() => void confirm()} busy={busy}>
            {translateOnboarding(lang, 'onboarding.languages.confirm')}
          </PrimaryButton>
          <SecondaryButton id="languages.later" onClick={onLater}>
            {translateOnboarding(lang, 'onboarding.later')}
          </SecondaryButton>
        </>
      }
    >
      <LevelGauge points={host.points} target={LEVEL_ONE_POINTS} lang={host.lang} />
      <div className="onb-field">
        <span className="onb-field-label">{translateOnboarding(lang, 'onboarding.languages.primary')}</span>
        <div className="onb-language-row">
          <span className="onb-language-main" lang={primary}>
            <span aria-hidden="true">{flagOf(primary)}</span>
            {languageNameIn(host.lang, primary)}
          </span>
          <button type="button" className="onb-link" data-onb-action="languages.change" onClick={() => setPicking(true)}>
            {translateOnboarding(lang, 'onboarding.languages.change')}
          </button>
        </div>
      </div>
      <div className="onb-field">
        <span className="onb-field-label">{translateOnboarding(lang, 'onboarding.languages.secondary')}</span>
        <div className="onb-chips">
          {choices.map((code) => (
            <Chip key={code} selected={secondary === code} onClick={() => setSecondary((current) => (current === code ? null : code))}>
              <span aria-hidden="true">{flagOf(code)}</span> {languageNameIn(host.lang, code)}
            </Chip>
          ))}
        </div>
      </div>
      {failed ? (
        <p role="alert" className="onb-error">
          {translateOnboarding(lang, 'onboarding.languages.failed')}
        </p>
      ) : null}
      {picking ? (
        <LanguageSheet
          title={translateOnboarding(lang, 'onboarding.languages.pick')}
          selected={primary}
          onSelect={(code) => {
            setPrimary(code);
            if (secondary === code) setSecondary(null);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </CardFrame>
  );
}

// --- 2. Meeshy Global ---------------------------------------------------------

export type GreetingSend = 'sent' | 'failed' | 'offline';

type GlobalPhase = 'draft' | 'sending' | 'sent' | 'failed';

export function GlobalCard({
  host,
  available,
  name,
  languagesLabel,
  pick,
  send,
  onReward,
  onDone,
  onLater,
}: {
  readonly host: CardHost;
  readonly available: boolean;
  readonly name: string;
  readonly languagesLabel: string;
  readonly pick: (count: number) => number;
  readonly send: (content: string) => Promise<GreetingSend>;
  readonly onReward: () => void;
  readonly onDone: () => void;
  readonly onLater: () => void;
}) {
  const lang = host.lang;
  const templates = greetingTemplates(host.lang);
  const draftAt = (index: number): GreetingDraft => greetingDraft({ templates, index, name, languages: languagesLabel });
  const [index, setIndex] = useState(() => pick(templates.length));
  const [draft, setDraft] = useState<GreetingDraft>(() => draftAt(index));
  const [text, setText] = useState(draft.text);
  const [phase, setPhase] = useState<GlobalPhase>('draft');
  const [offline, setOffline] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  const shuffle = () => {
    const next = (index + 1 + pick(Math.max(1, templates.length - 1))) % templates.length;
    const fresh = draftAt(next);
    setIndex(next);
    setDraft(fresh);
    setText(fresh.text);
  };

  const selectHole = () => {
    const input = field.current;
    if (input === null || text !== draft.text) return;
    input.setSelectionRange(draft.holeStart, draft.holeEnd);
  };

  const submit = async () => {
    const content = text.trim();
    if (content === '' || phase === 'sending') return;
    setPhase('sending');
    setOffline(false);
    const outcome = await send(content);
    if (outcome === 'sent') {
      setPhase('sent');
      onReward();
      return;
    }
    setOffline(outcome === 'offline');
    setPhase('failed');
  };

  const sent = phase === 'sent';
  const unavailable = !available;

  return (
    <CardFrame
      step="global"
      title={translateOnboarding(lang, 'onboarding.global.title')}
      body={translateOnboarding(lang, 'onboarding.global.body')}
      illustration={<GlobalIllustration />}
      actions={
        <>
          {sent || unavailable ? (
            <PrimaryButton id="global.continue" onClick={sent ? onDone : onLater}>
              {translateOnboarding(lang, 'onboarding.continue')}
            </PrimaryButton>
          ) : (
            <PrimaryButton id="global.send" onClick={() => void submit()} busy={phase === 'sending'} disabled={!host.online || text.trim() === ''}>
              {phase === 'sending' ? translateOnboarding(lang, 'onboarding.global.sending') : translateOnboarding(lang, 'onboarding.global.send')}
            </PrimaryButton>
          )}
          {sent ? null : (
            <SecondaryButton id="global.later" onClick={onLater}>
              {translateOnboarding(lang, 'onboarding.later')}
            </SecondaryButton>
          )}
        </>
      }
    >
      {unavailable ? (
        <p className="onb-note">{translateOnboarding(lang, 'onboarding.global.unavailable')}</p>
      ) : sent ? (
        <div className="onb-sent" data-onb-sent>
          <div className="onb-sent-bubble" lang={host.lang}>
            {text.trim()}
          </div>
          <p className="onb-sent-title">{translateOnboarding(lang, 'onboarding.global.sent')}</p>
          <div className="onb-rewards">
            <span className="onb-reward-chip">{translateOnboarding(lang, 'onboarding.global.badge')}</span>
            <span className="onb-reward-chip onb-reward-chip-warm">{translateOnboarding(lang, 'onboarding.global.streak')}</span>
          </div>
          <LevelGauge points={host.points} target={LEVEL_ONE_POINTS} lang={host.lang} />
        </div>
      ) : (
        <div className="onb-composer">
          <label htmlFor={fieldId} className="onb-field-label">
            {translateOnboarding(lang, 'onboarding.global.field')}
          </label>
          <textarea
            id={fieldId}
            ref={field}
            data-onb-greeting
            className="onb-textarea"
            rows={3}
            maxLength={500}
            value={text}
            lang={host.lang}
            onInput={(event) => setText(event.currentTarget.value)}
            onFocus={selectHole}
          />
          <div className="onb-composer-foot">
            <button type="button" className="onb-link" data-onb-action="global.shuffle" onClick={shuffle} disabled={phase === 'sending'}>
              ↻ {translateOnboarding(lang, 'onboarding.global.shuffle')}
            </button>
            <span className="onb-reward-hint">{translateOnboarding(lang, 'onboarding.global.reward')}</span>
          </div>
          {!host.online ? <p className="onb-note">{translateOnboarding(lang, 'onboarding.offline')}</p> : null}
          {phase === 'failed' ? (
            <p role="alert" className="onb-error">
              {offline ? translateOnboarding(lang, 'onboarding.offline') : translateOnboarding(lang, 'onboarding.global.failed')}
            </p>
          ) : null}
        </div>
      )}
    </CardFrame>
  );
}

// --- 3. La première story -----------------------------------------------------

export function StoryCard({
  host,
  audience,
  name,
  avatar,
  published,
  onOpen,
  onDone,
  onLater,
}: {
  readonly host: CardHost;
  readonly audience: StoryDefaultVisibility;
  readonly name: string;
  readonly avatar: string | undefined;
  readonly published: boolean;
  readonly onOpen: () => void;
  readonly onDone: () => void;
  readonly onLater: () => void;
}) {
  const lang = host.lang;
  return (
    <CardFrame
      step="story"
      title={translateOnboarding(lang, 'onboarding.story.title')}
      body={translateOnboarding(lang, 'onboarding.story.body')}
      illustration={<StoryIllustration name={name} avatar={avatar} published={published} />}
      actions={
        published ? (
          <PrimaryButton id="story.continue" onClick={onDone}>
            {translateOnboarding(lang, 'onboarding.continue')}
          </PrimaryButton>
        ) : (
          <>
            <PrimaryButton id="story.create" onClick={onOpen} disabled={!host.online}>
              {translateOnboarding(lang, 'onboarding.story.create')}
            </PrimaryButton>
            <SecondaryButton id="story.later" onClick={onLater}>
              {translateOnboarding(lang, 'onboarding.later')}
            </SecondaryButton>
          </>
        )
      }
    >
      {published ? (
        <p className="onb-sent-title" data-onb-sent>
          {translateOnboarding(lang, 'onboarding.story.done')}
        </p>
      ) : (
        <div className="onb-audience" data-audience={audience}>
          <GlyphSvg glyph={audience === 'public' ? STORY_AUDIENCE_GLYPHS.globe : STORY_AUDIENCE_GLYPHS.usersThree} size={20} />
          <span>{audience === 'public' ? translateOnboarding(lang, 'onboarding.story.audience.public') : translateOnboarding(lang, 'onboarding.story.audience.friends')}</span>
        </div>
      )}
      {published ? null : <span className="onb-reward-hint onb-reward-hint-center">{translateOnboarding(lang, 'onboarding.story.reward')}</span>}
      {!host.online && !published ? <p className="onb-note">{translateOnboarding(lang, 'onboarding.offline')}</p> : null}
      <LevelGauge points={host.points} target={LEVEL_ONE_POINTS} lang={host.lang} />
    </CardFrame>
  );
}

// --- 4. La bande --------------------------------------------------------------

const FRIENDS_GOAL = 3;

type RequestPhase = 'idle' | 'sending' | 'sent' | 'failed';

export function FriendsCard({
  host,
  suggestions,
  alreadySent,
  add,
  onSent,
  onDone,
  onLater,
}: {
  readonly host: CardHost;
  readonly suggestions: readonly OnboardingSuggestion[];
  readonly alreadySent: readonly string[];
  readonly add: (suggestion: OnboardingSuggestion) => Promise<FriendActionOutcome>;
  readonly onSent: (userId: string) => void;
  readonly onDone: () => void;
  readonly onLater: () => void;
}) {
  const lang = host.lang;
  const [phases, setPhases] = useState<Readonly<Record<string, RequestPhase>>>(() =>
    Object.fromEntries(alreadySent.map((id) => [id, 'sent' as const])),
  );
  const sentCount = Object.values(phases).filter((phase) => phase === 'sent').length;

  const request = async (suggestion: OnboardingSuggestion) => {
    const current = phases[suggestion.id];
    if (current === 'sending' || current === 'sent') return;
    setPhases((all) => ({ ...all, [suggestion.id]: 'sending' }));
    const outcome = await add(suggestion);
    setPhases((all) => ({ ...all, [suggestion.id]: outcome === 'done' ? 'sent' : 'failed' }));
    if (outcome === 'done') onSent(suggestion.id);
  };

  const speaks = (languages: readonly string[]) =>
    translateOnboarding(lang, 'onboarding.friends.speaks', { languages: listIn(lang, languages.map((code) => languageNameIn(lang, code))) });

  return (
    <CardFrame
      step="friends"
      title={translateOnboarding(lang, 'onboarding.friends.title')}
      body={translateOnboarding(lang, 'onboarding.friends.body')}
      illustration={<FriendsIllustration />}
      actions={
        <>
          <PrimaryButton id="friends.continue" onClick={sentCount > 0 ? onDone : onLater}>
            {translateOnboarding(lang, 'onboarding.continue')}
          </PrimaryButton>
          {sentCount > 0 ? null : (
            <SecondaryButton id="friends.later" onClick={onLater}>
              {translateOnboarding(lang, 'onboarding.later')}
            </SecondaryButton>
          )}
        </>
      }
    >
      {suggestions.length === 0 ? (
        <p className="onb-note">{translateOnboarding(lang, 'onboarding.friends.empty')}</p>
      ) : (
        <>
          <div className="onb-friends-head">
            <span className="onb-friends-count" aria-live="polite">
              {translateOnboarding(lang, 'onboarding.friends.count', { count: String(Math.min(sentCount, FRIENDS_GOAL)) })}
            </span>
            <span className="onb-reward-hint">{translateOnboarding(lang, 'onboarding.friends.reward')}</span>
          </div>
          <ul className="onb-people">
            {suggestions.map((suggestion) => {
              const phase = phases[suggestion.id] ?? 'idle';
              return (
                <li key={suggestion.id} className="onb-person" data-onb-person={suggestion.id}>
                  <Avatar
                    initials={initialsOf(suggestion.displayName)}
                    color={colorForName(suggestion.displayName)}
                    size={48}
                    name={suggestion.displayName}
                    {...(suggestion.avatarUrl === null ? {} : { src: suggestion.avatarUrl })}
                  />
                  <span className="onb-person-text">
                    <span className="onb-person-name">
                      <bdi>{suggestion.displayName}</bdi>
                      <span className="onb-person-flags" aria-hidden="true">
                        {suggestion.languages.map(flagOf).join(' ')}
                      </span>
                    </span>
                    <span className="onb-person-langs">{speaks(suggestion.languages)}</span>
                    {phase === 'failed' ? <span className="onb-person-error">{translateOnboarding(lang, 'onboarding.friends.failed')}</span> : null}
                  </span>
                  <button
                    type="button"
                    className={phase === 'sent' ? 'onb-add onb-add-sent' : 'onb-add'}
                    data-onb-action="friends.add"
                    aria-label={phase === 'sent' ? `${suggestion.displayName} — ${translateOnboarding(lang, 'onboarding.friends.added')}` : translateOnboarding(lang, 'onboarding.friends.addNamed', { name: suggestion.displayName })}
                    aria-pressed={phase === 'sent'}
                    disabled={phase === 'sending' || !host.online}
                    onClick={() => void request(suggestion)}
                  >
                    {phase === 'sent' ? (
                      <GlyphSvg glyph={DISCOVER_GLYPHS.userCheck} size={18} />
                    ) : (
                      <GlyphSvg glyph={DISCOVER_GLYPHS.userPlus} size={18} />
                    )}
                    <span>{phase === 'sent' ? translateOnboarding(lang, 'onboarding.friends.added') : translateOnboarding(lang, 'onboarding.friends.add')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!host.online ? <p className="onb-note">{translateOnboarding(lang, 'onboarding.offline')}</p> : null}
        </>
      )}
    </CardFrame>
  );
}

// --- 5. Les notifications -----------------------------------------------------

export function NotificationsCard({ host, onYes, onNo }: { readonly host: CardHost; readonly onYes: () => void; readonly onNo: () => void }) {
  const lang = host.lang;
  return (
    <CardFrame
      step="notifications"
      title={translateOnboarding(lang, 'onboarding.notifications.title')}
      body={translateOnboarding(lang, 'onboarding.notifications.body')}
      illustration={<BellIllustration />}
      actions={
        <>
          <PrimaryButton id="notifications.yes" onClick={onYes}>
            {translateOnboarding(lang, 'onboarding.notifications.yes')}
          </PrimaryButton>
          <SecondaryButton id="notifications.no" onClick={onNo}>
            {translateOnboarding(lang, 'onboarding.notifications.no')}
          </SecondaryButton>
        </>
      }
    />
  );
}
