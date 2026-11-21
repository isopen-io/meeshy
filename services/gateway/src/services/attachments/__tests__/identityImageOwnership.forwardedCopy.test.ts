/**
 * @jest-environment node
 *
 * #20113, constat F1 de l'audit adversarial — **une pièce TRANSFÉRÉE n'est pas
 * une pièce TÉLÉVERSÉE**, et la garde des images d'identité (#16811) doit le
 * dire elle-même.
 *
 * `identityImageIsCallers` apparie « une ligne `MessageAttachment` de type
 * image, TÉLÉVERSÉE par l'appelant, qui porte ce fichier ». Le mot
 * « téléversée » n'était tenu par AUCUNE colonne : il l'était par accident,
 * parce qu'une copie transférée portait un `Participant.id` dans `uploadedBy`
 * et que la garde compare un `User.id`. #20113 ayant unifié cet espace de clés,
 * l'accident disparaît — et avec lui la garde, si rien ne la remplace.
 *
 * Le scénario que ces témoins ferment :
 *  1. V envoie `photo.jpg` à A, en conversation privée ;
 *  2. A transfère ce message — la copie reprend `filePath`, `fileUrl` et
 *     `mimeType` À L'IDENTIQUE (`copiedAttachmentFields` : « le MÊME blob ») ;
 *  3. A pose cette référence en avatar. `/attachments/file/*` servant par
 *     chemin, et sans authentification, **la photo privée de V devient l'image
 *     publique de A** — exactement ce que #16811 avait fermé, et de façon
 *     PERMANENTE : `unlinkIfUnreferenced` compte les lignes qui citent le
 *     `filePath`, jamais les avatars.
 *
 * Le double APPLIQUE le `where` ligne par ligne (`matchesMongoWhere`). Un
 * double qui affirmerait `where.uploadedBy === USER` serait auto-réalisateur :
 * il validerait la régression au lieu de la voir — c'est ce qui a laissé passer
 * ce cas dans la suite existante.
 */
import { describe, it, expect } from '@jest/globals';
import { identityImageIsCallers } from '../identityImageOwnership';
import { findFirstIn } from '../../../__tests__/helpers/mongo-where';
import type { MongoDocument } from '../../../__tests__/helpers/mongo-where';

const VICTIME = '507f1f77bcf86cd799439011';
const TRANSFERANT = '507f1f77bcf86cd799439022';
const CHEMIN = '2026/11/abcdef/photo.jpg';

/** La ligne d'ORIGINE : téléversée par la victime, dans sa conversation privée. */
const originale: MongoDocument = {
  id: 'att-origine',
  uploadedBy: VICTIME,
  mimeType: 'image/jpeg',
  filePath: CHEMIN,
  fileUrl: CHEMIN,
  messageId: 'msg-v',
};

/**
 * La COPIE transférée, telle que `copyForwardedAttachments` l'écrit après
 * #20113 : mêmes octets, même type, l'identité de COMPTE du transférant, et
 * les deux marques de transfert.
 */
const copieTransferee: MongoDocument = {
  id: 'att-copie',
  uploadedBy: TRANSFERANT,
  mimeType: 'image/jpeg',
  filePath: CHEMIN,
  fileUrl: CHEMIN,
  messageId: 'msg-a',
  forwardedFromAttachmentId: 'att-origine',
  isForwarded: true,
};

/** La ligne d'un VRAI téléversement du transférant, pour que le refus ne soit pas global. */
const sonPropreTeleversement: MongoDocument = {
  id: 'att-sien',
  uploadedBy: TRANSFERANT,
  mimeType: 'image/png',
  filePath: '2026/11/zzzzzz/selfie.png',
  fileUrl: '2026/11/zzzzzz/selfie.png',
  messageId: 'msg-a2',
};

const prismaWith = (rows: readonly MongoDocument[]) =>
  ({ messageAttachment: { findFirst: findFirstIn(rows) } }) as unknown as Parameters<typeof identityImageIsCallers>[0];

describe('#20113 F1 — la garde des images d’identité refuse une pièce TRANSFÉRÉE', () => {
  it('REFUSE le fichier d’une photo reçue puis transférée, même sous l’identité de compte du transférant', async () => {
    const prisma = prismaWith([originale, copieTransferee]);

    await expect(
      identityImageIsCallers(prisma, { userId: TRANSFERANT, reference: CHEMIN })
    ).resolves.toBe(false);
  });

  it('refuse aussi par l’ADRESSE de la copie, pas seulement par son chemin disque', async () => {
    const prisma = prismaWith([originale, copieTransferee]);

    await expect(
      identityImageIsCallers(prisma, { userId: TRANSFERANT, reference: copieTransferee.fileUrl as string })
    ).resolves.toBe(false);
  });

  it('ACCEPTE toujours un vrai téléversement de l’appelant — le refus n’est pas global', async () => {
    const prisma = prismaWith([originale, copieTransferee, sonPropreTeleversement]);

    await expect(
      identityImageIsCallers(prisma, { userId: TRANSFERANT, reference: sonPropreTeleversement.filePath as string })
    ).resolves.toBe(true);
  });

  it('accepte une ligne héritée dont la marque de transfert est ABSENTE, et non nulle', async () => {
    // Sur MongoDB, une colonne jamais écrite est ABSENTE, pas nulle : une garde
    // qui n'interrogerait que `null` refuserait tout téléversement d'avant la
    // colonne. C'est la règle `unsetOrNull` du dépôt.
    const heritee: MongoDocument = {
      id: 'att-herite', uploadedBy: TRANSFERANT, mimeType: 'image/jpeg',
      filePath: '2026/01/aaaaaa/vieille.jpg', fileUrl: '2026/01/aaaaaa/vieille.jpg', messageId: 'msg-vieux',
    };

    await expect(
      identityImageIsCallers(prismaWith([heritee]), { userId: TRANSFERANT, reference: heritee.filePath as string })
    ).resolves.toBe(true);
  });

  it('la VICTIME garde l’accès à son propre fichier — la garde ne punit pas le déposant', async () => {
    const prisma = prismaWith([originale, copieTransferee]);

    await expect(
      identityImageIsCallers(prisma, { userId: VICTIME, reference: CHEMIN })
    ).resolves.toBe(true);
  });
});
