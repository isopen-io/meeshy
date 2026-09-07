/**
 * LE DÉFILEMENT DU FIL — ancré en bas, et jamais un saut.
 *
 * La zone des messages est un conteneur à défilement PROPRE en
 * `column-reverse` (feuille du fil) : son origine est le BAS, donc
 * `scrollTop` vaut 0 quand le lecteur est en bas et s'en ÉLOIGNE quand il
 * remonte — en négatif chez Chromium et Firefox, et ce module ne présume pas
 * du signe : il mesure des DISTANCES. Le document arrive donc déjà en bas,
 * sans script, et le module n'a rien à faire sauter.
 *
 * Un message reçu quand on est EN BAS fait glisser la liste ; reçu quand on
 * lit PLUS HAUT, il allume une pastille « N nouveaux messages » qui ramène en
 * bas d'un tap — et ce qu'on lisait ne bouge pas : un ajout au BAS d'un
 * conteneur ancré en bas repousserait tout vers le haut, `conserveLeHaut` le
 * compense. Charger une page plus ancienne par le HAUT ne coûte rien : la
 * distance au bas est ce que le conteneur garde de lui-même.
 */

const MARGE_DU_BAS = 120;
const MARGE_DU_HAUT = 240;

export type Defilement = {
  readonly estEnBas: () => boolean;
  readonly versLeBas: (doux?: boolean) => void;
  readonly signaleNouveaux: (nombre: number) => void;
  readonly surApproche: (rappel: () => void) => () => void;
  /** Ajouter en BAS sans déplacer ce que le lecteur lit plus haut. */
  readonly conserveLeHaut: (action: () => void) => void;
};

export const defilement = ({
  main,
  libelle,
}: {
  readonly main: HTMLElement;
  readonly libelle: (n: number) => string;
}): Defilement => {
  const zone = main.querySelector<HTMLElement>('.messages') ?? main;
  const pastille = main.querySelector<HTMLAnchorElement>('#nouveaux');
  let nouveaux = 0;

  const distanceDuBas = (): number => Math.abs(zone.scrollTop);
  const distanceDuHaut = (): number => Math.max(0, zone.scrollHeight - zone.clientHeight - distanceDuBas());
  const estEnBas = (): boolean => distanceDuBas() <= MARGE_DU_BAS;

  const versLeBas = (doux = true): void => {
    nouveaux = 0;
    if (pastille !== null) pastille.hidden = true;
    zone.scrollTo({ top: 0, behavior: doux ? 'smooth' : 'auto' });
  };

  const signaleNouveaux = (nombre: number): void => {
    nouveaux += nombre;
    if (pastille === null || nouveaux === 0) return;
    pastille.textContent = libelle(nouveaux);
    pastille.hidden = false;
  };

  pastille?.addEventListener('click', (evenement) => {
    evenement.preventDefault();
    versLeBas();
  });

  zone.addEventListener(
    'scroll',
    () => {
      if (nouveaux > 0 && estEnBas()) {
        nouveaux = 0;
        if (pastille !== null) pastille.hidden = true;
      }
    },
    { passive: true },
  );

  return {
    estEnBas,
    versLeBas,
    signaleNouveaux,
    surApproche: (rappel) => {
      let arme = true;
      const surDefilement = (): void => {
        if (!arme || distanceDuHaut() > MARGE_DU_HAUT) return;
        arme = false;
        rappel();
        setTimeout(() => {
          arme = true;
        }, 1_000);
      };
      zone.addEventListener('scroll', surDefilement, { passive: true });
      return () => zone.removeEventListener('scroll', surDefilement);
    },
    conserveLeHaut: (action) => {
      const haut = distanceDuHaut();
      const signe = zone.scrollTop < 0 ? -1 : 1;
      action();
      const voulue = Math.max(0, zone.scrollHeight - zone.clientHeight - haut);
      if (Math.abs(distanceDuBas() - voulue) > 1) zone.scrollTop = signe * voulue;
    },
  };
};
