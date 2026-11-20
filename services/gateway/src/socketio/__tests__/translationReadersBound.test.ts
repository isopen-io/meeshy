/**
 * #20050 — la loi du plancher d'historique compose un COMPLÉMENT, et une
 * lecture TRONQUÉE y SOUS-exclut, donc y FUIT.
 *
 * `translationReaders` rend deux listes, et elles ne se dégradent PAS dans le
 * même sens :
 *
 * | ce qu'elle rend | ce qu'une troncature en fait |
 * |---|---|
 * | `rooms` — les lecteurs AUTORISÉS | moins de rooms ⇒ une remise perdue |
 * | `excludedQueueKeys` — les lecteurs qui ne doivent RIEN recevoir | moins de clés ⇒ **une porte ouverte** |
 *
 * La seconde est un COMPLÉMENT (`actifs moins admis`) : chaque ligne qu'une
 * lecture bornée ne voit pas est une personne qu'on cesse d'exclure. Un lecteur
 * SOUS PLANCHER reçoit alors, dans une file qui le garde 48 h, la traduction
 * d'un message que quatre portes lui refusent (`GET …/messages`, `/sync`,
 * `conversation:updated`, `GET /attachments/:id`).
 *
 * C'est la forme de #20007 avec l'inversion qui la rend plus grave : là, une
 * troncature appauvrissait une diffusion ; ici, elle ouvre un accès. **Borner
 * ce site sans le rendre fail-closed aurait été pire que de le laisser nu** —
 * c'est pourquoi #20020 l'a GELÉ au cliquet plutôt que corrigé au passage.
 *
 * ─── Ce que ces témoins exigent, et pourquoi ils ne peuvent pas se poser au
 *     cas nominal ──────────────────────────────────────────────────────────────
 *
 * Quand personne n'est arrivé après le message, la loi rend `{kind:'room'}`
 * sans rien restreindre : la forme juste et la forme fautive rendent le MÊME
 * verdict. Chaque témoin porte donc un lecteur SOUS PLANCHER, et le cas nominal
 * est gardé à part comme non-régression.
 *
 * **Le double honore le `take`** — sans quoi aucun témoin de borne ne peut
 * tomber : un double qui rend tout ce qu'on lui demande atteste une lecture
 * bornée aussi bien qu'une lecture nue (règle du cycle 112 bis, « un double de
 * test ment aussi par ce qu'il ACCEPTE »). Et il ÉVALUE le `where`
 * (`matchesMongoWhere`) : la sélection se juge sur ce qu'elle rend, jamais sur
 * une copie de la clause.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { translationReaders } from '../translationReaders';
import { ADMITTED_FILE_READER_WHERE } from '../../services/attachments/fileReaderAdmission';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { matchesMongoWhere, type MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ECRIT = new Date('2026-11-01T10:00:00Z');
const NOW = new Date('2026-11-02T10:00:00Z');
const apres = (minutes: number) => new Date(ECRIT.getTime() + minutes * 60_000);
const avant = (jours: number) => new Date(ECRIT.getTime() - jours * 86_400_000);

/** Un inscrit entré bien avant le message : aucun plancher ne le concerne. */
const membre = (suffixe: string): MongoDocument => ({
  id: `p-${suffixe}`,
  userId: `u-${suffixe}`,
  conversationId: CONV,
  isActive: true,
  bannedAt: null,
  role: 'member',
  joinedAt: avant(30),
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
});

/** Entré APRÈS le message, par un lien qui REFUSE l'historique : sous plancher. */
const sousPlancher = (suffixe: string): MongoDocument => ({
  id: `p-${suffixe}`,
  userId: null,
  conversationId: CONV,
  isActive: true,
  bannedAt: null,
  role: 'member',
  joinedAt: apres(30),
  shareLinkId: 'lnk-ferme',
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: { rights: null },
  user: null,
});

/** Actif, et BANNI : il est dans la lecture des ACTIFS, jamais dans les admis. */
const banni = (suffixe: string): MongoDocument => ({
  ...membre(suffixe),
  bannedAt: avant(1),
});

type Lecture = { readonly where: MongoDocument; readonly take: number | undefined };

function monde(participants: readonly MongoDocument[], options?: { readonly leve?: boolean }) {
  const lectures: Lecture[] = [];
  const prisma = {
    participant: {
      findMany: jest.fn(async (args: any) => {
        if (options?.leve) throw new Error('mongo down');
        lectures.push({ where: args.where, take: args.take });
        const matched = participants.filter((row) => matchesMongoWhere(row, args.where));
        // Le `take` de production vaut `cap + 1` : la ligne EXCÉDENTAIRE est la
        // sonde qui distingue une audience de la taille EXACTE du plafond d'une
        // audience tronquée. Un double qui l'ignore rend le témoin décoratif.
        return typeof args.take === 'number' ? matched.slice(0, args.take) : matched;
      }),
    },
    conversationShareLink: {
      findMany: jest.fn(async () => [
        { id: 'lnk-ferme', allowViewHistory: false, expiresAt: null },
        { id: 'lnk-ouvert', allowViewHistory: true, expiresAt: null },
      ]),
    },
  } as any;

  return { prisma, lectures };
}

