/**
 * @jest-environment node
 */

import { annule, bascule, reconcilie, type EtatDePrefs } from '@/lib/realtime/prefs-etat';

/**
 * `lib/realtime/prefs-etat.ts` — L'ÉTAT PUR DE LA BASCULE OPTIMISTE
 * (spécification § 3, § 4 étape 6). Sans DOM, sans réseau : la peinture
 * (`lib/realtime/prefs.ts`) lit l'état AVANT dans le document servi, calcule
 * l'état APRÈS avec ces trois fonctions, peint, envoie, et réconcilie ou
 * défait selon la réponse.
 */

const ETAT: EtatDePrefs = {
  reglages: {
    pushEnabled: true,
    emailEnabled: true,
    soundEnabled: true,
    reactionEnabled: false,
  },
};

describe('bascule — l’état optimiste', () => {
  it('inverse la clé demandée, et rend la mutation à envoyer', () => {
    const { etat, mutation } = bascule(ETAT, 'pushEnabled');

    expect(etat.reglages.pushEnabled).toBe(false);
    expect(mutation).toEqual({ cle: 'pushEnabled', valeur: false });
  });

  it('inverse depuis faux vers vrai', () => {
    const { etat, mutation } = bascule(ETAT, 'reactionEnabled');

    expect(etat.reglages.reactionEnabled).toBe(true);
    expect(mutation).toEqual({ cle: 'reactionEnabled', valeur: true });
  });

  it('ne touche à AUCUNE autre clé', () => {
    const { etat } = bascule(ETAT, 'pushEnabled');

    expect(etat.reglages.emailEnabled).toBe(true);
    expect(etat.reglages.soundEnabled).toBe(true);
  });
});

describe('reconcilie — le serveur gagne', () => {
  it('aligne l’état sur le document servi, même s’il diffère de l’optimiste', () => {
    const optimiste = bascule(ETAT, 'pushEnabled').etat;

    // La passerelle a répondu avec pushEnabled TOUJOURS vrai (refus silencieux
    // d'un rang de consentement, par exemple) : le client obéit au serveur.
    const reconcilié = reconcilie(optimiste, { pushEnabled: true, emailEnabled: true, soundEnabled: true, reactionEnabled: false });

    expect(reconcilié.reglages.pushEnabled).toBe(true);
  });

  it('accepte un document qui porte des clés en plus de la table locale', () => {
    const reconcilié = reconcilie(ETAT, {
      pushEnabled: false,
      emailEnabled: true,
      soundEnabled: true,
      reactionEnabled: false,
      callsEnabled: true,
    });

    expect(reconcilié.reglages.pushEnabled).toBe(false);
  });
});

describe('annule — le rollback, VISIBLE', () => {
  it('restaure la valeur d’avant et signale l’échec à peindre', () => {
    const { etat: apres } = bascule(ETAT, 'pushEnabled');

    const { etat, echec } = annule(apres, 'pushEnabled', true);

    expect(etat.reglages.pushEnabled).toBe(true);
    expect(echec).toBe(true);
  });

  it('ne touche à aucune autre clé en annulant', () => {
    const { etat: apres } = bascule(ETAT, 'reactionEnabled');

    const { etat } = annule(apres, 'reactionEnabled', false);

    expect(etat.reglages.pushEnabled).toBe(true);
    expect(etat.reglages.reactionEnabled).toBe(false);
  });
});
