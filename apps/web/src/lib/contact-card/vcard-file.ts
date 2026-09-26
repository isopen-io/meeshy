import type { ParsedVCard } from '@meeshy/shared/types/contact-card';
import { parseVCard } from '@meeshy/shared/utils/vcard';

import { attachmentSrc } from '@/lib/api/media-url';

/**
 * **LE CONTENU D'UNE CARTE DE VISITE REÇUE** (#8101) — la pièce jointe
 * `text/vcard` est lue par la route de fichier (la même que les images,
 * `attachmentSrc`), puis lue par `parseVCard` (`@meeshy/shared/utils/vcard`),
 * le lecteur PARTAGÉ avec la passerelle et le contrat iOS.
 *
 * Une pièce jointe est IMMUABLE : sa lecture ne se revalide jamais
 * (`staleTime: Infinity`) et se persiste avec le cache de requêtes — la carte
 * se peint au rechargement sans un octet de réseau.
 *
 * `null` = le fichier n'est pas une vCard lisible (l'écran le dit) ; une
 * panne réseau LÈVE (l'écran propose de réessayer) — les deux ne se
 * confondent pas.
 */

export type FetchText = (url: string, init: { readonly signal?: AbortSignal }) => Promise<string>;

const MAX_VCARD_BYTES = 512 * 1024;

export const fetchAttachmentText: FetchText = async (url, init) => {
  const response = await fetch(url, init.signal !== undefined ? { signal: init.signal } : {});
  if (!response.ok) throw new Error(`vCard ${response.status}`);
  const text = await response.text();
  return text.slice(0, MAX_VCARD_BYTES);
};

export function vcardQueryKey(attachmentId: string): readonly unknown[] {
  return ['contact-card', 'vcard', attachmentId];
}

export function vcardQueryOptions({
  attachmentId,
  fileUrl,
  fetchText = fetchAttachmentText,
}: {
  readonly attachmentId: string;
  readonly fileUrl: string;
  readonly fetchText?: FetchText;
}) {
  return {
    queryKey: vcardQueryKey(attachmentId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async ({ signal }: { readonly signal: AbortSignal }): Promise<ParsedVCard | null> =>
      parseVCard(await fetchText(attachmentSrc(fileUrl), { signal })),
  };
}
