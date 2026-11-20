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
 * ─── Ce que ces témoins exigent de leur double ───────────────────────────────
 *
 * Le double est `findManyIn` (`__tests__/helpers/mongo-where`), qui honore le
 * `where`, le `select` **et** le `take`. Les trois comptent, et chacun garde
 * une chose qu'un double maison laissait passer :
 *
 * - le **`take`** : sans lui, aucun témoin de borne ne peut tomber — un double
 *   qui rend tout ce qu'on lui demande atteste une lecture bornée aussi bien
 *   qu'une lecture nue ;
 * - le **`select`** : sans lui, retirer `shareLinkId` de la projection des
 *   ADMIS rouvre la porte des liens ÉCHUS sans faire rougir un seul témoin
 *   (mesuré par l'audit adversarial du lot : 20 suites, 410 témoins, tous
 *   verts sous cette mutation). C'est la règle du `CLAUDE.md` du gateway — « le
 *   `select` est le seul des trois qu'aucun témoin de rang ne peut voir » ;
 * - le **`where`** : il est ÉVALUÉ, donc la sélection se juge sur ce qu'elle
 *   rend, jamais sur une copie de la clause.
 *
 * Et les témoins ne peuvent pas se poser au cas nominal : quand personne n'est
 * arrivé après le message, la loi rend `{kind:'room'}` sans rien restreindre —
 * la forme juste et la forme fautive rendent le MÊME verdict. Chacun porte donc
 * un lecteur SOUS PLANCHER, et le cas nominal est gardé à part comme
 * non-régression.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { translationReaders } from '../translationReaders';
