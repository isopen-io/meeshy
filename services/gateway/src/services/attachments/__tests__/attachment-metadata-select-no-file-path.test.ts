/**
 * LA MOITIÉ QU'AUCUN TÉMOIN DE COMPORTEMENT NE PEUT VOIR (#20048).
 *
 * `GET /attachments/:id/metadata` ne SERT plus `filePath` : son témoin de
 * sérialisation le prouve (`attachments-metadata-no-server-path.test.ts`). Mais
 * un retrait au seul contrat laisserait la lecture CHARGER le chemin, et le
 * dépôt refuse cette moitié-là : « compter sur une omission de schéma pour
 * retenir un secret est un piège armé, pas une protection »
 * (`services/gateway/CLAUDE.md`, règle du cycle 84).
 *
 * Or **un double Prisma rend ce qu'on lui dit, quel que soit le `select`** : un
 * témoin de comportement passe au vert sur une lecture qui charge le chemin
 * comme sur une lecture qui ne le charge pas. La projection est la seule des
 * trois moitiés d'une règle (clause, projection, prédicat) qu'un rendu ne peut
 * pas observer. Ce témoin assert donc sur la REQUÊTE.
 *
 * `getAttachmentWithMetadata` est la SEULE lecture du dépôt dont le résultat
 * soit sérialisé. Les lectures internes qui résolvent un chemin disque pour en
 * lire les octets (`getFilePath`, `getThumbnailPath`, la copie, le pipeline
 * audio, le miroir d'objets) le chargent légitimement et ne servent rien — ce
 * témoin ne les vise pas, et le nommer ici dirait le contraire.
 */

import { describe, it, expect, jest } from '@jest/globals';

import { AttachmentService } from '../AttachmentService';

const ATTACHMENT_ID = 'att-111aaa';

/** Le `select` que la lecture a RÉELLEMENT demandé — l'objet passé à Prisma. */
const selectOfMetadataRead = async (): Promise<Record<string, unknown>> => {
  const findUnique = jest.fn<any>().mockResolvedValue(null);
  const prisma = { messageAttachment: { findUnique } } as any;
  await new AttachmentService(prisma).getAttachmentWithMetadata(ATTACHMENT_ID);
  expect(findUnique).toHaveBeenCalledTimes(1);
  return (findUnique.mock.calls[0] as any[])[0].select as Record<string, unknown>;
};

describe('getAttachmentWithMetadata — la lecture qui est SERVIE ne charge aucun chemin serveur', () => {
  it('ne demande pas `filePath`', async () => {
    expect(await selectOfMetadataRead()).not.toHaveProperty('filePath');
  });

  it('ne demande pas `thumbnailPath` non plus', async () => {
    expect(await selectOfMetadataRead()).not.toHaveProperty('thumbnailPath');
  });

  /**
   * Le témoin NÉGATIF du témoin : sans lui, un `select` vidé par accident —
   * ou une lecture qui cesse d'être appelée — rendrait les deux assertions
   * ci-dessus vertes pour la mauvaise raison.
   */
  it('demande bien ce que la route SERT — l’adresse publique et le média', async () => {
    const select = await selectOfMetadataRead();
    expect(select).toMatchObject({ id: true, fileUrl: true, fileName: true, mimeType: true, fileSize: true });
  });
});
