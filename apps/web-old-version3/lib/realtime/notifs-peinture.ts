import { ATTRIBUT_PAR_CONTEXTE, NOTIFS, type CleDeContexte } from '@/lib/contenu/notifs';
import { quand } from '@/lib/temps';

import type { EtatDesNotifs, LigneDeNotif } from './notifs-etat';

/**
 * LA PEINTURE DE `/notifications` (issue #4898) — l'état de `notifs-etat.ts`
 * posé sur le document que le SERVEUR a servi.
 *
 * ELLE NE FABRIQUE UNE LIGNE QUE DEPUIS LE GABARIT SERVI
 * (`template#gabarit-notif`) : le glyphe d'une vignette est un tracé INLINÉ
 * par `svgDuSprite`, qu'un module de navigateur ne sait pas composer. Une
 * ligne neuve prend donc le glyphe d'une ligne EXISTANTE du même genre quand
 * il y en a une — zéro octet de plus dans le document — et sinon celui du
 * gabarit, la cloche : « une notification », sans mentir sur laquelle. Le
 * TEXTE porte le sens ; la vignette est `aria-hidden`.
 *
 * ELLE EST IDEMPOTENTE, comme `liste-peinture.ts` : chaque écriture est gardée
 * par une comparaison, et une repeinture qui n'a rien à changer ne touche pas
 * le DOM.
 */

export type PeintreDesNotifs = {
  readonly main: HTMLElement;
  readonly liste: HTMLElement;
  readonly gabarit: HTMLTemplateElement | null;
  readonly sous: HTMLElement | null;
  readonly formulaire: HTMLFormElement | null;
  readonly vide: HTMLElement | null;
  readonly avis: HTMLElement | null;
};

export const peintre = (main: HTMLElement): PeintreDesNotifs | null => {
  const liste = main.querySelector<HTMLElement>('ul.notifs');
  if (liste === null) return null;
  return {
    main,
    liste,
    gabarit: main.querySelector<HTMLTemplateElement>('template#gabarit-notif'),
    sous: main.querySelector<HTMLElement>('.fil-tete .sous'),
    formulaire: main.querySelector<HTMLFormElement>('form.tout-lire'),
    vide: main.querySelector<HTMLElement>('.vide-des-notifs'),
    avis: main.querySelector<HTMLElement>('.avis'),
  };
};

const texte = (noeud: Element | null, valeur: string): void => {
  if (noeud !== null && noeud.textContent !== valeur) noeud.textContent = valeur;
};

const revele = (noeud: HTMLElement | null, visible: boolean): void => {
  if (noeud !== null && noeud.hidden === visible) noeud.hidden = !visible;
};

const lignesDuDom = (p: PeintreDesNotifs): readonly HTMLElement[] => [
  ...p.liste.querySelectorAll<HTMLElement>(':scope > li'),
];

const CLES_DE_CONTEXTE = Object.keys(ATTRIBUT_PAR_CONTEXTE) as readonly CleDeContexte[];

const contexteDuNoeud = (noeud: HTMLElement): Readonly<Partial<Record<CleDeContexte, string>>> =>
  CLES_DE_CONTEXTE.reduce<Partial<Record<CleDeContexte, string>>>((retenu, cle) => {
    const valeur = noeud.getAttribute(ATTRIBUT_PAR_CONTEXTE[cle]);
    return valeur === null || valeur === '' ? retenu : { ...retenu, [cle]: valeur };
  }, {});

/**
 * L'ÉTAT DE DÉPART, LU DANS LE DOCUMENT SERVI — les `data-` et la classe,
 * jamais le texte affiché (« il y a 30 min » ne se relit pas).
 */
export const etatDuDocument = (p: PeintreDesNotifs): EtatDesNotifs => ({
  lignes: lignesDuDom(p).map(
    (noeud): LigneDeNotif => ({
      id: noeud.dataset.id ?? '',
      genre: noeud.dataset.genre ?? 'system',
      primaire: noeud.querySelector('.primaire')?.textContent ?? '',
      secondaire: noeud.querySelector('.secondaire')?.textContent ?? null,
      lue: !noeud.classList.contains('non-lue'),
      creeeA: noeud.dataset.creee === undefined || noeud.dataset.creee === '' ? null : noeud.dataset.creee,
      contexte: contexteDuNoeud(noeud),
    }),
  ),
  nonLues: Number.parseInt(p.main.dataset.nonlues ?? '0', 10) || 0,
});

