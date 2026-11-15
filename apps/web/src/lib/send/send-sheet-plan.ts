import type { ForwardSource } from '@/lib/api/forward';
import type { PublishFormat } from '@/lib/api/share-publish';
import { MAX_SHARE_CAPTION, type ShareMessage } from '@meeshy/shared/utils/share-plan';
import { SHARE_LIMITS } from '@meeshy/shared/utils/share-limits';

import { publishFormatsOf, sharePlanOf } from './share-entry';

export type { PublishFormat } from '@/lib/api/share-publish';

/**
 * LE PLAN D'UN ENVOI (#8884, #10948) — « que doit-il se passer quand on envoie
 * CECI à CELLES-CI ». Toute entrée fabrique un `SendPayload`, l'utilisateur
 * choisit des `SendTarget`, et ce module rend, PAR cible, les étapes
 * ordonnées que `send-sheet-run.ts` jouera.
 *
 * **AUCUNE RÈGLE DE SORTIE ICI.** Ce qui part, ce qui est retiré, ce qui se
 * publie, les plafonds et le placement de la légende viennent de `planShare`
 * (`@meeshy/shared/utils/share-plan`, traduit par `share-entry.ts`) : le web
 * l'exécute, il ne le redit pas.
 *
 * **Chaque destinataire reçoit SON envoi.** Envoyer à cinq personnes, c'est
 * cinq messages — et pour des fichiers neufs, UN téléversement puis des copies
 * serveur (`copyAttachmentsFromMessageId`), comme l'extension iOS.
 *
 * **La légende d'un transfert est un message à part, juste après (D4)** : la
 * copie reste fidèle à sa source. Pour des fichiers, un lien ou une carte, elle
 * est le texte du message (D3) — du premier en « Séparément ».
 */

/** Une légende tient dans un message et dans une publication. */
export const MAX_SEND_CAPTION = MAX_SHARE_CAPTION;

/** L'aperçu de ce qu'on envoie, déjà composé par l'entrée qui ouvre l'écran. */
export type SendPreview = {
  readonly kind: 'text' | 'image' | 'video' | 'audio' | 'file' | 'publication' | 'messages' | 'sticker' | 'profile' | 'invitation';
  readonly text?: string;
  readonly thumbUrl?: string;
  readonly count?: number;
};

export type SendPayload =
  /**
   * Des messages d'une conversation, dans l'ordre du fil. `exit` : ce que la
   * loi lit de chacun (mêmes ids, même ordre). `unsendable` : les messages que
   * le web ne peut pas recopier lui-même (source chiffrée qu'il ne détient pas
   * en clair, D7) — retirés avec le motif « indisponible ».
   */
  | {
      readonly kind: 'messages';
      readonly conversationId: string;
      readonly messages: readonly ForwardSource[];
      readonly exit: readonly ShareMessage[];
      readonly preview: SendPreview;
      readonly unsendable?: readonly string[];
    }
  /** UNE pièce d'un message (#9914) : seule elle part, la loi lue sur le message et cette pièce. */
  | {
      readonly kind: 'attachment';
      readonly conversationId: string;
      readonly messageId: string;
      readonly attachmentId: string;
      readonly mime: string;
      readonly previewUrl: string;
      readonly exit: ShareMessage;
      /** La source n'a plus rien à copier (supprimée, échue) — rien ne part. */
      readonly unsendable?: boolean;
    }
  | {
      readonly kind: 'publication';
      readonly postId: string;
      readonly postType: PublishFormat;
      readonly url: string;
      readonly preview: SendPreview;
    }
  /** Un média sans message (image de commentaire, média de publication) : téléchargé, puis traité comme un fichier. */
  | { readonly kind: 'media'; readonly url: string; readonly mime: string; readonly name: string; readonly preview: SendPreview }
  | { readonly kind: 'files'; readonly files: readonly File[] }
  | { readonly kind: 'text'; readonly text: string; readonly url?: string }
  /** « Envoyer le profil » (D15) : la carte profil, par son adresse. */
  | { readonly kind: 'profile'; readonly userId: string; readonly url: string; readonly name: string; readonly avatarUrl?: string }
  /** Une invitation dans une conversation : son lien. */
  | { readonly kind: 'invitation'; readonly url: string; readonly title: string };

export type SendTarget =
  | {
      readonly kind: 'conversation';
      readonly conversationId: string;
      readonly label: string;
      readonly avatarUrl?: string;
      readonly isGroup?: boolean;
      readonly encrypted?: boolean;
    }
  | { readonly kind: 'contact'; readonly userId: string; readonly label: string; readonly avatarUrl?: string }
  /** « Créer un groupe avec… » (D12) : UNE conversation neuve pour ces personnes, un seul envoi. */
  | { readonly kind: 'new-group'; readonly userIds: readonly string[]; readonly title: string }
  | { readonly kind: 'publish'; readonly as: PublishFormat };

