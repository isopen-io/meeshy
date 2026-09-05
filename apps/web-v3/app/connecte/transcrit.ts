import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { annonceDeLaPiece, type PieceJointe } from '@/lib/api/fil';
import { FIL } from '@/lib/contenu/fil';

/**
 * CE QU'UN VOCAL ANNONCE DU PRISME — le site UNIQUE de ce bloc, pour les DEUX
 * écrans qui rendent une pièce jointe : la ligne du fil
 * (`app/connecte/fil-lignes.ts`) et la galerie des médias
 * (`app/connecte/medias-vue.ts`).
 *
 * Il vivait en `const` non exportée dans `fil-lignes.ts`, où il n'avait qu'un
 * lecteur. La galerie en est le second, et le recopier aurait fabriqué deux
 * façons de dire la même chose d'un même vocal — la jumelle que la charte
 * interdit, et exactement la forme de la leçon 453 (« une table qui n'est pas
 * EXPORTÉE n'est la table de personne »).
 *
 * Ce que le bloc DIT, il le sert : la transcription est traduite, elle se lit
 * juste dessous, et l'original est à un geste. Il ne PROMET pas de sous-titres
 * — la passerelle n'expose aucun WebVTT, et fabriquer des minutages depuis un
 * texte plein serait inventer (régime 3, cycle 123 : le Prisme ANNONCÉ sans
 * être APPLIQUÉ).
 */

/**
 * `lang="xx"` sur tout nœud rendu dans une langue ≠ `<html lang>` — ce qui part
 * À CÔTÉ du texte (cycle 123), et ce que le gate B lit.
 */
export const langAttribut = (langue: string | null, langueDuDocument: string): string =>
  langue !== null && langue !== langueDuDocument ? ` lang="${echappe(langue)}"` : '';

export const blocDeTranscription = (piece: PieceJointe, langueDuDocument: string): string => {
  if (piece.transcription === null) return '';
  const annonce = annonceDeLaPiece(piece);
  const servie = piece.langueServie ?? piece.langueDeTranscription;
  const original =
    annonce === null || piece.transcriptionOriginale === null
      ? ''
      : '<details class="transcrit-original">' +
        `<summary>${svgDuSprite('ph-text-aa')}${echappe(FIL.original)}</summary>` +
        `<p${langAttribut(annonce.origine, langueDuDocument)}>${echappe(piece.transcriptionOriginale)}</p></details>`;
  return (
    `<p class="transcription"${langAttribut(servie, langueDuDocument)}>` +
    `<span class="hors-ecran">${echappe(FIL.transcription)} </span><span class="texte-transcrit">${echappe(piece.transcription)}</span></p>` +
    (annonce === null ? '' : `<p class="transcrit">${echappe(FIL.transcrit(annonce.origine, annonce.servie))}</p>`) +
    original
  );
};