describe('#20050 — la loi du plancher borne ses lectures, et une troncature ne SOUS-exclut jamais', () => {
  /**
   * La lecture des suspects passe désormais par `scanLiveParticipants`, dont la
   * clause est `PARTICIPATION_VIVANTE` — là où ce site écrivait
   * `ADMITTED_FILE_READER_WHERE`. Les deux sont la MÊME clause (une affectation
   * directe, `fileReaderAdmission.ts`), et c'est exactement ce qui rend le
   * passage sûr… tant que c'est vrai.
   *
   * Ce témoin garde le couplage : le jour où la porte de LECTURE des fichiers
   * se durcit ou s'élargit, il tombe, et ce site est relu dans le même lot au
   * lieu de suivre en silence. Chercher une clause par son NOM, c'est manquer
   * les sites qui l'écrivent autrement (cycle 105) — la réciproque est qu'un
   * site qui change de NOM de clause doit prouver que la clause n'a pas changé.
   */
  it("la porte de lecture des fichiers et la participation vivante sont encore la MÊME clause", () => {
    expect(ADMITTED_FILE_READER_WHERE).toEqual(PARTICIPATION_VIVANTE);
  });

  it('les TROIS lectures partent bornées, à la même sonde `cap + 1`', async () => {
    const { prisma, lectures } = monde([membre('hote'), sousPlancher('invite')]);

    await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 10 });

    expect(lectures.length).toBeGreaterThanOrEqual(3);
    expect(lectures.every((lecture) => lecture.take === 11)).toBe(true);
  });

  /**
   * La lecture des SUSPECTS — « qui est arrivé, ou a été autorisé, APRÈS ce
   * message ? » — décide à elle seule si l'audience se restreint : zéro suspect
   * ⇒ `{kind:'room'}`, toute la room servie. Une troncature y fait disparaître
   * des suspects, donc des BLOQUÉS.
   *
   * Mutation qui le prouve : la clause de complétude retirée de cette lecture,
   * la loi rend `{kind:'readers'}` dont `rooms` porte la room du second invité
   * sous plancher — elle le SERT, en direct, le message qu'il n'a pas le droit
   * de lire.
   */
  it("une lecture des SUSPECTS tronquée ne sert plus personne — elle n'affirme rien", async () => {
    const { prisma } = monde([membre('hote'), sousPlancher('invite-1'), sousPlancher('invite-2')]);

    const readers = await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 1 });

    expect(readers.kind).toBe('unknown');
  });

  /**
   * La lecture des ACTIFS est la BASE du complément. L'ordre des lignes du
   * double n'est pas décoratif : la tronquer fait tomber la DERNIÈRE, et ce
   * témoin place là le lecteur sous plancher.
   *
   * Mutation qui le prouve : la clause de complétude retirée de cette lecture,
   * `excludedQueueKeys` ne porte PLUS `p-invite` — la file hors ligne dépose
   * donc chez lui, pour 48 h, la traduction d'un message antérieur à son
   * arrivée.
   */
  it("une lecture des ACTIFS tronquée n'enfile pour personne — le complément serait FAUX", async () => {
    const { prisma } = monde([membre('hote'), membre('autre'), banni('banni'), sousPlancher('invite')]);

    const readers = await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 3 });

    expect(readers.kind).toBe('unknown');
  });

  it('une audience de la taille EXACTE du plafond est complète, et la loi tranche', async () => {
    const { prisma } = monde([membre('hote'), membre('autre'), sousPlancher('invite')]);

    const readers = await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 3 });

    expect(readers.kind).toBe('readers');
    if (readers.kind !== 'readers') return;
    expect([...readers.rooms].sort()).toEqual([ROOMS.user('u-autre'), ROOMS.user('u-hote')].sort());
    expect([...readers.excludedQueueKeys]).toEqual(['p-invite']);
  });

  it('personne sous plancher ⇒ la room entière, comme avant le lot', async () => {
    const { prisma } = monde([membre('hote'), membre('autre')]);

    const readers = await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 3 });

    expect(readers.kind).toBe('room');
  });

  /**
   * Une PANNE n'est pas une troncature, et les deux ne se rendent pas de la
   * même façon : cinq appelants NOMMENT la panne par leur propre `onError`
   * (`messageReadership`, `broadcastMessageMutation`, `emitAttachmentUpdated`,
   * `messageMentions`, `deliverTextTranslation`). La loi continue donc de
   * LEVER ; elle ne substitue pas `unknown` à une levée, ce qui priverait ces
   * cinq sites de leur diagnostic.
   */
  it('une lecture qui LÈVE lève encore — la panne reste nommable chez ses appelants', async () => {
    const { prisma } = monde([membre('hote')], { leve: true });

    await expect(translationReaders(prisma, CONV, ECRIT, NOW)).rejects.toThrow('mongo down');
  });

  /**
   * Sans date de message, la loi lit le plancher de TOUS les participants et
   * exclut quiconque en a un (fail-closed, doc-comment de `translationReaders`).
   * La borne ne doit pas changer cette posture : la lecture des suspects y est
   * la lecture ENTIÈRE, donc la plus exposée à la troncature.
   */
  it('sans date de message, une troncature ne rend pas la room entière', async () => {
    const { prisma } = monde([membre('hote'), membre('autre'), sousPlancher('invite')]);

    const readers = await translationReaders(prisma, CONV, null, NOW, { cap: 2 });

    expect(readers.kind).toBe('unknown');
  });
});
