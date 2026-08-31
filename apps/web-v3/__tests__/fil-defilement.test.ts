import {
  MARGE_DE_COLLAGE_PX,
  estColleEnBas,
  libelleDesNonLus,
  nonLusApresAjout,
} from '@/app/(public)/chats/[lien]/defilement';

/**
 * OÙ LE FIL S'OUVRE — la moitié POSITIVE du § 7, gagée sans navigateur.
 *
 * Le défaut corrigé ici ne se voyait dans AUCUN test parce que les fixtures
 * tenaient toutes dans le pli : 1 à 3 bulles, et `toContainText` ne dit rien de
 * la VISIBILITÉ. Un fil réel s'ouvrait donc sur le message le plus ancien, et
 * la bulle optimiste — appendue en bas — n'était jamais vue par celui qui
 * venait de l'écrire. Ces témoins-ci opposent la règle ; le cas D de la recette
 * l'oppose au navigateur, avec assez de bulles pour que le pli existe.
 */

const position = (partiel: {
  readonly scrollTop?: number;
  readonly scrollHeight?: number;
  readonly clientHeight?: number;
}) => ({
  scrollTop: partiel.scrollTop ?? 0,
  scrollHeight: partiel.scrollHeight ?? 2000,
  clientHeight: partiel.clientHeight ?? 600,
});

describe('« le lecteur suit-il le bas ? » — la question qui gouverne tout le reste', () => {
  it('dit oui quand la zone ne défile pas encore : il n’y a rien à remonter', () => {
    expect(estColleEnBas(position({ scrollHeight: 400, clientHeight: 600 }))).toBe(true);
  });

  it('dit oui au bas exact', () => {
    expect(estColleEnBas(position({ scrollTop: 1400 }))).toBe(true);
  });

  /**
   * La marge n'est pas cosmétique : sans elle, un sous-pixel ou l'inertie d'un
   * défilement tactile ferait répondre « non » à quelqu'un qui regarde
   * manifestement le présent, et l'écran cesserait de le suivre.
   */
  it('tolère la marge de collage, et rien de plus', () => {
    expect(estColleEnBas(position({ scrollTop: 1400 - MARGE_DE_COLLAGE_PX }))).toBe(true);
    expect(estColleEnBas(position({ scrollTop: 1400 - MARGE_DE_COLLAGE_PX - 1 }))).toBe(false);
  });

  it('dit non à quelqu’un qui a remonté', () => {
    expect(estColleEnBas(position({ scrollTop: 0 }))).toBe(false);
  });
});

describe('ce qu’on ANNONCE à qui a remonté', () => {
  it('n’annonce RIEN à qui est déjà en bas — le message est sous ses yeux', () => {
    expect(nonLusApresAjout({ nonLus: 0, avant: 3, apres: 5, colle: true })).toBe(0);
    expect(nonLusApresAjout({ nonLus: 4, avant: 3, apres: 5, colle: true })).toBe(0);
  });

  it('CUMULE les arrivées successives, au lieu de ne dire que la dernière', () => {
    const premier = nonLusApresAjout({ nonLus: 0, avant: 3, apres: 4, colle: false });
    const second = nonLusApresAjout({ nonLus: premier, avant: 4, apres: 6, colle: false });

    expect(second).toBe(3);
  });

  /**
   * Le fil RÉTRÉCIT quand une bulle en file est remplacée par sa jumelle
   * servie. Un écart négatif ne doit pas se retrancher de ce qui reste
   * réellement non lu — sinon un envoi ferait disparaître l'annonce d'un
   * message reçu.
   */
  it('ne retranche rien quand le fil rétrécit', () => {
    expect(nonLusApresAjout({ nonLus: 2, avant: 6, apres: 5, colle: false })).toBe(2);
  });

  it('dit un NOMBRE et un mot, jamais un nombre nu', () => {
    expect(libelleDesNonLus(1)).toBe('1 nouveau message');
    expect(libelleDesNonLus(4)).toBe('4 nouveaux messages');
  });
});
