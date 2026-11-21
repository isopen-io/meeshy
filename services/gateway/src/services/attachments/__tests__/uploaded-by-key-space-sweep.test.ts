/**
 * @jest-environment node
 *
 * #20113 — l'inventaire GELÉ des sites qui posent ou apparient
 * `MessageAttachment.uploadedBy` par sa valeur, chacun avec l'espace de clés
 * qu'il suppose.
 *
 * Un site neuf ne peut pas s'ajouter en silence : il doit s'inscrire ici, et
 * s'inscrire force à répondre « quelle clé ce site manipule-t-il ? » — la
 * question que personne n'avait eu à poser pendant que deux écrivains posaient
 * un `Participant.id` dans un champ que dix lecteurs lisaient comme un
 * `User.id`.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  choosesNoKeySpace,
  readValue,
  scanUploadedByKeyUses,
  SRC_ROOT,
} from './uploaded-by-key-space-sweep';

/**
 * L'espace qu'un site suppose.
 *
 * - `account` — il pose ou apparie l'identité de COMPTE (`User.id`, ou le
 *   `Participant.id` d'un anonyme, qui EST son identité d'authentification).
 *   C'est la norme depuis #20113.
 * - `account-blind-to-legacy` — même espace, mais le site APPARIE : il rate donc
 *   les lignes héritées écrites dans l'espace participant, et ce qu'il rate
 *   compte. Consigné, suivi par son issue.
 * - `account-and-legacy` — le site APPARIE les DEUX espaces, par
 *   `uploadedByOfAccount` (#20129) : l'identité de compte, et les identifiants
 *   de participation sous lesquels les copies transférées ont été écrites. C'est
 *   la forme qu'une requête à l'échelle d'un compte ENTIER doit prendre quand ce
 *   qu'elle rate ne se rattrape pas ailleurs — un export RGPD, une purge.
 */
type KeySpace = 'account' | 'account-blind-to-legacy' | 'account-and-legacy';

/**
 * Le gel. La clé est `fichier` — jamais une ligne, qui dérive à la première
 * édition (règle du cycle 87 bis) — et la valeur dit l'espace de CHAQUE usage
 * du fichier, dans l'ordre où le balayage les rend.
 */
const FROZEN: Readonly<Record<string, readonly KeySpace[]>> = {
  // ── Les écrivains ───────────────────────────────────────────────────────
  'routes/uploads/tus-handler.ts': ['account', 'account'],
  'services/attachments/UploadProcessor.ts': ['account', 'account'],
  // Les deux écrivains de COPIE, unifiés par #20113 : ils passaient un
  // `Participant.id`, ils posent l'identité de compte.
  'services/messaging/MessageProcessor.ts': ['account'],
  'services/messaging/copyAttachments.ts': ['account'],

  // ── Les requêtes par valeur ─────────────────────────────────────────────
  'services/attachments/identityImageOwnership.ts': ['account'],
  'services/calls/callRecordingLink.ts': ['account'],
  'routes/admin/user-profile-images.ts': ['account'],
  // Les deux qui APPARIENT les DEUX espaces depuis #20129 — l'export RGPD
  // (art. 15) et la purge de fin de période de grâce, les seuls dont ce qui
  // manque ne se rattrape nulle part.
  'routes/me/export-sections.ts': ['account-and-legacy'],
  'services/purgeDeletedAccountMedia.ts': ['account-and-legacy'],
  // Les trois qui APPARIENT encore l'espace de compte SEUL. Ce sont des
  // compteurs d'AFFICHAGE : ils sous-comptent les copies héritées, et les
  // corriger changerait des succès déjà attribués (#20129). Dette d'hygiène de
  // données, suivie par #20114 — plus le chemin critique d'une conformité.
  'services/achievements/GlobalAchievements.ts': ['account-blind-to-legacy'],
  'routes/admin/user-member-stats.ts': ['account-blind-to-legacy'],
  'routes/admin/users.ts': ['account-blind-to-legacy'],
};

