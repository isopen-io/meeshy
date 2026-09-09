import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { MAX_ATTACHMENTS_PER_MESSAGE, SMALL_FILE_THRESHOLD } from '@meeshy/shared/types/attachment';
import { DEFAULT_USER_PERMISSIONS } from '@meeshy/shared/types/participant';

import { previewUrlFor, releasePreviewUrl } from './attachment-preview-url';
import {
  acceptPendingFiles,
  addPendingAttachment,
  attachmentPreviewOf,
  attachmentRightFor,
  mayAttach,
  messageTypeOfPending,
  pendingAttachmentOf,
  removePendingAttachment,
  resetPendingAttachmentIdsForTests,
  type PendingAttachment,
} from './attachments';

// `File`/`URL.createObjectURL` n'existent que dans un DOM — happy-dom, jamais
// le moteur `bun:test` nu (même dispositif que `composer.test.tsx`).
beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const file = (name: string, type: string, bytes = 3): File => new File([new Uint8Array(bytes)], name, { type });

describe('pendingAttachmentOf — le GENRE dérivé du MIME, la MÊME règle que le serveur', () => {
  test('image/jpeg ⇒ image', () => {
    expect(pendingAttachmentOf(file('photo.jpg', 'image/jpeg')).kind).toBe('image');
  });

  test('audio/wav ⇒ audio', () => {
    expect(pendingAttachmentOf(file('son.wav', 'audio/wav')).kind).toBe('audio');
  });

  test('video/mp4 ⇒ video', () => {
    expect(pendingAttachmentOf(file('clip.mp4', 'video/mp4')).kind).toBe('video');
  });

  test('application/pdf (ou tout MIME hors image/audio/vidéo) ⇒ file', () => {
    expect(pendingAttachmentOf(file('doc.pdf', 'application/pdf')).kind).toBe('file');
  });

  test('name/size REPRIS du fichier ; durationMs ABSENT sans option', () => {
    const p = pendingAttachmentOf(file('a.png', 'image/png', 42));
    expect(p.name).toBe('a.png');
    expect(p.size).toBe(42);
    expect('durationMs' in p).toBe(false);
  });

  test('durationMs porté seulement quand fourni (un vocal)', () => {
    const p = pendingAttachmentOf(file('voix.webm', 'audio/webm'), { durationMs: 4200 });
    expect(p.durationMs).toBe(4200);
  });

  test('localId : deux fichiers distincts ⇒ deux identifiants distincts', () => {
    resetPendingAttachmentIdsForTests();
    const a = pendingAttachmentOf(file('a.png', 'image/png'));
    const b = pendingAttachmentOf(file('b.png', 'image/png'));
    expect(a.localId).not.toBe(b.localId);
  });
});

describe('addPendingAttachment / removePendingAttachment — IMMUABLES', () => {
  test('add ajoute en QUEUE sans muter la liste reçue', () => {
    const first = pendingAttachmentOf(file('a.png', 'image/png'));
    const before: readonly PendingAttachment[] = [];
    const after = addPendingAttachment(before, first);
    expect(before).toHaveLength(0);
    expect(after).toEqual([first]);
  });

  test('remove retire par localId, sans muter la liste reçue', () => {
    const a = pendingAttachmentOf(file('a.png', 'image/png'));
    const b = pendingAttachmentOf(file('b.png', 'image/png'));
    const before = [a, b];
    const after = removePendingAttachment(before, a.localId);
    expect(before).toHaveLength(2);
    expect(after).toEqual([b]);
  });

  test('remove d’un localId absent ⇒ liste inchangée en VALEUR', () => {
    const a = pendingAttachmentOf(file('a.png', 'image/png'));
    expect(removePendingAttachment([a], 'inexistant')).toEqual([a]);
  });
});

