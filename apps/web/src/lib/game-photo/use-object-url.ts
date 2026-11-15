import { useEffect, useMemo } from 'react';

/**
 * UNE ADRESSE ÉPHÉMÈRE POUR UN FICHIER (#9382) — l'aperçu d'une photo composée
 * ou gardée au carnet. Créée quand le fichier change, RENDUE au démontage :
 * une photo qu'on n'affiche plus ne reste pas en mémoire. `URL.createObjectURL`
 * peut manquer (contexte sans DOM) : l'aperçu se tait alors, il ne lève pas.
 */
const urlOf = (file: Blob | null): string | null => {
  if (file === null) return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
};

export function useObjectUrl(file: Blob | null | undefined): string | null {
  const url = useMemo(() => urlOf(file ?? null), [file]);
  useEffect(
    () => () => {
      if (url === null) return;
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* Rien à rendre. */
      }
    },
    [url],
  );
  return url;
}
