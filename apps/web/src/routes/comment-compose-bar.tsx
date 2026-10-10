import type { PostCommentCardMode } from '@meeshy/shared/utils/comment-card-composition';

import { translateExportCard, type PlainExportCardKey } from '@/lib/i18n-export-card-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Pill } from './thread-export-controls';

/**
 * **LES PUCES DE COMPOSITION D'UN COMMENTAIRE DE POST** (#9687, miroir de
 * `MessageCardCompositionBar` iOS, #9686) — au-dessus de l'aperçu : les modes,
 * « Post en tête » pour une réponse (au premier niveau, les deux modes SONT la
 * bascule), et les cases du fil sous « Choisir les réponses ». Un toucher
 * change la carte, l'aperçu se repeint aussitôt. Les rangées défilent dans le
 * sens de lecture (RTL compris) : `overflow-x-auto`, jamais de positions fixes.
 */

const MODE_LABEL: Readonly<Record<PostCommentCardMode, PlainExportCardKey>> = {
  postAndComment: 'export.card.compose.postAndComment',
  commentAlone: 'export.card.compose.commentAlone',
  threadToHere: 'export.card.compose.threadToHere',
  postRootAndReply: 'export.card.compose.postRootAndReply',
  chosenReplies: 'export.card.compose.chosenReplies',
};

export type ComposeReplyChoice = { readonly id: string; readonly label: string };

export function CommentComposeBar({
  language,
  modes,
  mode,
  onMode,
  postToggle,
  replies,
  onReply,
}: {
  readonly language: InterfaceLanguage;
  readonly modes: readonly PostCommentCardMode[];
  readonly mode: PostCommentCardMode;
  readonly onMode: (mode: PostCommentCardMode) => void;
  /** « Post en tête » — `null` quand la bascule ne s'offre pas. */
  readonly postToggle: { readonly pressed: boolean; readonly onToggle: () => void } | null;
  /** Les cases de « Choisir les réponses » — `null` hors de ce mode. */
  readonly replies: { readonly choices: readonly ComposeReplyChoice[]; readonly chosen: ReadonlySet<string> } | null;
  readonly onReply: (id: string) => void;
}) {
  if (modes.length < 2 && postToggle === null) return null;
  return (
    <div data-export-compose="" className="flex flex-col gap-2">
      <div role="group" aria-label={translateExportCard(language, 'export.card.compose')} className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5">
        {modes.length < 2
          ? null
          : modes.map((item) => (
              <Pill key={item} pressed={item === mode} onClick={() => onMode(item)} data={{ 'data-export-compose-mode': item }}>
                {translateExportCard(language, MODE_LABEL[item])}
              </Pill>
            ))}
        {postToggle === null ? null : (
          <Pill pressed={postToggle.pressed} onClick={postToggle.onToggle} data={{ 'data-export-compose-post': '' }}>
            {translateExportCard(language, 'export.card.compose.post')}
          </Pill>
        )}
      </div>
      {replies === null ? null : (
        <div role="group" aria-label={translateExportCard(language, 'export.card.compose.replies')} className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5">
          {replies.choices.map((choice) => (
            <Pill key={choice.id} pressed={replies.chosen.has(choice.id)} onClick={() => onReply(choice.id)} data={{ 'data-export-compose-reply': choice.id }}>
              {choice.label}
            </Pill>
          ))}
        </div>
      )}
    </div>
  );
}
