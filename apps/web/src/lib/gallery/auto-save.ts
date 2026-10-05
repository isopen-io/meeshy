import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { galleryMediaEssence, type GallerySaver } from './gallery-saver';

/**
 * **L'ENREGISTREMENT AUTOMATIQUE DES MÉDIAS REÇUS** (#8308) — règles porteur,
 * jumelles de l'issue iOS :
 *
 *  - REÇUS seulement : jamais un média que j'ai envoyé (mon participant, mon
 *    compte, ou l'écho de mon envoi — seul l'écho porte un `clientMessageId`) ;
 *  - à la RÉCEPTION (`message:new`), une SEULE fois par pièce — registre local
 *    borné, préfixé par le lecteur (deux comptes sur un appareil ne partagent
 *    rien) ;
 *  - JAMAIS un média protégé : éphémère (échéance, durée, drapeau, y compris
 *    « éphémère après lecture »), flou, vue unique, chiffré — lu au niveau du
 *    MESSAGE comme de la PIÈCE, les deux niveaux qui le déclarent ;
 *  - images et vidéos seulement ;
 *  - un interrupteur des réglages médias, actif par défaut.
 *
 * Tout accès au stockage est rattrapé : une fenêtre privée ou un quota plein
 * rendent l'état par défaut, jamais une exception dans le puits du socket.
 */

export type GalleryStorage = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
};

export type GalleryAttachment = {
  readonly id: string;
  readonly fileUrl: string;
  readonly mimeType: string;
  readonly originalName?: string;
};

export type GalleryMessage = {
  readonly senderId?: string;
  readonly sender?: { readonly userId?: string } | null;
  readonly clientMessageId?: string;
  readonly isViewOnce?: boolean;
  readonly isBlurred?: boolean;
  readonly isEncrypted?: boolean;
  readonly expiresAt?: unknown;
  readonly ephemeralDuration?: number | null;
  readonly effectFlags?: number;
  readonly attachments?: unknown;
};

const PROTECTING_FLAGS =
  MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.BLURRED | MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

const flagsProtect = (flags: unknown): boolean => typeof flags === 'number' && (flags & PROTECTING_FLAGS) !== 0;

const present = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

function messageIsProtected(message: GalleryMessage): boolean {
  return (
    message.isViewOnce === true ||
    message.isBlurred === true ||
    message.isEncrypted === true ||
    present(message.expiresAt) ||
    (typeof message.ephemeralDuration === 'number' && message.ephemeralDuration > 0) ||
    flagsProtect(message.effectFlags)
  );
}

function attachmentIsProtected(raw: Record<string, unknown>): boolean {
  return (
    raw.isViewOnce === true ||
    raw.isBlurred === true ||
    raw.isEncrypted === true ||
    present(raw.encryptionIv) ||
    present(raw.encryptionAuthTag) ||
    flagsProtect(raw.effectFlags)
  );
}

const isMine = (message: GalleryMessage, viewerId: string): boolean =>
  message.senderId === viewerId || message.sender?.userId === viewerId || message.clientMessageId !== undefined;

function visualAttachmentOf(raw: unknown): GalleryAttachment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const { id, fileUrl, mimeType, originalName } = record;
  if (typeof id !== 'string' || typeof fileUrl !== 'string' || typeof mimeType !== 'string' || fileUrl === '') return null;
  if (galleryMediaEssence(mimeType) === null) return null;
  if (attachmentIsProtected(record)) return null;
  return { id, fileUrl, mimeType, ...(typeof originalName === 'string' && originalName !== '' ? { originalName } : {}) };
}

/** Les pièces qui ONT LE DROIT de partir vers la galerie — vide dès qu'une règle refuse. */
export function galleryCandidates(message: GalleryMessage, viewerId: string): readonly GalleryAttachment[] {
  if (viewerId === '' || isMine(message, viewerId) || messageIsProtected(message)) return [];
  if (!Array.isArray(message.attachments)) return [];
  return message.attachments.map(visualAttachmentOf).filter((attachment): attachment is GalleryAttachment => attachment !== null);
}

export const GALLERY_REGISTRY_CAPACITY = 500;

const registryKey = (readerId: string): string => `meeshy.gallery.saved.${readerId}`;

function readIds(storage: GalleryStorage, key: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export type GalleryRegistry = {
  readonly has: (attachmentId: string) => boolean;
  readonly mark: (attachmentId: string) => void;
};

export function createGalleryRegistry(params: { readonly storage: GalleryStorage; readonly readerId: string }): GalleryRegistry {
  const key = registryKey(params.readerId);
  return {
    has: (attachmentId) => readIds(params.storage, key).includes(attachmentId),
    mark: (attachmentId) => {
      const ids = readIds(params.storage, key).filter((id) => id !== attachmentId);
      const next = [...ids, attachmentId].slice(-GALLERY_REGISTRY_CAPACITY);
      try {
        params.storage.setItem(key, JSON.stringify(next));
      } catch {
        return;
      }
    },
  };
}

const SETTING_KEY = 'meeshy.gallery.autoSave';

export function galleryAutoSaveEnabled(storage: GalleryStorage): boolean {
  try {
    return storage.getItem(SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setGalleryAutoSaveEnabled(storage: GalleryStorage, enabled: boolean): void {
  try {
    storage.setItem(SETTING_KEY, enabled ? 'on' : 'off');
  } catch {
    return;
  }
}

export type GalleryAutoSaveDeps = {
  readonly isAndroidShell: () => boolean;
  readonly saver: () => GallerySaver | null;
  readonly storage: () => GalleryStorage | null;
  readonly fetchBlob: (attachment: GalleryAttachment) => Promise<Blob | null>;
};

/**
 * Le geste de réception : décide, télécharge, enregistre, puis NOTE — une
 * pièce n'est notée qu'une fois enregistrée, et deux échos simultanés d'un
 * même message ne partent qu'une fois (pièces en vol).
 */
export function createGalleryAutoSave(deps: GalleryAutoSaveDeps): (message: GalleryMessage, viewerId: string) => void {
  const inFlight = new Set<string>();

  const saveOne = async (saver: GallerySaver, registry: GalleryRegistry, attachment: GalleryAttachment): Promise<void> => {
    try {
      const blob = await deps.fetchBlob(attachment);
      if (blob === null) return;
      const mimeType = blob.type !== '' ? blob.type : attachment.mimeType;
      const outcome = await saver.save({ blob, fileName: attachment.originalName ?? `meeshy-${attachment.id}`, mimeType });
      if (outcome === 'saved') registry.mark(attachment.id);
    } catch {
      return;
    } finally {
      inFlight.delete(attachment.id);
    }
  };

  return (message, viewerId) => {
    if (!deps.isAndroidShell()) return;
    const saver = deps.saver();
    const storage = deps.storage();
    if (saver === null || !saver.available || storage === null || !galleryAutoSaveEnabled(storage)) return;
    const registry = createGalleryRegistry({ storage, readerId: viewerId });
    const pending = galleryCandidates(message, viewerId).filter((attachment) => !inFlight.has(attachment.id) && !registry.has(attachment.id));
    for (const attachment of pending) {
      inFlight.add(attachment.id);
      void saveOne(saver, registry, attachment);
    }
  };
}
