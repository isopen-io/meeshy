import { coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * **CE QUE L'HÔTE SAIT LIVRER** (#7116, revue) — les portes par lesquelles un
 * fichier déjà téléchargé peut ATTEINDRE l'utilisateur, décidées AVANT
 * d'offrir « Enregistrer » (loi 4 : un contrôle existe s'il a un effet).
 *
 *  - l'ANCRE `<a download>` — un navigateur. JAMAIS dans une coque : mesuré
 *    dans le dépôt, ni `@capacitor/android` 8.5.1 (aucun `DownloadListener`)
 *    ni `@capacitor/ios` 8.5.1 (aucun `WKDownloadDelegate`) ne branchent le
 *    téléchargement de leur WebView — l'ancre y serait un clic sans effet ;
 *  - le PARTAGE DE FICHIER (`navigator.canShare({ files })`) — Safari mobile
 *    et la coque iOS, où la feuille du système propose « Enregistrer dans
 *    Photos ». La coque Android n'a pas `navigator.share` (crbug 765923,
 *    `invitation.ts`), et son pont `MeeshyShare` ne porte que du texte.
 *
 * Module STATIQUE et léger : le lecteur le lit pour décider d'offrir le
 * geste ; la LIVRAISON elle-même (`deliver-file.ts`) reste à la demande.
 */
export type FileDeliveryHost = {
  readonly document?: Pick<Document, 'createElement'> & { readonly body: Pick<HTMLElement, 'appendChild' | 'removeChild'> };
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly canShareFiles?: (data: { readonly files: readonly File[] }) => boolean;
  readonly shareFiles?: (data: { readonly files: readonly File[] }) => Promise<void>;
};

type FileShareNavigator = {
  readonly canShare?: (data: { files: File[] }) => boolean;
  readonly share?: (data: { files: File[] }) => Promise<void>;
};

export type FileDeliveryEnvironment = {
  readonly document: FileDeliveryHost['document'] | undefined;
  readonly navigator: FileShareNavigator | undefined;
  readonly urls: { readonly createObjectURL: (blob: Blob) => string; readonly revokeObjectURL: (url: string) => void };
  readonly shell: CoqueNative | undefined;
};

function currentEnvironment(): FileDeliveryEnvironment {
  return {
    document: typeof document === 'undefined' ? undefined : document,
    navigator: typeof navigator === 'undefined' ? undefined : (navigator as FileShareNavigator),
    urls: { createObjectURL: (blob) => URL.createObjectURL(blob), revokeObjectURL: (url) => URL.revokeObjectURL(url) },
    shell: coqueCourante(),
  };
}

export function browserFileDeliveryHost(environment: FileDeliveryEnvironment = currentEnvironment()): FileDeliveryHost {
  if (environment.document === undefined) return {};
  const nav = environment.navigator;
  const fileShare =
    nav !== undefined && typeof nav.canShare === 'function' && typeof nav.share === 'function'
      ? {
          canShareFiles: (data: { readonly files: readonly File[] }) => nav.canShare?.({ files: [...data.files] }) === true,
          shareFiles: (data: { readonly files: readonly File[] }) => nav.share?.({ files: [...data.files] }) ?? Promise.resolve(),
        }
      : {};
  const anchor =
    environment.shell === undefined
      ? { document: environment.document, createObjectURL: environment.urls.createObjectURL, revokeObjectURL: environment.urls.revokeObjectURL }
      : {};
  return { ...anchor, ...fileShare };
}

export function hasFileDeliveryDoor(host: FileDeliveryHost): boolean {
  const anchor = host.document !== undefined && host.createObjectURL !== undefined && host.revokeObjectURL !== undefined;
  const fileShare = host.canShareFiles !== undefined && host.shareFiles !== undefined;
  return anchor || fileShare;
}
