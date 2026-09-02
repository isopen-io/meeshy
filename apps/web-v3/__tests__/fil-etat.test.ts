/**
 * @jest-environment node
 */
import {
  ETAT_VIDE,
  accuse,
  aEnvoyer,
  bulleOptimiste,
  bulleServie,
  confirme,
  depuisLaCharge,
  dernierInstantServi,
  echoue,
  edite,
  frappe,
  frappeurDe,
  insere,
  presence,
  presenceDe,
  presencesDe,
  reactionDe,
  reagisMoiMeme,
  reagit,
  retire,
  traduit,
  type EtatDuFil,
} from '../lib/realtime/fil-etat';
import { message } from '../lib/api/fil';

/**
 * L'ÉTAT D'UN FIL OUVERT, transition par transition — chacune répond à UNE
 * charge de la passerelle, lue dans son émetteur (conception § 12.4). Ces
 * témoins gagent la partie PURE du module de participation : sans DOM, sans
 * socket, sans navigateur.
 */

const charge = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm1',
  conversationId: 'c1',
  senderId: 'u2',
  content: 'Shall we meet at 3 pm?',
  originalLanguage: 'en',
  messageType: 'text',
  createdAt: '2026-09-01T12:00:00.000Z',
  translations: [],
  sender: { id: 'p2', displayName: 'Ibrahim', type: 'user', userId: 'u2' },
  ...attributs,
});

const LANGUES = ['fr', 'en'];
const ORIGINE = 'https://gate.test';

const bulle = (attributs: Record<string, unknown> = {}) => {
  const b = depuisLaCharge(charge(attributs), 'u1', LANGUES, ORIGINE);
  if (b === null) throw new Error('charge illisible');
  return b;
};

describe('insérer — dans l’ordre d’écriture, sans doublon', () => {
  it('range par instant d’écriture, quel que soit l’ordre d’arrivée', () => {
    const tard = bulle({ id: 'm2', createdAt: '2026-09-01T12:05:00.000Z' });
    const tot = bulle({ id: 'm1', createdAt: '2026-09-01T12:00:00.000Z' });
    const etat = insere(insere(ETAT_VIDE, tard), tot);
    expect(etat.bulles.map((b) => b.id)).toEqual(['m1', 'm2']);
  });

  it('REMPLACE une bulle déjà là plutôt que de l’ajouter — le rattrapage par /sync relit ce qui est peint', () => {
    const etat = insere(insere(ETAT_VIDE, bulle()), bulle({ content: 'edited', isEdited: true }));
    expect(etat.bulles).toHaveLength(1);
    expect(etat.bulles[0]?.edite).toBe(true);
  });

  /**
   * Le `message:new` de l'EXPÉDITEUR porte le `clientMessageId` de sa bulle
   * optimiste (`messageNewPayload.ts`, « voyage jusqu'aux appareils de
   * l'EXPÉDITEUR, et à eux seuls ») : la charge serveur prend la place de
   * l'optimiste, à SON rang, et la bulle devient servie.
   */
  it('confirme une bulle optimiste par la charge qui porte son clientMessageId', () => {
    const optimiste = bulleOptimiste({
      clientMessageId: 'cid_1',
      texte: 'Bonjour',
      auteur: 'Amina',
      auteurId: 'u1',
      langue: 'fr',
      horsLigne: false,
      maintenant: Date.parse('2026-09-01T12:00:00.000Z'),
    });
    const servie = bulle({ id: 'm9', senderId: 'u1', content: 'Bonjour', originalLanguage: 'fr', clientMessageId: 'cid_1', createdAt: '2026-09-01T12:00:01.000Z' });
    const etat = insere(insere(ETAT_VIDE, optimiste), servie);
    expect(etat.bulles).toHaveLength(1);
    expect(etat.bulles[0]?.id).toBe('m9');
    expect(etat.bulles[0]?.envoi).toBe('servi');
    expect(etat.bulles[0]?.ecritA).toBe('2026-09-01T12:00:01.000Z');
  });
});

