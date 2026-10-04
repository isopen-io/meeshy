import { useState } from 'react';

import { AdminGlyph, type AdminGlyphName } from '@/components/admin/admin-glyph';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaRow, AdminMomentText } from '@/components/admin/meta';
import { BRAND, EDGE, INK2, SURFACE } from '@/components/admin/tone';
import { formatBytes, formatCount } from '@/lib/admin/interpret/numbers';
import { languageName, sentenceCase } from '@/lib/admin/interpret/language';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import { personRef } from '@/lib/admin/post-entities';
import { mediaKindOf, type MediaKind } from '@/lib/admin/post-phrases';
import { storyStyleWords } from '@/lib/admin/publication-summaries';
import { withPostRemoved } from '@/lib/admin/post-state';
import { translatedRefusal, useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import {
  adminPostQueryKey,
  FICHE_COMMENTS,
  FICHE_VIEWERS,
  removeAdminPost,
  type AdminPostFiche,
  type AdminPostMedia,
  type AdminPostStory,
  type AdminPostRemoval as RemovalResult,
} from '@/lib/api/admin-posts-detail';
import type { ApiResult } from '@/lib/api/http';
import { attachmentSrc } from '@/lib/api/media-url';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES PIÈCES DE LA FICHE D'UNE PUBLICATION** (#8876) — médias, derniers
 * commentaires, derniers spectateurs, et le geste « Retirer la publication ».
 *
 * Les commentaires et les spectateurs sont les DERNIERS seulement (la fiche en
 * garde dix et douze) : chaque liste dit « N sur TOTAL » plutôt que de laisser
 * croire qu'elle est complète. Une personne est une puce nommée, jamais un
 * identifiant ; elle ouvre sa fiche quand le lecteur ouvre la section des comptes.
 */
const KIND_GLYPH: Readonly<Record<MediaKind, AdminGlyphName>> = { image: 'image', video: 'videoCamera', audio: 'microphone', file: 'file' };

const KIND_LABEL: Readonly<Record<MediaKind, AdminPlainCatalogKey>> = {
  image: 'admin.posts.media.kind.image',
  video: 'admin.posts.media.kind.video',
  audio: 'admin.posts.media.kind.audio',
  file: 'admin.posts.media.kind.file',
};

function MediaTile({ language, media, index }: { readonly language: AdminLanguage; readonly media: AdminPostMedia; readonly index: number }) {
  const kind = mediaKindOf(media.mimeType);
  const preview = media.thumbnailUrl ?? (kind === 'image' ? media.fileUrl : null);
  const facts = [
    translateAdmin(language, KIND_LABEL[kind]),
    ...(media.fileSize === null ? [] : [formatBytes(media.fileSize, language)]),
    ...(media.durationMs === null ? [] : [formatDuration(media.durationMs, 'ms', language)]),
  ].join(' · ');

  const visual =
    preview === null ? (
      <span className="grid size-full place-items-center" style={{ color: INK2 }}>
        <AdminGlyph name={KIND_GLYPH[kind]} size={32} />
      </span>
    ) : (
      <img src={attachmentSrc(preview)} alt={media.alt ?? ''} loading="lazy" decoding="async" className="block size-full object-cover" />
    );
  const frame = { aspectRatio: '1 / 1', border: `1px solid ${EDGE}`, backgroundColor: SURFACE, overflow: 'hidden' } as const;

  return (
    <li data-admin-media={media.id} className="grid content-start gap-2">
      {media.fileUrl === null ? (
        <div className="rounded-card" style={frame}>
          {visual}
        </div>
      ) : (
        <a
          href={attachmentSrc(media.fileUrl)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={translateAdmin(language, 'admin.posts.media.open', { index: String(index + 1) })}
          className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ ...frame, outlineColor: BRAND }}
        >
          {visual}
        </a>
      )}
      <span className="text-caption" style={{ color: INK2 }}>
        {facts}
      </span>
      {media.caption === null ? null : <span className="break-words text-caption">{translateAdmin(language, 'admin.posts.media.caption', { text: media.caption })}</span>}
      {media.alt === null ? null : (
        <span className="break-words text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.posts.media.alt', { text: media.alt })}
        </span>
      )}
      {/* La transcription d'un audio ou d'une vidéo (servie, jamais affichée — audit 2026-10-04), avec sa langue NOMMÉE. */}
      {media.transcription === null ? null : (
        <span data-admin-media-transcription className="grid gap-1 break-words text-caption" {...(media.transcription.language === null ? {} : { lang: media.transcription.language })}>
          {translateAdmin(language, 'admin.posts.media.transcription', { text: media.transcription.text })}
          {media.transcription.language === null ? null : (
            <span style={{ color: INK2 }}>{sentenceCase(languageName(media.transcription.language, language), language)}</span>
          )}
        </span>
      )}
    </li>
  );
}

