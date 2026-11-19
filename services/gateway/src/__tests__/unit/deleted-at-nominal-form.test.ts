/**
 * **LES DEUX DERNIERS `deletedAt: null` NUS DU TRI DE #19748** (#19803), et ce
 * que réparer le premier ALLUME.
 *
 * Sur les 83 filtres d'égalité nue de `deletedAt`, 81 sont EXACTS : 76 portent
 * sur `Message`, où `LIVE_MESSAGE_MARK` est une discipline d'écriture complète,
 * et 5 sur une relation vers `Message`. Les deux derniers portent sur des
 * modèles dont AUCUN créateur n'écrit la colonne — donc les deux n'apparient
 * jamais rien.
 *
 * | site | ce qui est mort |
 * |---|---|
 * | `services/talkie/talkieFallback.ts` | le repli du talkie ne rend JAMAIS de conversation |
 * | `services/notifications/fanout/story-comment.ts` | AUCUN commentateur précédent n'est jamais prévenu |
 *
 * ─── LE SECOND EST UNE LIGNE ; LE PREMIER TRANSFÈRE UNE DÉCISION ─────────────
 *
 * C'est la leçon du cycle 184, appliquée AVANT d'écrire cette fois : réparer un
 * filtre inerte ne fait pas que « rallumer » un chemin — il faut lire ce que son
 * CONSOMMATEUR fait de la valeur rendue.
 *
 * `withFallbackConversation` (`talkieRelay.ts`) n'agit que sur un refus
 * `FALLBACK_VOICE`, et pose `conversationId` sur l'accusé. Or le client
 * PRÉFÈRE ce que le serveur nomme : tant que le filtre est inerte, le serveur ne
 * nomme rien et le client choisit seul, par le RANG
 * (`pickTalkieCopyDestination` : `listRankAt ?? lastMessageAt ?? updatedAt`).
 *
 * **Réparer le filtre transfère donc la décision du client au serveur** — et le
 * serveur triait par `lastMessageAt` SEUL, c'est-à-dire par un critère que la
 * règle partagée contredit depuis #9026 : rang = max(`lastMessageAt`,
 * `lastActivityAt`), et « les clients trient sur `listRankAt` quand il est
 * servi — ils ne recalculent pas » (`conversation-list-rank.ts`). Depuis que
 * #19800 a rendu `lastActivityAt` vivante, les deux critères DIVERGENT dès
 * qu'une conversation a été remontée par une réaction, un appel ou une épingle
 * (#19834).
 *
 * > **Un filtre inerte cache la divergence du chemin qu'il désamorce.** Le
 * > serveur et le client nomment deux destinations différentes depuis #9026, et
 * > personne ne pouvait le voir : le serveur n'en nommait aucune. Réparer le
 * > filtre SANS aligner le critère aurait fait partir la copie vocale ailleurs
 * > que là où l'utilisateur voit sa conversation en tête — un défaut PIRE que
 * > celui qu'on corrige, parce qu'il a l'air d'un caprice plutôt que d'une
 * > absence.
 *
 * Les deux se livrent donc ensemble, et le témoin qui le prouve COMPOSE les deux
 * règles : la destination que le serveur élit, et celle que le client élirait.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';
import { matchesMongoWhere, type MongoDocument } from '../helpers/mongo-where';
import { mostRecentSharedConversation } from '../../services/talkie/talkieFallback';

const SRC = join(__dirname, '..', '..');

const at = (iso: string) => new Date(iso);

/**
 * La forme NOMINALE pour `deletedAt` : **aucune clé**, ce que produisent les
 * onze chemins de création. C'est le sujet de ce témoin.
 *
 * `encryptionMode: null` est posé EXPLICITEMENT, et ce n'est pas la forme
 * nominale de cette colonne-là — plusieurs créateurs ne l'écrivent pas non
 * plus. C'est délibéré : le `where` porte `NOT: SERVER_BLIND_REGIME_FILTER`,
 * une négation d'une condition COMPOSÉE (`isSet: true` + `not: null` +
 * `notIn`), et `matchesMongoWhere` modélise `NOT` comme exigeant la clé
 * présente — mesuré contre `mongo:8` pour une négation SCALAIRE (#8309), pas
 * pour cette forme-ci, où MongoDB rend `$nor` d'un `$and` faux, donc VRAI.
 *
 * Faire décider au double une question qu'il n'a pas été mesuré pour trancher
 * donnerait un verdict sur `deletedAt` qui dépendrait d'une autre colonne. La
 * question est réelle et elle est ouverte : #19907.
 */
const conversationNominale = (id: string, columns: MongoDocument): MongoDocument => ({
  id,
  isActive: true,
  type: 'direct',
  encryptionMode: null,
  ...columns,
});

/** Un double qui ÉVALUE le `where` contre des documents nus, jamais une copie de la clause. */
const prismaDouble = (conversations: readonly MongoDocument[], partage: readonly string[]) => ({
  participant: {
    findMany: async ({ where }: { where: MongoDocument }) =>
      partage.map((conversationId) => ({ conversationId })).filter(() => where !== undefined),
  },
  conversation: {
    findFirst: async ({ where, orderBy }: { where: MongoDocument; orderBy?: Record<string, 'asc' | 'desc'> }) => {
      const retenues = conversations.filter((row) => matchesMongoWhere(row, where));
      const clé = orderBy ? Object.keys(orderBy)[0]! : 'lastMessageAt';
      const trié = [...retenues].sort(
        (a, b) => ((b[clé] as Date | undefined)?.getTime() ?? 0) - ((a[clé] as Date | undefined)?.getTime() ?? 0),
      );
      return trié[0] ? { id: trié[0].id as string } : null;
    },
    findMany: async ({ where }: { where: MongoDocument }) =>
      conversations.filter((row) => matchesMongoWhere(row, where)),
  },
});

