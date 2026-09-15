import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useStore } from 'zustand/react';

import { LanguageSheet } from '@/components/language-sheet';
import { apiDeps } from '@/lib/api/deps';
import { friendRequestsQueryOptions, pendingRequestsOf } from '@/lib/api/friend-requests';
import {
  myProfileQueryOptions,
  myStatsQueryOptions,
  type MyProfile,
  type ProfileImageKind,
  type ProfilePatch,
} from '@/lib/api/profile';
import {
  performImageUpdate,
  performProfileEdit,
  type ImageUpdateOutcome,
  type ProfileActionDeps,
  type ProfileEditOutcome,
} from '@/lib/api/profile-actions';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore, type SessionUser } from '@/lib/api/session';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { draftOf, draftPatch, type ProfileDraft } from '@/lib/view/profile-draft';
import {
  ContactSection,
  IdentitySection,
  LanguagesSection,
  MemberSinceSection,
  PRISM_RANKS,
  ProfileHeaderBar,
  ProfileHero,
  ProfileHeroSkeleton,
  ProfileLoadError,
  ProfileOfflineNotice,
  ProfileSectionsSkeleton,
  ProgressionEntry,
  RequestsSection,
  StatsSection,
  type PendingImages,
  type PrismRank,
} from '@/routes/profile-sections';

/**
 * **LE PROFIL** (#6289, #5562) — miroir `ProfileView.swift`. Remplace l'écran
 * d'attente de #6214. Son adresse complète l'espace `/me` ouvert par
 * `/me/progression`, et iOS l'ouvre au second tap sur l'avatar du bouton de
 * droite (`RootView.swift:1570-1579`).
 *
 * **Cache d'abord, à deux étages.** La SESSION porte déjà le nom,
 * l'identifiant, l'avatar et les trois langues : la bannière, l'identité et
 * les langues se peignent donc au premier rendu, avant toute requête. Le reste
 * (bio, contact, ancienneté) vient du cache de `GET /me`, persisté ; le
 * squelette n'est dessiné que pour ce qui manque vraiment.
 *
 * **Tout geste est optimiste** (`lib/api/profile-actions.ts`) et se défait
 * sur un refus, que l'écran annonce. Hors ligne, le profil reste lisible et
 * les gestes d'écriture sont désactivés — jamais un « enregistré » qui ne
 * partirait pas.
 *
 * **Changer une langue change TOUT le produit sans rechargement** : la session
 * est écrite au geste, `useReaderLanguages` la lit en primitives, et la liste
 * des conversations est relue à la confirmation.
 */

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

const actionDeps = (): ProfileActionDeps => ({
  ...apiDeps,
  queryClient: appQueryClient,
  session: sessionStore,
  isOnline: () => navigator.onLine,
});

const FIELD_LABELS = {
  displayName: 'profile.display_name',
  firstName: 'profile.first_name',
  lastName: 'profile.last_name',
  bio: 'profile.bio',
  systemLanguage: 'profile.language.primary',
  regionalLanguage: 'profile.language.regional',
  customDestinationLanguage: 'profile.language.custom',
} as const satisfies Readonly<Record<string, InterfaceCatalogKey>>;

function editNotice(language: InterfaceLanguage, outcome: ProfileEditOutcome): string {
  if (outcome.status === 'saved') return translate(language, 'profile.saved');
  if (outcome.status === 'offline') return translate(language, 'profile.save.offline');
  if (outcome.status === 'invalid') {
    const label = Object.entries(FIELD_LABELS).find(([field]) => field === outcome.field)?.[1];
    return label === undefined ? translate(language, 'profile.save.error') : translate(language, 'profile.save.invalid', { field: translate(language, label) });
  }
  return translate(language, 'profile.save.error');
}

function imageNotice(language: InterfaceLanguage, kind: ProfileImageKind, outcome: ImageUpdateOutcome): string {
  if (outcome.status === 'saved') return translate(language, kind === 'avatar' ? 'profile.avatar.updated' : 'profile.banner.updated');
  if (outcome.status === 'offline') return translate(language, 'profile.save.offline');
  if (outcome.status === 'cancelled') return translate(language, 'profile.image.cancelled');
  if (outcome.status === 'unreadable') return translate(language, 'profile.image.unreadable');
  return translate(language, kind === 'avatar' ? 'profile.avatar.error' : 'profile.banner.error');
}

type Identity = Pick<MyProfile, 'username' | 'displayName' | 'avatar' | 'banner'>;
type PrismCodes = Readonly<Record<PrismRank, string | null>>;

const identityOf = (profile: MyProfile | undefined, user: SessionUser | null): Identity | null => {
  if (profile !== undefined) return profile;
  if (user === null) return null;
  return { username: user.username, displayName: user.displayName ?? null, avatar: user.avatar ?? null, banner: null };
};

const prismOf = (profile: MyProfile | undefined, user: SessionUser | null): PrismCodes | null => {
  if (profile !== undefined) return profile;
  if (user === null) return null;
  return {
    systemLanguage: user.systemLanguage ?? null,
    regionalLanguage: user.regionalLanguage ?? null,
    customDestinationLanguage: user.customDestinationLanguage ?? null,
  };
};

const withoutKind = (pending: PendingImages, kind: ProfileImageKind): PendingImages =>
  kind === 'avatar' ? (pending.banner === undefined ? {} : { banner: pending.banner }) : pending.avatar === undefined ? {} : { avatar: pending.avatar };

