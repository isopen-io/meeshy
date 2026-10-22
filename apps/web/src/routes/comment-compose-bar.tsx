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

/** Un média du post offert pour la tête (#11783) — sa vignette (photo, première image d'une vidéo) ou l'onde d'un son. */
export type ComposeHeadChoice = { readonly kind: 'image' | 'video' | 'audio'; readonly thumbnail: string | null };

const HEAD_LABEL = {
  image: 'export.card.compose.head.image',
  video: 'export.card.compose.head.video',
  audio: 'export.card.compose.head.audio',
} as const;

const HEAD_GLYPH: Readonly<Record<ComposeHeadChoice['kind'], string>> = { image: '🖼', video: '▶', audio: '〰' };

export function CommentComposeBar({
  language,
  modes,
  mode,
  onMode,
  postToggle,
  replies,
  onReply,
  heads = null,
  withheld = false,
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
  /** Le média de tête à choisir (#11783) — `null` : un seul média, ou le post n'est pas en tête. */
  readonly heads?: { readonly choices: readonly ComposeHeadChoice[]; readonly selected: number; readonly onPick: (index: number) => void } | null;
  /** Le support existe mais son audience (non publique) le retient : la feuille le DIT. */
  readonly withheld?: boolean;
}) {
  if (modes.length < 2 && postToggle === null && heads === null && !withheld) return null;
  return (
    <div data-export-compose="" className="flex flex-col gap-2">
      {modes.length < 2 && postToggle === null ? null : (
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
      )}
      {heads === null ? null : (
        <div role="radiogroup" aria-label={translateExportCard(language, 'export.card.compose.head')} className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5">
          {heads.choices.map((choice, index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={index === heads.selected}
              aria-label={translateExportCard(language, HEAD_LABEL[choice.kind], { position: String(index + 1) })}
              data-export-compose-head={String(index)}
              onClick={() => heads.onPick(index)}
              className={`relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[color-mix(in_srgb,currentColor_7%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 ${index === heads.selected ? 'ring-[3px] ring-current' : 'opacity-70'}`}
            >
              {choice.thumbnail === null ? (
                <span aria-hidden="true" className="text-title">{HEAD_GLYPH[choice.kind]}</span>
              ) : (
                <img src={choice.thumbnail} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
              )}
              {choice.kind === 'video' && choice.thumbnail !== null ? <span aria-hidden="true" className="absolute text-caption text-white drop-shadow">▶</span> : null}
            </button>
          ))}
        </div>
      )}
      {withheld ? (
        <p data-export-compose-withheld="" className="text-caption opacity-70">
          {translateExportCard(language, 'export.card.compose.withheld')}
        </p>
      ) : null}
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
