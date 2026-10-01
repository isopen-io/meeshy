import { useQuery } from '@tanstack/react-query';

import { AdminBadge, AdminInterpretedBadge, AdminLanguageBadge } from '@/components/admin/badges';
import { AdminEntityChip, AdminLink } from '@/components/admin/entity-chip';
import { AdminFiche, AdminFicheSection, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { BRAND, INK2 } from '@/components/admin/tone';
import { adminGroupOf } from '@/lib/admin/admin-routes';
import { interpretPostState, interpretPostType, interpretPostVisibility } from '@/lib/admin/interpret/enums';
import { personInitials, personLabel, personSecondary, postLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { communityRef, personRef, postRef } from '@/lib/admin/post-entities';
import { audiencePhrase, translationsPhrase } from '@/lib/admin/post-phrases';
import { postStateOf } from '@/lib/admin/post-state';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { adminPostQueryKey, loadAdminPost, type AdminPostFiche } from '@/lib/api/admin-posts-detail';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useParams } from '@/lib/router';
import { participantAvatarOf } from '@/lib/view/conversation';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';

import { AdminAnnouncement, AdminSkeleton } from './admin-parts';
import { AdminPostRemoval, PostCommentsSection, PostMediaSection, PostViewersSection } from './admin-post-parts';

/**
 * **LA FICHE D'UNE PUBLICATION** (#8876) — `/admin/posts/$post` ·
 * `/adm/posts/$post` : publication, story, reel ou statut.
 *
 * L'auteur nommé, le type, l'audience et l'état dits en mots ; le contenu (texte,
 * langue d'origine NOMMÉE, nombre de langues traduites, humeur), les médias, les
 * six compteurs, la communauté et le repartage, les derniers commentaires et
 * spectateurs ; les métadonnées interprétées — et le geste « Retirer la
 * publication ».
 *
 * **Ce que la fiche ne montre jamais** : la position (`geoPoint`) et la liste des
 * personnes visées par l'audience — seulement « visible par N personnes ». Le
 * décodeur ne les garde pas.
 *
 * Gardée par `canModerateContent`.
 */
function Content({ language, fiche }: { readonly language: AdminLanguage; readonly fiche: AdminPostFiche }) {
  return (
    <AdminFicheSection id="content" title={translateAdmin(language, 'admin.posts.section.content')}>
      {fiche.restricted ? <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.posts.content.restricted')} /> : null}
      {fiche.content === null ? (
        <p className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.posts.content.empty')}
        </p>
      ) : (
        <p className="whitespace-pre-wrap break-words text-body">{fiche.content}</p>
      )}
      {fiche.moodEmoji === null ? null : (
        <p data-admin-mood className="flex items-center gap-2 text-body">
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.posts.content.mood')}
          </span>
          <span className="text-title" aria-hidden="true">
            {fiche.moodEmoji}
          </span>
        </p>
      )}
      <p data-admin-language className="flex flex-wrap items-center gap-2 text-caption" style={{ color: INK2 }}>
        <span>{translateAdmin(language, 'admin.posts.content.language')}</span>
        {fiche.originalLanguage === null ? (
          <span>{translateAdmin(language, 'admin.posts.content.languageUnknown')}</span>
        ) : (
          <AdminLanguageBadge language={language} code={fiche.originalLanguage} />
        )}
        <span>· {translationsPhrase(fiche.translationCount, language)}</span>
      </p>
    </AdminFicheSection>
  );
}

function Context({ language, fiche }: { readonly language: AdminLanguage; readonly fiche: AdminPostFiche }) {
  const author = personRef(fiche.author, language);
  const community = fiche.community === null ? null : communityRef(fiche.community, language);
  const repost = fiche.repostOf === null ? null : postRef(fiche.repostOf, language);
  return (
    <AdminFicheSection id="context" title={translateAdmin(language, 'admin.posts.section.context')}>
      <dl className="grid gap-3">
        <AdminMetaRow
          anchor="author"
          label={translateAdmin(language, 'admin.posts.context.author')}
          value={
            author === null ? (
              personLabel(null, language)
            ) : (
              <span className="flex flex-wrap items-center gap-x-4">
                <AdminEntityChip language={language} entity={author} />
                <AdminLink target={{ kind: 'section', section: 'posts', search: { authorId: author.id } }} className="text-caption font-medium" style={{ color: BRAND }} anchor="author-posts">
                  {translateAdmin(language, 'admin.posts.context.authorPosts')}
                </AdminLink>
              </span>
            )
          }
        />
        {community === null ? null : <AdminMetaRow anchor="community" label={translateAdmin(language, 'admin.posts.context.community')} value={<AdminEntityChip language={language} entity={community} />} />}
        {repost === null ? null : (
          <AdminMetaRow
            anchor="repost"
            label={translateAdmin(language, 'admin.posts.context.repost')}
            value={<AdminEntityChip language={language} entity={repost} />}
            explain={translateAdmin(language, fiche.isQuote ? 'admin.posts.context.repostQuote' : 'admin.posts.context.repostSimple')}
          />
        )}
      </dl>
    </AdminFicheSection>
  );
}

function Metadata({
  language,
  fiche,
  now,
  onAnnounce,
}: {
  readonly language: AdminLanguage;
  readonly fiche: AdminPostFiche;
  readonly now: Date;
  readonly onAnnounce: (message: string) => void;
}) {
  const state = interpretPostState(postStateOf(fiche, now), language);
  const visibility = interpretPostVisibility(fiche.visibility, language);
  const audience = audiencePhrase(fiche.visibility, fiche.audienceCount, language);
  const edited = adminMomentOf(fiche.contentEditedAt, now, language);
  const expires = adminMomentOf(fiche.expiresAt, now, language);
  const expiresExplain = state.raw === 'expired' ? state.explain : state.raw === 'published' ? translateAdmin(language, 'admin.posts.meta.expires.future') : null;

  return (
    <AdminMetaPanel title={translateAdmin(language, 'admin.kit.meta.title')}>
      <AdminMetaRow anchor="type" label={translateAdmin(language, 'admin.posts.meta.type')} value={<AdminInterpretedBadge value={interpretPostType(fiche.type, language)} />} />
      <AdminMetaRow anchor="visibility" label={translateAdmin(language, 'admin.posts.meta.visibility')} value={<AdminInterpretedBadge value={visibility} />} explain={audience ?? visibility.explain} />
      <AdminMetaRow anchor="state" label={translateAdmin(language, 'admin.posts.meta.state')} value={<AdminInterpretedBadge value={state} />} explain={state.explain} />
      <AdminMetaRow anchor="pinned" label={translateAdmin(language, 'admin.posts.meta.pinned')} value={translateAdmin(language, fiche.isPinned ? 'admin.posts.meta.pinned.yes' : 'admin.posts.meta.pinned.no')} />
      <AdminMetaRow
        anchor="edited"
        label={translateAdmin(language, 'admin.posts.meta.edited')}
        value={
          !fiche.isEdited
            ? translateAdmin(language, 'admin.posts.meta.edited.no')
            : edited === null
              ? translateAdmin(language, 'admin.posts.edited')
              : translateAdmin(language, 'admin.posts.meta.edited.yes', { date: edited.absolute })
        }
      />
      {expires === null ? null : (
        <AdminMetaRow anchor="expires" label={translateAdmin(language, 'admin.posts.meta.expires')} value={<AdminMomentText moment={expires} variant="both" />} explain={expiresExplain} />
      )}
      <AdminMetaRow anchor="created" label={translateAdmin(language, 'admin.posts.meta.created')} value={<AdminMomentText moment={adminMomentOf(fiche.createdAt, now, language)} variant="both" />} />
      <AdminMetaRow
        anchor="updated"
        label={translateAdmin(language, 'admin.posts.meta.updated')}
        value={<AdminMomentText moment={adminMomentOf(fiche.updatedAt, now, language)} variant="both" />}
        explain={translateAdmin(language, 'admin.posts.meta.updated.explain')}
      />
      <AdminTechnicalId language={language} id={fiche.id} onAnnounce={onAnnounce} />
    </AdminMetaPanel>
  );
}

export function AdminPostPanel({
  language,
  postId,
  deps = apiDeps,
  now = new Date(),
}: {
  readonly language: AdminLanguage;
  readonly postId: string;
  readonly deps?: AdminDeps;
  readonly now?: Date;
}) {
  const reach = useAdminReach();
  const announcer = useLiveAnnouncer();

  const query = useQuery({
    queryKey: adminPostQueryKey(postId),
    queryFn: async ({ signal }) => unwrap(await loadAdminPost({ ...deps, postId, signal })),
    enabled: reach.opens('posts'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const fiche = query.data;
  const section = translateAdmin(language, 'admin.nav.posts');
  const header = (name: string | null) => (
    <AdminPageHeader
      language={language}
      title={name ?? section}
      crumbs={[
        { label: translateAdmin(language, `admin.group.${adminGroupOf('posts')}`) },
        { label: section, target: { kind: 'section', section: 'posts' } },
        ...(name === null ? [] : [{ label: name }]),
      ]}
    />
  );

  if (fiche === undefined || fiche === null) {
    const failure = query.error;
    return (
      <div className="grid gap-6" data-admin-screen="post">
        {header(null)}
        {query.isPending ? (
          <AdminSkeleton rows={4} />
        ) : failure instanceof ApiError && failure.status === 403 ? (
          <AdminDeniedInline language={language} />
        ) : failure instanceof ApiError && failure.status === 404 ? (
          <AdminEmptyState title={translateAdmin(language, 'admin.posts.notFound')} hint={translateAdmin(language, 'admin.posts.notFound.hint')} glyph="newspaper" />
        ) : (
          <AdminErrorState language={language} onRetry={() => void query.refetch()} />
        )}
      </div>
    );
  }

  const label = postLabel({ type: fiche.type, author: fiche.author }, language);
  const created = adminMomentOf(fiche.createdAt, now, language);
  const state = interpretPostState(postStateOf(fiche, now), language);
  const photo = participantAvatarOf({ avatar: fiche.author?.avatar ?? null });
  const secondary = created === null ? personSecondary(fiche.author?.username) : translateAdmin(language, 'admin.posts.publishedOn', { date: `${created.absolute} · ${created.relative}` });

  return (
    <div className="grid gap-6" data-admin-screen="post">
      {header(label)}
      <AdminOfflineNotice language={language} />
      {query.isError ? (
        <AdminInlineNotice
          tone="warning"
          text={translateAdmin(language, 'admin.kit.cached')}
          action={
            <button
              type="button"
              data-admin-retry
              onClick={() => void query.refetch()}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
            >
              {translateAdmin(language, 'admin.kit.retry')}
            </button>
          }
        />
      ) : null}
      <AdminFiche
        kind="post"
        header={
          <AdminIdentityHeader
            language={language}
            title={label}
            {...(secondary === null ? {} : { secondary })}
            {...(fiche.author === null
              ? { glyph: 'newspaper' as const }
              : { avatar: { initials: personInitials(personLabel(fiche.author, language)), color: 'var(--color-ios-brand)', ...(photo === undefined ? {} : { src: photo }) } })}
            badges={
              <>
                <AdminInterpretedBadge value={interpretPostType(fiche.type, language)} />
                <AdminInterpretedBadge value={interpretPostVisibility(fiche.visibility, language)} />
                <AdminInterpretedBadge value={state} />
                {fiche.isPinned ? <AdminBadge tone="brand">{translateAdmin(language, 'admin.posts.pinned')}</AdminBadge> : null}
                {fiche.isEdited ? <AdminBadge tone="neutral">{translateAdmin(language, 'admin.posts.edited')}</AdminBadge> : null}
              </>
            }
            actions={reach.can('canModerateContent') ? <AdminPostRemoval language={language} fiche={fiche} deps={deps} onAnnounce={announcer.announce} /> : undefined}
          />
        }
        stats={
          <AdminStatStrip
            items={[
              { id: 'likes', label: translateAdmin(language, 'admin.posts.stat.likes'), value: formatCount(fiche.counts.likes, language) },
              { id: 'comments', label: translateAdmin(language, 'admin.posts.stat.comments'), value: formatCount(fiche.counts.comments, language) },
              { id: 'shares', label: translateAdmin(language, 'admin.posts.stat.shares'), value: formatCount(fiche.counts.shares, language) },
              { id: 'views', label: translateAdmin(language, 'admin.posts.stat.views'), value: formatCount(fiche.counts.views, language) },
              { id: 'bookmarks', label: translateAdmin(language, 'admin.posts.stat.bookmarks'), value: formatCount(fiche.counts.bookmarks, language) },
              { id: 'reposts', label: translateAdmin(language, 'admin.posts.stat.reposts'), value: formatCount(fiche.counts.reposts, language) },
            ]}
          />
        }
        aside={<Metadata language={language} fiche={fiche} now={now} onAnnounce={announcer.announce} />}
      >
        <Content language={language} fiche={fiche} />
        <PostMediaSection language={language} media={fiche.media} />
        <Context language={language} fiche={fiche} />
        <PostCommentsSection language={language} fiche={fiche} now={now} />
        <PostViewersSection language={language} fiche={fiche} />
      </AdminFiche>
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminPostScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const { post } = useParams<'/admin/posts/$post'>();
  return (
    <AdminSectionScreen section="posts" language={language} title={translateAdmin(language, 'admin.nav.posts')}>
      {() => <AdminPostPanel language={language} postId={post} />}
    </AdminSectionScreen>
  );
}
