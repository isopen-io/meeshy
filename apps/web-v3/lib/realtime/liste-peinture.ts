import { compteDeParticipants, enUneLigne } from '@/lib/contenu/fil';
import { CHATS } from '@/lib/contenu/liste';
import { quand } from '@/lib/temps';

import { ordonnees, type EtatDeLaListe, type LigneDeListe } from './liste-etat';

/**
 * LA PEINTURE DE `/chats` — l'état de `liste-etat.ts` posé sur le document que
 * le SERVEUR a servi, sans jamais fabriquer une ligne.
 *
 * ELLE NE CRÉE AUCUN NŒUD, et ce n'est pas une élégance : le glyphe de la
 * pastille de langue vient du sprite, que `svgDuSprite` lit sur le DISQUE — un
 * module de navigateur n'en a pas. Le document sert donc chaque fente CACHÉE
 * (`hidden`), et la peinture ne fait que remplir et révéler. Bénéfice de bord :
 * une ligne qui reçoit son premier aperçu ne provoque aucune insertion, donc
 * aucun recalcul de mise en page de la liste entière au moment précis où elle
 * change de rang (dimension 4).
 *
 * ELLE EST IDEMPOTENTE. Chaque écriture est gardée par une comparaison : une
 * repeinture qui n'a rien à changer ne touche pas le DOM, donc ne déclenche ni
 * style ni layout. C'est ce qui rend le défilement fluide pendant qu'une
 * conversation bouge à l'autre bout de la liste.
 *
 * LE RÉORDONNANCEMENT DÉPLACE LES NŒUDS EXISTANTS (`append`), il ne les
 * reconstruit pas : le focus du clavier, un `<details>` ouvert et la position de
 * défilement survivent au re-tri. Reconstruire aurait fermé le menu sous le
 * doigt de qui vient de l'ouvrir.
 */

export type Peintre = {
  readonly main: HTMLElement;
  readonly liste: HTMLElement;
  /**
   * Le prisme du lecteur, ORDONNÉ — servi par le document (`data-langues`). La
   * peinture ne s'en sert pas ; le MODULE le lit ici pour descendre le Prisme à
   * l'arrivée d'une charge (`liste-etat.ts` › `bouge`), à un seul endroit.
   */
  readonly langues: readonly string[];
  /** La langue du DOCUMENT : au-dessous d'elle, un texte servi dans une autre langue porte son `lang`. */
  readonly langueDuDocument: string;
};

const texte = (noeud: Element | null, valeur: string): void => {
  if (noeud !== null && noeud.textContent !== valeur) noeud.textContent = valeur;
};

const revele = (noeud: HTMLElement | null, visible: boolean): void => {
  if (noeud !== null && noeud.hidden === visible) noeud.hidden = !visible;
};

const attribut = (noeud: HTMLElement, nom: string, valeur: string): void => {
  if (noeud.getAttribute(nom) !== valeur) noeud.setAttribute(nom, valeur);
};

export const peintre = (main: HTMLElement, langueDuDocument: string): Peintre | null => {
  const liste = main.querySelector<HTMLElement>('.liste ul');
  if (liste === null) return null;
  const langues = (main.dataset.langues ?? '').split(',').filter((langue) => langue !== '');
  return { main, liste, langues, langueDuDocument };
};

const lignesDuDom = (peintre: Peintre): readonly HTMLElement[] => [...peintre.liste.querySelectorAll<HTMLElement>(':scope > li')];

/**
 * L'ÉTAT DE DÉPART, LU DANS LE DOCUMENT SERVI — jamais dans son texte affiché.
 *
 * Chaque valeur vient d'un `data-`, et c'est la raison d'être de ces attributs :
 * « il y a 30 min » ne se compare pas, « 3 » lu dans une pastille ne dit pas si
 * elle est cachée, et un aperçu déjà traduit ne permet plus de redescendre le
 * prisme. La ligne SERT donc ce que le module doit relire.
 *
 * L'aperçu est repris DÉJÀ RÉSOLU — le texte servi, sa langue (`lang`), et la
 * langue d'origine que la pastille annonce. Le document a fait la descente ; la
 * relire comme une source BRUTE la referait sur une carte de traductions
 * absente, donc rendrait « aucune traduction » et EFFACERAIT la pastille au
 * premier repeint. Mesuré : la pastille `es` de la ligne servie disparaissait
 * dès l'arrivée du module.
 */
export const etatDuDocument = (peintre: Peintre): EtatDeLaListe => ({
  lignes: lignesDuDom(peintre).map((noeud): LigneDeListe => {
    // Le TEXTE fait foi, pas la visibilité de la fente : `.apercu` est caché
    // pendant qu'une frappe occupe sa place, et lire son état caché comme
    // « aucun aperçu » ferait perdre le texte à la relecture suivante.
    const corps = noeud.querySelector<HTMLElement>('.apercu .texte');
    const pastille = noeud.querySelector<HTMLElement>('.apercu .langue');
    const texteServi = corps?.textContent ?? '';
    return {
      id: noeud.dataset.conversation ?? '',
      titre: noeud.dataset.titre ?? '',
      quand: noeud.dataset.quand === undefined || noeud.dataset.quand === '' ? null : noeud.dataset.quand,
      nonLus: Number.parseInt(noeud.dataset.nonlus ?? '0', 10) || 0,
      sourdine: noeud.dataset.sourdine === '1',
      apercu:
        texteServi === ''
          ? null
          : {
              texte: texteServi,
              langue: corps?.getAttribute('lang') ?? null,
              traduitDe: pastille === null || pastille.hidden ? null : (pastille.querySelector('.code')?.textContent ?? null),
            },
      frappeurs: [],
      retiree: false,
    };
  }),
});

