import { useQuery, type InfiniteData } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useStore } from 'zustand/react';

import { ChromeActionDisc, CHROME_ACTION_HIT_CLASS } from '@/components/chrome-action';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import { GroupedSection } from '@/components/grouped-section';
import { ApiError } from '@/lib/api/client';
import { COMMUNITIES_QUERY_PREFIX, communityQueryOptions, type CommunityPage } from '@/lib/api/communities';
import type { CommunityActionDeps } from '@/lib/api/community-actions';
import {
  canEditSettingsOf,
  performDeleteCommunity,
  performUpdateCommunitySettings,
  settingsChangesOf,
  settingsDraftOf,
  type CommunitySettingsDraft,
  type CommunitySettingsField,
  type DeleteCommunityOutcome,
  type UpdateSettingsOutcome,
} from '@/lib/api/community-settings';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { findCachedCommunity } from '@/lib/communities/view';
import { translate } from '@/lib/i18n-catalog';
import { translateCommunitySettings, type CommunitySettingsCatalogKey } from '@/lib/i18n-community-settings-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { COMMUNITIES_HEADER_HEIGHT, CommunitiesOfflineNotice, CommunityDetailSkeleton, CommunityRefused, PrivacyToggle } from '@/routes/communities-parts';
import { SettingsCreatorOnly, SettingsDangerZone, SettingsSaveButton } from '@/routes/community-settings-parts';
import { href, Link, navigate } from '@/routes/route-table';

/**
 * **LES RÉGLAGES D'UNE COMMUNAUTÉ** (#6377) — miroir `Route.communitySettings`
 * (`CommunitySettingsView` → `CommunitySettingsScreen`, iOS) : nom,
 * description, confidentialité, puis la zone dangereuse (supprimer, confirmé).
 *
 * **Réservé au créateur**, comme la passerelle (`PUT` / `DELETE
 * communities.byId`, 403 `COMMUNITY_CREATOR_ONLY`) : un autre lecteur qui
 * arrive par l'adresse voit le refus dessiné, jamais un formulaire qui
 * échouerait à l'envoi. Le détail n'offre « Réglages » qu'au créateur.
 *
 * **Cache d'abord.** La fiche vient du détail ou de la liste qui y a mené ; le
 * formulaire se remplit aussitôt. **Optimiste** : « Enregistrer » peint le
 * nouveau nom partout au geste et rend l'ancien sur un refus
 * (`community-settings.ts`). Supprimer ramène à la liste, où la carte a déjà
 * disparu.
 *
 * Ce que l'écran ne montre pas encore : l'avatar et la bannière (seconde
 * moitié de #6377). L'emoji et la couleur d'iOS ne quittent pas l'appareil :
 * aucun champ serveur ne les porte, le web ne les imite pas.
 */

const FIELD_TINT = 'var(--color-ios-brand)';
const ERROR_INK = 'var(--color-error)';

type NoticeKey = Exclude<CommunitySettingsCatalogKey, 'community.settings.delete.confirm.title'>;
type Notice = { readonly key: NoticeKey; readonly tone: 'status' | 'alert'; readonly field: CommunitySettingsField | null };

const FIELD_ERRORS: Readonly<Record<CommunitySettingsField, NoticeKey>> = {
  name: 'community.settings.error.name',
  description: 'community.settings.error.description',
};

function noticeOfSave(outcome: UpdateSettingsOutcome): Notice | null {
  switch (outcome.status) {
    case 'saved':
      return { key: 'community.settings.saved', tone: 'status', field: null };
    case 'unchanged':
      return null;
    case 'invalid':
      return { key: FIELD_ERRORS[outcome.field], tone: 'alert', field: outcome.field };
    case 'refused':
      return { key: 'community.settings.error.refused', tone: 'alert', field: null };
    case 'gone':
      return { key: 'community.settings.error.gone', tone: 'alert', field: null };
    case 'offline':
      return { key: 'community.settings.error.offline', tone: 'status', field: null };
    case 'error':
      return { key: 'community.settings.error.default', tone: 'alert', field: null };
  }
}

function noticeOfDelete(outcome: Exclude<DeleteCommunityOutcome, { readonly status: 'deleted' }>): Notice {
  if (outcome.status === 'refused') return { key: 'community.settings.error.refused', tone: 'alert', field: null };
  if (outcome.status === 'offline') return { key: 'community.settings.error.offline', tone: 'status', field: null };
  return { key: 'community.settings.error.default', tone: 'alert', field: null };
}

