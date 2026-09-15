import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { Glyph } from '@/components/glyph';
import { conversationsQuery } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { performCreateShareLink, type CreateShareLinkOutcome } from '@/lib/api/link-actions';
import { defaultShareLinkDraft, type ShareLinkDraft } from '@/lib/api/links';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { titleOf } from '@/lib/view/conversation';
import { eligibleForShareLink } from '@/lib/view/share-link-eligibility';
import { LinksGlyph, LinksHeader, LinksOfflineNotice } from '@/routes/links-parts';
import { href, navigate } from '@/routes/route-table';
import {
  ACCESS_RULES,
  ConversationChoice,
  ConversationPicker,
  CreateLinkButton,
  FormSection,
  LimitsFields,
  PERMISSION_RULES,
  RulesSection,
  TextRow,
  type PickableConversation,
} from '@/routes/share-link-form';

/**
 * **NOUVEAU LIEN DE PARTAGE** (#6361) — miroir `CreateShareLinkView.swift` : la
 * conversation (jamais un DM, et un groupe seulement pour un modérateur —
 * `canCreateShareLink`, la règle de la feuille de partage d'un fil), l'identité
 * du lien, l'accès des invités, leurs permissions, les limites.
 *
 * **La création attend la passerelle** (`performCreateShareLink`, même arbitrage
 * que D-60) : le bouton passe « Création en cours… » au geste, puis l'écran est
 * REMPLACÉ par le détail du lien créé — le retour ramène à la liste, où il se
 * lit en tête. Hors ligne, rien ne part et le bouton le dit en se désactivant.
 */

type Feedback = 'links.create.error.conversation' | 'links.create.error.offline' | 'links.create.error.refused' | 'links.create.error.default';

const FAILURE: Readonly<Record<Extract<CreateShareLinkOutcome['status'], 'offline' | 'refused' | 'error'>, Feedback>> = {
  offline: 'links.create.error.offline',
  refused: 'links.create.error.refused',
  error: 'links.create.error.default',
};

export default function ShareLinkNewScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const session = useStore(sessionStore, (state) => state.session);
  const viewerId = resolveViewer({ source: apiDeps.source, session }).id ?? '';
  const conversations = useInfiniteQuery(
    { ...conversationsQuery(apiDeps), enabled: apiDeps.source === 'fixtures' || session.status === 'authenticated' },
    appQueryClient,
  );
  const pickable: readonly PickableConversation[] = useMemo(
    () => eligibleForShareLink(conversations.data ?? []).map((conversation) => ({ id: conversation.id, title: titleOf(conversation, viewerId) })),
    [conversations.data, viewerId],
  );

  const [draft, setDraft] = useState<ShareLinkDraft>(() => defaultShareLinkDraft(null));
  const [chosen, setChosen] = useState<PickableConversation | null>(null);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [maxUsesInvalid, setMaxUsesInvalid] = useState(false);

  const edit = <K extends keyof ShareLinkDraft>(key: K, value: ShareLinkDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
    if (key === 'maxUses' || key === 'limitUses') setMaxUsesInvalid(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);
    const outcome = await performCreateShareLink({
      draft,
      conversationTitle: chosen?.title ?? null,
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine },
      now: new Date(),
    });
    if (outcome.status === 'created') {
      navigate(href('shareLink', { link: outcome.link.linkId }), true);
      return;
    }
    setSubmitting(false);
    if (outcome.status !== 'invalid') {
      setFeedback(FAILURE[outcome.status]);
      return;
    }
    if (outcome.field === 'maxUses') setMaxUsesInvalid(true);
    else setFeedback('links.create.error.conversation');
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <LinksHeader language={language} back="shareLinks" backLabel={translate(language, 'links.detail.back')} title={translate(language, 'links.create.title')} />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <form noValidate onSubmit={(event) => void submit(event)} className="mx-auto grid max-w-xl gap-6 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          <FormSection id="link-section-conversation" title={translate(language, 'links.create.section.conversation')} subtitle={null} icon={<LinksGlyph name="chatsCircle" size={12} />}>
            <ConversationChoice language={language} conversation={chosen} invalid={feedback === 'links.create.error.conversation'} onOpen={() => setPicking(true)} />
          </FormSection>
          <FormSection id="link-section-identity" title={translate(language, 'links.create.section.identity')} subtitle={null} icon={<LinksGlyph name="tag" size={12} />}>
            <TextRow
              id="link-name"
              label={translate(language, 'links.create.name')}
              placeholder={translate(language, 'links.create.name.placeholder')}
              value={draft.name}
              onChange={(value) => edit('name', value)}
            />
            <TextRow
              id="link-description"
              label={translate(language, 'links.create.description')}
              placeholder={translate(language, 'links.create.description.placeholder')}
              value={draft.description}
              onChange={(value) => edit('description', value)}
            />
          </FormSection>
          <RulesSection
            language={language}
            id="link-section-access"
            title={translate(language, 'links.create.section.access')}
            subtitle={translate(language, 'links.create.section.access.subtitle')}
            icon={<Glyph name="key" size={12} />}
            rules={ACCESS_RULES}
            draft={draft}
            onToggle={(key, next) => edit(key, next)}
          />
          <RulesSection
            language={language}
            id="link-section-permissions"
            title={translate(language, 'links.create.section.permissions')}
            subtitle={translate(language, 'links.create.section.permissions.subtitle')}
            icon={<LinksGlyph name="slidersHorizontal" size={12} />}
            rules={PERMISSION_RULES}
            draft={draft}
            onToggle={(key, next) => edit(key, next)}
          />
          <FormSection
            id="link-section-limits"
            title={translate(language, 'links.create.section.limits')}
            subtitle={translate(language, 'links.create.section.limits.subtitle')}
            icon={<LinksGlyph name="gauge" size={12} />}
          >
            <LimitsFields
              language={language}
              draft={draft}
              maxUsesInvalid={maxUsesInvalid}
              onLimitUses={(next) => edit('limitUses', next)}
              onMaxUses={(value) => edit('maxUses', value)}
              onExpiration={(value) => edit('expiration', value)}
            />
          </FormSection>
          {feedback === null ? null : (
            <p role="alert" data-link-create-error className="text-center text-caption font-medium" style={{ color: 'var(--color-error)' }}>
              {translate(language, feedback)}
            </p>
          )}
          <CreateLinkButton language={language} submitting={submitting} disabled={submitting || !online || chosen === null} />
        </form>
      </main>
      {picking ? (
        <ConversationPicker
          language={language}
          conversations={pickable}
          onPick={(conversation) => {
            setChosen(conversation);
            edit('conversationId', conversation.id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
