import { appelNatifMethode, type CoqueNative } from '@/lib/native-shell';

import type { IncomingShare } from './incoming-share';

/**
 * LE PARTAGE REÇU PAR LA COQUE ANDROID (#8884) — l'autre porte d'entrée, celle
 * de l'intent `SEND` / `SEND_MULTIPLE` (`AndroidManifest.xml`). Le pont
 * `MeeshyShareIntent` (`MeeshyShareIntentPlugin.java`) copie les contenus
 * partagés en fichiers temporaires de la coque — une WebView ne lit pas les
 * `content://` d'une autre application — et les décrit. Ce module lit ces
 * fichiers par l'adresse locale de la WebView (la même que `@capacitor/camera`
 * remet en `webPath`), les rend en `File`, puis relâche les temporaires.
 *
 * Les deux moitiés du pont — `consume` (prend le partage en attente, une seule
 * fois) et `release` (efface les temporaires) — sont séparées : les `File` sont
 * en mémoire avant que le natif ne supprime quoi que ce soit.
 */
export const PONT_PARTAGE = 'MeeshyShareIntent';
const EVENEMENT = 'shareReceived';

export type NativeSharedFile = {
  readonly path: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
};

export type NativeShare = {
  readonly files: readonly NativeSharedFile[];
  readonly text: string;
  readonly subject: string;
};

type CoqueWithFiles = CoqueNative & { readonly convertFileSrc?: (path: string) => string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const stringOr = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

const sharedFileOf = (value: unknown): NativeSharedFile | null => {
  const record = asRecord(value);
  if (record === null || typeof record['path'] !== 'string' || typeof record['name'] !== 'string') return null;
  const size = record['size'];
  return {
    path: record['path'],
    name: record['name'],
    mimeType: stringOr(record['mimeType'], ''),
    size: typeof size === 'number' && Number.isFinite(size) ? size : 0,
  };
};

/** Ce que le pont remet, validé : le natif est une frontière, pas une garantie. */
export function parseNativeShare(raw: unknown): NativeShare | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const files = (Array.isArray(record['files']) ? record['files'] : []).map(sharedFileOf).filter((file): file is NativeSharedFile => file !== null);
  const text = stringOr(record['text'], '');
  const subject = stringOr(record['subject'], '');
  return files.length === 0 && text === '' && subject === '' ? null : { files, text, subject };
}

const localUrlOf = (coque: CoqueWithFiles, origin: string, path: string): string =>
  typeof coque.convertFileSrc === 'function' ? coque.convertFileSrc(path) : `${origin}/_capacitor_file_${path}`;

async function fileOf(file: NativeSharedFile, url: string, fetchImpl: typeof fetch): Promise<File | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], file.name, { type: file.mimeType === '' ? blob.type : file.mimeType });
  } catch {
    return null;
  }
}

/**
 * Prend le partage en attente côté coque. `null` : rien à recevoir, hors coque,
 * coque construite avant le pont, ou pont en échec — jamais une exception, le
 * partage est perdu mais l'application démarre.
 */
export async function readNativeShare(params: {
  readonly coque: CoqueNative | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly origin?: string;
}): Promise<IncomingShare | null> {
  const consume = appelNatifMethode(params.coque, PONT_PARTAGE, 'consume');
  if (params.coque === undefined || consume === null) return null;
  const release = appelNatifMethode(params.coque, PONT_PARTAGE, 'release');
  const coque: CoqueWithFiles = params.coque;
  try {
    const native = parseNativeShare(await consume({}));
    if (native === null) return null;
    const fetchImpl = params.fetchImpl ?? fetch;
    const origin = params.origin ?? globalThis.location?.origin ?? '';
    const files = (await Promise.all(native.files.map((file) => fileOf(file, localUrlOf(coque, origin, file.path), fetchImpl)))).filter(
      (file): file is File => file !== null,
    );
    if (native.files.length > 0) await release?.({}).catch(() => undefined);
    const share: IncomingShare = { files, text: native.text, title: native.subject, url: '' };
    return files.length === 0 && native.text === '' && native.subject === '' ? null : share;
  } catch {
    return null;
  }
}

/** S'abonne au réveil du pont ; `false` hors coque ou coque sans le pont. */
export function listenNativeShares(coque: CoqueNative | undefined, onShare: () => void): boolean {
  const declare = coque?.PluginHeaders?.some((header) => header.name === PONT_PARTAGE) === true;
  const addListener = coque?.addListener;
  if (!declare || typeof addListener !== 'function') return false;
  addListener(PONT_PARTAGE, EVENEMENT, () => onShare());
  return true;
}
