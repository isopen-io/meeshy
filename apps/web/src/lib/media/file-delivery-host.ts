import { annulationDuPont, appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

import { base64De, fileSinkOf, SINK_CHUNK_BYTES, throughSink } from './file-sink';

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
 *    `invitation.ts`) : son pont `MeeshyShare.shareFile` (#7863) ouvre la
 *    même feuille avec le fichier. Une coque construite avant ce pont ne
 *    déclare pas la méthode et reste sans porte.
 *
 * Module STATIQUE et léger : le lecteur le lit pour décider d'offrir le
 * geste ; la LIVRAISON elle-même (`deliver-file.ts`) reste à la demande.
 */
export type FileDeliveryHost = {
  readonly document?: Pick<Document, 'createElement'> & { readonly body: Pick<HTMLElement, 'appendChild' | 'removeChild'> };
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly canShareFiles?: (data: { readonly files: readonly File[]; readonly text?: string }) => boolean;
  readonly shareFiles?: (data: { readonly files: readonly File[]; readonly text?: string }) => Promise<void>;
};

type FileShareNavigator = {
  readonly canShare?: (data: { files: File[]; text?: string }) => boolean;
  readonly share?: (data: { files: File[]; text?: string }) => Promise<void>;
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

/**
 * LE PLAFOND DU PONT DE LA COQUE (#8336, #9512) — un fichier y voyage en base64
 * dans une chaîne, recopiée par le pont puis par Java : au-delà, la copie fait
 * courir un OOM à l'application. La galerie (`gallery-saver.ts`) et la feuille
 * de partage lisent ce même plafond, sans quoi la seconde copierait ce que la
 * première vient de refuser.
 */
export const NATIVE_BRIDGE_MAX_BYTES = 32 * 1024 * 1024;

export type NativeBridgeLimits = { readonly bridgeMaxBytes?: number; readonly chunkBytes?: number };

/**
 * Au-delà du plafond, le fichier passe par tranches dans le récepteur de la
 * coque (#9553), puis `shareFileAt` partage le fichier écrit, comme
 * `shellGallerySaver` l'enregistre (#9514). Le récepteur nomme son fichier
 * d'après le TYPE : un fichier sans type reste refusé.
 */
function partageParLePont(shell: CoqueNative | undefined, limits: NativeBridgeLimits): Pick<FileDeliveryHost, 'canShareFiles' | 'shareFiles'> {
  const pont = appelNatifMethode(shell, 'MeeshyShare', 'shareFile');
  if (pont === null) return {};
  const { bridgeMaxBytes = NATIVE_BRIDGE_MAX_BYTES, chunkBytes = SINK_CHUNK_BYTES } = limits;
  const pontEcrit = appelNatifMethode(shell, 'MeeshyShare', 'shareFileAt');
  const sink = pontEcrit === null ? null : fileSinkOf(shell);
  const parTranches = (file: File): boolean => file.size > bridgeMaxBytes;
  const annule = (erreur: unknown): never => {
    throw annulationDuPont(erreur);
  };
  return {
    canShareFiles: (data) => {
      const [file] = data.files;
      if (data.files.length !== 1 || file === undefined) return false;
      return !parTranches(file) || (sink !== null && file.type !== '');
    },
    shareFiles: async ({ files, text }) => {
      const [file] = files;
      if (file === undefined) return;
      const offert = text === undefined ? {} : { text };
      if (parTranches(file) && sink !== null && pontEcrit !== null) {
        await throughSink({
          sink,
          blob: file,
          mimeType: file.type,
          chunkBytes,
          use: (path) => pontEcrit({ fileName: file.name, mimeType: file.type, path, ...offert }).catch(annule),
        });
        return;
      }
      const data = await base64De(file);
      await pont({ fileName: file.name, mimeType: file.type, data, ...offert }).catch(annule);
    },
  };
}

/**
 * LE PONT DE LA COQUE D'ABORD (#9038) — une coque qui DÉCLARE
 * `MeeshyShare.shareFile` y remet le fichier, même si sa WebView expose
 * `navigator.share` : une WebView peut n'en offrir que la moitié texte
 * (`canShare({ files })` faux), et le geste « Partager » d'une carte imagée
 * restait alors sans porte. Le pont porte les OCTETS, et au-delà du plafond
 * le seul chemin qu'il accepte est celui d'un fichier de son récepteur.
 */
export function browserFileDeliveryHost(
  environment: FileDeliveryEnvironment = currentEnvironment(),
  limits: NativeBridgeLimits = {},
): FileDeliveryHost {
  if (environment.document === undefined) return {};
  const nav = environment.navigator;
  const pont = partageParLePont(environment.shell, limits);
  const fileShare =
    pont.shareFiles === undefined && nav !== undefined && typeof nav.canShare === 'function' && typeof nav.share === 'function'
      ? {
          canShareFiles: (data: { readonly files: readonly File[]; readonly text?: string }) =>
            nav.canShare?.({ files: [...data.files], ...(data.text === undefined ? {} : { text: data.text }) }) === true,
          shareFiles: (data: { readonly files: readonly File[]; readonly text?: string }) =>
            nav.share?.({ files: [...data.files], ...(data.text === undefined ? {} : { text: data.text }) }) ?? Promise.resolve(),
        }
      : pont;
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
