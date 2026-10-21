import { planShare, type ShareAction, type ShareDestination, type ShareEntry, type SharePlan } from '@meeshy/shared/utils/share-plan';

import type { PublishFormat } from '@/lib/api/share-publish';

import type { SendPayload } from './send-sheet-plan';

/**
 * LE PONT ENTRE LA DEMANDE DU WEB ET LA LOI DU PARTAGE UNIQUE (#10948).
 *
 * `planShare` (`@meeshy/shared/utils/share-plan`) décide, pour iOS comme pour
 * le web : ce qui part et ce qui est retiré (D6), ce qu'on peut en faire, les
 * plafonds (D10), la durée d'une flamme, le flou hérité (D8), l'avertissement
 * de chiffrement (D7). Ce module ne fait que deux choses :
 *
 * - traduire un `SendPayload` en `ShareEntry` (`shareEntryOf`) ;
 * - dire ce que le web ne sait pas REFAIRE lui-même. Le web ne détient aucune
 *   clé : un message d'une source chiffrée qu'il ne lit pas en clair ne peut
 *   pas être recopié sur l'appareil, et la passerelle n'en recopie jamais rien.
 *   Il est retiré, motif « indisponible » — fermé par défaut, jamais envoyé
 *   vide.
 *
 * Et une troisième, de capacité et non de loi : les formats de publication que
 * le web sait EXÉCUTER d'ici (`publishFormatsOf`). Le son et le texte en story
 * passent par le studio, qui les reçoit.
 */

const OCTET_STREAM = 'application/octet-stream';

/**
 * UNE CONVERSATION CHIFFRÉE, au sens où la passerelle la juge (D7) : un mode de
 * chiffrement, quel qu'il soit, ou une date d'activation. C'est la règle de
 * `forwardAdmission` (fermée sur la projection) ; le web la lit pour la source
 * et pour chaque destinataire, ici seulement.
 */
export const conversationEncrypted = (conversation: { readonly encryptionMode?: string | null; readonly encryptionEnabledAt?: Date | string | null } | undefined): boolean =>
  conversation !== undefined && (conversation.encryptionMode != null || conversation.encryptionEnabledAt != null);

const POST_KIND = { POST: 'post', STORY: 'story', REEL: 'reel' } as const satisfies Readonly<Record<PublishFormat, 'post' | 'story' | 'reel'>>;

export function shareEntryOf(payload: SendPayload): ShareEntry {
  switch (payload.kind) {
    case 'messages':
      return { kind: 'messages', messages: payload.exit };
    case 'attachment':
      return { kind: 'piece', message: payload.exit, attachmentId: payload.attachmentId };
    case 'publication':
      return { kind: POST_KIND[payload.postType], url: payload.url };
    case 'media':
      return { kind: 'media', media: [{ mimeType: payload.mime === '' ? OCTET_STREAM : payload.mime }] };
    case 'files':
      return { kind: 'media', media: payload.files.map((file) => ({ mimeType: file.type === '' ? OCTET_STREAM : file.type, bytes: file.size })) };
    case 'text':
      return payload.url === undefined ? { kind: 'text', text: payload.text } : { kind: 'link', url: payload.url, text: payload.text };
    case 'profile':
      return { kind: 'profile', url: payload.url };
    case 'invitation':
      return { kind: 'invitation', url: payload.url };
  }
}

/** Rien ne part de ce que le web ne peut pas reconstituer — ni envoi, ni publication, ni copie. */
const unavailable = (plan: SharePlan, withdrawn: SharePlan['withdrawn']): SharePlan => ({
  ...plan,
  kept: [],
  withdrawn,
  blocked: 'unavailable',
  actions: [],
  canSend: false,
});

/** Une pièce d'une source chiffrée : le web n'a pas la clé de son fichier. */
const pieceUnsendable = (payload: Extract<SendPayload, { kind: 'attachment' }>): boolean => payload.exit.encrypted === true || payload.unsendable === true;

export function sharePlanOf(payload: SendPayload, destinations: readonly ShareDestination[] = []): SharePlan {
  const plan = planShare({ entry: shareEntryOf(payload), destinations });
  if (payload.kind === 'attachment' && plan.blocked === null && pieceUnsendable(payload)) {
    return unavailable(plan, [{ id: payload.attachmentId, reason: 'unavailable' }]);
  }
  const unsendable = payload.kind === 'messages' ? new Set(payload.unsendable ?? []) : new Set<string>();
  if (unsendable.size === 0) return plan;
  const kept = plan.kept.filter((id) => !unsendable.has(id));
  const withdrawn = [...plan.withdrawn, ...plan.kept.filter((id) => unsendable.has(id)).map((id) => ({ id, reason: 'unavailable' as const }))];
  if (kept.length === 0) return unavailable(plan, withdrawn);
  return { ...plan, kept, withdrawn };
}

const PUBLISH_ORDER: readonly { readonly action: ShareAction; readonly format: PublishFormat }[] = [
  { action: 'publish-story', format: 'STORY' },
  { action: 'publish-post', format: 'POST' },
  { action: 'publish-reel', format: 'REEL' },
];

const isVisual = (mime: string): boolean => mime.startsWith('image/') || mime.startsWith('video/');

/** Ce que le web sait publier d'ici, indépendamment de la loi. */
function executable(payload: SendPayload, plan: SharePlan): ReadonlySet<PublishFormat> {
  const all = new Set<PublishFormat>(['STORY', 'POST', 'REEL']);
  switch (payload.kind) {
    case 'attachment':
      return isVisual(payload.mime) ? all : new Set();
    case 'messages': {
      const sole = plan.kept.length === 1 ? payload.exit.find((message) => message.id === plan.kept[0]) : undefined;
      const pieces = sole?.pieces ?? [];
      return pieces.length === 1 && pieces[0] !== undefined && isVisual(pieces[0].mimeType) ? all : new Set();
    }
    case 'media':
      return isVisual(payload.mime) ? all : new Set();
    case 'files':
      return payload.files.length > 0 && payload.files.every((file) => isVisual(file.type)) ? all : new Set();
    case 'publication':
      return payload.postType === 'STORY' ? new Set() : new Set(['STORY', 'POST']);
    case 'text':
      return new Set(['POST']);
    case 'profile':
    case 'invitation':
      return new Set();
  }
}

export function publishFormatsOf(payload: SendPayload, plan: SharePlan = sharePlanOf(payload)): readonly PublishFormat[] {
  const can = executable(payload, plan);
  return PUBLISH_ORDER.filter(({ action, format }) => plan.actions.includes(action) && can.has(format)).map(({ format }) => format);
}
