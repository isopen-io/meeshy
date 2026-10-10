import { appelNatifMethode, type CoqueNative } from '@/lib/native-shell';

/**
 * **LE RÉCEPTEUR DE FICHIERS DE LA COQUE ANDROID** (#9514, #9553) — le pont
 * Capacitor porte un fichier en base64 dans UNE chaîne, recopiée par le pont
 * puis par Java. Au-delà de son plafond (`NATIVE_BRIDGE_MAX_BYTES`), la pièce
 * passe par TRANCHES dans `MeeshyFileSink`, qui l'écrit dans un fichier de son
 * cache ; la galerie (`gallery-saver.ts`) et la feuille de partage
 * (`file-delivery-host.ts`) consomment ce fichier, puis le récepteur l'efface.
 * Une coque construite avant le récepteur ne déclare pas ses méthodes : le
 * récepteur est alors `null`, et le plafond reste un refus.
 */

/** Une tranche du récepteur : quelques Mo dans le pont, jamais la pièce entière. */
export const SINK_CHUNK_BYTES = 4 * 1024 * 1024;

const BLOC_BASE64 = 0x8000;

export async function base64De(blob: Blob): Promise<string> {
  const octets = new Uint8Array(await blob.arrayBuffer());
  const blocs = Array.from({ length: Math.ceil(octets.length / BLOC_BASE64) }, (_, i) =>
    String.fromCharCode(...octets.subarray(i * BLOC_BASE64, (i + 1) * BLOC_BASE64)),
  );
  return btoa(blocs.join(''));
}

const SINK_PLUGIN = 'MeeshyFileSink';

type NativeMethod = (options: object) => Promise<unknown>;
export type FileSink = { readonly open: NativeMethod; readonly append: NativeMethod; readonly close: NativeMethod; readonly discard: NativeMethod };

export function fileSinkOf(shell: CoqueNative | undefined): FileSink | null {
  const open = appelNatifMethode(shell, SINK_PLUGIN, 'open');
  const append = appelNatifMethode(shell, SINK_PLUGIN, 'append');
  const close = appelNatifMethode(shell, SINK_PLUGIN, 'close');
  const discard = appelNatifMethode(shell, SINK_PLUGIN, 'discard');
  if (open === null || append === null || close === null || discard === null) return null;
  return { open, append, close, discard };
}

const fieldOf = (result: unknown, field: string): string => {
  const value = (result as Record<string, unknown> | null)?.[field];
  if (typeof value !== 'string' || value === '') throw new Error(`file-sink: ${field} missing`);
  return value;
};

/** Écrit la pièce par tranches dans le récepteur, rend le chemin du fichier, puis l'efface quoi qu'il arrive à `use`. */
export async function throughSink(params: {
  readonly sink: FileSink;
  readonly blob: Blob;
  readonly mimeType: string;
  readonly chunkBytes: number;
  readonly use: (path: string) => Promise<unknown>;
}): Promise<void> {
  const { sink, blob, mimeType, chunkBytes, use } = params;
  const id = fieldOf(await sink.open({ mimeType }), 'id');
  try {
    for (let offset = 0; offset < blob.size; offset += chunkBytes) {
      await sink.append({ id, data: await base64De(blob.slice(offset, offset + chunkBytes)) });
    }
    await use(fieldOf(await sink.close({ id }), 'path'));
  } finally {
    await sink.discard({ id }).catch(() => undefined);
  }
}