export default function CommunitySettingsScreen() {
  const { community: communityId } = useParams<'/communities/$community/settings'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const viewerId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  const enabled = apiDeps.source === 'fixtures' || signedIn;
  const [edited, setEdited] = useState<CommunitySettingsDraft | null>(null);
  const [focused, setFocused] = useState<CommunitySettingsField | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deps] = useState<CommunityActionDeps>(() => ({ ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine }));

  const detail = useQuery(
    {
      ...communityQueryOptions(apiDeps, communityId),
      enabled,
      initialData: () =>
        findCachedCommunity(
          appQueryClient.getQueriesData<InfiniteData<CommunityPage, number>>({ queryKey: [...COMMUNITIES_QUERY_PREFIX, 'list'] }).map(([, data]) => data),
          communityId,
        ),
    },
    appQueryClient,
  );
  const community = detail.data;
  const refused = detail.error instanceof ApiError && (detail.error.status === 403 || detail.error.status === 404);
  const draft = edited ?? (community === undefined ? null : settingsDraftOf(community));
  const changes = community === undefined || draft === null ? null : settingsChangesOf(community, draft);
  const changed = changes !== null && (!changes.ok || changes.body !== null);

  const edit = (patch: Partial<CommunitySettingsDraft>) => {
    if (draft === null) return;
    setEdited({ ...draft, ...patch });
    setNotice(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (community === undefined || draft === null || saving) return;
    setSaving(true);
    setNotice(null);
    const outcome = await performUpdateCommunitySettings({ community, draft, deps });
    setSaving(false);
    setNotice(noticeOfSave(outcome));
    if (outcome.status === 'saved' || outcome.status === 'unchanged') setEdited(null);
  };

  const remove = async () => {
    setConfirmingDelete(false);
    if (community === undefined || deleting) return;
    setDeleting(true);
    setNotice(null);
    const outcome = await performDeleteCommunity({ community, deps });
    if (outcome.status === 'deleted') {
      navigate(href('communities'), true);
      return;
    }
    setDeleting(false);
    setNotice(noticeOfDelete(outcome));
  };

  const fieldError = (field: CommunitySettingsField) =>
    notice !== null && notice.field === field ? translateCommunitySettings(language, notice.key) : undefined;
  const general = notice !== null && notice.field === null ? notice : null;
  const busy = saving || deleting;

  const body =
    community === undefined || draft === null ? (
      refused ? <CommunityRefused language={language} /> : <CommunityDetailSkeleton language={language} />
    ) : !canEditSettingsOf(community, viewerId) ? (
      <SettingsCreatorOnly language={language} />
    ) : (
      <>
        <form noValidate onSubmit={(event) => void save(event)} className="grid gap-6">
          <GroupedSection id="community-settings-info" title={translateCommunitySettings(language, 'community.settings.section.info')} icon={<Glyph name="users" size={14} />} card={false}>
            <div className="grid gap-4">
              <Field
                id="community-settings-name"
                label={translateCommunitySettings(language, 'community.settings.field.name')}
                tint={FIELD_TINT}
                focused={focused === 'name'}
                error={fieldError('name')}
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
                    placeholder={translateCommunitySettings(language, 'community.settings.field.name.placeholder')}
                    onInput={(event) => edit({ name: event.currentTarget.value })}
                    onFocus={() => setFocused('name')}
                    onBlur={() => setFocused(null)}
                    className="w-0 min-w-0 flex-1 bg-transparent text-body outline-none"
                    style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
                  />
                )}
              </Field>
              <Field
                id="community-settings-description"
                label={translateCommunitySettings(language, 'community.settings.field.description')}
                tint={FIELD_TINT}
                focused={focused === 'description'}
                error={fieldError('description')}
              >
                {({ id, describedBy }) => (
                  <textarea
                    id={id}
                    aria-describedby={describedBy}
                    rows={3}
                    maxLength={500}
                    value={draft.description}
                    placeholder={translateCommunitySettings(language, 'community.settings.field.description.placeholder')}
                    onInput={(event) => edit({ description: event.currentTarget.value })}
                    onFocus={() => setFocused('description')}
                    onBlur={() => setFocused(null)}
                    className="w-0 min-w-0 flex-1 resize-none bg-transparent py-3 text-body outline-none"
                    style={{ color: 'var(--color-ios-ink)' }}
                  />
                )}
              </Field>
            </div>
          </GroupedSection>
          <GroupedSection id="community-settings-privacy" title={translateCommunitySettings(language, 'community.settings.section.privacy')} icon={<Glyph name="lock" size={14} />} card={false}>
            <PrivacyToggle language={language} isPrivate={draft.isPrivate} onToggle={(isPrivate) => edit({ isPrivate })} />
          </GroupedSection>
          <SettingsSaveButton language={language} saving={saving} disabled={busy || !online || !changed} />
        </form>
        <SettingsDangerZone language={language} disabled={busy || !online} onDelete={() => setConfirmingDelete(true)} />
      </>
    );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 px-2 pt-safe">
        <div className="flex items-center gap-2" style={{ height: COMMUNITIES_HEADER_HEIGHT }}>
          <Link
            to="community"
            params={{ community: communityId }}
            aria-label={translate(language, 'community.detail.back')}
            data-community-settings-back
            className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
            style={{ color: 'var(--color-ios-brand)' }}
          >
            <ChromeActionDisc>
              <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
            </ChromeActionDisc>
          </Link>
          <h1 className="grid min-w-0 text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            <span>{translateCommunitySettings(language, 'community.settings.title')}</span>
            {community === undefined ? null : (
              <span className="truncate text-caption font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
                {community.name}
              </span>
            )}
          </h1>
        </div>
      </header>
      <main id="contenu" className="flex-1 overflow-y-auto pb-safe">
        <div className="mx-auto grid max-w-xl gap-6 px-4 pb-24 pt-2">
          {online ? null : <CommunitiesOfflineNotice language={language} />}
          {body}
          <p
            role={general?.tone ?? 'status'}
            aria-live="polite"
            data-community-settings-notice={general?.key ?? ''}
            className="text-center text-caption empty:hidden"
            style={{ color: general?.tone === 'alert' ? ERROR_INK : 'var(--color-ios-ink-2)' }}
          >
            {general === null ? '' : translateCommunitySettings(language, general.key)}
          </p>
        </div>
      </main>
      {confirmingDelete && community !== undefined ? (
        <ConfirmDialog
          name="community-delete"
          title={translateCommunitySettings(language, 'community.settings.delete.confirm.title', { name: community.name })}
          body={translateCommunitySettings(language, 'community.settings.delete.confirm.body')}
          cancelLabel={translate(language, 'common.cancel')}
          confirmLabel={translateCommunitySettings(language, 'community.settings.delete.confirm.action')}
          tone="destructive"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </div>
  );
}
