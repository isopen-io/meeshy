/**
 * @jest-environment node
 */
import { apercuServi } from '@/lib/api/compte';
import {
  bouge,
  compte,
  comptesDe,
  frappe,
  frappeurDe,
  ligneDe,
  metEnSourdine,
  miseAJourDe,
  ordonnees,
  remets,
  retire,
  type EtatDeLaListe,
  type LigneDeListe,
} from '@/lib/realtime/liste-etat';

/**
 * L'ÉTAT DE `/chats` EN DIRECT — la moitié du module de participation qui se
 * juge sans navigateur (§ 12.4) : le re-tri, la pastille de non-lus, la frappe,
 * le retrait réversible, et la lecture des charges que la passerelle POUSSE.
 *
 * Chaque lecteur de charge est opposé à la forme RÉELLE de son émetteur, citée
 * dans le témoin — un vert obtenu contre une charge inventée ne prouve rien.
 */

const LIGNE = (attributs: Partial<LigneDeListe> = {}): LigneDeListe => ({
  id: 'c1',
  titre: 'Équipe Lagos',
  quand: '2026-09-01T12:00:00.000Z',
  nonLus: 0,
  sourdine: false,
  apercu: { texte: 'On se cale à 15 h ?', langue: 'fr', traduitDe: null },
  frappeurs: [],
  retiree: false,
  ...attributs,
});

const ETAT = (...lignes: readonly LigneDeListe[]): EtatDeLaListe => ({ lignes });

