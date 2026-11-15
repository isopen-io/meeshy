/**
 * #9249 — TOUTE PORTE QUI HÉRITE DE `fileUrl` DÉCLARE LA PROTECTION.
 *
 * `messageAttachmentMinimalSchema` (`@meeshy/shared/types/api-schemas`) porte
 * sept clés, dont `fileUrl` et `thumbnailUrl`. Un schéma de réponse qui
 * l'ÉPAND hérite donc de l'URL du média — et c'est précisément cet héritage
 * qui a rendu l'omission invisible : la galerie d'une conversation servait
 * l'URL d'une pièce à vue unique ou floutée en SUPPRIMANT, par
 * `fast-json-stringify`, les deux drapeaux qui disent au client de poser un
 * voile. La projection les rendait déjà ; seule la déclaration manquait, et
 * aucun `grep` du fichier de la route ne pouvait la voir : la clé n'y est
 * écrite nulle part, elle y est VERSÉE par un spread.
 *
 * La protection d'une pièce jointe est DÉCLARÉE par ses champs et APPLIQUÉE
 * par le client (cycle 125, #6189 — c'est pourquoi la loi vit dans
 * `packages/shared/utils/attachment-protection.ts` et non dans un service).
 * Une porte qui sert l'URL sans les drapeaux ne contourne pas la garde : elle
 * la rend INEXPRIMABLE.
 *
 * CE QUE CE BALAYAGE VOIT, et ce qu'il ne voit pas. Il lit la SOURCE des
 * routes du gateway et n'attrape que l'héritage ÉCRIT (`...schéma.properties`).
 * Un schéma qui recopierait `fileUrl` à la main, ou qui l'hériterait d'un
 * troisième schéma, lui échappe — la limite est dite ici plutôt que laissée à
 * la lecture, parce qu'une limite non écrite redevient un angle mort.
 *
 * `effectFlags`, le troisième canal du OU de `attachmentProtectionOf`, n'est
 * PAS exigé : il est absent de l'interface `Attachment` elle-même, donc
 * d'aucune projection de ce service (#9249, « ce que ce lot ne ferme pas »).
 * L'exiger ici rendrait le cliquet rouge sans qu'aucune porte puisse le
 * satisfaire.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROUTES_ROOT = join(__dirname, '..', '..', '..', 'routes');
const SPREAD = '...messageAttachmentMinimalSchema.properties';
const PROTECTION_FIELDS = ['isViewOnce', 'isBlurred'] as const;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.d.ts') ? [full] : [];
  });
}

/**
 * Les blocs `const X = { … } as const;` du fichier. Découpés sur la fermeture
 * `} as const` plutôt que par comptage d'accolades : la forme est celle que
 * tous les schémas du dépôt emploient, et un découpage approximatif rendrait
 * des verdicts approximatifs.
 */
function schemaBlocks(source: string): Array<{ readonly name: string; readonly body: string }> {
  const blocks: Array<{ name: string; body: string }> = [];
  const declaration = /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*\{/g;
  for (let match = declaration.exec(source); match !== null; match = declaration.exec(source)) {
    const start = match.index + match[0].length;
    const end = source.indexOf('} as const', start);
    if (end === -1) continue;
    blocks.push({ name: match[1], body: source.slice(start, end) });
  }
  return blocks;
}

const doors = sourceFiles(ROUTES_ROOT)
  .filter((file) => readFileSync(file, 'utf8').includes(SPREAD))
  .flatMap((file) => {
    const relative = file.slice(file.indexOf('/src/') + 1);
    return schemaBlocks(readFileSync(file, 'utf8'))
      .filter((block) => block.body.includes(SPREAD))
      .map((block) => ({ file: relative, ...block }));
  });

describe("les portes qui héritent de l'URL d'un média déclarent sa protection (#9249)", () => {
  // Un balayage négatif dont la collecte rend `[]` reste vert sans rien
  // attester. Celui-ci prouve d'abord qu'il a trouvé ses sujets — si un
  // refactor renomme le schéma partagé ou change la forme du spread, c'est
  // CETTE assertion qui tombe, et pas le cliquet qui se tait.
  it('trouve au moins une porte qui épand le schéma minimal', () => {
    expect(doors.length).toBeGreaterThan(0);
  });

  it.each(PROTECTION_FIELDS)('chaque porte déclare %s', (field) => {
    const silent = doors.filter((door) => !door.body.includes(`${field}:`));
    expect(silent.map((door) => `${door.file} → ${door.name}`)).toEqual([]);
  });
});
