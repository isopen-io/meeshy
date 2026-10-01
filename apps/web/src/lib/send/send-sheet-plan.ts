import type { ForwardSource } from '@/lib/api/forward';
import type { PublishFormat } from '@/lib/api/share-publish';

export type { PublishFormat } from '@/lib/api/share-publish';

/**
 * LE PLAN D'UN ENVOI (#8884, directive porteur 2026-09-30) — la règle UNIQUE
 * de « que doit-il se passer quand on envoie CECI à CELLES-CI ». Les feuilles
 * de transfert et de partage reposent sur la même base : elles fabriquent un
 * `SendPayload`, l'utilisateur choisit des `SendTarget`, et ce module rend,
 * PAR cible, les étapes ordonnées que `send-sheet-run.ts` jouera.
 *
 * **PUR** : aucune requête, aucun DOM, aucun import réseau. Le moteur
 * d'exécution reçoit ses ports ; ce fichier n'a rien à injecter.
 *
 * **Chaque destinataire reçoit SON envoi.** Envoyer à cinq personnes n'est pas
 * un message de groupe : c'est cinq messages, un par conversation — et pour des
 * fichiers neufs, UN téléversement puis quatre copies serveur
 * (`copyAttachmentsFromMessageId`), exactement comme l'extension de partage iOS
 * (`ShareSender.swift`).
 *
 * **La légende est un message, pas une réécriture.** `content` avec
 * `forwardedFromId` REMPLACERAIT le texte de la source (passerelle) : un
 * transfert n'y touche jamais, la légende part APRÈS, en second message. Pour
 * des fichiers ou une copie de pièce, elle voyage dans le même message.
 */

export const MAX_CONVERSATION_TARGETS = 10;
export const MAX_PUBLISH_TARGETS = 3;
export const MAX_PUBLISH_FILES = 10;
/** `PublishAttachmentSchema.content` / `RepostSchema.content` / `CreatePostSchema.content`. */
export const MAX_PUBLISH_CAPTION = 5000;

/** L'aperçu de ce qu'on envoie — tout ce que la feuille montre, déjà composé
 * par l'entrée qui l'ouvre (jamais recalculé par la feuille). */
export type SendPreview = {
  readonly kind: 'text' | 'image' | 'video' | 'audio' | 'file' | 'publication' | 'messages';
  readonly text?: string;
  readonly thumbUrl?: string;
  readonly count?: number;
};

/** Le média UNIQUE d'un transfert d'un seul message — ce qui le rend publiable. */
export type SoleMedia = {
  readonly attachmentId: string;
  readonly mime: string;
  readonly protected: boolean;
};

export type SendPayload =
  /** Transfert : des messages d'une conversation. `soleMedia` n'est posé que
   * si la sélection est UN message portant UN média (alors publiable). */
  | {
      readonly kind: 'messages';
      readonly conversationId: string;
      readonly messages: readonly ForwardSource[];
      readonly preview: SendPreview;
      readonly soleMedia?: SoleMedia;
    }
  /** La pièce d'UN message, depuis une visionneuse plein écran. `mine` : le
   * lecteur est l'auteur du message source (seul cas de la copie serveur). */
  | {
      readonly kind: 'attachment';
      readonly conversationId: string;
      readonly messageId: string;
      readonly attachmentId: string;
      readonly mime: string;
      readonly previewUrl: string;
      readonly mine: boolean;
      readonly protected: boolean;
    }
  | {
      readonly kind: 'publication';
      readonly postId: string;
      readonly postType: PublishFormat;
      readonly url: string;
      readonly preview: SendPreview;
    }
  /** Un média sans pièce de message (image de commentaire, média de
   * publication) : le moteur le télécharge, puis le traite comme un fichier. */
  | { readonly kind: 'media'; readonly url: string; readonly mime: string; readonly name: string; readonly preview: SendPreview }
  | { readonly kind: 'files'; readonly files: readonly File[] }
  | { readonly kind: 'text'; readonly text: string; readonly url?: string };

export type SendTarget =
  | { readonly kind: 'conversation'; readonly conversationId: string; readonly label: string; readonly avatarUrl?: string; readonly isGroup?: boolean }
  | { readonly kind: 'contact'; readonly userId: string; readonly label: string; readonly avatarUrl?: string }
  | { readonly kind: 'publish'; readonly as: PublishFormat };