export type SendGrouping = 'together' | 'separate';

export const targetKeyOf = (target: SendTarget): string => {
  switch (target.kind) {
    case 'conversation':
      return `conversation:${target.conversationId}`;
    case 'contact':
      return `contact:${target.userId}`;
    case 'new-group':
      return `group:${[...target.userIds].sort().join(',')}`;
    case 'publish':
      return `publish:${target.as}`;
  }
};

/** Une étape, dans l'ordre où la cible la joue. */
export type SendStep =
  | { readonly kind: 'open-direct'; readonly userId: string }
  | { readonly kind: 'open-group'; readonly userIds: readonly string[]; readonly title: string }
  /** `ephemeralDuration` : la durée choisie pour les flammes à durée du lot (#9573) — le transport la borne par source. */
  | { readonly kind: 'forward'; readonly sourceConversationId: string; readonly messages: readonly ForwardSource[]; readonly ephemeralDuration?: number }
  /** La pièce seule (#9914) : `forwardedAttachmentIds` nomme ce que la passerelle recopie. */
  | { readonly kind: 'forward-attachment'; readonly messageId: string; readonly attachmentId: string; readonly sourceConversationId: string }
  | { readonly kind: 'text'; readonly text: string }
  /** `indexes` : les fichiers que CE message porte, dans l'ordre d'envoi. */
  | { readonly kind: 'send-files'; readonly indexes: readonly number[]; readonly content?: string }
  | { readonly kind: 'publish-attachment'; readonly attachmentId: string; readonly format: PublishFormat; readonly content?: string }
  | { readonly kind: 'repost'; readonly postId: string; readonly format: PublishFormat; readonly content?: string; readonly isQuote: boolean }
  | { readonly kind: 'publish-file'; readonly format: PublishFormat; readonly fileIndex: number; readonly caption?: string }
  | { readonly kind: 'publish-text'; readonly format: PublishFormat; readonly content: string };

export type SendPlanEntry = { readonly key: string; readonly target: SendTarget; readonly steps: readonly SendStep[] };

export type SendPlanError =
  | { readonly kind: 'no-targets' }
  | { readonly kind: 'too-many-targets'; readonly max: number }
  | { readonly kind: 'over-limits'; readonly trimCount: number }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'unsupported'; readonly targetKey: string }
  | { readonly kind: 'caption-too-long'; readonly max: number }
  | { readonly kind: 'self-target' };

export type SendPlanResult =
  /** `payload` : ce que la file durable ÉCRIT — réduit aux messages qui partent, jamais un message retiré (D6). */
  | { readonly ok: true; readonly entries: readonly SendPlanEntry[]; readonly payload: SendPayload }
  | { readonly ok: false; readonly error: SendPlanError };

/** Les pastilles « Publier » de ce contenu, dans l'ordre de l'écran — la loi, filtrée par ce que le web exécute. */
export const publishOffered = (payload: SendPayload): readonly PublishFormat[] => publishFormatsOf(payload);

const captionOf = (caption: string): string | undefined => {
  const trimmed = caption.trim();
  return trimmed === '' ? undefined : trimmed;
};

const contentProp = (content: string | undefined): { readonly content?: string } => (content === undefined ? {} : { content });

const captionProp = (caption: string | undefined): { readonly caption?: string } => (caption === undefined ? {} : { caption });

const joinLines = (parts: readonly (string | undefined)[]): string =>
  parts.filter((part): part is string => part !== undefined && part.trim() !== '').join('\n');

const openStepsOf = (target: SendTarget): readonly SendStep[] => {
  if (target.kind === 'contact') return [{ kind: 'open-direct', userId: target.userId }];
  if (target.kind === 'new-group') return [{ kind: 'open-group', userIds: target.userIds, title: target.title }];
  return [];
};

const captionStep = (caption: string | undefined): readonly SendStep[] => (caption === undefined ? [] : [{ kind: 'text', text: caption }]);

const fileCountOf = (payload: SendPayload): number => {
  if (payload.kind === 'files') return payload.files.length;
  return payload.kind === 'media' ? 1 : 0;
};

function fileSteps(count: number, caption: string | undefined, grouping: SendGrouping): readonly SendStep[] {
  const indexes = Array.from({ length: count }, (_, index) => index);
  if (grouping === 'together' || count < 2) return [{ kind: 'send-files', indexes, ...contentProp(caption) }];
  return indexes.map((index) => ({ kind: 'send-files' as const, indexes: [index], ...contentProp(index === 0 ? caption : undefined) }));
}

