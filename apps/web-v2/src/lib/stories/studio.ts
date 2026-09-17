import type { StudioMediaKind } from './story-document';

/**
 * L'ÉTAT DU STUDIO DE STORY (#6900) — trois portes, une valeur par porte :
 * fond (image/vidéo), son de fond, texte. P1 (« un début, pas les 31 vues ») :
 * une seule scène, un seul fond, un seul son — poser un second fichier
 * REMPLACE le précédent (§ 1.2 de la spécification, « aucune question n'est
 * posée à l'utilisateur » — ici il n'y a qu'une place, donc rien à choisir).
 *
 * `StudioUploadState` miroir de la pré-montée iOS
 * (`MeeshyComposerHost+PreUpload.swift:1-128`) : `uploading` pendant le
 * transport, `ready` porte l'identité SERVEUR (adoptée), `failed` porte la
 * RAISON — le brouillon garde le fichier local, `Réessayer` relance SUR LE
 * MÊME fichier plutôt que de redemander la sélection.
 */
export type StudioUploadState =
  | { readonly phase: 'uploading' }
  | { readonly phase: 'ready'; readonly postMediaId: string; readonly fileUrl: string }
  | { readonly phase: 'failed'; readonly reason: string };

export type StudioBackgroundAsset = {
  /** ABSENT pour un asset RESTAURÉ depuis `studioDraftStore` (§0, brouillon
   * conservé sur échec) : aucun fichier ne survit à une reprise de session —
   * seule son identité SERVEUR (déjà `ready`) le fait. `Réessayer` n'a alors
   * plus de sens (l'asset n'est pas en échec), et n'est jamais montré. */
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
  readonly background: StudioBackgroundAsset | null;
  readonly sound: StudioSoundAsset | null;
};

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

/**
 * LE BOUTON PUBLIER EST INERTE — loi 4 (« un contrôle existe s'il a un
 * effet »), critère de fin de `story-compose.test.tsx`. `false` sur un
 * brouillon VIDE (rien à publier, O3 côté serveur) et sur tout asset en
 * ÉCHEC (l'utilisateur doit le retirer ou réessayer avant d'avancer) — un
 * asset EN VOL, lui, n'inhibe PAS le bouton : `publier()` ATTEND son accusé
 * (§1.4, « la publication ATTEND l'accusé, elle ne relance pas un second
 * envoi »), il ne bloque pas le geste qui le déclenche.
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