export const targetKeyOf = (target: SendTarget): string => {
  switch (target.kind) {
    case 'conversation':
      return `conversation:${target.conversationId}`;
    case 'contact':
      return `contact:${target.userId}`;
    case 'publish':
      return `publish:${target.as}`;
  }
};

/** Une étape, dans l'ordre où la cible la joue. */
export type SendStep =
  | { readonly kind: 'open-direct'; readonly userId: string }
  | { readonly kind: 'forward'; readonly sourceConversationId: string; readonly messages: readonly ForwardSource[] }
  | { readonly kind: 'forward-attachment'; readonly messageId: string; readonly sourceConversationId: string }
  | { readonly kind: 'copy-attachment'; readonly messageId: string; readonly content?: string }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'send-files'; readonly content?: string }
  | { readonly kind: 'publish-attachment'; readonly attachmentId: string; readonly format: PublishFormat; readonly content?: string }
  | { readonly kind: 'repost'; readonly postId: string; readonly format: PublishFormat; readonly content?: string; readonly isQuote: boolean }
  | { readonly kind: 'publish-file'; readonly format: PublishFormat; readonly fileIndex: number; readonly caption?: string }
  | { readonly kind: 'publish-text'; readonly format: PublishFormat; readonly content: string };

export type SendPlanEntry = { readonly key: string; readonly target: SendTarget; readonly steps: readonly SendStep[] };

export type SendPlanError =
  | { readonly kind: 'no-targets' }
  | { readonly kind: 'too-many-targets'; readonly max: number }
  | { readonly kind: 'too-many-publish-targets'; readonly max: number }
  | { readonly kind: 'too-many-files'; readonly max: number }
  | { readonly kind: 'protected' }
  | { readonly kind: 'unsupported'; readonly targetKey: string }
  | { readonly kind: 'caption-too-long'; readonly max: number }
  | { readonly kind: 'self-target' };

export type SendPlanResult =
  | { readonly ok: true; readonly entries: readonly SendPlanEntry[] }
  | { readonly ok: false; readonly error: SendPlanError };

const isVisualMime = (mime: string): boolean => mime.startsWith('image/') || mime.startsWith('video/');

const ALL_FORMATS: readonly PublishFormat[] = ['POST', 'STORY', 'REEL'];

/** Les fichiers qu'un payload met en jeu, comptés — `media` pèse UN fichier. */
const fileCountOf = (payload: SendPayload): number => {
  if (payload.kind === 'files') return payload.files.length;
  return payload.kind === 'media' ? 1 : 0;
};

const visualFilesOf = (payload: SendPayload): boolean => {
  if (payload.kind === 'files') return payload.files.length > 0 && payload.files.every((f) => isVisualMime(f.type));
  return payload.kind === 'media' && isVisualMime(payload.mime);
};

/**
 * LES PASTILLES À OFFRIR — JAMAIS rien pour un contenu protégé (vue unique,
 * flouté, éphémère, chiffré : la passerelle refuse en `PROTECTED_MEDIA`, autant
 * ne pas proposer un geste qui échoue).
 */
export function publishOffered(payload: SendPayload): readonly PublishFormat[] {
  switch (payload.kind) {
    case 'attachment':
      return !payload.protected && isVisualMime(payload.mime) ? ALL_FORMATS : [];
    case 'media':
    case 'files':
      return visualFilesOf(payload) ? ALL_FORMATS : [];
    case 'publication':
      return ['STORY', 'REEL', 'POST'];
    case 'text':
      return ['POST'];
    case 'messages':
      return payload.messages.length === 1 &&
        payload.soleMedia !== undefined &&
        !payload.soleMedia.protected &&
        isVisualMime(payload.soleMedia.mime)
        ? ALL_FORMATS
        : [];
  }
}

const captionOf = (caption: string): string | undefined => {
  const trimmed = caption.trim();
  return trimmed === '' ? undefined : trimmed;
};

const contentProp = (content: string | undefined): { readonly content?: string } => (content === undefined ? {} : { content });

const captionProp = (caption: string | undefined): { readonly caption?: string } => (caption === undefined ? {} : { caption });

const joinLines = (parts: readonly (string | undefined)[]): string =>
  parts.filter((part): part is string => part !== undefined && part.trim() !== '').join('\n');

const openDirectOf = (target: SendTarget): readonly SendStep[] =>
  target.kind === 'contact' ? [{ kind: 'open-direct', userId: target.userId }] : [];

