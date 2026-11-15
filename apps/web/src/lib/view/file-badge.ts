/**
 * LE BADGE DE LA CARTE DE FICHIER (#10004) — le FORMAT lisible d'un coup
 * d'œil : l'extension du nom d'origine, sinon « TXT » pour du texte brut
 * (la seule pièce non sonore que World Wide accepte d'un invité, #10001),
 * sinon un badge générique. Quatre lettres au plus : le badge mesure 36 px.
 */
const EXTENSION = /\.([a-z0-9]{1,4})$/i;

export const fileBadgeOf = ({ originalName, mimeType }: { readonly originalName: string; readonly mimeType: string }): string => {
  const extension = EXTENSION.exec(originalName.trim())?.[1];
  if (extension !== undefined) return extension.toUpperCase();
  return mimeType.trim().toLowerCase().startsWith('text/plain') ? 'TXT' : 'FILE';
};