describe('messageTypeOfPending — miroir de messageTypeForClientAttachments', () => {
  test('liste vide ⇒ text', () => {
    expect(messageTypeOfPending([])).toBe('text');
  });

  test('une seule catégorie ⇒ cette catégorie', () => {
    const p = pendingAttachmentOf(file('a.png', 'image/png'));
    expect(messageTypeOfPending([p])).toBe('image');
  });

  test('catégories mélangées (photo + PDF) ⇒ file, jamais la première pièce seule', () => {
    const photo = pendingAttachmentOf(file('a.png', 'image/png'));
    const pdf = pendingAttachmentOf(file('a.pdf', 'application/pdf'));
    expect(messageTypeOfPending([photo, pdf])).toBe('file');
  });
});

describe('attachmentPreviewOf — la charge que la bulle optimiste rend', () => {
  test('id === localId ; fileUrl est un URL D’OBJET (jamais le chemin serveur) ; duration reprise', () => {
    const pending = pendingAttachmentOf(file('voix.webm', 'audio/webm', 10), { durationMs: 1500 });
    const preview = attachmentPreviewOf(pending);
    expect(preview.id).toBe(pending.localId);
    expect(preview.messageId).toBe('');
    expect(preview.fileName).toBe('voix.webm');
    expect(preview.originalName).toBe('voix.webm');
    expect(preview.mimeType).toBe('audio/webm');
    expect(preview.fileSize).toBe(10);
    expect(preview.fileUrl.startsWith('blob:')).toBe(true);
    expect(preview.duration).toBe(1500);
  });

  test('sans durationMs, la clé duration est ABSENTE — jamais 0 fabriqué', () => {
    const pending = pendingAttachmentOf(file('a.png', 'image/png'));
    expect('duration' in attachmentPreviewOf(pending)).toBe(false);
  });
});

/**
 * DÉFAUT 7 (revue #5668) — `attachmentPreviewOf` créait sa PROPRE
 * `createObjectURL`, jamais révoquée : mesuré, trois envois d'UNE photo ⇒
 * six URL créées, trois seulement révoquées (celles de la tuile du plateau,
 * qui démonte). `previewUrlFor` (`attachment-preview-url.ts`) partage
 * désormais l'URL entre la tuile ET la bulle optimiste — UNE seule création
 * par pièce, jamais deux.
 */
describe('attachmentPreviewOf — l’URL d’aperçu, PARTAGÉE (défaut 7, revue #5668)', () => {
  test('deux appels sur la MÊME pièce ⇒ la MÊME fileUrl, jamais une seconde createObjectURL', () => {
    const pending = pendingAttachmentOf(file('photo.jpg', 'image/jpeg'));
    const first = attachmentPreviewOf(pending);
    const second = attachmentPreviewOf(pending);
    expect(second.fileUrl).toBe(first.fileUrl);
  });

  test('previewUrlFor(localId, file) rend la MÊME URL que celle posée par attachmentPreviewOf pour ce localId', () => {
    const pending = pendingAttachmentOf(file('photo.jpg', 'image/jpeg'));
    const preview = attachmentPreviewOf(pending);
    expect(previewUrlFor(pending.localId, pending.file)).toBe(preview.fileUrl);
  });

  test('releasePreviewUrl retire l’entrée — un appel ULTÉRIEUR recrée une URL neuve, jamais la même', () => {
    // Comptage SCOPÉ à ce `localId` — la carte est un magasin de MODULE
    // partagé par toute la suite (même discipline que
    // `resetPendingAttachmentIdsForTests`) : sa TAILLE globale dépend de ce
    // que d'AUTRES fichiers y ont laissé, jamais un témoin fiable ici.
    const pending = pendingAttachmentOf(file('photo.jpg', 'image/jpeg'));
    const before = attachmentPreviewOf(pending);
    releasePreviewUrl(pending.localId);
    const after = previewUrlFor(pending.localId, pending.file);
    expect(after).not.toBe(before.fileUrl);
  });

  test('releasePreviewUrl sur un localId inconnu ⇒ ne lève pas (idempotent)', () => {
    expect(() => releasePreviewUrl('jamais-créé')).not.toThrow();
  });
});


/**
 * CE QUE LE COMPOSEUR ACCEPTE (revue-correction #5668) — trois refus, et
 * chacun DIT sa cause. La version livrée n'en posait AUCUN : `api/messages.ts`
 * déclarait que la borne était tenue « par `send/attachments.ts` », qui ne la
 * tenait pas — deux absences qui se justifiaient l'une l'autre.
 */
