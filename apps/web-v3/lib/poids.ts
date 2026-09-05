/**
 * LE POIDS D'UN FICHIER, dit en unités que le lecteur lit — et dit AVANT qu'un
 * octet ne parte (une pièce choisie s'annonce, une pièce servie se pèse).
 *
 * UN seul site : le serveur le rend dans la ligne (`app/connecte/fil-lignes.ts`),
 * le peintre le rend dans un clone (`lib/realtime/fil-peinture.ts`), le
 * composeur l'annonce sous le champ (`lib/realtime/composeur.ts`). Trois copies
 * de la même arithmétique avaient chacune leur arrondi à tenir — c'est la
 * jumelle que la charte interdit.
 */

import { seLit, type GenreDePiece } from './api/formes';

const UNITES = ['o', 'Ko', 'Mo', 'Go'] as const;

export const poids = (octets: number | null): string => {
  if (octets === null) return '';
  const rang = Math.min(UNITES.length - 1, Math.max(0, Math.floor(Math.log(Math.max(octets, 1)) / Math.log(1024))));
  const valeur = octets / 1024 ** rang;
  return `${rang === 0 ? Math.round(valeur) : valeur.toFixed(valeur < 10 ? 1 : 0).replace('.', ',')} ${UNITES[rang]}`;
};

/** `m:ss` d'une durée — ce qu'un vocal ou une vidéo annonce avec son poids. */
export const duree = (ms: number | null): string => {
  if (ms === null) return '';
  const secondes = Math.round(ms / 1000);
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
};

/**
 * CE QU'UNE PIÈCE ANNONCE avant qu'un octet ne parte — sa durée quand elle en
 * a une, son poids toujours —, écrit UNE fois : la ligne servie et le clone
 * peint disaient deux choses différentes d'un même vocal (l'une la durée et le
 * poids, l'autre le poids seul).
 *
 * QUELS genres ont une durée n'est pas jugé ici : c'est `seLit`
 * (`lib/api/formes.ts`), la table qui dit déjà quel bloc chaque genre demande.
 * Écrit `genre === 'audio' || genre === 'video'`, ce module était la quatrième
 * écriture de la même règle — et celle qu'on aurait oublié de changer.
 */
export const metaDePiece = ({
  genre,
  dureeMs,
  octets,
}: {
  readonly genre: GenreDePiece;
  readonly dureeMs: number | null;
  readonly octets: number | null;
}): string =>
  [seLit(genre) ? duree(dureeMs) : '', poids(octets)].filter((morceau) => morceau !== '').join(' · ');