export default function ProfileScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const sessionUser = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user : null));
  const enabled = apiDeps.source === 'fixtures' || sessionUser !== null;

  const profileQuery = useQuery({ ...myProfileQueryOptions(apiDeps), enabled }, appQueryClient);
  const statsQuery = useQuery({ ...myStatsQueryOptions(apiDeps), enabled }, appQueryClient);
  const receivedRequests = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'received'), enabled }, appQueryClient);
  const profile = profileQuery.data;

  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ readonly text: string; readonly bytes?: number } | null>(null);
  const [openRank, setOpenRank] = useState<PrismRank | null>(null);
  const [pending, setPending] = useState<PendingImages>({});
  const controllers = useRef<Partial<Record<ProfileImageKind, AbortController>>>({});
  const inputs = useRef<Partial<Record<ProfileImageKind, HTMLInputElement | null>>>({});

  useEffect(() => {
    if (notice === null) return undefined;
    const handle = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(handle);
  }, [notice]);

  useEffect(
    () => () => {
      Object.values(controllers.current).forEach((controller) => controller?.abort());
    },
    [],
  );

  const identity = identityOf(profile, sessionUser);
  const prism = prismOf(profile, sessionUser);
  const editing = draft !== null;

  const save = async () => {
    if (draft === null || profile === undefined) return;
    const patch = draftPatch(profile, draft);
    if (Object.keys(patch).length === 0) {
      setDraft(null);
      return;
    }
    const typed = draft;
    setDraft(null);
    setSaving(true);
    const outcome = await performProfileEdit({ patch, deps: actionDeps() });
    setSaving(false);
    if (outcome.status !== 'saved') setDraft(typed);
    setNotice({ text: editNotice(language, outcome) });
  };

  const editPrism = async (patch: ProfilePatch) => {
    const outcome = await performProfileEdit({ patch, deps: actionDeps() });
    if (outcome.status !== 'saved') setNotice({ text: editNotice(language, outcome) });
  };

  const chooseLanguage = (rank: PrismRank, code: string) => {
    setOpenRank(null);
    void editPrism({ [rank]: code });
  };

  const uploadImage = async (kind: ProfileImageKind, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file === undefined) return;
    const preview = URL.createObjectURL(file);
    const controller = new AbortController();
    controllers.current = { ...controllers.current, [kind]: controller };
    setPending((current) => ({ ...current, [kind]: preview }));
    const outcome = await performImageUpdate({ kind, file, signal: controller.signal, deps: actionDeps() });
    URL.revokeObjectURL(preview);
    setPending((current) => withoutKind(current, kind));
    setNotice({ text: imageNotice(language, kind, outcome), ...(outcome.status === 'saved' ? { bytes: outcome.bytesSent } : {}) });
  };

  const openSheetRank = PRISM_RANKS.find((entry) => entry.rank === openRank);

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <ProfileHeaderBar
        language={language}
        editing={editing}
        saving={saving}
        online={online}
        ready={profile !== undefined}
        onEdit={() => profile === undefined || setDraft(draftOf(profile))}
        onCancel={() => setDraft(null)}
        onSave={() => void save()}
      />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-6 pb-24 pt-2">
          {online ? null : <ProfileOfflineNotice language={language} />}
          {identity === null ? (
            <ProfileHeroSkeleton />
          ) : (
            <ProfileHero
              language={language}
              profile={identity}
              editing={editing && online}
              pending={pending}
              onPick={(kind) => inputs.current[kind]?.click()}
              onCancelUpload={(kind) => controllers.current[kind]?.abort()}
            />
          )}
          {profile === undefined ? (
            profileQuery.status === 'error' ? (
              <ProfileLoadError language={language} onRetry={() => void profileQuery.refetch()} />
            ) : (
              <ProfileSectionsSkeleton language={language} />
            )
          ) : (
            <>
              <IdentitySection language={language} profile={profile} editing={editing} draft={draft} onDraft={setDraft} />
              <ContactSection language={language} email={profile.email} phone={profile.phone} />
            </>
          )}
          {prism === null ? null : (
            <LanguagesSection
              language={language}
              systemLanguage={prism.systemLanguage}
              regionalLanguage={prism.regionalLanguage}
              customDestinationLanguage={prism.customDestinationLanguage}
              disabled={!online}
              onOpen={setOpenRank}
              onClear={(rank) => void editPrism({ [rank]: '' })}
            />
          )}
          <StatsSection language={language} stats={statsQuery.data ?? null} />
          <ProgressionEntry language={language} />
          <RequestsSection language={language} pending={pendingRequestsOf(receivedRequests.data)} />
          {profile === undefined ? null : <MemberSinceSection language={language} createdAt={profile.createdAt} />}
        </div>
      </main>
      {(['avatar', 'banner'] as const).map((kind) => (
        <input
          key={kind}
          ref={(element) => {
            inputs.current = { ...inputs.current, [kind]: element };
          }}
          type="file"
          accept={IMAGE_ACCEPT}
          data-profile-file={kind}
          tabIndex={-1}
          aria-hidden="true"
          hidden
          onChange={(event) => void uploadImage(kind, event)}
        />
      ))}
      {openSheetRank === undefined || prism === null ? null : (
        <LanguageSheet
          title={translate(language, openSheetRank.title)}
          {...(prism[openSheetRank.rank] === null ? {} : { selected: prism[openSheetRank.rank] ?? '' })}
          onSelect={(code) => chooseLanguage(openSheetRank.rank, code)}
          onClose={() => setOpenRank(null)}
        />
      )}
      <p
        role="status"
        aria-live="polite"
        data-profile-notice
        {...(notice?.bytes === undefined ? {} : { 'data-uploaded-bytes': String(notice.bytes) })}
        className="pointer-events-none fixed inset-x-4 bottom-6 mx-auto max-w-sm rounded-chip px-4 py-2.5 text-center text-caption font-semibold empty:hidden"
        style={{ color: 'var(--color-ios-surface)', backgroundColor: 'var(--color-ios-ink)' }}
      >
        {notice?.text ?? ''}
      </p>
    </div>
  );
}