describe('acceptPendingFiles — le droit, la taille, le nombre (#5668, revue-correction)', () => {
  const rights = { ...DEFAULT_USER_PERMISSIONS, canSendImages: false };

  test('un type SANS droit est écarté avec sa cause, et la sélection ne bouge pas', () => {
    const outcome = acceptPendingFiles({ current: [], files: [file('plage.jpg', 'image/jpeg')], rights });
    expect(outcome.list).toHaveLength(0);
    expect(outcome.refusal).toContain('plage.jpg');
  });

  test('le MÊME droit laisse passer un type AUTRE (le refus est par catégorie, pas global)', () => {
    const outcome = acceptPendingFiles({ current: [], files: [file('notes.pdf', 'application/pdf')], rights });
    expect(outcome.list).toHaveLength(1);
    expect(outcome.refusal).toBeUndefined();
  });

  test('au-delà de SMALL_FILE_THRESHOLD (le seuil du chemin REST direct), le fichier est écarté', () => {
    // La TAILLE est déclarée, pas allouée : un `Uint8Array` de 50 Mo ne
    // mesurerait que la mémoire du moteur de test.
    const heavy = file('film.mov', 'video/quicktime');
    Object.defineProperty(heavy, 'size', { value: SMALL_FILE_THRESHOLD + 1, configurable: true });
    const outcome = acceptPendingFiles({ current: [], files: [heavy] });
    expect(outcome.list).toHaveLength(0);
    expect(outcome.refusal).toContain('50 Mo');
  });

  test('la sélection est BORNÉE à MAX_ATTACHMENTS_PER_MESSAGE — le corps du POST est refusé au-delà', () => {
    const full = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, (_, i) =>
      pendingAttachmentOf(file(`p${i}.png`, 'image/png')),
    );
    const outcome = acceptPendingFiles({ current: full, files: [file('un-de-trop.png', 'image/png')] });
    expect(outcome.list).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);
    expect(outcome.refusal).toContain(String(MAX_ATTACHMENTS_PER_MESSAGE));
  });

  test('addPendingAttachment porte la borne, quel que soit l’appelant', () => {
    const full = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, (_, i) =>
      pendingAttachmentOf(file(`p${i}.png`, 'image/png')),
    );
    expect(addPendingAttachment(full, pendingAttachmentOf(file('x.png', 'image/png')))).toHaveLength(
      MAX_ATTACHMENTS_PER_MESSAGE,
    );
  });
});

/**
 * LA TABLE DES DROITS — miroir de `attachmentSendRightForMimeType`
 * (`services/gateway/src/services/participantRights.ts:230-235`), repli
 * générique `canSendFiles` compris. Un témoin de RANG s'écrit sur un rang
 * AUTRE que le premier : `canSendFiles` ouvert ne doit PAS ouvrir l'image.
 */
describe('attachmentRightFor / mayAttach', () => {
  test('image / vidéo / audio ont chacun leur droit ; le reste retombe sur canSendFiles', () => {
    expect(attachmentRightFor('image/png')).toBe('canSendImages');
    expect(attachmentRightFor('video/mp4')).toBe('canSendVideos');
    expect(attachmentRightFor('audio/webm')).toBe('canSendAudios');
    expect(attachmentRightFor('application/pdf')).toBe('canSendFiles');
    expect(attachmentRightFor(undefined)).toBe('canSendFiles');
  });

  test('canSendFiles ouvert n’est JAMAIS un laissez-passer pour l’image', () => {
    const rights = { ...DEFAULT_USER_PERMISSIONS, canSendImages: false, canSendFiles: true };
    expect(mayAttach(rights, 'image/png')).toBe(false);
    expect(mayAttach(rights, 'application/pdf')).toBe(true);
  });

  test('droits ABSENTS ⇒ tout est permis (aucun participant chargé encore)', () => {
    expect(mayAttach(undefined, 'image/png')).toBe(true);
  });
});
