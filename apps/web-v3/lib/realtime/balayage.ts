import type { GesteDeLigne } from '@/lib/contenu/liste';

/**
 * LE BALAYAGE D'UNE LIGNE (§ 12.10.4) — un sens archive, l'autre supprime.
 *
 * CE QU'IL N'EST PAS. Ce n'est pas un chemin d'action : c'est un RACCOURCI vers
 * un geste qui existe déjà, avec son contrôle, son libellé et son formulaire
 * (le menu de la ligne). Le module qui l'installe ne fait que déclencher le
 * MÊME geste ; il n'existe donc aucun chemin réservé au doigt, et la dimension 5
 * est tenue par construction plutôt que par une intention dupliquée.
 *
 * POINTER EVENTS, PAS TOUCH EVENTS. Un seul jeu d'écouteurs couvre le doigt, le
 * stylet et la souris, et `setPointerCapture` garantit qu'un doigt qui sort de
 * la ligne rend quand même son `pointerup` — sans quoi une ligne restait
 * décalée pour toujours après un geste qui déborde.
 *
 * `touch-action: pan-y` (feuille de la liste) rend le défilement VERTICAL au
 * navigateur : le fil de la page reste fluide sous le pouce, et seul
 * l'horizontal nous revient. Sans lui, le navigateur attendrait notre verdict
 * avant de faire défiler, ce qui se voit à l'image près.
 *
 * LE VERROU DE DIRECTION est ce qui rend les deux gestes compatibles : tant que
 * le déplacement vertical domine, la ligne ne bouge PAS et le geste est
 * abandonné. Un balayage horizontal mal assuré ne doit pas voler un défilement.
 *
 * AUCUNE TRANSITION N'EST DÉCLARÉE (charte règle 24) : le décalage SUIT le
 * doigt, et le retour est instantané. Ce qui bouge sous la main n'est pas du
 * mouvement décoratif — et animer le retour aurait demandé une transition
 * géométrique, que la charte interdit.
 */

/** Le déplacement horizontal au-delà duquel la ligne suit le doigt — sous lui, on ne sait pas encore. */
const VERROU_PX = 12;

/** Ce qu'il faut parcourir pour DÉCLENCHER — deux fois le verrou : un geste franc, jamais un frôlement. */
const DECLENCHEMENT_PX = 72;

/** Au-delà, la ligne ne suit plus : le geste est acquis, le montrer glisser davantage n'apprend rien. */
const COURSE_MAX_PX = 96;

export type Balayage = {
  /** Le geste que le sens désigne — `archiver` vers la droite, `supprimer` vers la gauche. */
  readonly geste: GesteDeLigne;
  readonly ligne: HTMLElement;
};

/**
 * LE SENS DIT LE GESTE, et le choix n'est pas arbitraire : vers la DROITE (le
 * sens de la lecture) le geste RANGE — il archive —, vers la GAUCHE il RETIRE.
 * C'est la convention des trois applications de messagerie que les lecteurs de
 * Meeshy ont déjà dans la main.
 */
export const gesteDuSens = (deplacement: number): GesteDeLigne => (deplacement > 0 ? 'archiver' : 'supprimer');

type Poursuite = {
  readonly pointeur: number;
  readonly departX: number;
  readonly departY: number;
  readonly ligne: HTMLElement;
  readonly glissiere: HTMLElement;
  verrouille: boolean;
  abandonne: boolean;
};

const borne = (deplacement: number): number =>
  Math.sign(deplacement) * Math.min(Math.abs(deplacement), COURSE_MAX_PX);

export type OptionsDuBalayage = {
  /** Le conteneur des lignes — les écouteurs y vivent UNE fois, jamais un par ligne. */
  readonly liste: HTMLElement;
  /** Ce qu'un balayage abouti demande. Le module en fait ce qu'il fait d'une pression sur le menu. */
  readonly sur: (balayage: Balayage) => void;
};

/**
 * Les écouteurs sont posés sur la LISTE, pas sur chaque ligne : une liste de
 * trente conversations n'installe pas quatre-vingt-dix écouteurs, et une ligne
 * qui arrive en direct est balayable sans qu'on ait à l'équiper.
 */
export const prendsLeBalayage = ({ liste, sur }: OptionsDuBalayage): (() => void) => {
  let poursuite: Poursuite | null = null;

  const pose = (glissiere: HTMLElement, deplacement: number): void => {
    glissiere.style.transform = deplacement === 0 ? '' : `translateX(${borne(deplacement)}px)`;
  };

  const relache = (): void => {
    if (poursuite !== null) pose(poursuite.glissiere, 0);
    poursuite = null;
  };

  const surDebut = (evenement: PointerEvent): void => {
    if (poursuite !== null || evenement.isPrimary === false) return;
    const cible = evenement.target as HTMLElement | null;
    if (cible === null) return;
    // Un geste qui commence SUR un contrôle appartient au contrôle : ouvrir le
    // menu ou presser un bouton ne doit pas armer un balayage.
    if (cible.closest('summary, button, input') !== null) return;
    const ligne = cible.closest<HTMLElement>('li[data-conversation]');
    const glissiere = ligne?.querySelector<HTMLElement>(':scope > .glissiere') ?? null;
    if (ligne === null || glissiere === null) return;
    poursuite = {
      pointeur: evenement.pointerId,
      departX: evenement.clientX,
      departY: evenement.clientY,
      ligne,
      glissiere,
      verrouille: false,
      abandonne: false,
    };
  };

  const surMouvement = (evenement: PointerEvent): void => {
    if (poursuite === null || evenement.pointerId !== poursuite.pointeur || poursuite.abandonne) return;
    const dx = evenement.clientX - poursuite.departX;
    const dy = evenement.clientY - poursuite.departY;

    if (!poursuite.verrouille) {
      if (Math.abs(dx) < VERROU_PX && Math.abs(dy) < VERROU_PX) return;
      // Le vertical l'emporte : c'est un défilement, et il ne nous appartient pas.
      if (Math.abs(dy) >= Math.abs(dx)) {
        poursuite.abandonne = true;
        return;
      }
      poursuite.verrouille = true;
      // La capture garantit le `pointerup` même si le doigt quitte la ligne :
      // sans elle, une ligne pouvait rester décalée pour toujours.
      poursuite.glissiere.setPointerCapture?.(evenement.pointerId);
    }
    evenement.preventDefault();
    pose(poursuite.glissiere, dx);
  };

  const surFin = (evenement: PointerEvent): void => {
    if (poursuite === null || evenement.pointerId !== poursuite.pointeur) return;
    const dx = evenement.clientX - poursuite.departX;
    const { ligne, verrouille, abandonne } = poursuite;
    relache();
    if (!verrouille || abandonne || Math.abs(dx) < DECLENCHEMENT_PX) return;
    sur({ geste: gesteDuSens(dx), ligne });
  };

  liste.addEventListener('pointerdown', surDebut);
  liste.addEventListener('pointermove', surMouvement, { passive: false });
  liste.addEventListener('pointerup', surFin);
  liste.addEventListener('pointercancel', relache);

  return () => {
    liste.removeEventListener('pointerdown', surDebut);
    liste.removeEventListener('pointermove', surMouvement);
    liste.removeEventListener('pointerup', surFin);
    liste.removeEventListener('pointercancel', relache);
    relache();
  };
};