/**
 * LA PHRASE DE FRAPPE — « Marta Ruiz écrit… », et le PLURIEL est celui du
 * français : deux noms se joignent, trois et plus se comptent. Elle REMPLACE
 * l'aperçu le temps de la frappe (charte règle 27), elle ne s'ajoute pas
 * dessous : une ligne qui grandirait ferait sauter tout ce qui la suit.
 */
const phraseDeFrappe = (frappeurs: readonly string[]): string =>
  frappeurs.length === 0 ? '' : `${frappeurs.join(', ')} ${CHATS.frappe}`;

const peinsLApercu = (noeud: HTMLElement, ligne: LigneDeListe, peintre: Peintre): void => {
  const bloc = noeud.querySelector<HTMLElement>('.apercu');
  if (bloc === null) return;
  const servi = ligne.apercu;
  revele(bloc, servi !== null);
  if (servi === null) return;

  const corps = bloc.querySelector<HTMLElement>('.texte');
  texte(corps, servi.texte);
  // `lang` sur tout nœud rendu dans une langue ≠ celle du document (§ 5.4) —
  // retiré, jamais posé vide, quand la langue est celle du document ou inconnue.
  if (corps !== null) {
    if (servi.langue !== null && servi.langue.toLowerCase() !== peintre.langueDuDocument.toLowerCase()) {
      attribut(corps, 'lang', servi.langue);
    } else corps.removeAttribute('lang');
  }

  const pastille = bloc.querySelector<HTMLElement>('.langue');
  revele(pastille, servi.traduitDe !== null);
  if (servi.traduitDe !== null) texte(pastille?.querySelector('.code') ?? null, servi.traduitDe);
};

const peinsLaMeta = (noeud: HTMLElement, ligne: LigneDeListe): void => {
  const meta = noeud.querySelector<HTMLElement>('.meta');
  if (meta === null) return;
  const membres = Number.parseInt(meta.dataset.membres ?? '0', 10) || 0;
  const phrase = enUneLigne([
    compteDeParticipants({ membres, mot: CHATS.participants }),
    ligne.sourdine ? CHATS.sourdine : '',
  ]);
  texte(meta, phrase);
  revele(meta, phrase !== '');
};

const peinsUneLigne = (noeud: HTMLElement, ligne: LigneDeListe, peintre: Peintre, maintenant: number): void => {
  attribut(noeud, 'data-nonlus', String(ligne.nonLus));
  attribut(noeud, 'data-sourdine', ligne.sourdine ? '1' : '0');
  attribut(noeud, 'data-quand', ligne.quand ?? '');
  if (noeud.hidden !== ligne.retiree) noeud.hidden = ligne.retiree;

  // La VALEUR seule : écrire dans `.compte` retirerait le libellé hors écran
  // que la pastille porte à côté du nombre (« 3 non lus »).
  texte(noeud.querySelector('.compte .valeur'), String(ligne.nonLus));
  texte(noeud.querySelector('.quand'), quand(ligne.quand, maintenant));

  const frappe = noeud.querySelector<HTMLElement>('.frappe');
  const phrase = phraseDeFrappe(ligne.frappeurs);
  texte(frappe, phrase);
  revele(frappe, phrase !== '');
  // La frappe REMPLACE l'aperçu : elles occupent la même place, jamais deux.
  peinsLApercu(noeud, ligne, peintre);
  const apercu = noeud.querySelector<HTMLElement>('.apercu');
  if (apercu !== null && phrase !== '') apercu.hidden = true;
  peinsLaMeta(noeud, ligne);
};

export const peins = (peintre: Peintre, etat: EtatDeLaListe, maintenant: number): void => {
  const parId = new Map(lignesDuDom(peintre).map((noeud) => [noeud.dataset.conversation ?? '', noeud]));
  const voulu = ordonnees(etat);

  voulu.forEach((ligne) => {
    const noeud = parId.get(ligne.id);
    if (noeud !== undefined) peinsUneLigne(noeud, ligne, peintre, maintenant);
  });

  // Le re-tri en DERNIER, et seulement s'il change quelque chose : `append`
  // déplace un nœud existant (le focus et un `<details>` ouvert survivent),
  // mais il coûte un recalcul de mise en page — inutile quand seul un compte a
  // bougé, ce qui est le cas le plus fréquent.
  const actuel = lignesDuDom(peintre).map((noeud) => noeud.dataset.conversation ?? '');
  const attendu = voulu.map((ligne) => ligne.id);
  if (actuel.join(',') === attendu.join(',')) return;
  voulu.forEach((ligne) => {
    const noeud = parId.get(ligne.id);
    if (noeud !== undefined) peintre.liste.append(noeud);
  });
};

/**
 * LE TROU DE SYNCHRONISATION (§ 7) — `hasGap` de `GET /sync` : la passerelle
 * dit que l'absence a dépassé ce qu'elle sait rejouer. La liste ne peut pas le
 * rattraper toute seule, elle le DIT et offre le rechargement, comme le fil.
 *
 * Posé UNE fois : un second `/sync` qui redit `hasGap` ne doit pas empiler deux
 * bandeaux.
 */
export const montreLeTrou = (peintre: Peintre): void => {
  if (peintre.main.querySelector('.manque') !== null) return;
  const bloc = document.createElement('p');
  bloc.className = 'manque';
  bloc.setAttribute('role', 'status');
  const lien = document.createElement('a');
  lien.href = window.location.pathname;
  lien.textContent = `${CHATS.trou} — ${CHATS.trouAction}`;
  bloc.append(lien);
  peintre.liste.parentElement?.append(bloc);
};