describe('#20113 — l’espace de clés de `uploadedBy`', () => {
  const uses = scanUploadedByKeyUses(SRC_ROOT);

  it('voit bien des usages — sinon un balayage vide passerait au vert', () => {
    expect(uses.length).toBeGreaterThanOrEqual(12);
  });

  it('n’a AUCUN site non déclaré', () => {
    const inconnus = [...new Set(uses.map((use) => use.file))].filter((file) => !(file in FROZEN));

    expect(inconnus).toEqual([]);
  });

  it('déclare autant d’usages que le fichier en porte', () => {
    const compte = new Map<string, number>();
    for (const use of uses) compte.set(use.file, (compte.get(use.file) ?? 0) + 1);

    const ecarts = Object.entries(FROZEN)
      .filter(([file, spaces]) => (compte.get(file) ?? 0) !== spaces.length)
      .map(([file, spaces]) => `${file} : déclaré ${spaces.length}, mesuré ${compte.get(file) ?? 0}`);

    expect(ecarts).toEqual([]);
  });

  it('ne compte pas plus de sites AVEUGLES aux lignes héritées qu’au gel', () => {
    // Un cliquet, pas un plancher : en solder un est attendu ; en ajouter un ne
    // l'est jamais. Passé de 5 à 3 par #20129 — les deux sites dont l'oubli ne
    // se rattrapait pas apparient désormais les deux espaces.
    const aveugles = Object.values(FROZEN).flat().filter((space) => space === 'account-blind-to-legacy');

    expect(aveugles.length).toBeLessThanOrEqual(3);
  });

  /**
   * Le verdict `account-and-legacy` est DÉCLARÉ à la main, comme tous les
   * autres : le balayage lit une valeur, pas une sémantique. Ce témoin le rend
   * MESURABLE — les deux sites passent par le site unique de la loi, et cesser
   * d'y passer le fait tomber. Sans lui, l'étiquette serait une décoration, et
   * un cliquet qui rassure à tort est pire que pas de cliquet (#20113, F2-F4).
   */
  it('les deux sites qui apparient les DEUX espaces passent par le site unique', () => {
    const sites = Object.entries(FROZEN)
      .filter(([, spaces]) => spaces.includes('account-and-legacy'))
      .map(([file]) => file);

    expect(sites).toEqual(['routes/me/export-sections.ts', 'services/purgeDeletedAccountMedia.ts']);

    const sansLoi = sites.filter((file) => {
      const code = readFileSync(join(SRC_ROOT, file), 'utf8');
      return !/uploadedBy:\s*uploadedByOfAccount\(/.test(code);
    });

    expect(sansLoi).toEqual([]);
  });

  /**
   * Il n'y a PAS de témoin « aucun site ne pose un `Participant.id` », et c'est
   * une décision.
   *
   * Un tel témoin avait été écrit ; il était vide par construction. Les deux
   * écrivains de copie posent `uploader` et
   * `uploaderIdentityOf(requester, params.requesterParticipantId)` : le premier
   * est une LOCALE, dont le balayage ne voit que le nom, et le second nomme son
   * repli — donc le témoin passait quelle que soit la valeur réellement posée.
   * Un cliquet qui rassure à tort est pire que pas de cliquet.
   *
   * Ce qui se mesure vraiment, et qui suffit : les deux écrivains de copie
   * PASSENT par le site unique. S'ils cessaient, leur propre témoin tomberait.
   */
  it('les deux écrivains de copie passent par le site unique de l’identité', () => {
    const sansSiteUnique = ['services/messaging/copyAttachments.ts', 'services/messaging/MessageProcessor.ts']
      .filter((file) => !readFileSync(join(SRC_ROOT, file), 'utf8').includes("from '../attachments/uploaderIdentity'"));

    expect(sansSiteUnique).toEqual([]);
  });
});

/**
 * Les PIÈGES du discriminant — ce qu'il doit voir et ce qu'il doit ignorer.
 *
 * Trois trous mesurés par l'audit adversarial du lot : un filtre Prisma écarté
 * comme s'il était un schéma JSON (`{ in: … }`), une affectation coupée par
 * Prettier après les deux-points, et deux usages sur une même ligne dont un
 * seul était compté. Chacun laissait passer, en silence, la catégorie même que
 * ce balayage revendique.
 */
describe('#20113 — les pièges du discriminant', () => {
  it('garde un FILTRE Prisma, et n’en fait pas un schéma JSON', () => {
    expect(choosesNoKeySpace('{ in: ids }')).toBe(false);
    expect(choosesNoKeySpace('{ equals: userId }')).toBe(false);
    expect(choosesNoKeySpace('{ not: userId }')).toBe(false);
  });

  it('écarte un schéma JSON par ses CLÉS, jamais par son accolade', () => {
    expect(choosesNoKeySpace("{ type: 'string', description: 'Uploader id' }")).toBe(true);
    expect(choosesNoKeySpace("{ type: 'string', nullable: true }")).toBe(true);
  });

  it('écarte la projection, la déclaration de type et le recopiage', () => {
    expect(choosesNoKeySpace('true')).toBe(true);
    expect(choosesNoKeySpace('string | null')).toBe(true);
    expect(choosesNoKeySpace('row.uploadedBy')).toBe(true);
    expect(choosesNoKeySpace('(raw.uploadedBy as string | null)')).toBe(true);
  });

  it('lit une valeur jusqu’à sa virgule de MÊME profondeur — un appel n’est pas tronqué', () => {
    expect(readValue('uploaderIdentityOf(requester, pid), rank: 0 }', 0))
      .toBe('uploaderIdentityOf(requester, pid)');
    expect(readValue('{ in: [a, b] }, select: 1', 0)).toBe('{ in: [a, b] }');
  });

  it('voit les DEUX usages d’une même ligne', () => {
    const uses = [...'{ uploadedBy: alpha }, nested: { uploadedBy: beta }'.matchAll(/\buploadedBy\s*\??\s*:\s*/g)];

    expect(uses).toHaveLength(2);
  });
});
