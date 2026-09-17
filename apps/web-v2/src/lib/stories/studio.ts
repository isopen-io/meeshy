import type { ApiFailure } from '@/lib/api/http';

import type { StudioMediaKind } from './story-document';
import type { StudioDraftSnapshot } from './studio-draft-store';

/**
 * L'ÉTAT DU STUDIO DE STORY (#6900) — trois portes, une valeur par porte :
 * fond (image/vidéo), son de fond, texte. P1 (« un début, pas les 31 vues ») :
 * une seule scène, un seul fond, un seul son — poser un second fichier
 * REMPLACE le précédent (question 9.1 : il n'y a qu'une place, donc rien à
 * demander à l'auteur).
 *
 * `StudioUploadState` miroir de la pré-montée iOS
 * (`MeeshyComposerHost+PreUpload.swift:1-128`) : `uploading` pendant le
 * transport, `ready` porte l'identité SERVEUR (adoptée), `failed` porte la
 * CLÉ de sa cause — traduite au RENDU, jamais figée dans la langue du moment
 * de l'échec. Un asset RESTAURÉ n'a plus de `File` : il est `ready` ou il
 * n'est pas restauré.
 */
export type StudioFailureKey =
  | 'story.studio.failure.network'
  | 'story.studio.failure.timeout'
  | 'story.studio.failure.session'
  | 'story.studio.failure.account'
  | 'story.studio.failure.forbidden'
  | 'story.studio.failure.tooLarge'
  | 'story.studio.failure.fileRefused'
  | 'story.studio.failure.rateLimited'
  | 'story.studio.failure.refused'
  | 'story.studio.failure.unavailable';

export type StudioUploadState =
  | { readonly phase: 'uploading'; readonly progress: number }
  | { readonly phase: 'ready'; readonly postMediaId: string; readonly fileUrl: string }
  | { readonly phase: 'failed'; readonly reasonKey: StudioFailureKey };

export type StudioBackgroundAsset = {
  readonly file?: File;
  readonly previewUrl: string;
  readonly mediaType: StudioMediaKind;
  readonly upload: StudioUploadState;
};

export type StudioSoundAsset = {
  readonly file?: File;
  readonly previewUrl: string;
  readonly upload: StudioUploadState;
};

export type StudioDraft = {
  readonly text: string;
  readonly language?: string;
  readonly background: StudioBackgroundAsset | null;
  readonly sound: StudioSoundAsset | null;
};

export type StudioDoor = 'visual' | 'sound';

export function emptyStudioDraft(): StudioDraft {
  return { text: '', background: null, sound: null };
}

export function isStudioDraftEmpty(draft: StudioDraft): boolean {
  return draft.text.trim() === '' && draft.background === null && draft.sound === null;
}

export function withText(draft: StudioDraft, text: string): StudioDraft {
  return { ...draft, text };
}

export function withBackground(draft: StudioDraft, asset: StudioBackgroundAsset): StudioDraft {
  return { ...draft, background: asset };
}

export function withoutBackground(draft: StudioDraft): StudioDraft {
  return { ...draft, background: null };
}

export function withBackgroundUpload(draft: StudioDraft, upload: StudioUploadState): StudioDraft {
  if (draft.background === null) return draft;
  return { ...draft, background: { ...draft.background, upload } };
}

export function withSound(draft: StudioDraft, asset: StudioSoundAsset): StudioDraft {
  return { ...draft, sound: asset };
}

export function withoutSound(draft: StudioDraft): StudioDraft {
  return { ...draft, sound: null };
}

export function withSoundUpload(draft: StudioDraft, upload: StudioUploadState): StudioDraft {
  if (draft.sound === null) return draft;
  return { ...draft, sound: { ...draft.sound, upload } };
}

/** La porte décide du rôle ; `accept` n'est qu'un CONSEIL au sélecteur natif
 * (« Tous les fichiers » le contourne) — ce prédicat est la garde. Un MIME
 * vide (inconnu du navigateur) passe : la passerelle juge les octets
 * (`tus-handler.ts:384-400`) et son refus se dit (`fileRefused`). */
export function studioDoorAccepts(door: StudioDoor, mimeType: string): boolean {
  if (mimeType === '') return true;
  if (door === 'sound') return mimeType.startsWith('audio/');
  return mimeType.startsWith('image/') || mimeType.startsWith('video/');
}