import { scanLiveParticipants } from '../conversationAudienceRooms';
import { findManyIn, type MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ECRIT = new Date('2026-11-01T10:00:00Z');
const NOW = new Date('2026-11-02T10:00:00Z');
const apres = (minutes: number) => new Date(ECRIT.getTime() + minutes * 60_000);
const avant = (jours: number) => new Date(ECRIT.getTime() - jours * 86_400_000);

/** Un inscrit entré bien avant le message : aucun plancher ne le concerne. */
const membre = (suffixe: string, overrides: MongoDocument = {}): MongoDocument => ({
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
  ...overrides,
});

/** Entré APRÈS le message, par un lien qui REFUSE l'historique : sous plancher. */
const sousPlancher = (suffixe: string): MongoDocument => ({
  ...membre(suffixe),
  userId: null,
  joinedAt: apres(30),
  shareLinkId: 'lnk-ferme',
  anonymousSession: { rights: null },
  user: null,
});

/**
 * Entré APRÈS le message, mais par un lien qui OUVRE l'historique : il est
 * SUSPECT (la clause de retard l'apparie) et n'est PAS bloqué.
 *
 * C'est la seule fixture qui permet au témoin de la troncature des SUSPECTS de
 * tomber SEUL — sans elle, le verdict commun des lectures ACTIFS/ADMIS rend
 * `unknown` de toute façon, et le témoin passe pour une raison qui n'est pas
 * la sienne (constat de l'audit adversarial du lot).
 */
const sousPlancherOuvert = (suffixe: string): MongoDocument => ({
  ...sousPlancher(suffixe),
  shareLinkId: 'lnk-ouvert',
});

/** Actif, et BANNI : il est dans la lecture des ACTIFS, jamais dans les admis. */
const banni = (suffixe: string): MongoDocument => ({ ...membre(suffixe), bannedAt: avant(1) });

/** Admis par la clause, et pourtant RETIRÉ : son lien d'entrée a expiré. */
const lienEchu = (suffixe: string): MongoDocument => ({ ...membre(suffixe), shareLinkId: 'lnk-echu' });

const LIENS = [
  { id: 'lnk-ferme', allowViewHistory: false, expiresAt: null },
  { id: 'lnk-ouvert', allowViewHistory: true, expiresAt: null },
  { id: 'lnk-echu', allowViewHistory: true, expiresAt: avant(1) },
];

function monde(participants: readonly MongoDocument[], options?: { readonly leve?: boolean }) {
  const collection = findManyIn(participants);
  const prisma = {
    participant: {
      findMany: options?.leve
        ? async () => { throw new Error('mongo down'); }
        : collection.findMany,
    },
    conversationShareLink: { findMany: async () => LIENS },
  } as any;

  return { prisma, lectures: collection.calls };
}

describe('#20050 — la loi du plancher borne ses lectures, et une troncature ne SOUS-exclut jamais', () => {
  it('les TROIS lectures partent bornées, à la même sonde `cap + 1`', async () => {
    const { prisma, lectures } = monde([membre('hote'), sousPlancher('invite')]);

    await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 10 });

    expect(lectures.map((lecture) => lecture.take)).toEqual([11, 11, 11]);
  });

  /**
   * La clause de retard est ce qui rend la première lecture BON MARCHÉ : au cas
   * nominal — un message neuf — elle ne rend rien. La retirer n'ouvre aucune
   * fuite (la loi devient plus large, donc plus fermée) mais fait payer
   * l'audience ENTIÈRE à chaque traduction, et rien ne le signalerait.
   */
  it('la lecture des SUSPECTS porte la clause de retard, dans un `AND`', async () => {
    const { prisma, lectures } = monde([membre('hote'), sousPlancher('invite')]);

    await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 10 });

    expect(JSON.stringify(lectures[0].where)).toContain('joinedAt');
    expect(lectures[0].where).toEqual(expect.objectContaining({ AND: expect.any(Array), isActive: true }));
  });

  /**
   * La lecture des SUSPECTS — « qui est arrivé, ou a été autorisé, APRÈS ce
   * message ? » — décide à elle seule si l'audience se restreint : aucun
   * SUSPECT BLOQUÉ ⇒ `{kind:'room'}`, toute la room servie.
   *
   * La fixture est construite pour que ce témoin tombe SEUL : le suspect
   * CONSERVÉ par la troncature n'est pas bloqué (son lien ouvre l'historique),
   * le suspect PERDU l'est. Sans la garde, la loi sort donc sur
   * `blocked.length === 0` en rendant `{kind:'room'}` — AVANT même les lectures
   * des actifs et des admis, dont le verdict commun ne peut plus rattraper
   * quoi que ce soit. Mutation qui le prouve : la garde de complétude des
   * suspects retirée ⇒ `'room'` au lieu d'`'unknown'`, et le lecteur sous
   * plancher est servi en direct.
   */
  it("une lecture des SUSPECTS tronquée ne rend pas « toute la room »", async () => {
    const { prisma } = monde([sousPlancherOuvert('invite-ouvert'), sousPlancher('invite-ferme')]);

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

  /**
   * La RAISON D'ÊTRE de `scanActiveParticipants` : un banni est ACTIF et n'est
   * pas ADMIS, donc il doit figurer dans la liste de refus — c'est la
   * distinction que le cliquet #16690 tient (« audience ⇒ loi étroite / refus
   * ⇒ sur-ensemble »), et la seule chose qui distingue cette lecture de celle
   * de l'audience.
   *
   * Mutation qui le prouve : `activeScan.rows` → `admittedScan.rows` dans le
   * complément — c'est-à-dire annuler exactement ce que cette lecture existe
   * pour faire — fait disparaître `u-banni` de l'exclusion, donc lui sert la
   * traduction par la file. Aucun témoin du premier jet du lot ne tombait sous
   * cette mutation (constat de l'audit adversarial).
   */
  it('un membre BANNI entre dans les clés exclues, et jamais dans les rooms', async () => {
    const { prisma } = monde([membre('hote'), banni('banni'), sousPlancher('invite')]);

    const readers = await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 10 });

    expect(readers.kind).toBe('readers');
    if (readers.kind !== 'readers') return;
    expect([...readers.rooms]).toEqual([ROOMS.user('u-hote')]);
    expect([...readers.excludedQueueKeys].sort()).toEqual(['p-invite', 'u-banni']);
  });

  /**
   * Le `select` des ADMIS porte `shareLinkId` pour une seule raison :
   * `withoutExpiredShareLinks` en a besoin. Le retirer ne fait rien compiler de
   * faux et ne change aucune clause — il rend `shareLinkId` indéfini pour tout
   * le monde, donc n'exclut plus AUCUN invité au lien échu.
   *
   * Ce témoin est la seule chose qui tombe sous cette mutation, et il ne tombe
   * que parce que le double honore le `select`.
   */
  it('un invité au lien ÉCHU ne reçoit rien, et son absence de projection le prouve', async () => {
    const { prisma } = monde([membre('hote'), lienEchu('echu'), sousPlancher('invite')]);

    const readers = await translationReaders(prisma, CONV, ECRIT, NOW, { cap: 10 });

    expect(readers.kind).toBe('readers');
    if (readers.kind !== 'readers') return;
    expect([...readers.rooms]).toEqual([ROOMS.user('u-hote')]);
    expect([...readers.excludedQueueKeys].sort()).toEqual(['p-invite', 'u-echu']);
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

/**
 * Le rétrécissement que cette loi apporte à la lecture des vivants est la SEULE
 * liberté qu'un appelant obtient sur le `where` — et la première écriture du
 * lot la lui donnait sous forme d'objet ÉTALÉ, sous un doc-comment affirmant
 * qu'« un appelant ne peut pas élargir l'audience ».
 *
 * C'était faux, et l'audit adversarial du lot l'a mesuré : `{ OR: [...] }` —
 * la façon NATURELLE d'écrire un rétrécissement disjonctif — écrasait l'`OR` de
 * `bannedAt`, donc faisait perdre la garde de BANNISSEMENT sur un type
 * d'options partagé par les audiences de DIFFUSION. Le dépôt NOMME ce piège
 * (`utils/prisma-unset.ts`). Ce témoin garde la forme qui le ferme.
 *
 * La question des ACTIFS, elle, n'admet AUCUN rétrécissement, et c'est le
 * COMPILATEUR qui le tient : `ActiveParticipantScanOptions` déclare
 * `narrowing?: never`, donc un appelant qui lui passe les options de l'audience
 * ne compile pas — au lieu de se faire ignorer en silence, l'autre moitié du
 * même constat d'audit. Aucun témoin d'exécution ici : un `expect(true)` qui
 * NOMME une garde de type est une décoration, pas un témoin.
 */
describe('#20050 — un rétrécissement ne peut QUE rétrécir', () => {
  const vivants = [membre('hote'), banni('banni')];

  it('une clause disjonctive n’écrase pas la garde de bannissement', async () => {
    const collection = findManyIn(vivants);
    const prisma = { participant: { findMany: collection.findMany } } as any;

    const scan = await scanLiveParticipants<{ id: string }>(
      prisma,
      CONV,
      { id: true },
      { narrowing: [{ OR: [{ joinedAt: { gt: avant(60) } }] }] },
    );

    // Le banni apparie la clause de rétrécissement ; seule la loi l'écarte.
    expect(scan.rows.map((row) => row.id)).toEqual(['p-hote']);
    expect(collection.calls[0].where).toEqual(expect.objectContaining({ isActive: true }));
    expect(JSON.stringify(collection.calls[0].where)).toContain('bannedAt');
  });
});
