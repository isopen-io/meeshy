import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { LienDePartage } from '@/lib/api/compte';
import { GLYPHE_LIEN, LIENS } from '@/lib/contenu/liens';

import { adresseDuLien } from './contenu';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_LIENS } from './liens-feuille';
import { carteVide } from './vue';

/**
 * L'ÉCRAN DES LIENS DE PARTAGE (`cible/links.png`, issue #4933).
 *
 * L'ADRESSE EST UN TEXTE, LA LIGNE EST UN LIEN — et les deux mènent à des
 * endroits DIFFÉRENTS, ce qui est délibéré. Le texte est ce que le lecteur
 * COLLE dans une conversation WhatsApp (`adresseDuLien`, site unique, déjà
 * employé par le tableau de bord) ; la ligne, elle, mène à la conversation du
 * lecteur dans l'interface connectée. `/chat/:lien` est la porte de l'INVITÉ :
 * y envoyer le membre lui ferait refaire une jonction qu'il a déjà faite. La
 * carte du tableau de bord tient déjà ce raisonnement ; cet écran ne l'invente
 * pas une seconde fois.
 *
 * QUAND LA PASSERELLE N'A PAS ÉTENDU LA CONVERSATION, LA LIGNE N'EST PAS UN
 * LIEN. Elle reste une ligne d'INFORMATION — l'adresse s'y lit et s'y copie —
 * plutôt qu'un lien mort (charte règle 7).
 *
 * NI « CRÉER » NI « COPIER » NE SONT RENDUS, ET C'EST LA MÊME RÈGLE.
 * La cible dessine les deux ; aucun des deux n'a d'effet aujourd'hui.
 *
 *   - « Créer » ouvre la feuille `sheet:link`, un écran de la matrice que la v3
 *     ne sert pas encore — et la v3 n'a aucune autre route de création. Le
 *     poser mènerait à une page inexistante.
 *   - « Copier » exige le presse-papiers, donc du JavaScript, sur un écran qui
 *     en expédie zéro. Un bouton « Copier » qui ne copie pas est pire que son
 *     absence : le lecteur croit avoir copié et colle autre chose.
 *
 * L'adresse reste SÉLECTIONNABLE — c'est le chemin qui marche partout, y
 * compris sans JavaScript. Les deux contrôles reviendront avec ce qui leur
 * donne un effet, suivis par leurs issues.
 *
 * UN LIEN FERMÉ RESTE, ET LE DIT. Le tableau de bord les écarte — un lien mort
 * peint sur l'accueil dirait qu'on peut encore le partager. Ici, c'est
 * l'inverse : cet écran est l'endroit où le lecteur apprend qu'un lien ne sert
 * plus. Le cacher se lirait comme une perte, pas comme une fermeture.
 */

export type EtatDesLiens = {
  readonly liens: readonly LienDePartage[];
  /** `meta.summary.activeLinks` — SERVI, jamais recompté sur la page. */
  readonly actifs: number;
};

/**
 * LA DATE D'ÉCHÉANCE, POSÉE PAR LE SERVEUR. `Intl` s'exécute ici, au rendu,
 * dans le fuseau du processus — l'écran n'ayant aucun JavaScript, il n'y a
 * personne pour la reposer chez le lecteur. Une date illisible ne rend rien
 * plutôt qu'« Invalid Date ».
 */
const jour = (iso: string | null): string | null => {
  if (iso === null) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    instant,
  );
};

/**
 * CE QUE DIT LA SECONDE LIGNE. « Ont rejoint » d'abord — c'est le seul nombre
 * que la passerelle mesure —, puis la capacité et l'échéance quand le lien en
 * déclare. Rien n'est composé quand rien n'est servi : une ligne « 0 / 0 » sous
 * un lien sans borne serait une contrainte inventée.
 */
const meta = (lien: LienDePartage): readonly string[] => {
  const echeance = jour(lien.expireA);

  return [
    LIENS.ontRejoint(lien.utilisations),
    ...(lien.capacite === null ? [] : [LIENS.capacite(lien.utilisations, lien.capacite)]),
    ...(echeance === null ? [] : [LIENS.expire(echeance)]),
  ];
};

const dedans = (lien: LienDePartage): string =>
  `<span class="tuile" aria-hidden="true">${svgDuSprite(GLYPHE_LIEN)}</span>` +
  '<span class="dit">' +
  `<span class="adresse">${echappe(adresseDuLien(lien.identifiant))}</span>` +
  `<span class="meta">${meta(lien)
    .map((morceau) => `<span>${echappe(morceau)}</span>`)
    .join('')}</span>` +
  '</span>' +
  (lien.actif ? '' : `<span class="etat">${echappe(LIENS.ferme)}</span>`);

const ligne = (lien: LienDePartage): string => {
  const classe = `lien${lien.actif ? '' : ' ferme'}`;

  return lien.conversation === null
    ? `<li class="${classe}">${dedans(lien)}</li>`
    : `<li><a class="${classe}" href="/chats/${echappe(encodeURIComponent(lien.conversation))}">${dedans(lien)}</a></li>`;
};

const enTete = (actifs: number): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(LIENS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(LIENS.titre)}</h1>` +
  (actifs === 0 ? '' : `<p class="sous">${echappe(LIENS.actifs(actifs))}</p>`) +
  '</div>' +
  '</header>';

const corps = ({ liens, actifs }: EtatDesLiens): string =>
  '<main id="main-content" class="liens-ecran">' +
  enTete(actifs) +
  (liens.length === 0
    ? carteVide({ glyphe: GLYPHE_LIEN, titre: LIENS.vide, phrase: LIENS.videPrecision })
    : `<ul class="liens" aria-label="${echappe(LIENS.liste)}">${liens.map(ligne).join('')}</ul>`) +
  '</main>';

export const documentDesLiens = (etat: EtatDesLiens): string =>
  documentPleinEcran({
    titre: LIENS.titre,
    description: etat.actifs === 0 ? LIENS.titre : LIENS.actifs(etat.actifs),
    corps: corps(etat),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_LIENS,
  });