describe('l’envoi optimiste — ses trois issues, toutes VISIBLES', () => {
  const optimiste = bulleOptimiste({
    clientMessageId: 'cid_2',
    texte: 'Salut',
    auteur: 'Amina',
    auteurId: 'u1',
    langue: 'fr',
    horsLigne: true,
    maintenant: 0,
  });
  const etat = insere(ETAT_VIDE, optimiste);

  it('naît en attente ou hors ligne, avec une horloge, jamais confirmée d’avance', () => {
    expect(etat.bulles[0]?.envoi).toBe('hors-ligne');
    expect(etat.bulles[0]?.deMoi).toBe(true);
    expect(aEnvoyer(etat).map((b) => b.clientMessageId)).toEqual(['cid_2']);
  });

  it('se confirme sur l’accusé du transport, qui ne porte que l’identifiant', () => {
    const confirmee = confirme(etat, 'cid_2', 'm7');
    expect(confirmee.bulles[0]?.envoi).toBe('servi');
    expect(confirmee.bulles[0]?.id).toBe('m7');
    expect(aEnvoyer(confirmee)).toEqual([]);
  });

  /**
   * L'envoi d'un INVITÉ par la route : la passerelle n'adresse la charge avec
   * `clientMessageId` qu'à la room du COMPTE de l'expéditeur
   * (`MeeshySocketIOManager.ts:3042-3056`), qu'une place anonyme n'a pas. Son
   * `message:new` arrive donc NU — et parfois AVANT l'accusé de la route :
   * l'optimiste s'efface devant la servie, jamais deux bulles pour un envoi.
   */
  it('efface l’optimiste quand la bulle servie a devancé l’accusé sans clientMessageId', () => {
    const servieNue = bulle({ id: 'm7', senderId: 'p-tolu', content: 'Salut', originalLanguage: 'fr', sender: { id: 'p-tolu', displayName: 'Tolu', type: 'anonymous' } });
    const avant = insere(etat, servieNue);
    expect(avant.bulles).toHaveLength(2);
    const apres = confirme(avant, 'cid_2', 'm7');
    expect(apres.bulles).toHaveLength(1);
    expect(apres.bulles[0]).toMatchObject({ id: 'm7', envoi: 'servi', clientMessageId: null });
  });

  it('échoue avec sa raison — jamais perdue en silence', () => {
    const echouee = echoue(etat, 'cid_2', 'Ce lien a été fermé.');
    expect(echouee.bulles[0]?.envoi).toBe('en-echec');
    expect(echouee.bulles[0]?.raison).toBe('Ce lien a été fermé.');
  });
});

describe('une traduction qui arrive — `message:translation`, `buildTranslationEvent.ts:70-97`', () => {
  const evenement = (targetLanguage: string, translatedContent: string) => [
    { id: 't1', messageId: 'm1', sourceLanguage: 'en', targetLanguage, translatedContent, translationModel: 'medium', cacheKey: 'k', cached: false },
  ];

  it('fait passer la bulle à la langue du lecteur dès qu’elle arrive', () => {
    const avant = insere(ETAT_VIDE, bulle());
    expect(avant.bulles[0]?.texte).toBe('Shall we meet at 3 pm?');

    const apres = traduit(avant, 'm1', evenement('fr', 'On se cale à 15 h ?'), LANGUES);
    expect(apres.bulles[0]?.texte).toBe('On se cale à 15 h ?');
    expect(apres.bulles[0]?.langueServie).toBe('fr');
    expect(apres.bulles[0]?.texteOriginal).toBe('Shall we meet at 3 pm?');
  });

  /**
   * LE TÉMOIN DE RANG (leçon 261) : une traduction vers un rang INFÉRIEUR à
   * celui déjà servi ne change rien à l'écran. Prisme `['fr','en']`, message
   * ESPAGNOL déjà servi en français : la traduction anglaise qui arrive ensuite
   * ne le rétrograde pas.
   */
  it('ne rétrograde jamais un rang déjà servi', () => {
    const espagnol = bulle({ originalLanguage: 'es', content: 'Perfecto', translations: [{ language: 'fr', content: 'Parfait' }] });
    const avant = insere(ETAT_VIDE, espagnol);
    expect(avant.bulles[0]?.texte).toBe('Parfait');

    const apres = traduit(avant, 'm1', evenement('en', 'Perfect'), LANGUES);
    expect(apres.bulles[0]?.texte).toBe('Parfait');
    expect(apres.bulles[0]?.langueServie).toBe('fr');
  });

  it('ne touche pas un message protégé', () => {
    const protege = bulle({ isViewOnce: true });
    const apres = traduit(insere(ETAT_VIDE, protege), 'm1', evenement('fr', 'fuite'), LANGUES);
    expect(apres.bulles[0]?.texte).not.toContain('fuite');
  });
});