const captionStep = (caption: string | undefined): readonly SendStep[] =>
  caption === undefined ? [] : [{ kind: 'text', text: caption }];

function stepsForConversation(payload: SendPayload, caption: string | undefined): readonly SendStep[] {
  switch (payload.kind) {
    case 'messages':
      return [{ kind: 'forward', sourceConversationId: payload.conversationId, messages: payload.messages }, ...captionStep(caption)];
    case 'attachment':
      /* La copie serveur crée un message NEUF, sans la durée de la source : une
         pièce protégée (éphémère) se TRANSFÈRE, la copie héritant de sa durée. */
      return payload.mine && !payload.protected
        ? [{ kind: 'copy-attachment', messageId: payload.messageId, ...contentProp(caption) }]
        : [{ kind: 'forward-attachment', messageId: payload.messageId, sourceConversationId: payload.conversationId }, ...captionStep(caption)];
    case 'publication':
      return [{ kind: 'text', text: joinLines([caption, payload.url]) }];
    case 'media':
    case 'files':
      return [{ kind: 'send-files', ...contentProp(caption) }];
    case 'text':
      return [{ kind: 'text', text: joinLines([caption, payload.text, payload.url]) }];
  }
}

function stepsForPublish(payload: SendPayload, format: PublishFormat, caption: string | undefined): readonly SendStep[] | null {
  if (!publishOffered(payload).includes(format)) return null;
  switch (payload.kind) {
    case 'attachment':
      return [{ kind: 'publish-attachment', attachmentId: payload.attachmentId, format, ...contentProp(caption) }];
    case 'messages':
      return payload.soleMedia === undefined
        ? null
        : [{ kind: 'publish-attachment', attachmentId: payload.soleMedia.attachmentId, format, ...contentProp(caption) }];
    case 'publication':
      return [
        {
          kind: 'repost',
          postId: payload.postId,
          format,
          ...contentProp(caption),
          isQuote: caption !== undefined,
        },
      ];
    case 'media':
    case 'files':
      return Array.from({ length: fileCountOf(payload) }, (_, fileIndex) => ({
        kind: 'publish-file' as const,
        format,
        fileIndex,
        ...captionProp(caption),
      }));
    case 'text':
      return [{ kind: 'publish-text', format, content: joinLines([caption, payload.text, payload.url]) }];
  }
}

const refuse = (error: SendPlanError): SendPlanResult => ({ ok: false, error });

export function planSend(params: {
  readonly payload: SendPayload;
  readonly targets: readonly SendTarget[];
  readonly caption: string;
  readonly viewerId: string;
}): SendPlanResult {
  const { payload, viewerId } = params;
  const caption = captionOf(params.caption);
  const targets = [...new Map(params.targets.map((target) => [targetKeyOf(target), target])).values()];

  if (targets.length === 0) return refuse({ kind: 'no-targets' });
  if (targets.some((target) => target.kind === 'contact' && target.userId === viewerId)) return refuse({ kind: 'self-target' });

  const publishTargets = targets.filter((target) => target.kind === 'publish');
  const peopleTargets = targets.length - publishTargets.length;
  if (peopleTargets > MAX_CONVERSATION_TARGETS) return refuse({ kind: 'too-many-targets', max: MAX_CONVERSATION_TARGETS });
  if (publishTargets.length > MAX_PUBLISH_TARGETS) return refuse({ kind: 'too-many-publish-targets', max: MAX_PUBLISH_TARGETS });

  if (publishTargets.length > 0) {
    if (caption !== undefined && caption.length > MAX_PUBLISH_CAPTION) {
      return refuse({ kind: 'caption-too-long', max: MAX_PUBLISH_CAPTION });
    }
    if ((payload.kind === 'attachment' && payload.protected) || (payload.kind === 'messages' && payload.soleMedia?.protected === true)) {
      return refuse({ kind: 'protected' });
    }
    if (fileCountOf(payload) > MAX_PUBLISH_FILES) return refuse({ kind: 'too-many-files', max: MAX_PUBLISH_FILES });
  }

  const entries: SendPlanEntry[] = [];
  for (const target of targets) {
    const key = targetKeyOf(target);
    const steps =
      target.kind === 'publish'
        ? stepsForPublish(payload, target.as, caption)
        : [...openDirectOf(target), ...stepsForConversation(payload, caption)];
    if (steps === null) return refuse({ kind: 'unsupported', targetKey: key });
    entries.push({ key, target, steps });
  }
  return { ok: true, entries };
}
