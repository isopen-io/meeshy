/**
 * OÙ LE FIL S'OUVRE, ET OÙ IL RESTE — la moitié POSITIVE du § 7.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE MODULE CORRIGE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La liste des bulles est une zone qui défile (`overflow-y: auto`), donc elle
 * s'ouvre à `scrollTop = 0` — c'est-à-dire sur le message le PLUS ANCIEN. La
 * passerelle sert les 50 messages les plus RÉCENTS (`orderBy: desc` puis
 * `?limit=50`), le modèle les retrie en ascendant, et le lecteur atterrissait
 * donc sur une conversation d'il y a des jours, avec le présent hors du pli.
 *
 * La même absence tuait la mise à jour optimiste que le § 7 revendique : la
 * bulle qu'on vient d'écrire est APPENDUE en bas, donc invisible. Écrire et
 * appuyer sur « Envoyer » ne produisait AUCUN retour visible — le contraire
 * exact de ce qu'un feedback instantané veut dire.
 *
 * Le § 7 était cité, et à moitié : « les messages manqués s'insèrent SANS FAIRE
 * SAUTER le scroll ». La clause NÉGATIVE (ne pas sauter) était tenue par la
 * seule absence de code ; la clause POSITIVE (être au bon endroit) n'existait
 * pas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS `flex-direction: column-reverse`, LA SOLUTION SANS JS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'ancrage natif du navigateur en bas s'obtient en inversant l'axe, ce qui
 * suppose d'inverser aussi l'ORDRE DU DOM pour retrouver la chronologie à
 * l'écran. Or l'ordre du DOM est l'ordre de LECTURE d'un lecteur d'écran et
 * l'ordre de TABULATION : une conversation qui se lit du plus récent au plus
 * ancien pour qui n'y voit pas est une régression d'accès (dimension 5) payée
 * pour un gain de rendu. Le pli se règle donc en JavaScript, dans l'îlot qui
 * est déjà client, et le DOM reste chronologique.
 *
 * ÉCART DÉCLARÉ : sans JavaScript, le fil s'ouvre en haut. C'est le prix de
 * l'ordre de lecture, et il est assumé — le contenu, lui, est ENTIER dans le
 * HTML, ce qui est ce que le rôle premier exige.
 *
 * Ce module est PUR : aucune référence au DOM, aucun effet. Il répond à deux
 * questions — « le lecteur est-il collé au bas ? » et « que doit-on lui dire
 * quand il ne l'est pas ? » — et c'est ce qui les rend gageables sans
 * navigateur.
 */

/**
 * La marge sous laquelle on considère que le lecteur EST en bas.
 *
 * Elle n'est pas cosmétique. À zéro, un demi-pixel de sous-pixel, une image en
 * cours de chargement ou l'inertie d'un défilement tactile suffisent à faire
 * répondre « non » à quelqu'un qui regarde manifestement le bas du fil — et
 * l'écran cesse alors de suivre la conversation sous ses yeux. Une ligne de
 * bulle fait de l'ordre de 60 px : 48 px reste sous la bulle, donc on ne
 * « colle » jamais quelqu'un qui a remonté d'un message entier.
 */
export const MARGE_DE_COLLAGE_PX = 48;

export type PositionDeDefilement = {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
};

/**
 * Le lecteur suit-il le bas du fil ?
 *
 * C'est la question qui gouverne TOUT le reste : on ne défile jamais sous
 * quelqu'un qui a remonté — « les messages manqués s'insèrent sans faire sauter
 * le scroll » —, on ne défile QUE sous quelqu'un qui regarde le présent.
 *
 * Une zone qui ne défile pas encore (contenu plus court que le pli) répond
 * `true` : il n'y a rien à remonter, donc personne n'a rien remonté.
 */
export const estColleEnBas = (position: PositionDeDefilement): boolean =>
  position.scrollHeight - position.scrollTop - position.clientHeight <= MARGE_DE_COLLAGE_PX;

/**
 * Combien de bulles NON LUES annoncer, après un ajout.
 *
 * Trois règles, et chacune évite un mensonge :
 *
 *   • collé en bas ⇒ ZÉRO. Ce qui arrive est déjà sous les yeux ; annoncer
 *     « 1 nouveau message » au-dessus d'un message qu'on est en train de lire
 *     est un contrôle qui ne mène nulle part (loi 4) ;
 *   • remonté ⇒ on CUMULE l'écart. Un compteur remis à l'écart du dernier tour
 *     dirait « 1 » là où trois messages sont arrivés en trois tours ;
 *   • le fil peut RÉTRÉCIR (une bulle en file remplacée par sa jumelle servie) :
 *     l'écart est alors négatif, et il ne se retranche pas de ce qui reste
 *     réellement non lu.
 */
export const nonLusApresAjout = ({
  nonLus,
  avant,
  apres,
  colle,
}: {
  readonly nonLus: number;
  readonly avant: number;
  readonly apres: number;
  readonly colle: boolean;
}): number => (colle ? 0 : nonLus + Math.max(0, apres - avant));

/** Ce que le bouton de retour au présent DIT — jamais un nombre nu. */
export const libelleDesNonLus = (nonLus: number): string =>
  nonLus <= 1 ? '1 nouveau message' : `${nonLus} nouveaux messages`;
