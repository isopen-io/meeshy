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
import { scanUploadedByKeyUses, SRC_ROOT } from './uploaded-by-key-space-sweep';

/**
 * L'espace qu'un site suppose.
 *
 * - `account` — il pose ou apparie l'identité de COMPTE (`User.id`, ou le
 *   `Participant.id` d'un anonyme, qui EST son identité d'authentification).
 *   C'est la norme depuis #20113.
 * - `account-blind-to-legacy` — même espace, mais le site APPARIE : il rate donc
 *   les lignes héritées écrites dans l'espace participant, et ce qu'il rate
 *   compte. Consigné, suivi par son issue.
 */
type KeySpace = 'account' | 'account-blind-to-legacy';

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
  // Les quatre qui APPARIENT à l'échelle d'un compte entier, donc les seuls
  // pour qui une ligne héritée manquante se VOIT. Suivi : #20114.
  'routes/me/export-sections.ts': ['account-blind-to-legacy'],
  'services/purgeDeletedAccountMedia.ts': ['account-blind-to-legacy'],
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
    // Un cliquet, pas un plancher : en solder un (par une reprise des lignes
    // héritées, #20114) est attendu ; en ajouter un ne l'est jamais.
    const aveugles = Object.values(FROZEN).flat().filter((space) => space === 'account-blind-to-legacy');

    expect(aveugles).toHaveLength(5);
  });

  it('aucun site ne pose un `Participant.id` : plus un seul écrivain hors de la convention', () => {
    // Le discriminant est TEXTUEL et ne peut pas juger une expression ; ce
    // témoin garde donc ce qu'il peut : qu'aucun écrivain ne nomme
    // explicitement un identifiant de participant.
    const suspects = uses.filter((use) => /participantId|requesterParticipantId|senderId/.test(use.value));

    expect(suspects).toEqual([]);
  });
});