/**
 * LE BOUTON PUBLIER EST INERTE — loi 4 (« un contrôle existe s'il a un
 * effet »). `false` sur un brouillon VIDE et sur tout asset en ÉCHEC
 * (l'auteur le retire ou réessaie d'abord) — un asset EN VOL n'inhibe PAS le
 * geste : la publication ATTEND son accusé (§1.4), elle ne relance jamais un
 * second envoi.
 */
export function canPublishStudioDraft(draft: StudioDraft): boolean {
  if (isStudioDraftEmpty(draft)) return false;
  if (draft.background?.upload.phase === 'failed') return false;
  if (draft.sound?.upload.phase === 'failed') return false;
  return true;
}

export function readyAssetOf(upload: StudioUploadState): { readonly postMediaId: string; readonly fileUrl: string } | null {
  return upload.phase === 'ready' ? { postMediaId: upload.postMediaId, fileUrl: upload.fileUrl } : null;
}

/**
 * LA CAUSE D'UN ÉCHEC, dans le vocabulaire d'une STORY — `sendFailureReason`
 * (`send/failure-reason.ts`) parle d'une conversation et d'un message, en
 * français quelle que soit la langue de l'interface. `null` ⇒ rien à dire :
 * une annulation vient de l'auteur lui-même (retrait, remplacement).
 */
export function studioFailureKey(failure: ApiFailure, stage: 'upload' | 'publish'): StudioFailureKey | null {
  if (failure.code === 'ABORTED') return null;
  if (failure.code === 'CANVAS_INVALID' || failure.code === 'MEDIA_NOT_CLAIMED') return 'story.studio.failure.refused';
  if (failure.code === 'POST_MEDIA_REQUIRES_ACCOUNT') return 'story.studio.failure.account';
  if (failure.status === 0) return failure.code === 'TIMEOUT' ? 'story.studio.failure.timeout' : 'story.studio.failure.network';
  if (failure.status === 401) return 'story.studio.failure.session';
  if (failure.status === 403) return 'story.studio.failure.forbidden';
  if (failure.status === 413) return 'story.studio.failure.tooLarge';
  if (failure.status === 429) return 'story.studio.failure.rateLimited';
  if (failure.status === 400 && stage === 'upload') return 'story.studio.failure.fileRefused';
  if (failure.status >= 400 && failure.status < 500) return 'story.studio.failure.refused';
  return 'story.studio.failure.unavailable';
}

/** Ce qui se PERSISTE : le texte et les médias PRÊTS — jamais un `File`,
 * jamais une URL locale (morte au rechargement). */
export function studioSnapshotOf(draft: StudioDraft, language: string): StudioDraftSnapshot {
  const background = draft.background === null ? null : readyAssetOf(draft.background.upload);
  const sound = draft.sound === null ? null : readyAssetOf(draft.sound.upload);
  return {
    text: draft.text,
    ...(draft.text.trim() !== '' ? { language } : {}),
    ...(background !== null && draft.background !== null ? { background: { ...background, mediaType: draft.background.mediaType } } : {}),
    ...(sound !== null ? { sound } : {}),
  };
}

/** Le brouillon RELU — chaque média restauré est PRÊT et se prévisualise
 * depuis le SERVEUR (`resolveUrl`, `attachmentSrc` en production) : c'est le
 * seul cas où l'aperçu lit le réseau, le fichier local n'existant plus. */
export function studioDraftFromSnapshot(snapshot: StudioDraftSnapshot | null, resolveUrl: (fileUrl: string) => string): StudioDraft {
  if (snapshot === null) return emptyStudioDraft();
  const { background, sound } = snapshot;
  return {
    text: snapshot.text,
    ...(snapshot.language !== undefined ? { language: snapshot.language } : {}),
    background:
      background === undefined
        ? null
        : {
            previewUrl: resolveUrl(background.fileUrl),
            mediaType: background.mediaType,
            upload: { phase: 'ready', postMediaId: background.postMediaId, fileUrl: background.fileUrl },
          },
    sound:
      sound === undefined
        ? null
        : { previewUrl: resolveUrl(sound.fileUrl), upload: { phase: 'ready', postMediaId: sound.postMediaId, fileUrl: sound.fileUrl } },
  };
}