export function PostMediaSection({ language, media }: { readonly language: AdminLanguage; readonly media: readonly AdminPostMedia[] }) {
  if (media.length === 0) return null;
  return (
    <AdminFicheSection id="media" title={translateAdmin(language, 'admin.posts.section.media')}>
      <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @2xl:grid-cols-4">
        {media.map((item, index) => (
          <MediaTile key={item.id} language={language} media={item} index={index} />
        ))}
      </ul>
    </AdminFicheSection>
  );
}

export function PostCommentsSection({ language, fiche, now }: { readonly language: AdminLanguage; readonly fiche: AdminPostFiche; readonly now: Date }) {
  return (
    <AdminFicheSection id="comments" title={translateAdmin(language, 'admin.posts.section.comments')}>
      {fiche.comments.length === 0 ? (
        <p className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.posts.comments.empty')}
        </p>
      ) : (
        <>
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.posts.comments.caption', {
              shown: formatCount(Math.min(fiche.comments.length, FICHE_COMMENTS), language),
              total: formatCount(Math.max(fiche.commentTotal, fiche.comments.length), language),
            })}
          </p>
          <ul className="grid gap-4">
            {fiche.comments.map((comment) => {
              const author = personRef(comment.author, language);
              return (
                <li key={comment.id} data-admin-comment={comment.id} className="grid gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {author === null ? null : <AdminEntityChip language={language} entity={author} size="sm" />}
                    <span className="text-caption" style={{ color: INK2 }}>
                      <AdminMomentText moment={adminMomentOf(comment.createdAt, now, language)} />
                    </span>
                  </div>
                  <p className="break-words text-body" style={comment.content === null ? { color: INK2 } : undefined}>
                    {comment.content ?? translateAdmin(language, 'admin.posts.comments.noText')}
                  </p>
                  <p data-admin-comment-facts className="text-caption" style={{ color: INK2 }}>
                    {[
                      translateAdmin(language, 'admin.posts.comments.likes', { count: formatCount(comment.likeCount, language) }),
                      translateAdmin(language, 'admin.posts.comments.replies', { count: formatCount(comment.replyCount, language) }),
                      ...(comment.isEdited ? [translateAdmin(language, 'admin.posts.comments.edited')] : []),
                    ].join(' · ')}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AdminFicheSection>
  );
}

export function PostViewersSection({ language, fiche, now }: { readonly language: AdminLanguage; readonly fiche: AdminPostFiche; readonly now: Date }) {
  return (
    <AdminFicheSection id="viewers" title={translateAdmin(language, 'admin.posts.section.viewers')}>
      {fiche.viewers.length === 0 ? (
        <p className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.posts.viewers.empty')}
        </p>
      ) : (
        <>
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.posts.viewers.caption', {
              shown: formatCount(Math.min(fiche.viewers.length, FICHE_VIEWERS), language),
              total: formatCount(Math.max(fiche.viewerTotal, fiche.viewers.length), language),
            })}
          </p>
          {/* Chaque vue dit QUAND et COMBIEN DE TEMPS (servis, jamais affichés — audit 2026-10-04). */}
          <ul className="grid gap-2">
            {fiche.viewers.map((viewer) => {
              const person = personRef(viewer.user, language);
              return person === null ? null : (
                <li key={viewer.user.id} data-admin-viewer={viewer.user.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <AdminEntityChip language={language} entity={person} size="sm" />
                  <span className="flex flex-wrap items-center gap-2 text-caption" style={{ color: INK2 }}>
                    <AdminMomentText moment={adminMomentOf(viewer.viewedAt, now, language)} />
                    {viewer.durationMs === null ? null : (
                      <span data-admin-viewer-duration>{translateAdmin(language, 'admin.posts.viewers.viewedFor', { duration: formatDuration(viewer.durationMs, 'ms', language) })}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AdminFicheSection>
  );
}

/**
 * L'AUDIENCE ET LES RÉACTIONS (audit 2026-10-04) — ce que la passerelle comptait
 * sans écran : réactions par emoji (jamais QUI a réagi), impressions, ouvertures,
 * vues qualifiées, lectures, téléchargements.
 */
export function PostEngagementSection({ language, fiche }: { readonly language: AdminLanguage; readonly fiche: AdminPostFiche }) {
  const metrics: readonly (readonly [string, AdminPlainCatalogKey, number])[] = [
    ['reactions', 'admin.posts.metric.reactions', fiche.reactionTally.total],
    ['impressions', 'admin.posts.metric.impressions', fiche.metrics.impressions],
    ['opens', 'admin.posts.metric.opens', fiche.metrics.opens],
    ['qualifiedViews', 'admin.posts.metric.qualifiedViews', fiche.metrics.qualifiedViews],
    ['plays', 'admin.posts.metric.plays', fiche.metrics.plays],
    ['downloads', 'admin.posts.metric.downloads', fiche.metrics.downloads],
  ];
  return (
    <AdminFicheSection id="engagement" title={translateAdmin(language, 'admin.posts.section.engagement')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-3">
        {metrics.map(([anchor, label, value]) => (
          <AdminMetaRow key={anchor} anchor={`metric-${anchor}`} label={translateAdmin(language, label)} value={formatCount(value, language)} />
        ))}
      </dl>
      <h3 className="text-caption font-semibold" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.posts.reactions.byEmoji')}
      </h3>
      {fiche.reactionTally.byEmoji.length === 0 ? (
        <p className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.posts.reactions.empty')}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-admin-reactions>
          {fiche.reactionTally.byEmoji.map(({ emoji, count }) => (
            <li key={emoji} data-admin-reaction={emoji} className="inline-flex items-center gap-2 rounded-chip px-3 py-1 text-body" style={{ border: `1px solid ${EDGE}`, backgroundColor: SURFACE }}>
              <span>{emoji}</span>
              <span className="tabular-nums">{formatCount(count, language)}</span>
            </li>
          ))}
        </ul>
      )}
    </AdminFicheSection>
  );
}

/**
 * LES EFFETS D'UNE STORY (audit 2026-10-04) — le LIEN qu'elle porte (titre,
 * domaine, adresse ouvrable dans un nouvel onglet), ses autocollants, son style
 * en mots. Jamais le blob de scène.
 */
export function PostStorySection({ language, story }: { readonly language: AdminLanguage; readonly story: AdminPostStory }) {
  const style = storyStyleWords(story, language);
  return (
    <AdminFicheSection id="story" title={translateAdmin(language, 'admin.posts.section.story')}>
      <dl className="grid gap-3">
        <AdminMetaRow
          anchor="story-link"
          label={translateAdmin(language, 'admin.posts.story.link')}
          value={
            story.linkUrl === null ? (
              translateAdmin(language, 'admin.posts.story.noLink')
            ) : !/^https?:\/\//i.test(story.linkUrl) ? (
              /* Une adresse qui n'est pas du web (`javascript:`, `data:`…) se LIT, elle ne s'ouvre pas. */
              <span data-admin-story-link-inert className="break-all font-mono text-caption">
                {story.linkUrl}
              </span>
            ) : (
              <a
                href={story.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center break-all underline"
                style={{ minHeight: 44, color: BRAND }}
              >
                {story.linkTitle ?? story.linkDomain ?? story.linkUrl}
              </a>
            )
          }
          explain={story.linkUrl === null || story.linkDomain === null ? null : story.linkDomain}
        />
        <AdminMetaRow anchor="story-stickers" label={translateAdmin(language, 'admin.posts.story.stickers')} value={formatCount(story.stickerCount, language)} />
        <AdminMetaRow
          anchor="story-style"
          label={translateAdmin(language, 'admin.posts.story.style')}
          value={style.length === 0 ? translateAdmin(language, 'admin.posts.story.styleNone') : style.join(' · ')}
        />
        {story.sceneCount === 0 ? null : (
          <AdminMetaRow anchor="story-scenes" label={translateAdmin(language, 'admin.posts.story.scenes')} value={formatCount(story.sceneCount, language)} />
        )}
      </dl>
    </AdminFicheSection>
  );
}

/** La piste audio d'un statut, JOUABLE : le lecteur natif, avec sa durée dite en mots. */
export function PostAudioTrack({ language, audio }: { readonly language: AdminLanguage; readonly audio: NonNullable<AdminPostFiche['audio']> }) {
  return (
    <div data-admin-post-audio className="grid gap-1">
      <span className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.posts.audio.title')}
        {audio.durationMs === null ? null : ` · ${formatDuration(audio.durationMs, 'ms', language)}`}
      </span>
      <audio controls preload="none" src={attachmentSrc(audio.url)} className="w-full" style={{ minHeight: 44 }} />
    </div>
  );
}

const MOTIVE_MIN = 3;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * « Retirer la publication » — un seul geste, le motif DEMANDÉ (3 caractères au
 * moins, consigné dans le journal), une feuille qui dit ce qui va se passer. La
 * passerelle ne sert aucune restauration : la feuille le dit aussi.
 *
 * L'effet est immédiat (la fiche passe à « Retirée » avant la réponse) et se défait
 * si la passerelle refuse. Une publication DÉJÀ retirée (400) se dit en mots ; le
 * bouton n'existe d'ailleurs plus une fois la fiche à jour. Hors ligne, il est éteint.
 *
 * Le composant reste MONTÉ pendant le vol : c'est lui qui porte la feuille ouverte,
 * et un retrait optimiste qui le démonterait ferait perdre la feuille — et son
 * message de refus — si la passerelle répondait non. Seul le BOUTON disparaît.
 */
export function AdminPostRemoval({
  language,
  fiche,
  deps,
  onAnnounce,
}: {
  readonly language: AdminLanguage;
  readonly fiche: AdminPostFiche;
  readonly deps: AdminDeps;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const action = useAdminAction<RemovalResult>({ language, onAnnounce });

  const close = () => {
    setOpen(false);
    action.reset();
  };

  const remove = async (motive: string | null) => {
    const done = await action.run({
      call: async (): Promise<ApiResult<RemovalResult>> => {
        const result = await removeAdminPost({ ...deps, postId: fiche.id, reason: motive });
        return !result.ok && result.status === 400 ? translatedRefusal(translateAdmin(language, 'admin.posts.remove.already')) : result;
      },
      success: 'admin.posts.remove.done',
      optimistic: { key: adminPostQueryKey(fiche.id), apply: (before) => withPostRemoved(before, new Date().toISOString()) },
      invalidate: [['admin', 'posts']],
    });
    if (done !== null) close();
  };

  return (
    <>
      {fiche.deletedAt === null ? (
        <button
          type="button"
          data-admin-action="remove"
          disabled={!online}
          onClick={() => setOpen(true)}
          className={`rounded-chip px-4 text-body font-semibold disabled:opacity-40 ${FOCUS}`}
          style={{ minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: 'var(--color-danger)', outlineColor: BRAND }}
        >
          {translateAdmin(language, 'admin.posts.remove.action')}
        </button>
      ) : null}
      {open ? (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, 'admin.posts.remove.title')}
          body={translateAdmin(language, 'admin.posts.remove.body')}
          confirmLabel={translateAdmin(language, 'admin.posts.remove.confirm')}
          tone="danger"
          motive={{ label: translateAdmin(language, 'admin.posts.remove.motive'), minLength: MOTIVE_MIN, required: true }}
          busy={action.state.phase === 'running'}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={(motive) => void remove(motive)}
          onCancel={close}
        />
      ) : null}
    </>
  );
}
