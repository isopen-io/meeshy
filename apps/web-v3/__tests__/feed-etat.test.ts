import {
  aposteRepost,
  basculeAime,
  doitRafraichirLeFil,
  TOLERANCE_DE_TETE_PX,
} from '@/lib/realtime/feed-etat';
import { SEUIL_DE_RATTRAPAGE_MS } from '@/lib/realtime/reconnect-policy';

describe('basculeAime', () => {
  it('aime quand ce n’était pas le cas', () => {
    expect(basculeAime({ actif: false, compte: 128 })).toEqual({ actif: true, compte: 129 });
  });

  it('retire quand c’était le cas', () => {
    expect(basculeAime({ actif: true, compte: 129 })).toEqual({ actif: false, compte: 128 });
  });

  it('ne descend jamais sous zéro', () => {
    expect(basculeAime({ actif: true, compte: 0 })).toEqual({ actif: false, compte: 0 });
  });
});

describe('aposteRepost', () => {
  it('incrémente le compte, à sens unique', () => {
    expect(aposteRepost({ compte: 4 })).toEqual({ compte: 5 });
  });
});

describe('doitRafraichirLeFil — la fraîcheur du fil, sans socket', () => {
  const MAINTENANT = 1_000_000;

  /**
   * DEUX CONDITIONS, ET CHACUNE A SON TÉMOIN NÉGATIF : une règle à deux
   * conjonctions dont un seul côté est prouvé est une règle à moitié gardée.
   */
  it('rafraîchit après une absence longue, en tête de fil', () => {
    expect(
      doitRafraichirLeFil({
        absentDepuis: MAINTENANT - SEUIL_DE_RATTRAPAGE_MS,
        maintenant: MAINTENANT,
        defilement: 0,
      }),
    ).toBe(true);
  });

  it('ne rafraîchit pas pour un aller-retour de trois secondes', () => {
    expect(
      doitRafraichirLeFil({ absentDepuis: MAINTENANT - 3_000, maintenant: MAINTENANT, defilement: 0 }),
    ).toBe(false);
  });

  /**
   * LE TÉMOIN LE PLUS IMPORTANT. Remplacer la liste sous quelqu'un qui a défilé
   * lui ARRACHE ce qu'il lit — le fil saute, la place est perdue, et cela
   * ressemble à un bogue. Une personne qui a défilé a CHOISI un endroit.
   */
  it('ne rafraîchit JAMAIS sous un lecteur qui a défilé, si longue que soit l’absence', () => {
    expect(
      doitRafraichirLeFil({
        absentDepuis: MAINTENANT - 60 * 60_000,
        maintenant: MAINTENANT,
        defilement: 900,
      }),
    ).toBe(false);
  });

  it('tolère l’élastique et les arrondis sous-pixel, et rien de plus', () => {
    const apres = (defilement: number): boolean =>
      doitRafraichirLeFil({ absentDepuis: MAINTENANT - 60_000, maintenant: MAINTENANT, defilement });

    expect(apres(TOLERANCE_DE_TETE_PX)).toBe(true);
    expect(apres(TOLERANCE_DE_TETE_PX + 1)).toBe(false);
  });

  it('ne rafraîchit rien sans absence — une lecture ininterrompue n’a rien à rattraper', () => {
    expect(doitRafraichirLeFil({ absentDepuis: null, maintenant: MAINTENANT, defilement: 0 })).toBe(false);
  });

  /**
   * LE SEUIL EST CELUI DES DEUX SURFACES À SOCKET, pas un second nombre : une
   * règle de rattrapage écrite deux fois diverge à la première hésitation.
   */
  it('emprunte son seuil au rattrapage partagé, jamais un sien', () => {
    const juste = doitRafraichirLeFil({
      absentDepuis: MAINTENANT - SEUIL_DE_RATTRAPAGE_MS,
      maintenant: MAINTENANT,
      defilement: 0,
    });
    const unPoilMoins = doitRafraichirLeFil({
      absentDepuis: MAINTENANT - SEUIL_DE_RATTRAPAGE_MS + 1,
      maintenant: MAINTENANT,
      defilement: 0,
    });

    expect([juste, unPoilMoins]).toEqual([true, false]);
  });
});
