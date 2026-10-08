import { useMemo, useState, type ComponentProps } from 'react';

import {
  postCommentCardChoosable,
  postCommentCardModes,
  postCommentCardOffersPost,
  type PostCommentCardComment,
} from '@meeshy/shared/utils/comment-card-composition';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { PostComment } from '@/lib/api/publication-comments';
import { commentCardSubjectOf } from '@/lib/export/comment-card-subject';
import {
  NO_POST_COMMENT_PICK,
  postCommentCardSourceOf,
  postCommentChoiceOf,
  postCommentMessageCardSubjectOf,
  postCommentPickAfter,
  type PostCommentCardEntry,
  type PostCommentPickAction,
} from '@/lib/export/composed-comment-card';
import { translateExportCard } from '@/lib/i18n-export-card-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { CommentComposeBar } from './comment-compose-bar';
import { ExportCatalogGate } from './export-catalog-gate';
import { MessageExportSheet } from './thread-export-sheet';

/**
 * **« IMAGER » UN COMMENTAIRE** (#8693) — le même atelier « Imagine » que pour
 * un message : le commentaire est la réponse, celui auquel il répond la
 * citation. Chunk À LA DEMANDE (`comment-image-sheet-lazy.tsx`) : le fil de
 * commentaires n'en paie rien tant qu'on n'image pas.
 *
 * UN COMMENTAIRE DE POST (#9687, `composition`) : l'atelier compose la carte
 * — le post en tête, le fil jusqu'à une réponse, les réponses choisies — et
 * offre ses puces au-dessus de l'aperçu, qui se repeint aussitôt. Les règles
 * sont la composition partagée (`@meeshy/shared/utils/comment-card-composition`).
 *
 * La feuille annonce ses issues dans SA région vivante — le fil de
 * commentaires n'en tient pas.
 */
export type PostCommentComposition = {
  readonly post: FeedPost;
  /** La racine et les réponses lues autour du commentaire — grandit quand elles arrivent. */
  readonly thread: readonly PostComment[];
  readonly readerLanguages: readonly string[];
  readonly viewer: { readonly id: string; readonly displayName: string };
};

export type CommentImageRequest = {
  readonly comment: PostComment;
  readonly servedText: string;
  readonly parent: { readonly comment: PostComment; readonly servedText: string } | null;
  /** « Avec les réponses » (#8734) — absentes tant qu'elles ne sont pas lues. */
  readonly replies?: readonly { readonly comment: PostComment; readonly servedText: string }[];
  /** Le prisme du lecteur, qui élit la piste d'un vocal (#9687) — `null` ou absent : la rangée montre l'original. */
  readonly readerLanguages?: readonly string[] | null;
  /** Le commentaire d'un POST (#9687) — absent : une story, la carte du commentaire. */
  readonly composition?: PostCommentComposition;
};

type Painter = NonNullable<ComponentProps<typeof MessageExportSheet>['paint']>;

type SheetProps = { readonly handle: string | null; readonly onClose: () => void; readonly announce: (message: string) => void; readonly paint?: Painter };

const REPLY_EXCERPT = 24;

const replyLabelOf = (comment: PostCommentCardComment<PostCommentCardEntry>): string => {
  const name = comment.author.displayName?.trim() || comment.author.username?.trim() || 'Meeshy';
  const flat = comment.text.replace(/\s+/g, ' ').trim();
  const characters = [...flat];
  return `${name} · ${characters.length > REPLY_EXCERPT ? `${characters.slice(0, REPLY_EXCERPT).join('')}…` : flat}`;
};

function ComposedCommentImage({ request, composition, handle, onClose, announce, paint }: SheetProps & { readonly request: CommentImageRequest; readonly composition: PostCommentComposition }) {
  const language = currentInterfaceLanguage();
  const source = useMemo(
    () =>
      postCommentCardSourceOf({
        post: composition.post,
        target: request.comment,
        targetText: request.servedText,
        targetShowsOriginal: request.readerLanguages === null,
        thread: composition.thread,
        readerLanguages: composition.readerLanguages,
        viewer: composition.viewer,
      }),
    [request.comment, request.servedText, composition],
  );
  const [pick, setPick] = useState(NO_POST_COMMENT_PICK);
  const choice = postCommentChoiceOf(source, pick);
  const chosenKey = choice === null ? '' : [...choice.chosen].sort().join(',');
  const subjectKey = choice === null ? '' : `${choice.mode}|${choice.showsPost}|${chosenKey}|${source.thread.map((comment) => comment.id).join(',')}`;
  const subject = useMemo(
    () =>
      choice === null
        ? null
        : postCommentMessageCardSubjectOf(source, choice, {
            title: translateExportCard(language, 'export.card.compose.thread'),
            folded: (count) => translateExportCard(language, 'export.card.compose.folded', { count: String(count) }),
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, subjectKey, language],
  );
  if (choice === null || subject === null) return null;
  const act = (action: PostCommentPickAction) => setPick((current) => postCommentPickAfter(source, current, action));
  const offersPostToggle = source.target.parentId !== null && postCommentCardOffersPost(source);
  const bar = (
    <CommentComposeBar
      language={language}
      modes={postCommentCardModes(source)}
      mode={choice.mode}
      onMode={(mode) => act({ kind: 'mode', mode })}
      postToggle={offersPostToggle ? { pressed: choice.showsPost, onToggle: () => act({ kind: 'togglePost' }) } : null}
      replies={choice.mode === 'chosenReplies' ? { choices: postCommentCardChoosable(source).map((comment) => ({ id: comment.id, label: replyLabelOf(comment) })), chosen: choice.chosen } : null}
      onReply={(id) => act({ kind: 'reply', id })}
    />
  );
  return (
    <MessageExportSheet
      subject={subject}
      subjectKey={subjectKey}
      above={bar}
      handle={handle}
      conversationTitle={null}
      announce={announce}
      onClose={onClose}
      {...(paint === undefined ? {} : { paint })}
    />
  );
}

export default function CommentImageSheet({ request, handle, onClose, paint }: { readonly request: CommentImageRequest; readonly handle: string | null; readonly onClose: () => void; readonly paint?: Painter }) {
  const [announcement, setAnnouncement] = useState('');
  const composition = request.composition;
  const subject = composition === undefined ? commentCardSubjectOf(request) : null;
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only" data-comment-image-status="">
        {announcement}
      </p>
      {composition !== undefined ? (
        <ExportCatalogGate>
          <ComposedCommentImage request={request} composition={composition} handle={handle} onClose={onClose} announce={setAnnouncement} {...(paint === undefined ? {} : { paint })} />
        </ExportCatalogGate>
      ) : subject === null ? null : (
        <ExportCatalogGate>
          <MessageExportSheet subject={subject} handle={handle} conversationTitle={null} announce={setAnnouncement} onClose={onClose} {...(paint === undefined ? {} : { paint })} />
        </ExportCatalogGate>
      )}
    </>
  );
}