describe('édition, retrait, réactions, accusés', () => {
  it('applique une édition sur le texte et ses traductions', () => {
    const avant = insere(ETAT_VIDE, bulle());
    const apres = edite(avant, charge({ content: 'Shall we meet at 4 pm?', isEdited: true, translations: [{ language: 'fr', content: 'On se cale à 16 h ?' }] }), 'u1', LANGUES, ORIGINE);
    expect(apres.bulles[0]?.texte).toBe('On se cale à 16 h ?');
    expect(apres.bulles[0]?.edite).toBe(true);
  });

  it('retire un message supprimé sans retirer sa ligne — la mention reste', () => {
    const apres = retire(insere(ETAT_VIDE, bulle()), 'm1');
    expect(apres.bulles).toHaveLength(1);
    expect(apres.bulles[0]?.supprime).toBe(true);
    expect(apres.bulles[0]?.texte).toBe('');
  });

  /** `ReactionUpdateEvent.aggregation.count` est ABSOLU : on pose, on n'incrémente pas. */
  it('pose le compte absolu d’une réaction, et la retire à zéro', () => {
    const lu = reactionDe({ messageId: 'm1', conversationId: 'c1', participantId: 'p2', userId: 'u2', emoji: '👍', action: 'add', aggregation: { emoji: '👍', count: 3, participantIds: [] } }, 'u1');
    // Le geste d'un AUTRE ne dit rien de ma pastille : `null`, pas `false`.
    expect(lu).toEqual({ messageId: 'm1', emoji: '👍', nombre: 3, mienne: null });

    const avec = reagit(insere(ETAT_VIDE, bulle()), 'm1', '👍', 3);
    expect(avec.bulles[0]?.reactions).toEqual([{ emoji: '👍', nombre: 3, mienne: false }]);
    expect(reagit(avec, 'm1', '👍', 0).bulles[0]?.reactions).toEqual([]);
  });

  /**
   * « Ma réaction » se dérive de `userId` — le `User.id` de l'acteur — confronté
   * au mien (`packages/shared/types/reaction.ts:76-98`) ; un invité, sans compte,
   * se reconnaît à `participantId`. Un événement qui n'est pas de moi ne dit
   * rien (`null`) : il ne retire pas une pastille que je sais mienne.
   */
  it('reconnaît ma réaction à userId (membre) ou participantId (invité), et ne présume rien des autres', () => {
    const ajout = { messageId: 'm1', conversationId: 'c1', participantId: 'p-amina', userId: 'u1', emoji: '❤️', action: 'add', aggregation: { emoji: '❤️', count: 1, participantIds: ['p-amina'] } };
    expect(reactionDe(ajout, 'u1')?.mienne).toBe(true);
    expect(reactionDe({ ...ajout, action: 'remove' }, 'u1')?.mienne).toBe(false);
    expect(reactionDe({ ...ajout, participantId: 'p-tolu', userId: undefined }, 'p-tolu')?.mienne).toBe(true);
    expect(reactionDe(ajout, 'u2')?.mienne).toBeNull();

    const mienne = reagit(insere(ETAT_VIDE, bulle()), 'm1', '❤️', 1, true);
    expect(mienne.bulles[0]?.reactions).toEqual([{ emoji: '❤️', nombre: 1, mienne: true }]);
    // Un agrégat d'un AUTRE acteur (mienne: null) garde ce que je savais.
    expect(reagit(mienne, 'm1', '❤️', 2, null).bulles[0]?.reactions).toEqual([{ emoji: '❤️', nombre: 2, mienne: true }]);
  });

  /** Mon geste, avant l'accusé : un de plus, à moi ; rejoué à l'envers, un de moins, plus à moi. */
  it('peint mon geste d’avance, et le rejoue à l’envers sur un refus', () => {
    const avant = reagit(insere(ETAT_VIDE, bulle()), 'm1', '👍', 2, false);
    const optimiste = reagisMoiMeme(avant, 'm1', '👍', true);
    expect(optimiste.bulles[0]?.reactions).toEqual([{ emoji: '👍', nombre: 3, mienne: true }]);
    expect(reagisMoiMeme(optimiste, 'm1', '👍', false).bulles[0]?.reactions).toEqual([{ emoji: '👍', nombre: 2, mienne: false }]);
    expect(reagisMoiMeme(reagit(avant, 'm1', '👍', 1, true), 'm1', '👍', false).bulles[0]?.reactions).toEqual([]);
  });

  /** `read-status:updated` porte la FRONTIÈRE d'un pair : tout ce que j'ai écrit avant est lu. */
  it('fait passer mes messages antérieurs à « lu », jamais en arrière', () => {
    const mien = bulle({ senderId: 'u1', createdAt: '2026-09-01T12:00:00.000Z' });
    const plusTard = bulle({ id: 'm2', senderId: 'u1', createdAt: '2026-09-01T12:10:00.000Z' });
    const etat = insere(insere(ETAT_VIDE, mien), plusTard);
    const lu = accuse(etat, { type: 'read', jusquA: Date.parse('2026-09-01T12:05:00.000Z') });
    expect(lu.bulles.map((b) => b.accuse)).toEqual(['lu', 'envoye']);
    expect(accuse(lu, { type: 'received', jusquA: Date.parse('2026-09-01T12:05:00.000Z') }).bulles[0]?.accuse).toBe('lu');
  });
});

