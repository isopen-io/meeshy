import { useState, type FormEvent } from 'react';

import { Field } from '@/components/field';
import type { CommunityDraft } from '@/lib/api/communities';
import { performCreateCommunity, type CreateCommunityOutcome } from '@/lib/api/community-actions';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import {
  BackLink,
  COMMUNITIES_HEADER_HEIGHT,
  CommunitiesOfflineNotice,
  CommunityPreviewCard,
  PrivacyToggle,
  SubmitButton,
} from '@/routes/communities-parts';
import { href, navigate } from '@/routes/route-table';

/**
 * **CRÉER UNE COMMUNAUTÉ** (#6364) — miroir `CommunityCreateView.swift` :
 * aperçu vivant, nom, identifiant `mshy_…`, description, confidentialité, puis
 * « Créer la communauté ». Créée, elle REMPLACE cet écran par son détail — le
 * retour arrière ramène à la liste, comme `router.pop()` puis `push(detail)`.
 *
 * **Deux absences assumées** (D-60). Le choix d'emoji d'iOS ne part nulle part
 * (`selectedEmoji` n'est ni envoyé ni stocké) : c'est un contrôle sans effet,
 * suivi côté iOS (#6380). L'ajout de membres à la création est porté par
 * l'invitation (#6376).
 *
 * Un refus se pose SOUS son champ (409 : l'identifiant) ; hors ligne, le bouton
 * est désactivé et l'écran le dit — rien ne part, rien n'est simulé.
 */

const FIELD_TINT = 'var(--color-ios-brand)';
const EMPTY_DRAFT: CommunityDraft = { name: '', identifier: '', description: '', isPrivate: true };

type TextField = Exclude<keyof CommunityDraft, 'isPrivate'>;
type FeedbackKey =
  | 'community.create.error.name'
  | 'community.create.error.identifier'
  | 'community.create.error.description'
  | 'community.create.error.conflict'
  | 'community.create.error.offline'
  | 'community.create.error.default';
type Feedback = { readonly field: TextField | null; readonly key: FeedbackKey };

const FIELD_ERRORS: Readonly<Record<TextField, FeedbackKey>> = {
  name: 'community.create.error.name',
  identifier: 'community.create.error.identifier',
  description: 'community.create.error.description',
};

function feedbackOf(outcome: Exclude<CreateCommunityOutcome, { readonly status: 'created' }>): Feedback {
  if (outcome.status === 'conflict') return { field: 'identifier', key: 'community.create.error.conflict' };
  if (outcome.status === 'offline') return { field: null, key: 'community.create.error.offline' };
  if (outcome.status === 'invalid' && outcome.field !== 'isPrivate') return { field: outcome.field, key: FIELD_ERRORS[outcome.field] };
  return { field: null, key: 'community.create.error.default' };
}

const errorFor = (language: InterfaceLanguage, feedback: Feedback | null, field: TextField): string | undefined =>
  feedback !== null && feedback.field === field ? translate(language, feedback.key) : undefined;

export default function CommunityNewScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const [draft, setDraft] = useState<CommunityDraft>(EMPTY_DRAFT);
  const [focused, setFocused] = useState<TextField | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const edit = (field: TextField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (feedback?.field === field) setFeedback(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);
    const outcome = await performCreateCommunity({
      draft,
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine },
    });
    if (outcome.status === 'created') {
      navigate(href('community', { community: outcome.community.id }), true);
      return;
    }
    setSubmitting(false);
    setFeedback(feedbackOf(outcome));
  };

  const general = feedback !== null && feedback.field === null ? translate(language, feedback.key) : null;
  const disabled = submitting || !online || draft.name.trim() === '';

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: COMMUNITIES_HEADER_HEIGHT }}>
        <BackLink to="communities" label={translate(language, 'community.detail.back')} />
        <h1 className="min-w-0 flex-1 truncate text-center text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'community.create.title')}
        </h1>
        <span aria-hidden="true" className="block shrink-0" style={{ width: 44 }} />
      </header>
      <main id="contenu" className="flex-1 overflow-y-auto px-5 pb-safe">
        <form noValidate onSubmit={(event) => void submit(event)} className="mx-auto grid max-w-xl gap-6 pb-24 pt-2">
          {online ? null : <CommunitiesOfflineNotice language={language} />}
          <CommunityPreviewCard language={language} draft={draft} />
          <div className="grid gap-4">
            <Field
              id="community-name"
              label={translate(language, 'community.create.field.name')}
              tint={FIELD_TINT}
              focused={focused === 'name'}
              error={errorFor(language, feedback, 'name')}
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-required="true"
                  required
                  autoComplete="off"
                  maxLength={100}
                  value={draft.name}
                  placeholder={translate(language, 'community.create.field.name.placeholder')}
                  onChange={(event) => edit('name', event.currentTarget.value)}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  className="min-w-0 flex-1 bg-transparent text-body outline-none"
                  style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
                />
              )}
            </Field>
            <Field
              id="community-identifier"
              label={translate(language, 'community.create.field.identifier')}
              tint={FIELD_TINT}
              focused={focused === 'identifier'}
              error={errorFor(language, feedback, 'identifier')}
            >
              {({ id, describedBy }) => (
                <>
                  <span aria-hidden="true" className="shrink-0 font-mono text-caption font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
                    mshy_
                  </span>
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={50}
                    value={draft.identifier}
                    placeholder={translate(language, 'community.create.field.identifier.placeholder')}
                    onChange={(event) => edit('identifier', event.currentTarget.value)}
                    onFocus={() => setFocused('identifier')}
                    onBlur={() => setFocused(null)}
                    className="-ms-2 min-w-0 flex-1 bg-transparent text-body outline-none"
                    style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
                  />
                </>
              )}
            </Field>
            <Field
              id="community-description"
              label={translate(language, 'community.create.field.description')}
              tint={FIELD_TINT}
              focused={focused === 'description'}
              error={errorFor(language, feedback, 'description')}
            >
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  aria-describedby={describedBy}
                  rows={3}
                  maxLength={500}
                  value={draft.description}
                  placeholder={translate(language, 'community.create.field.description.placeholder')}
                  onChange={(event) => edit('description', event.currentTarget.value)}
                  onFocus={() => setFocused('description')}
                  onBlur={() => setFocused(null)}
                  className="min-w-0 flex-1 resize-none bg-transparent py-3 text-body outline-none"
                  style={{ color: 'var(--color-ios-ink)' }}
                />
              )}
            </Field>
          </div>
          <PrivacyToggle language={language} isPrivate={draft.isPrivate} onToggle={(isPrivate) => setDraft((current) => ({ ...current, isPrivate }))} />
          <SubmitButton language={language} submitting={submitting} disabled={disabled} />
          <p role="status" aria-live="polite" data-community-notice className="text-center text-caption empty:hidden" style={{ color: 'var(--ios-error)' }}>
            {general ?? ''}
          </p>
        </form>
      </main>
    </div>
  );
}
