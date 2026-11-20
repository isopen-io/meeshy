/**
 * #20017 — **le témoin de PROJECTION : il assert sur la REQUÊTE, jamais sur le
 * rendu.**
 *
 * Son jumeau (`attachment-metadata-side-content.test.ts`) prouve que la route
 * retient la transcription d'une pièce protégée. Il ne peut PAS prouver que la
 * garde est vivante en production, et c'est structurel : il double
 * `AttachmentService`, donc la pièce qu'il rend porte les drapeaux de
 * protection parce que la FIXTURE les porte. Un `select` qui les omet rendrait
 * ce témoin-là tout aussi vert, pendant que `maskedAttachment` — qui ne regarde
 * que les drapeaux PRÉSENTS — laisserait tout passer.
 *
 * C'est la mesure du dépôt, portée d'un résolveur de Prisme à une garde de
 * confidentialité (`services/gateway/CLAUDE.md`) :
 *
 * > « Le `select` est le seul des trois qu'aucun témoin de rang ne peut voir.
 * > Un mock Prisma rend ce qu'on lui dit quel que soit le `select` […] Un
 * > témoin de projection assert donc sur la REQUÊTE, pas sur le rendu. »
 *
 * Ce témoin interroge donc le client Prisma lui-même : quelles colonnes
 * `getAttachmentWithMetadata` DEMANDE-t-elle ?
 *
 * ─── La mesure qui le justifie, et elle n'est pas rhétorique ─────────────────
 *
 * Mutation appliquée : retirer les cinq colonnes du `select` de production,
 * c'est-à-dire reproduire exactement l'état d'avant #20017.
 *
 * | suite | verdict sous la mutation |
 * |---|---|
 * | les SIX témoins de comportement du jumeau | **verts** |
 * | ce témoin-ci | **rouge** |
 *
 * Six témoins de confidentialité, chacun prouvé ROUGE sur le défaut qu'il
 * nomme, attestent une garde MORTE sans en faire tomber un seul. C'est la
 * forme la plus coûteuse d'un témoin qui ne peut pas tomber : il tombe bien
 * sur la mutation qu'il VISE, et pas du tout sur celle qui désarme la garde
 * qu'il croit tenir.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { AttachmentService } from '../../services/attachments/AttachmentService';

/** Les colonnes que `mediaSideContentMayTravel` lit SUR LA PIÈCE. */
const LUES_PAR_LA_LOI = ['isViewOnce', 'isBlurred', 'effectFlags', 'isEncrypted', 'encryptionMode'] as const;

function serviceAvecSonde() {
  const findUnique = jest.fn<any>().mockResolvedValue(null);
  const prisma = { messageAttachment: { findUnique } } as never;
  return { service: new AttachmentService(prisma), findUnique };
}

describe('getAttachmentWithMetadata — le `select` porte ce que la loi LIT (#20017)', () => {
  it('demande les cinq colonnes de protection de la PIÈCE', async () => {
    const { service, findUnique } = serviceAvecSonde();

    await service.getAttachmentWithMetadata('aaaaaaaaaaaaaaaaaaaaaaa1');

    expect(findUnique).toHaveBeenCalledTimes(1);
    const select = findUnique.mock.calls[0][0].select as Record<string, unknown>;

    for (const colonne of LUES_PAR_LA_LOI) {
      expect(select[colonne]).toBe(true);
    }
  });

  it('demande toujours la transcription — sans quoi la route n’aurait rien à garder, et le témoin serait vacu', async () => {
    const { service, findUnique } = serviceAvecSonde();

    await service.getAttachmentWithMetadata('aaaaaaaaaaaaaaaaaaaaaaa1');
    const select = findUnique.mock.calls[0][0].select as Record<string, unknown>;

    expect(select['transcription']).toBe(true);
    expect(select['translations']).toBe(true);
  });
});