describe('l’ordre de la liste', () => {
  it('met le plus récent en tête', () => {
    const etat = ETAT(
      LIGNE({ id: 'ancienne', quand: '2026-09-01T10:00:00.000Z' }),
      LIGNE({ id: 'recente', quand: '2026-09-01T12:00:00.000Z' }),
    );

    expect(ordonnees(etat).map((ligne) => ligne.id)).toEqual(['recente', 'ancienne']);
  });

  it('range à la fin ce qui n’a jamais rien dit', () => {
    const etat = ETAT(LIGNE({ id: 'muette', quand: null }), LIGNE({ id: 'vivante' }));

    expect(ordonnees(etat).map((ligne) => ligne.id)).toEqual(['vivante', 'muette']);
  });

  /**
   * Le tri est STABLE : deux conversations du même instant gardent l'ordre
   * SERVI. Les départager autrement ferait sauter des lignes à chaque
   * repeinture, sous les yeux du lecteur, sans qu'aucune donnée n'ait bougé.
   */
  it('ne fait sauter aucune ligne à instant égal', () => {
    const etat = ETAT(LIGNE({ id: 'a' }), LIGNE({ id: 'b' }), LIGNE({ id: 'c' }));

    expect(ordonnees(etat).map((ligne) => ligne.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('un message reçu — `conversation:updated`', () => {
  /**
   * La charge est celle de `MeeshySocketIOManager.ts:3216` et de
   * `MessageHandler.ts:1691` : `conversationId`, `lastMessageAt`,
   * `lastMessageId`, `senderId`, `updatedBy`, `updatedAt`, plus la paire du
   * Prisme que `resolveLastMessagePreviewPrism` y répand.
   */
  const CHARGE = {
    conversationId: 'ancienne',
    updatedBy: { id: 'u9' },
    lastMessageAt: '2026-09-01T13:00:00.000Z',
    lastMessageId: 'm42',
    senderId: 'p3',
    updatedAt: '2026-09-01T13:00:00.100Z',
    lastMessagePreview: 'Hello everyone',
    lastMessageOriginalLanguage: 'en',
    lastMessageTranslations: { fr: 'Bonjour à tous' },
  };

  it('remonte la conversation en tête et sert son aperçu', () => {
    const etat = ETAT(
      LIGNE({ id: 'ancienne', quand: '2026-09-01T10:00:00.000Z' }),
      LIGNE({ id: 'recente', quand: '2026-09-01T12:00:00.000Z' }),
    );
    const maj = miseAJourDe(CHARGE);
    expect(maj).not.toBeNull();

    // Le prisme du lecteur commence par le FRANÇAIS : la descente rend la
    // traduction, et la ligne retient CE qu'elle sert — plus la carte brute.
    const suivant = bouge(etat, maj!, ['fr']);

    expect(ordonnees(suivant).map((ligne) => ligne.id)).toEqual(['ancienne', 'recente']);
    expect(ligneDe(suivant, 'ancienne')?.apercu).toEqual({ texte: 'Bonjour à tous', langue: 'fr', traduitDe: 'en' });
  });

  /**
   * LE TÉMOIN DE PRISME SE POSE SUR UN RANG ≠ 1 (leçon 261) : au rang 1, le
   * court-circuit interdit et la règle juste rendent le même verdict.
   *
   * Prisme `['es', 'fr']`, message ANGLAIS, aucune traduction espagnole, une
   * traduction française : la descente ORDONNÉE sert le FRANÇAIS — rang 2 —,
   * jamais l'original anglais.
   */
  it('descend le prisme ORDONNÉ, y compris quand le rang 1 manque', () => {
    const maj = miseAJourDe(CHARGE)!;
    const servi = apercuServi(maj, ['es', 'fr']);

    expect(servi).toEqual({ texte: 'Bonjour à tous', langue: 'fr', traduitDe: 'en' });
  });

  it('sert l’original quand la langue d’origine gagne à SON rang', () => {
    const maj = miseAJourDe(CHARGE)!;

    expect(apercuServi(maj, ['en', 'fr'])).toEqual({ texte: 'Hello everyone', langue: 'en', traduitDe: null });
  });

  /**
   * Un événement qui ne parle pas d'aperçu — une charge sans
   * `lastMessagePreview` — ne doit pas EFFACER celui de la ligne. L'absence
   * n'est pas une valeur vide.
   */
  it('ne perd pas l’aperçu sur une charge qui n’en porte pas', () => {
    const etat = ETAT(LIGNE({ id: 'c1', apercu: { texte: 'Un texte', langue: 'fr', traduitDe: null } }));
    const maj = miseAJourDe({ conversationId: 'c1', lastMessageAt: '2026-09-01T14:00:00.000Z' })!;

    expect(ligneDe(bouge(etat, maj, ['fr']), 'c1')?.apercu?.texte).toBe('Un texte');
  });

  it('refuse une charge sans conversation', () => {
    expect(miseAJourDe({ lastMessageAt: 'x' })).toBeNull();
    expect(miseAJourDe(null)).toBeNull();
  });
});

describe('la pastille de non-lus — `conversation:unread-updated`', () => {
  it('lit la charge de l’éventail, telle qu’il l’émet', () => {
    expect(comptesDe({ conversationId: 'c1', unreadCount: 3, bridge: null })).toEqual({ id: 'c1', nonLus: 3 });
  });

  it('bouge la pastille sans toucher au reste de la ligne', () => {
    const etat = ETAT(LIGNE({ nonLus: 0 }));
    const suivant = compte(etat, { id: 'c1', nonLus: 4 });

    expect(ligneDe(suivant, 'c1')).toEqual(LIGNE({ nonLus: 4 }));
  });

  it('ne descend jamais sous zéro, ni ne croit une charge sans compte', () => {
    expect(comptesDe({ conversationId: 'c1', unreadCount: -2 })).toEqual({ id: 'c1', nonLus: 0 });
    expect(comptesDe({ conversationId: 'c1' })).toBeNull();
  });
});

describe('la frappe — `typing:start` / `typing:stop`', () => {
  /** `TypingEvent` de `StatusHandler.ts:271-277`. */
  const EVENEMENT = { userId: 'u2', username: 'marta', displayName: 'Marta Ruiz', conversationId: 'c1', isTyping: true };

  it('prend le nom AFFICHÉ, celui que la ligne montre partout ailleurs', () => {
    expect(frappeurDe(EVENEMENT)).toEqual({ conversation: 'c1', nom: 'Marta Ruiz' });
  });

  it('retombe sur le pseudo quand la passerelle ne sert aucun nom affiché', () => {
    expect(frappeurDe({ ...EVENEMENT, displayName: null })).toEqual({ conversation: 'c1', nom: 'marta' });
  });

  it('ajoute puis retire le frappeur, sans jamais le compter deux fois', () => {
    const frappeur = frappeurDe(EVENEMENT)!;
    const commence = frappe(frappe(ETAT(LIGNE()), frappeur, true), frappeur, true);

    expect(ligneDe(commence, 'c1')?.frappeurs).toEqual(['Marta Ruiz']);
    expect(ligneDe(frappe(commence, frappeur, false), 'c1')?.frappeurs).toEqual([]);
  });
});

describe('un geste optimiste', () => {
  /**
   * LE RETRAIT GARDE SON RANG (§ 12.10.4, « réversible tant que le serveur n'a
   * pas confirmé ») : une ligne remise revient EXACTEMENT d'où elle vient. Un
   * retrait qui supprimerait l'entrée devrait la reconstruire, donc décider
   * d'un rang — et une conversation d'hier reviendrait en tête.
   */
  it('retire la ligne de la vue, sans lui faire perdre sa place', () => {
    const etat = ETAT(LIGNE({ id: 'a' }), LIGNE({ id: 'b', quand: '2026-09-01T09:00:00.000Z' }), LIGNE({ id: 'c', quand: '2026-08-30T09:00:00.000Z' }));
    const retiree = retire(etat, 'b');

    expect(ligneDe(retiree, 'b')?.retiree).toBe(true);
    expect(ordonnees(remets(retiree, 'b')).map((ligne) => ligne.id)).toEqual(['a', 'b', 'c']);
  });

  it('bascule la sourdine sans rien déplacer', () => {
    const suivant = metEnSourdine(ETAT(LIGNE()), 'c1', true);

    expect(ligneDe(suivant, 'c1')?.sourdine).toBe(true);
    expect(ligneDe(suivant, 'c1')?.quand).toBe('2026-09-01T12:00:00.000Z');
  });
});
