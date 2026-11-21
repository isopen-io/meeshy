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
 * Le fichier est balayé EN ENTIER (pas ligne à ligne) : une affectation que
 * Prettier a coupée après les deux-points échappait au balayage précédent, et
 * deux usages sur une même ligne n'en comptaient qu'un. La valeur est lue
 * jusqu'à sa virgule ou son accolade de MÊME profondeur, donc un appel de
 * fonction n'est plus tronqué à sa première virgule.
 *
 * Sont écartés, et seulement eux :
 *  - la PROJECTION d'un `select` (`uploadedBy: true`) ;
 *  - le RECOPIAGE champ à champ (`uploadedBy: row.uploadedBy`…), qui ne choisit
 *    aucun espace — il hérite de celui de sa source ;
 *  - une déclaration de TYPE (`uploadedBy: string | null`), qui ne pose rien ;
 *  - une propriété de SCHÉMA JSON, reconnue par ses CLÉS (`type`,
 *    `description`, `nullable`, `properties`, `format`, `items`) et non par sa
 *    forme : `uploadedBy: { … }` est aussi la forme d'un FILTRE Prisma
 *    (`{ in: … }`, `{ equals: … }`, `{ not: … }`), et l'écarter sur l'accolade
 *    seule laissait passer toute la catégorie que ce balayage revendique.
 *
 * Il ne mesure pas la JUSTESSE d'un verdict déclaré : il garde qu'un verdict
 * EXISTE. Un site rangé `account` qui poserait en réalité un participant
 * passerait au vert — c'est le témoin de ce site qui l'attrape.
 *
 * Trois limites restent, déclarées faute de pouvoir être fermées par du texte :
 *  1. un écrivain qui passerait par un nom calculé (`data['uploadedBy'] = …`) ;
 *  2. une valeur HISSÉE dans une locale (`const uploader = …` puis
 *     `uploadedBy: uploader`) : le balayage voit le nom de la locale, jamais ce
 *     qu'elle contient — et aucun témoin ne prétend donc juger la valeur POSÉE ;
 *  3. un écrivain qui pose le champ par ÉPANDAGE (`...uploaderStampOf(…)`),
 *     forme qu'exige #20142 pour que `uploadedBy` et `isAnonymous` ne puissent
 *     plus se contredire. Le nom du champ n'apparaît alors nulle part, donc le
 *     balayage ne voit rien — c'est pourquoi les deux écrivains de copie ne
 *     figurent plus dans l'inventaire, et pourquoi un témoin SÉPARÉ exige
 *     qu'ils passent par le site unique de l'empreinte.
 */
export type UploadedByKeyUse = {
  /** Chemin relatif à `src/`, la forme dont un inventaire se lit. */
  readonly file: string;
  /** L'expression affectée, lue jusqu'à sa virgule de même profondeur. */
  readonly value: string;
};

/** Les clés qui font d'un objet un SCHÉMA JSON plutôt qu'un filtre Prisma. */
const SCHEMA_KEYS = /\b(type|description|nullable|properties|format|items)\s*:/;

/** Ce qui n'affecte aucune valeur, ou n'en choisit pas l'espace. */
export function choosesNoKeySpace(value: string): boolean {
  if (/^true\b/.test(value)) return true;
  if (/^(string|String|number)\b/.test(value)) return true;
  if (/^\(?\w+\.uploadedBy\b/.test(value)) return true;
  if (value.startsWith('{') && SCHEMA_KEYS.test(value)) return true;
  return false;
}

/** La valeur, lue jusqu'à la virgule ou l'accolade de MÊME profondeur. */
export function readValue(code: string, from: number): string {
  const closers: string[] = [];
  let out = '';
  for (let i = from; i < code.length; i += 1) {
    const c = code[i];
    if (closers.length === 0 && (c === ',' || c === '}' || c === ';' || c === '\n')) break;
    if (c === '(') closers.push(')');
    else if (c === '{') closers.push('}');
    else if (c === '[') closers.push(']');
    else if (c === closers[closers.length - 1]) closers.pop();
    out += c;
  }
  return out.trim().replace(/\s+/g, ' ');
}

export function scanUploadedByKeyUses(srcRoot: string): readonly UploadedByKeyUse[] {
  const uses: UploadedByKeyUse[] = [];
  for (const file of walk(srcRoot)) {
    const code = blankOutNonCode(readFileSync(file, 'utf8'));
    const pattern = /\buploadedBy\s*\??\s*:\s*/g;
    for (let match = pattern.exec(code); match !== null; match = pattern.exec(code)) {
      const value = readValue(code, match.index + match[0].length);
      if (value.length === 0 || choosesNoKeySpace(value)) continue;
      uses.push({
        file: relative(srcRoot, file).split(sep).join('/'),
        value: value.slice(0, 100),
      });
    }
  }
  return uses;
}

export const SRC_ROOT = join(__dirname, '../../..');