describe('la frappe — `TypingEvent`, `StatusHandler.ts:276-292`', () => {
  it('lit le nom d’affichage, sinon le pseudo', () => {
    expect(frappeurDe({ userId: 'u2', username: 'ibrahim', displayName: 'Ibrahim', conversationId: 'c1', isTyping: true })).toEqual({ id: 'u2', nom: 'Ibrahim' });
    expect(frappeurDe({ userId: 'p9', username: 'Tolu', conversationId: 'c1' })).toEqual({ id: 'p9', nom: 'Tolu' });
    expect(frappeurDe({})).toBeNull();
  });

  it('ajoute et retire qui écrit, sans doublon', () => {
    const un = frappe(ETAT_VIDE, { id: 'u2', nom: 'Ibrahim' }, true);
    const deux = frappe(un, { id: 'u2', nom: 'Ibrahim' }, true);
    expect(deux.frappeurs).toHaveLength(1);
    expect(frappe(deux, { id: 'u2', nom: 'Ibrahim' }, false).frappeurs).toEqual([]);
  });
});

describe('le curseur de rattrapage', () => {
  it('est le dernier instant SERVI — jamais celui d’une bulle en attente', () => {
    const etat: EtatDuFil = insere(
      insere(ETAT_VIDE, bulleServie(message(charge(), 'u1', LANGUES, ORIGINE)!)),
      bulleOptimiste({ clientMessageId: 'cid_3', texte: 'x', auteur: 'A', auteurId: 'u1', langue: 'fr', horsLigne: false, maintenant: Date.parse('2026-09-01T13:00:00.000Z') }),
    );
    expect(dernierInstantServi(etat)).toBe('2026-09-01T12:00:00.000Z');
    expect(dernierInstantServi(ETAT_VIDE)).toBeNull();
  });
});

/**
 * LA PRÉSENCE — `user:status` `{ userId, username, isOnline, lastActiveAt }`
 * (`MeeshySocketIOManager.ts:2869`, poussé aux rooms des AMIS acceptés et des
 * administrateurs, `presence-audience.ts`) et `presence:snapshot` `{ users }`
 * à l'authentification (`:1435`). Le fil ne compte que les participants que le
 * document a SERVIS : recevoir l'événement prouve que la passerelle sert cette
 * présence au lecteur (directive 2026-08-25), et un inconnu ne fabrique rien.
 */
describe('la présence — `user:status`, `presence:snapshot`', () => {
  const PARTICIPANTS = ['u2', 'u3'];

  it('lit qui est en ligne dans la charge, et refuse une charge sans identité', () => {
    expect(presenceDe({ userId: 'u2', username: 'ibrahim', isOnline: true, lastActiveAt: null })).toEqual({ id: 'u2', enLigne: true });
    expect(presenceDe({ userId: 'u2', isOnline: 'oui' })).toEqual({ id: 'u2', enLigne: false });
    expect(presenceDe({ username: 'x', isOnline: true })).toBeNull();
    expect(presencesDe({ users: [{ userId: 'u2', isOnline: true }, { userId: 'u3', isOnline: false }, { isOnline: true }] })).toEqual([
      { id: 'u2', enLigne: true },
      { id: 'u3', enLigne: false },
    ]);
    expect(presencesDe({})).toEqual([]);
  });

  it('ne compte que les participants SERVIS, sans doublon — un inconnu ne fabrique rien, un départ retire', () => {
    const un = presence(ETAT_VIDE, PARTICIPANTS, { id: 'u2', enLigne: true });
    expect(un.presents).toEqual(['u2']);
    expect(presence(un, PARTICIPANTS, { id: 'u2', enLigne: true }).presents).toEqual(['u2']);
    expect(presence(un, PARTICIPANTS, { id: 'u9', enLigne: true }).presents).toEqual(['u2']);
    expect(presence(un, PARTICIPANTS, { id: 'u3', enLigne: true }).presents).toEqual(['u2', 'u3']);
    expect(presence(un, PARTICIPANTS, { id: 'u2', enLigne: false }).presents).toEqual([]);
    expect(un.bulles).toEqual([]);
  });
});
