import { useState } from 'react';

import { AdminGlyph, type AdminGlyphName } from '@/components/admin/admin-glyph';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMomentText } from '@/components/admin/meta';
import { BRAND, EDGE, INK2, SURFACE } from '@/components/admin/tone';
import { formatBytes, formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import { personRef } from '@/lib/admin/post-entities';
import { mediaKindOf, type MediaKind } from '@/lib/admin/post-phrases';
import { withPostRemoved } from '@/lib/admin/post-state';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import {
  adminPostQueryKey,
  FICHE_COMMENTS,
  FICHE_VIEWERS,
  removeAdminPost,
  type AdminPostFiche,
  type AdminPostMedia,
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
    </li>
  );
}

export function PostMediaSection({ language, media }: { readonly language: AdminLanguage; readonly media: readonly AdminPostMedia[] }) {
  if (media.length === 0) return null;
  return (
    <AdminFicheSection id="media" title={translateAdmin(language, 'admin.posts.section.media')}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AdminFicheSection>
  );
}

export function PostViewersSection({ language, fiche }: { readonly language: AdminLanguage; readonly fiche: AdminPostFiche }) {
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
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {fiche.viewers.map((viewer) => {
              const person = personRef(viewer.user, language);
              return person === null ? null : (
                <li key={viewer.user.id} data-admin-viewer={viewer.user.id}>
                  <AdminEntityChip language={language} entity={person} size="sm" />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AdminFicheSection>
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
        const result = await removeAdminPost({ ...deps, postId: fiche.id, reason: motive ?? '' });
        return !result.ok && result.status === 400 ? { ok: false, status: 400, error: translateAdmin(language, 'admin.posts.remove.already') } : result;
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
