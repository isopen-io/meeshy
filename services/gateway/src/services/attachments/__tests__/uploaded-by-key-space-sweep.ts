import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';

import { blankOutNonCode, walk } from '../../../__tests__/detached-promise-catch-sweep';

/**
 * #20113 — tout site de production qui POSE ou INTERROGE
 * `MessageAttachment.uploadedBy` par sa valeur, relevé pour que l'espace de
 * clés qu'il suppose soit DÉCLARÉ.
 *
 * Un `where: { uploadedBy: userId }` y figure au même titre qu'un `data` : il
 * AFFIRME un espace de clés, puisqu'il ne peut apparier que les lignes écrites
 * dedans. C'est ainsi que l'export RGPD et la purge des médias d'un compte
 * supprimé sont entrés dans cet inventaire — et qu'on a vu ce qu'ils rataient.
 *
 * ## Pourquoi les ÉCRIVAINS et les REQUÊTES, et pas les comparaisons
 *
 * `uploadedBy` est un `String` au schéma : aucun typage ne distingue un
 * `User.id` d'un `Participant.id`, et c'est la confusion qui a duré — quatre
 * écrivains de téléversement y posaient l'identité de COMPTE, deux écrivains de
 * copie un `Participant.id`, et une dizaine de lecteurs comparaient le champ à
 * un identifiant d'utilisateur. Une seule porte connaissait les deux espaces
 * (`ownsAsUploader`, #13608), et elle était privée à son fichier.
 *
 * Les sites qui COMPARENT (`attachment.uploadedBy === userId`) sont nombreux et
 * chacun a sa propre question — appartenance, résolution de room, traduction.
 * Les sites qui POSENT ou APPARIENT la valeur décident de l'espace à eux seuls :
 * les geler ferme la cause, geler les comparaisons mesurerait la popularité
 * d'un idiome. C'est la leçon du cycle 107, dont le balayage fut jeté pour
 * cette faute exacte.
 *
 * ## Le discriminant, et ce qu'il ne mesure PAS
 *
 * Est relevée toute affectation `uploadedBy: <expression>` dans du code de
 * production (commentaires et chaînes effacés), sauf :
 *  - la PROJECTION d'un `select` (`uploadedBy: true`) ;
 *  - le RECOPIAGE champ à champ (`uploadedBy: row.uploadedBy`…), qui ne choisit
 *    aucun espace — il hérite de celui de sa source ;
 *  - une propriété de SCHÉMA JSON (`uploadedBy: { type: … }`) ou de TYPE
 *    (`uploadedBy: string | null`), qui ne pose aucune valeur.
 *
 * Il ne mesure pas la JUSTESSE d'un verdict déclaré : il garde qu'un verdict
 * EXISTE. Un site rangé `account-id-space` qui poserait en réalité un
 * participant passerait au vert — c'est le témoin de ce site qui l'attrape.
 * Et il est TEXTUEL : un écrivain qui passerait par un nom calculé
 * (`data[key] = …`) lui échappe.
 */
export type UploadedByKeyUse = {
  /** Chemin relatif à `src/`, la forme dont un inventaire se lit. */
  readonly file: string;
  /** L'expression affectée, dépouillée — jamais un numéro de ligne, qui dérive. */
  readonly value: string;
};

/** Ce qui n'affecte aucune valeur, ou n'en choisit pas l'espace. */
const NOT_A_WRITE = [
  /^uploadedBy\s*:\s*true\b/,
  /^uploadedBy\s*:\s*\{/,
  /^(readonly\s+)?uploadedBy\??\s*:\s*(string|String|number)\b/,
  /^uploadedBy\s*:\s*\(?\w+\.uploadedBy\b/,
];

export function scanUploadedByKeyUses(srcRoot: string): readonly UploadedByKeyUse[] {
  const writers: UploadedByKeyUse[] = [];
  for (const file of walk(srcRoot)) {
    const code = blankOutNonCode(readFileSync(file, 'utf8'));
    for (const line of code.split('\n')) {
      const match = /uploadedBy\s*:\s*[^,}]+/.exec(line);
      if (!match) continue;
      const expression = match[0].trim().replace(/\s+/g, ' ');
      if (NOT_A_WRITE.some((pattern) => pattern.test(expression))) continue;
      writers.push({
        file: relative(srcRoot, file).split(sep).join('/'),
        value: expression.replace(/^uploadedBy\s*:\s*/, '').slice(0, 80),
      });
    }
  }
  return writers;
}

export const SRC_ROOT = join(__dirname, '../../..');
