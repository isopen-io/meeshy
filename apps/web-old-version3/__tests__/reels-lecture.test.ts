import {
  doitAutoJouer,
  estLaTeteDeLaFile,
  ETAT_INITIAL_DE_LA_MOLETTE,
  peutReculer,
  verdictDeLaMolette,
  verdictDuClavier,
  verdictDuToucher,
} from '@/lib/realtime/reels-decision';

/**
 * LA DÉCISION DU MODULE DE LECTURE (#5388) — pure, hors DOM.
 *
 * `lib/realtime/reels.ts` ne fait que BRANCHER ces fonctions sur `wheel`,
 * `touchstart`/`touchend` et `keydown` : ce qui peut rougir ici ne se
 * découvre pas en e2e (même patron que `navigateur-decision.ts`).
 */

describe('le geste vertical décide, le DOM n’est pas consulté', () => {
  describe('la molette : un cumul, un seuil, un refroidissement', () => {
    it('un cumul sous le seuil ne rend aucun verdict', () => {
      const { verdict, etat } = verdictDeLaMolette(ETAT_INITIAL_DE_LA_MOLETTE, 40, 1000);
      expect(verdict).toBeNull();
      expect(etat.cumul).toBe(40);
    });

    it('un cumul qui atteint le seuil positif rend « suivant »', () => {
      const { verdict } = verdictDeLaMolette({ cumul: 100, refroidiJusqua: 0 }, 30, 1000);
      expect(verdict).toBe('suivant');
    });

    it('un cumul qui atteint le seuil négatif rend « precedent »', () => {
      const { verdict } = verdictDeLaMolette({ cumul: -100, refroidiJusqua: 0 }, -30, 1000);
      expect(verdict).toBe('precedent');
    });

    it('un second verdict pendant le refroidissement ne rend rien — pas de double pas sur l’inertie', () => {
      const premier = verdictDeLaMolette(ETAT_INITIAL_DE_LA_MOLETTE, 130, 1000);
      expect(premier.verdict).toBe('suivant');

      const second = verdictDeLaMolette(premier.etat, 130, 1050);
      expect(second.verdict).toBeNull();
    });

    it('le refroidissement expiré laisse repartir un cumul neuf', () => {
      const premier = verdictDeLaMolette(ETAT_INITIAL_DE_LA_MOLETTE, 130, 1000);
      const apresRefroidissement = verdictDeLaMolette(premier.etat, 130, premier.etat.refroidiJusqua + 1);
      expect(apresRefroidissement.verdict).toBe('suivant');
    });
  });

  describe('le toucher : ΔY dominant et au-delà du seuil', () => {
    it('un balayage vers le haut (ΔY négatif dominant) rend « suivant »', () => {
      expect(verdictDuToucher(5, -100)).toBe('suivant');
    });

    it('un balayage vers le bas (ΔY positif dominant) rend « precedent »', () => {
      expect(verdictDuToucher(-5, 100)).toBe('precedent');
    });

    it('un balayage horizontal ne rend rien, même de grande amplitude', () => {
      expect(verdictDuToucher(150, 10)).toBeNull();
    });

    it('un balayage vertical sous le seuil ne rend rien', () => {
      expect(verdictDuToucher(0, -40)).toBeNull();
    });
  });

  describe('le clavier : flèches et pages, jamais dans un champ de saisie', () => {
    it.each([
      ['ArrowDown', 'suivant'],
      ['PageDown', 'suivant'],
      ['ArrowUp', 'precedent'],
      ['PageUp', 'precedent'],
      ['Enter', null],
      [' ', null],
    ] as const)('%s → %s', (touche, attendu) => {
      expect(verdictDuClavier(touche, false)).toBe(attendu);
    });

    it('une cible de saisie refuse tout verdict, même une flèche', () => {
      expect(verdictDuClavier('ArrowDown', true)).toBeNull();
      expect(verdictDuClavier('ArrowUp', true)).toBeNull();
    });
  });
});

describe('l’autolecture se refuse quatre fois, et ne s’accorde qu’au bout', () => {
  const TOUT_VA_BIEN = { reduiteMotion: false, saveData: false, videoPresente: true, ongletVisible: true };

  it('joue quand aucune des quatre raisons de refuser n’est là', () => {
    expect(doitAutoJouer(TOUT_VA_BIEN)).toBe(true);
  });

  it('refuse sous prefers-reduced-motion', () => {
    expect(doitAutoJouer({ ...TOUT_VA_BIEN, reduiteMotion: true })).toBe(false);
  });

  it('refuse sous saveData — la 3G rurale d’abord', () => {
    expect(doitAutoJouer({ ...TOUT_VA_BIEN, saveData: true })).toBe(false);
  });

  it('refuse sans vidéo présente', () => {
    expect(doitAutoJouer({ ...TOUT_VA_BIEN, videoPresente: false })).toBe(false);
  });

  /**
   * L'ONGLET D'ARRIÈRE-PLAN — `play()` sur une vidéo `preload="none"` DÉCLENCHE
   * le téléchargement du média : autoriser l'autolecture là violerait le gate
   * « onglet caché ⇒ ZÉRO requête » (§ 8.5) au prix d'une 3G rurale.
   */
  it('refuse quand l’onglet n’est pas à l’écran', () => {
    expect(doitAutoJouer({ ...TOUT_VA_BIEN, ongletVisible: false })).toBe(false);
  });
});

describe('precedent n’existe que si le module a avancé', () => {
  it('aucune avance : le retour arrière est refusé', () => {
    expect(peutReculer(0)).toBe(false);
  });

  it('au moins une avance : le retour arrière est accordé', () => {
    expect(peutReculer(1)).toBe(true);
    expect(peutReculer(4)).toBe(true);
  });

  /**
   * LA TÊTE DE LA FILE remet la pile à zéro : c'est ce qui empêche un compte
   * PÉRIMÉ (le module survit à la traversée) de faire sortir de la file un
   * lecteur qui vient tout juste de l'ouvrir.
   */
  it.each([
    ['', true],
    ['?', true],
    ['?lang=es', true],
    ['?cursor=c2', false],
    ['?lang=es&cursor=c2', false],
  ] as const)('« %s » est la tête de la file : %s', (recherche, attendu) => {
    expect(estLaTeteDeLaFile(recherche)).toBe(attendu);
  });
});