describe('les deux derniers `deletedAt: null` nus (#19803)', () => {
  describe('1. le repli du talkie — `Conversation.deletedAt`', () => {
    /**
     * LA FORME NOMINALE, celle que les onze chemins de création produisent :
     * aucune clé `deletedAt`. Un témoin écrit sur `deletedAt: null` explicite ne
     * pourrait pas tomber — les deux états sont indiscernables par la valeur.
     */
    it('rend la conversation partagée d’une paire dont la colonne n’est pas écrite', async () => {
      const conversations = [conversationNominale('c-partagee', { lastMessageAt: at('2026-11-10T10:00:00Z') })];
      const prisma = prismaDouble(conversations, ['c-partagee']);

      const destination = await mostRecentSharedConversation(prisma as never, 'u-from', 'u-to');

      expect(destination).toBe('c-partagee');
    });

    /**
     * ET ELLE ÉCARTE TOUJOURS CE QU'ELLE DOIT ÉCARTER — sans quoi dire l'absence
     * aurait ouvert la porte à une conversation réellement supprimée. Une
     * réparation de filtre se mesure dans les DEUX sens.
     */
    it('écarte une conversation réellement supprimée, et une inactive', async () => {
      const conversations = [
        conversationNominale('c-supprimee', { lastMessageAt: at('2026-11-12T10:00:00Z'), deletedAt: at('2026-11-11T10:00:00Z') }),
        conversationNominale('c-inactive', { lastMessageAt: at('2026-11-11T10:00:00Z'), isActive: false }),
        conversationNominale('c-vivante', { lastMessageAt: at('2026-11-01T10:00:00Z') }),
      ];
      const prisma = prismaDouble(conversations, ['c-supprimee', 'c-inactive', 'c-vivante']);

      expect(await mostRecentSharedConversation(prisma as never, 'u-from', 'u-to')).toBe('c-vivante');
    });

    /**
     * LE TÉMOIN QUI COMPOSE LES DEUX RÈGLES, et la raison pour laquelle ce lot
     * ne pouvait pas se limiter à dire l'absence.
     *
     * La conversation REMONTÉE par une activité (réaction, appel, épingle) a un
     * rang supérieur à celle qui porte le dernier message. Le client élit la
     * première ; le serveur élisait la seconde. Les deux doivent nommer la MÊME
     * destination, sinon la copie vocale part ailleurs que là où l'utilisateur
     * voit sa conversation en tête.
     */
    it('nomme la MÊME destination que le client : celle du RANG, pas du dernier message', async () => {
      const remontee = conversationNominale('c-remontee', {
        lastMessageAt: at('2026-11-01T10:00:00Z'),
        lastActivityAt: at('2026-11-15T10:00:00Z'),
      });
      const bavarde = conversationNominale('c-bavarde', { lastMessageAt: at('2026-11-10T10:00:00Z') });
      const prisma = prismaDouble([remontee, bavarde], ['c-remontee', 'c-bavarde']);

      // Ce que le CLIENT élirait, par la règle partagée du rang.
      const parLeRang = [remontee, bavarde]
        .map((row) => ({ id: row.id as string, rang: listRankFromColumns(row as never)!.getTime() }))
        .reduce((best, row) => (row.rang > best.rang ? row : best));
      expect(parLeRang.id).toBe('c-remontee');

      expect(await mostRecentSharedConversation(prisma as never, 'u-from', 'u-to')).toBe('c-remontee');
    });
  });

  describe('2. l’éventail d’un commentaire de story — `PostComment.deletedAt`', () => {
    /**
     * Ce site est le SEUL du dépôt à lire cette colonne par une égalité nue :
     * les 105 autres lectures de `Post` / `PostComment` passent par
     * `deletedAt: NOT_DELETED` (`{ isSet: false }`), la discipline INVERSE qui
     * dit « non supprimé = clé ABSENTE ». La forme juste était donc déjà nommée,
     * utilisée cent cinq fois, et ce site l'ignorait.
     */
    it('consomme `NOT_DELETED`, comme ses 105 voisins', () => {
      const source = readFileSync(join(SRC, 'services/notifications/fanout/story-comment.ts'), 'utf8');

      expect(source).toContain('deletedAt: NOT_DELETED');
      expect(source).not.toContain('deletedAt: null');
    });

    /**
     * Et la clause retenue apparie bien la forme NOMINALE d'un commentaire —
     * celle que ses deux créateurs produisent, sans clé `deletedAt`. L'inverse
     * de l'autre site : ici c'est l'ABSENCE qui vaut « vivant ».
     */
    it('apparie un commentaire à la forme nominale, et écarte un commentaire supprimé', () => {
      const vivant: MongoDocument = { postId: 'p1', authorId: 'u1' };
      const supprimé: MongoDocument = { postId: 'p1', authorId: 'u2', deletedAt: at('2026-11-18T10:00:00Z') };
      const clause = { postId: 'p1', deletedAt: { isSet: false } };

      expect(matchesMongoWhere(vivant, clause)).toBe(true);
      expect(matchesMongoWhere(supprimé, clause)).toBe(false);
      // L'égalité nue, elle, n'appariait NI l'un NI l'autre.
      expect(matchesMongoWhere(vivant, { postId: 'p1', deletedAt: null })).toBe(false);
    });
  });
});
