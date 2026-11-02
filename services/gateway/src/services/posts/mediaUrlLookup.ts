import { storageKeyFromMediaUrl } from '../attachments/mediaStorageKey';

/**
 * L'adresse qui REMPLACE `url` dans une scène, d'après `urlMap` (adresse d'une
 * pièce source → adresse de sa copie). La base porte trois formes d'une même
 * pièce — clé de stockage, `/api/v1/attachments/file/<clé>`, adresse absolue —
 * et une scène écrite par un ancien client peut désigner sous l'une ce que la
 * ligne `PostMedia` porte sous une autre : elles se comparent par leur clé de
 * stockage. `undefined` : la scène ne désigne aucune pièce copiée.
 */
export function mappedMediaUrl(urlMap: Readonly<Record<string, string>>, url: string): string | undefined {
  const exact = urlMap[url];
  if (exact !== undefined) return exact;
  const key = storageKeyFromMediaUrl(url);
  if (key === null) return undefined;
  return Object.entries(urlMap).find(([source]) => storageKeyFromMediaUrl(source) === key)?.[1];
}
