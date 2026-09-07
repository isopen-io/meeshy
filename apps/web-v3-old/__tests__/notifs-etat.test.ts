import type { Notification } from '@/lib/api/notifications';
import {
  arrive,
  chargeDeComptes,
  chargeDeLue,
  chargeDeLueEnMasse,
  compte,
  ligneDeNotification,
  lit,
  litEnMasse,
  type EtatDesNotifs,
} from '@/lib/realtime/notifs-etat';

/**
 * L'ÉTAT DES NOTIFICATIONS — les réducteurs PURS que le module de participation
 * applique (issue #4898), testés sans DOM.
 *
 * LE COMPTEUR N'EST PAS DÉDUIT DU PRÉDICAT DE MASSE, et c'est une loi copiée
 * de `@meeshy/shared` (`notification-read-bulk.ts`) : « un cache partiel matche
 * moins de lignes que le serveur n'en a marquées — décrémenter d'après ce
 * prédicat ferait dériver le badge ». `notification:counts`, émis juste après
 * chaque mutation par la passerelle (`emitCountsUpdate`), reste autoritatif.
 */

const NOTIF = (attributs: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  genre: 'message',
  titre: 'Alice vous a répondu',
  sousTitre: null,
  corps: 'On se voit demain ?',
  nomDeLActeur: 'Alice',
  lue: false,
  creeeA: '2026-09-02T20:00:00.000Z',
  contexte: { conversationId: 'c1' },
  ...attributs,
});

const ETAT = (attributs: Partial<EtatDesNotifs> = {}): EtatDesNotifs => ({
  lignes: [ligneDeNotification(NOTIF())],
  nonLues: 1,
  ...attributs,
});

describe('la ligne composée depuis une charge socket', () => {
  it('compose le texte primaire comme la vue le sert — titre, sinon corps, sinon acteur', () => {
    expect(ligneDeNotification(NOTIF()).primaire).toBe('Alice vous a répondu');
    expect(ligneDeNotification(NOTIF({ titre: null })).primaire).toBe('On se voit demain ?');
    expect(ligneDeNotification(NOTIF({ titre: null, corps: null })).primaire).toBe('Alice');
  });

  it('ne dit pas deux fois la même chose — un corps égal au titre ne fait pas de secondaire', () => {
    expect(ligneDeNotification(NOTIF({ titre: 'Pareil', corps: 'Pareil' })).secondaire).toBeNull();
    expect(ligneDeNotification(NOTIF({ sousTitre: 'Équipe Lagos' })).secondaire).toBe('Équipe Lagos');
  });

  it('retient le contexte servi — c’est lui que le prédicat de masse rejouera', () => {
    expect(ligneDeNotification(NOTIF()).contexte).toEqual({ conversationId: 'c1' });
  });
});

describe('l’arrivée d’une notification', () => {
  it('la place EN TÊTE et monte le compteur quand elle est non lue', () => {
    const suivant = arrive(ETAT(), ligneDeNotification(NOTIF({ id: 'n2', titre: 'Nouveau' })));

    expect(suivant.lignes.map((l) => l.id)).toEqual(['n2', 'n1']);
    expect(suivant.nonLues).toBe(2);
  });

  it('ne compte pas une arrivée déjà lue', () => {
    const suivant = arrive(ETAT(), ligneDeNotification(NOTIF({ id: 'n2', lue: true })));

    expect(suivant.nonLues).toBe(1);
  });

  it('ignore un doublon — le même événement reçu deux fois ne fait pas deux lignes', () => {
    const etat = ETAT();
    const suivant = arrive(etat, ligneDeNotification(NOTIF()));

    expect(suivant).toBe(etat);
  });
});

describe('une lecture, ligne à ligne', () => {
  it('marque la ligne lue et descend le compteur', () => {
    const suivant = lit(ETAT(), 'n1');

    expect(suivant.lignes[0]?.lue).toBe(true);
    expect(suivant.nonLues).toBe(0);
  });

  it('ne touche à rien pour une ligne inconnue ou déjà lue', () => {
    const etat = ETAT();
    expect(lit(etat, 'absente')).toBe(etat);

    const dejaLue = ETAT({ lignes: [ligneDeNotification(NOTIF({ lue: true }))], nonLues: 0 });
    expect(lit(dejaLue, 'n1')).toBe(dejaLue);
  });

  it('ne descend jamais sous zéro — un compteur négatif serait un mensonge de plus', () => {
    const suivant = lit(ETAT({ nonLues: 0 }), 'n1');

    expect(suivant.nonLues).toBe(0);
  });
});

describe('une lecture en masse — le prédicat partagé, jamais une réécriture', () => {
  const DEUX = (): EtatDesNotifs => ({
    lignes: [
      ligneDeNotification(NOTIF()),
      ligneDeNotification(NOTIF({ id: 'n2', contexte: { postId: 'p1' } })),
    ],
    nonLues: 2,
  });

  it('« tout » marque chaque ligne, et laisse le compteur à `notification:counts`', () => {
    const suivant = litEnMasse(DEUX(), { kind: 'all' });

    expect(suivant.lignes.every((l) => l.lue)).toBe(true);
    expect(suivant.nonLues).toBe(2);
  });

  it('« contexte » ne marque que les lignes du contexte annoncé', () => {
    const suivant = litEnMasse(DEUX(), { kind: 'context', contextKey: 'conversationId', contextValue: 'c1' });

    expect(suivant.lignes.map((l) => l.lue)).toEqual([true, false]);
  });

  it('un scope inconnu ne marque RIEN — le repli sûr du prédicat partagé', () => {
    const etat = DEUX();
    const suivant = litEnMasse(etat, { kind: 'plus-tard' } as never);

    expect(suivant.lignes.some((l) => l.lue)).toBe(false);
  });
});

describe('le compteur autoritatif', () => {
  it('prend la valeur servie par `notification:counts`', () => {
    expect(compte(ETAT(), 7).nonLues).toBe(7);
  });
});

describe('les charges, validées avant d’être crues', () => {
  it('lit `unread` dans une charge de comptes, et refuse le reste', () => {
    expect(chargeDeComptes({ unread: 3, total: 9 })).toBe(3);
    expect(chargeDeComptes({ total: 9 })).toBeNull();
    expect(chargeDeComptes('trois')).toBeNull();
  });

  it('lit l’identifiant d’un `notification:read`', () => {
    expect(chargeDeLue({ notificationId: 'n1' })).toBe('n1');
    expect(chargeDeLue({})).toBeNull();
  });

  it('lit le scope d’un `notification:read-bulk` sans en inventer', () => {
    expect(chargeDeLueEnMasse({ scope: { kind: 'all' } })).toEqual({ kind: 'all' });
    expect(chargeDeLueEnMasse({ scope: null })).toBeNull();
    expect(chargeDeLueEnMasse({})).toBeNull();
  });
});