function stepsForConversation(
  payload: SendPayload,
  kept: ReadonlySet<string>,
  caption: string | undefined,
  options: { readonly forwardDuration: number | undefined; readonly grouping: SendGrouping },
): readonly SendStep[] {
  switch (payload.kind) {
    case 'messages':
      return [
        {
          kind: 'forward',
          sourceConversationId: payload.conversationId,
          messages: payload.messages.filter((message) => kept.has(message.id)),
          ...(options.forwardDuration === undefined ? {} : { ephemeralDuration: options.forwardDuration }),
        },
        ...captionStep(caption),
      ];
    case 'attachment':
      return [
        { kind: 'forward-attachment', messageId: payload.messageId, attachmentId: payload.attachmentId, sourceConversationId: payload.conversationId },
        ...captionStep(caption),
      ];
    case 'publication':
    case 'profile':
    case 'invitation':
      return [{ kind: 'text', text: joinLines([caption, payload.url]) }];
    case 'media':
    case 'files':
      return fileSteps(fileCountOf(payload), caption, options.grouping);
    case 'text':
      return [{ kind: 'text', text: joinLines([caption, payload.text, payload.url]) }];
  }
}

function stepsForPublish(payload: SendPayload, kept: ReadonlySet<string>, format: PublishFormat, caption: string | undefined): readonly SendStep[] | null {
  if (!publishOffered(payload).includes(format)) return null;
  switch (payload.kind) {
    case 'attachment':
      return [{ kind: 'publish-attachment', attachmentId: payload.attachmentId, format, ...contentProp(caption) }];
    case 'messages': {
      const sole = payload.exit.find((message) => kept.has(message.id))?.pieces?.[0];
      return sole === undefined ? null : [{ kind: 'publish-attachment', attachmentId: sole.id, format, ...contentProp(caption) }];
    }
    case 'publication':
      return [{ kind: 'repost', postId: payload.postId, format, ...contentProp(caption), isQuote: caption !== undefined }];
    case 'media':
    case 'files':
      return Array.from({ length: fileCountOf(payload) }, (_, fileIndex) => ({ kind: 'publish-file' as const, format, fileIndex, ...captionProp(caption) }));
    case 'text':
      return [{ kind: 'publish-text', format, content: joinLines([caption, payload.text, payload.url]) }];
    case 'profile':
    case 'invitation':
      return null;
  }
}

const refuse = (error: SendPlanError): SendPlanResult => ({ ok: false, error });

function storableOf(payload: SendPayload, kept: ReadonlySet<string>): SendPayload {
  if (payload.kind !== 'messages') return payload;
  return {
    kind: 'messages',
    conversationId: payload.conversationId,
    preview: payload.preview,
    messages: payload.messages.filter((message) => kept.has(message.id)),
    exit: payload.exit.filter((message) => kept.has(message.id)),
  };
}

const destinationsOf = (targets: readonly SendTarget[]) =>
  targets.map((target) => ({ id: targetKeyOf(target), ...(target.kind === 'conversation' && target.encrypted === true ? { encrypted: true } : {}) }));

export function planSend(params: {
  readonly payload: SendPayload;
  readonly targets: readonly SendTarget[];
  readonly caption: string;
  readonly viewerId: string;
  /** La durée choisie pour la copie des flammes à durée (#9573). */
  readonly forwardDuration?: number;
  /** « Ensemble » (défaut, D3) ou « Séparément ». */
  readonly grouping?: SendGrouping;
}): SendPlanResult {
  const { payload, viewerId } = params;
  const caption = captionOf(params.caption);
  const targets = [...new Map(params.targets.map((target) => [targetKeyOf(target), target])).values()];

  if (targets.length === 0) return refuse({ kind: 'no-targets' });
  if (targets.some((target) => target.kind === 'contact' && target.userId === viewerId)) return refuse({ kind: 'self-target' });

  const verdict = sharePlanOf(payload, destinationsOf(targets));
  if (verdict.blocked !== null) return refuse({ kind: 'blocked' });
  if (verdict.limits.overRecipients > 0) return refuse({ kind: 'too-many-targets', max: SHARE_LIMITS.maxRecipients });
  if (verdict.limits.trimCount > 0) return refuse({ kind: 'over-limits', trimCount: verdict.limits.trimCount });
  if (caption !== undefined && caption.length > MAX_SEND_CAPTION) return refuse({ kind: 'caption-too-long', max: MAX_SEND_CAPTION });

  const kept = new Set(verdict.kept);
  const options = { forwardDuration: params.forwardDuration, grouping: params.grouping ?? 'together' } as const;
  const entries: SendPlanEntry[] = [];
  for (const target of targets) {
    const key = targetKeyOf(target);
    const steps =
      target.kind === 'publish'
        ? stepsForPublish(payload, kept, target.as, caption)
        : [...openStepsOf(target), ...stepsForConversation(payload, kept, caption, options)];
    if (steps === null) return refuse({ kind: 'unsupported', targetKey: key });
    entries.push({ key, target, steps });
  }
  return { ok: true, entries, payload: storableOf(payload, kept) };
}
