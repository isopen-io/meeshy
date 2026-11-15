/**
 * L'index unique PARTIEL dont tout le contrat d'idempotence d'envoi dépend
 * (#18621).
 *
 * `(conversationId, clientMessageId)` unique est la SEULE chose qui ferme la
 * fenêtre de concurrence du dedup : deux renvois réellement simultanés passent
 * tous les deux la lecture précoce de `MessagingService`, insèrent tous les
 * deux, et le `catch P2002` de `MessageProcessor` ne se déclenche jamais sans
 * contrainte réelle. Le repli « même contenu sous 2 s » ne peut pas aider — il
 * rend `false` dès qu'il y a une pièce jointe.
 *
 * `schema.prisma` décline `@@unique` **pour une bonne raison** : le connecteur
 * MongoDB poserait un index NON partiel, qui traite tous les `null` comme
 * égaux et casserait l'envoi pour les lignes historiques. L'index doit donc
 * être partiel, et posé à la main.
 *
 * ─── Pourquoi ces témoins portent sur la PRÉSENCE et la RÈGLE ────────────────
 *
 * L'index a déjà manqué DEUX MOIS en production (2026-05-09 → 2026-07-02), et
 * les deux pannes étaient d'une nature qu'aucun témoin portant sur le fichier
 * de migration n'aurait vue :
 *
 * | panne | ce qui l'aurait attrapée |
 * |---|---|
 * | `$ne` dans un `partialFilterExpression` — opérateur NON supporté, `createIndex` lève | une règle sur les opérateurs ADMIS, pas une copie de la spec |
 * | `db.messages` au lieu de `db.Message` — collection VIDE, « l'index semblait créé et ne protégeait rien » | le nom du model Prisma, relu depuis la source de vérité |
 *
 * Un témoin qui recopierait la spec attendue passerait au vert sur les deux.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

import { MESSAGE_DEDUP_INDEXES, ensureMessageDedupIndexes } from '../messageDedupIndex';

/**
 * Les opérateurs qu'un `partialFilterExpression` ADMET, tels que MongoDB les
 * documente : égalité, `$exists: true`, `$gt`/`$gte`/`$lt`/`$lte`, `$type`, et
 * `$and` au niveau racine.
 *
 * https://www.mongodb.com/docs/manual/core/index-partial/#supported-operators
 *
 * C'est la LISTE BLANCHE qui est le témoin : `$ne` n'y est pas, et c'est lui
 * qui a fait lever `createIndex` pendant deux mois.
 */
const ADMIS = new Set(['$exists', '$gt', '$gte', '$lt', '$lte', '$type', '$and']);

const operateurs = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(operateurs);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) =>
    key.startsWith('$') ? [key, ...operateurs(inner)] : operateurs(inner));
};

describe('l’index de dedup d’envoi (#18621)', () => {
  it('n’emploie QUE des opérateurs qu’un filtre partiel admet', () => {
    for (const spec of MESSAGE_DEDUP_INDEXES) {
      for (const operateur of operateurs(spec.partialFilterExpression)) {
        expect({ index: spec.name, operateur, admis: ADMIS.has(operateur) })
          .toEqual({ index: spec.name, operateur, admis: true });
      }
    }
  });

  /**
   * Le nom de collection ne se DEVINE pas : le model Prisma `Message` ne porte
   * aucun `@@map`, donc la collection s'appelle `Message`. La migration de
   * 2026-05-09 visait `messages` — une collection vide.
   */
  it('vise la collection du model Prisma, pas une minuscule devinée', () => {
    expect(MESSAGE_DEDUP_INDEXES.map((s) => s.collection)).toEqual(['Message']);
  });

  it('est UNIQUE et PARTIEL — l’un sans l’autre ne vaut rien', () => {
    const [spec] = MESSAGE_DEDUP_INDEXES;
    // Unique sans partiel : tous les `null` sont égaux, l'envoi casse pour les
    // lignes historiques. Partiel sans unique : la fenêtre reste ouverte.
    expect(spec?.unique).toBe(true);
    expect(spec?.partialFilterExpression).toBeDefined();
    expect(spec?.key).toEqual({ conversationId: 1, clientMessageId: 1 });
  });

  /** Le filtre ne retient que les lignes qui PORTENT un identifiant client. */
  it('ne contraint que les lignes porteuses d’un clientMessageId non vide', () => {
    expect(MESSAGE_DEDUP_INDEXES[0]?.partialFilterExpression)
      .toEqual({ clientMessageId: { $exists: true, $type: 'string', $gt: '' } });
  });

  it('demande la création au démarrage, et dit ce qu’elle a fait', async () => {
    const commandes: unknown[] = [];
    const prisma = {
      $runCommandRaw: jest.fn(async (command: Record<string, unknown>) => {
        commandes.push(command);
        return { numIndexesBefore: 1, numIndexesAfter: 2 };
      }),
    };

    const outcomes = await ensureMessageDedupIndexes(prisma);

    expect(commandes).toEqual([
      {
        createIndexes: 'Message',
        indexes: [{
          key: { conversationId: 1, clientMessageId: 1 },
          name: 'messages_conversationId_clientMessageId_unique',
          unique: true,
          partialFilterExpression: { clientMessageId: { $exists: true, $type: 'string', $gt: '' } },
        }],
      },
    ]);
    expect(outcomes['messages_conversationId_clientMessageId_unique']).toEqual({ outcome: 'created' });
  });

  /**
   * Un index DÉJÀ posé n'est pas un échec : `createIndexes` est idempotent côté
   * Mongo. C'est ce qui rend l'appel payable à CHAQUE boot — et c'est à chaque
   * boot qu'il faut l'appeler, une base peuplée ne passant jamais la porte du
   * seed.
   */
  it('lit « déjà présent » quand Mongo n’a rien créé', async () => {
    const prisma = { $runCommandRaw: jest.fn(async () => ({ numIndexesBefore: 2, numIndexesAfter: 2 })) };

    const outcomes = await ensureMessageDedupIndexes(prisma);

    expect(outcomes['messages_conversationId_clientMessageId_unique']).toEqual({ outcome: 'present' });
  });

  /**
   * Un index du même nom avec une AUTRE spec — le résidu d'une tentative
   * manuelle, ou l'index non partiel qu'un `prisma db push` égaré poserait —
   * est SIGNALÉ, jamais retiré : droper un index unique sous une base vivante
   * est l'affaire d'une migration nommée, pas d'un démarrage.
   */
  it('SIGNALE un conflit de spec au lieu de droper sous une base vivante', async () => {
    const conflit = Object.assign(new Error('Error code 85 (IndexOptionsConflict)'), {
      meta: { message: 'Error code 85 (IndexOptionsConflict): Index already exists with different options' },
    });
    const prisma = { $runCommandRaw: jest.fn(async () => { throw conflit; }) };

    const outcomes = await ensureMessageDedupIndexes(prisma);

    expect(outcomes['messages_conversationId_clientMessageId_unique']).toEqual({
      outcome: 'conflict',
      reason: expect.stringContaining('85'),
    });
  });

  /**
   * Toute AUTRE erreur remonte. Un `E11000` dit que des doublons existent déjà
   * — exactement ce que l'index devait empêcher — et l'avaler ferait du
   * démarrage le complice du défaut qu'il vient mesurer.
   */
  it('propage une erreur qui n’est pas un conflit d’index', async () => {
    const prisma = { $runCommandRaw: jest.fn(async () => { throw new Error('E11000 duplicate key'); }) };

    await expect(ensureMessageDedupIndexes(prisma)).rejects.toThrow('E11000');
  });
});