/**
 * Le glyphe d'une ligne EXISTANTE du même genre — sinon celui du gabarit, la
 * cloche. Le genre entre dans un sélecteur : seul un nom de forme sûre y est
 * admis (les genres de la passerelle sont des identifiants `[a-z_]`), et un
 * genre exotique retombe sur la cloche plutôt que d'échapper quoi que ce soit.
 */
const GENRE_SUR = /^[\w-]+$/;

const vignetteDuGenre = (p: PeintreDesNotifs, genre: string): SVGElement | null =>
  GENRE_SUR.test(genre) ? p.liste.querySelector<SVGElement>(`li[data-genre="${genre}"] .vignette svg`) : null;

const nait = (p: PeintreDesNotifs, ligne: LigneDeNotif, maintenant: number): HTMLElement | null => {
  const modele = p.gabarit?.content.querySelector('li');
  if (modele === null || modele === undefined) return null;
  const noeud = modele.cloneNode(true) as HTMLElement;

  noeud.dataset.id = ligne.id;
  noeud.dataset.genre = ligne.genre;
  if (ligne.creeeA !== null) noeud.dataset.creee = ligne.creeeA;
  CLES_DE_CONTEXTE.forEach((cle) => {
    const valeur = ligne.contexte[cle];
    if (valeur !== undefined) noeud.setAttribute(ATTRIBUT_PAR_CONTEXTE[cle], valeur);
  });

  texte(noeud.querySelector('.primaire'), ligne.primaire);
  const secondaire = noeud.querySelector<HTMLElement>('.secondaire');
  if (ligne.secondaire === null) secondaire?.remove();
  else if (secondaire !== null) {
    texte(secondaire, ligne.secondaire);
    secondaire.hidden = false;
  }
  const instant = noeud.querySelector<HTMLElement>('.instant');
  const dit = ligne.creeeA === null ? '' : quand(ligne.creeeA, maintenant);
  if (dit === '') instant?.remove();
  else if (instant !== null) {
    texte(instant, dit);
    instant.hidden = false;
  }

  const deja = vignetteDuGenre(p, ligne.genre);
  const vignette = noeud.querySelector<HTMLElement>('.vignette');
  if (deja !== null && vignette !== null) vignette.replaceChildren(deja.cloneNode(true));

  return noeud;
};

const peinsLaLecture = (noeud: HTMLElement, ligne: LigneDeNotif): void => {
  if (noeud.classList.contains('non-lue') === ligne.lue) noeud.classList.toggle('non-lue', !ligne.lue);
  revele(noeud.querySelector<HTMLElement>('.pastille'), !ligne.lue);
  revele(noeud.querySelector<HTMLElement>('.hors-ecran'), !ligne.lue);
};

/**
 * L'ÉTAT POSÉ SUR LE DOCUMENT. L'ordre des nœuds suit l'ordre de l'état — un
 * `append` DÉPLACE un nœud existant sans le reconstruire, donc sans perdre ni
 * focus ni sélection — mais il n'est joué que si l'ordre a réellement changé :
 * réinsérer des nœuds à l'identique ferait quand même recalculer la liste.
 */
export const peins = (p: PeintreDesNotifs, etat: EtatDesNotifs, maintenant: number): void => {
  const presents = new Map(lignesDuDom(p).map((noeud) => [noeud.dataset.id ?? '', noeud]));

  const noeuds = etat.lignes
    .map((ligne): readonly [LigneDeNotif, HTMLElement] | null => {
      const noeud = presents.get(ligne.id) ?? nait(p, ligne, maintenant);
      return noeud === null ? null : [ligne, noeud];
    })
    .filter((paire): paire is readonly [LigneDeNotif, HTMLElement] => paire !== null);

  noeuds.forEach(([ligne, noeud]) => {
    peinsLaLecture(noeud, ligne);
    if (ligne.creeeA !== null) texte(noeud.querySelector('.instant'), quand(ligne.creeeA, maintenant));
  });

  const ordreVoulu = noeuds.map(([, noeud]) => noeud);
  const ordreActuel = lignesDuDom(p);
  const identique =
    ordreActuel.length === ordreVoulu.length && ordreActuel.every((noeud, rang) => noeud === ordreVoulu[rang]);
  if (!identique) ordreVoulu.forEach((noeud) => p.liste.append(noeud));

  if (etat.nonLues > 0) texte(p.sous, NOTIFS.nonLues(etat.nonLues));
  revele(p.sous, etat.nonLues > 0);
  revele(p.formulaire, etat.nonLues > 0);
  revele(p.vide, etat.lignes.length === 0);
  revele(p.liste, etat.lignes.length > 0);
};
