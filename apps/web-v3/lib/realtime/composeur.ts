import type { Citation } from '@/lib/api/citations';
import { LONGUEUR_MAX_DU_MESSAGE } from '@/lib/api/fil';
import { FIL } from '@/lib/contenu/fil';
import { poids } from '@/lib/poids';

import { remplisLesCitations } from './fil-peinture';
import { CADENCE_DE_FRAPPE_MS, SILENCE_DE_FRAPPE_MS } from './reconnect-policy';

/**
 * LE COMPOSEUR, pris en main par le module de participation — sans qu'une
 * balise du `<form method="post">` servi ne change : le même formulaire
 * marche sans JavaScript, et c'est lui qu'on ENRICHIT.
 *
 *   • le champ GRANDIT avec le texte, d'une à six lignes, puis défile ;
 *   • Entrée ENVOIE, Maj + Entrée passe à la ligne — documenté à côté du champ
 *     (`aria-describedby`), et un clavier tactile garde son bouton ;
 *   • la frappe s'ANNONCE (`typing:start`) au premier caractère puis au plus
 *     toutes les deux secondes — la cadence que le serveur étrangle de toute
 *     façon (`StatusHandler.TYPING_THROTTLE_MS`) — et se tait (`typing:stop`)
 *     à l'envoi ou après trois secondes de silence ;
 *   • le brouillon se garde par conversation, et revient tel quel ;
 *   • une PIÈCE choisie est ANNONCÉE — nom et poids — avant qu'un octet ne
 *     parte, et voyage avec le texte à l'envoi ;
 *   • le PLAFOND de la passerelle est tenu (`LONGUEUR_MAX_DU_MESSAGE`,
 *     `lib/api/fil.ts`) : `maxlength` sur le champ, un compteur discret dès
 *     90 %, et un texte que le serveur refuse (400) REVIENT dans le champ avec
 *     sa raison (`rends`) — jamais une bulle en échec dont « Réessayer »
 *     rejouerait le même refus.
 *
 * Le module DIT ce qu'il fait au moyen de rappels ; il ne sait rien du socket.
 */

export type Frappe = { readonly commence: () => void; readonly cesse: () => void };

/** Ce que le composeur ARMÉ ajoute à un envoi (§ 12.10.1, issue #5163) — `cible` est l'identifiant du message visé. */
export type ContextePourEnvoi = { readonly genre: 'reponse'; readonly cible: string } | { readonly genre: 'modification'; readonly cible: string } | null;

export type ControleurDuComposeur = {
  readonly champ: HTMLTextAreaElement;
  readonly formulaire: HTMLFormElement;
  readonly ferme: (raison: string) => void;
  /** L'inverse de `ferme` — un droit RENDU par l'hôte, relu au battement. */
  readonly ouvre: () => void;
  readonly vide: () => void;
  /** Un texte que la passerelle a refusé revient dans le champ, avec sa raison — rien n'est perdu. */
  readonly rends: (texte: string, raison: string) => void;
  /**
   * ARMER EN RÉPONSE (§ 12.10.1, issue #5163) — le bandeau du contexte est
   * RÉVÉLÉ et REMPLI par le MÊME site que la lecture (`remplisLesCitations`,
   * `fil-peinture.ts`), jamais composé ici (leçon 519).
   */
  readonly armeLaReponse: (citation: Citation) => void;
  /**
   * ARMER EN MODIFICATION — le champ est PRÉREMPLI de l'ORIGINAL, avec sa
   * langue ; aucun trombone. `avecPiece` dit si la cible porte une pièce
   * jointe (§ 12.10.1, défauts #5163 §7-8) : sans elle, un champ VIDÉ ou un
   * texte INCHANGÉ à l'envoi seraient traités comme n'importe quel autre
   * message, au lieu d'être reconnus comme des cas particuliers de l'édition.
   */
  readonly armeLaModification: (params: {
    readonly id: string;
    readonly texteOriginal: string;
    readonly langue: string | null;
    readonly avecPiece?: boolean;
    readonly texteServi?: string;
  }) => void;
  /** DÉSARMER — Échap ou « Annuler » : le champ retrouve le brouillon d'AVANT l'armement (Q6 : rien de plus ne survit au rechargement). */
  readonly desarme: () => void;
  readonly detruit: () => void;
};

const LIGNES_MAX = 6;

/** Le compteur se montre à partir de ce ratio du plafond — assez tôt pour raccourcir, assez tard pour ne pas distraire. */
const SEUIL_DU_COMPTEUR = 0.9;

const ajusteLaHauteur = (champ: HTMLTextAreaElement): void => {
  champ.style.height = 'auto';
  const ligne = Number.parseFloat(getComputedStyle(champ).lineHeight) || 24;
  const rembourrage = champ.offsetHeight - champ.clientHeight;
  const plafond = ligne * LIGNES_MAX + rembourrage;
  champ.style.height = `${Math.min(champ.scrollHeight, plafond)}px`;
};

export const prendsLeComposeur = ({
  main,
  gabarit,
  surEnvoi,
  frappe,
  surBrouillon,
  brouillon,
}: {
  readonly main: HTMLElement;
  /** Le gabarit du fil — `remplisLesCitations` en clone `ul.citations > li.citation` pour le bandeau de réponse. */
  readonly gabarit: HTMLTemplateElement | null;
  readonly surEnvoi: (texte: string, fichiers: readonly File[], contexte: ContextePourEnvoi) => void;
  readonly frappe: Frappe;
  readonly surBrouillon: (texte: string) => void;
  readonly brouillon: string | null;
}): ControleurDuComposeur | null => {
  const formulaire = main.querySelector<HTMLFormElement>('form.composeur');
  const champ = formulaire?.querySelector<HTMLTextAreaElement>('textarea');
  if (formulaire === null || formulaire === undefined || champ === null || champ === undefined) return null;
  const piece = formulaire.querySelector<HTMLInputElement>('input[type="file"]');
  const annonceDePiece = formulaire.querySelector<HTMLElement>('.piece-choisie');
  const compteur = formulaire.querySelector<HTMLElement>('.compteur');
  const refus = formulaire.querySelector<HTMLElement>('.refus');
  const trombone = formulaire.querySelector<HTMLElement>('label.joindre');
  const zoneDuContexte = formulaire.querySelector<HTMLElement>('#contexte-du-composeur');
  const listeDesCitations = zoneDuContexte?.querySelector<HTMLUListElement>('ul.citations') ?? null;
  const quoiModif = zoneDuContexte?.querySelector<HTMLElement>('.quoi-modif') ?? null;
  const annuler = zoneDuContexte?.querySelector<HTMLAnchorElement>('a.annuler') ?? null;
  const champReponse = formulaire.querySelector<HTMLInputElement>('input[name="reponseA"]');
  const champModification = formulaire.querySelector<HTMLInputElement>('input[name="modifie"]');

  let contexteArme: ContextePourEnvoi = null;
  let brouillonAvantArmement: string | null = null;
  /**
   * CE QU'UNE MODIFICATION ARMÉE RETIENT EN PLUS DE SA CIBLE (défauts
   * #5163 §7-8) — le texte SERVI (pour détecter un « Enregistrer » sans rien
   * avoir changé : la passerelle marquerait alors le message modifié et
   * effacerait ses traductions POUR RIEN) et si la cible porte une pièce
   * jointe (pour admettre un champ VIDE — retirer la légende d'un message à
   * pièce est une édition valide, `messageEditContent.ts`). `null`/`false`
   * hors modification : rien de tout cela ne s'applique à un message nu ou à
   * une réponse.
   */
  let texteOriginalArme: string | null = null;
  let avecPieceArmee = false;

  /**
   * VIDER LA LISTE DES CITATIONS DU BANDEAU — et son EMPREINTE avec elle.
   * `remplisLesCitations` (`fil-peinture.ts`) court-circuite sur deux
   * signaux : une empreinte IDENTIQUE, et une liste SERVIE qu'aucune
   * empreinte n'annote encore. Les laisser en place après un désarmement
   * rendait le bandeau MENTEUR — vide au second armement du même message
   * (empreinte inchangée), ou figé sur la citation SERVIE quand le lecteur
   * répond à un AUTRE message que celui de `?repondre=`.
   */
  const videLesCitations = (): void => {
    if (listeDesCitations === null) return;
    listeDesCitations.replaceChildren();
    delete listeDesCitations.dataset.empreinte;
    listeDesCitations.hidden = true;
  };

  const compte = (): void => {
    if (compteur === null) return;
    const longueur = champ.value.length;
    compteur.textContent = FIL.compteur(longueur, LONGUEUR_MAX_DU_MESSAGE);
    compteur.hidden = longueur < LONGUEUR_MAX_DU_MESSAGE * SEUIL_DU_COMPTEUR;
    compteur.classList.toggle('limite', longueur >= LONGUEUR_MAX_DU_MESSAGE);
  };

  const taisLeRefus = (): void => {
    if (refus !== null) refus.hidden = true;
  };

  if (brouillon !== null && champ.value === '') champ.value = brouillon;
  ajusteLaHauteur(champ);
  compte();

  let dernierDebutDeFrappe = 0;
  let silence: ReturnType<typeof setTimeout> | null = null;
  let enFrappe = false;

  const cesse = (): void => {
    if (silence !== null) clearTimeout(silence);
    silence = null;
    if (!enFrappe) return;
    enFrappe = false;
    frappe.cesse();
  };

  const annonce = (): void => {
    const maintenant = Date.now();
    if (!enFrappe || maintenant - dernierDebutDeFrappe >= CADENCE_DE_FRAPPE_MS) {
      dernierDebutDeFrappe = maintenant;
      enFrappe = true;
      frappe.commence();
    }
    if (silence !== null) clearTimeout(silence);
    silence = setTimeout(cesse, SILENCE_DE_FRAPPE_MS);
  };

  const fichiers = (): readonly File[] => [...(piece?.files ?? [])].filter((f) => f.size > 0);

  const annonceLaPiece = (): void => {
    if (annonceDePiece === null) return;
    const choisis = fichiers();
    annonceDePiece.textContent = choisis.map((f) => `${f.name} · ${poids(f.size)}`).join(' — ');
    annonceDePiece.hidden = choisis.length === 0;
  };

  const videLaPiece = (): void => {
    if (piece !== null) piece.value = '';
    annonceLaPiece();
  };

  const rends = (texte: string, raison: string): void => {
    champ.value = texte;
    ajusteLaHauteur(champ);
    compte();
    if (refus !== null) {
      refus.textContent = raison;
      refus.hidden = false;
    }
    champ.focus();
  };

  /**
   * VIDER LE CONTEXTE ARMÉ — la fente REVIENT à son état servi (`hidden`,
   * vidée), jamais détruite : le module la révélera de nouveau au prochain
   * armement (leçon 519, aucune balise fabriquée).
   */
  const videLeContexteArme = (): void => {
    contexteArme = null;
    texteOriginalArme = null;
    avecPieceArmee = false;
    if (zoneDuContexte !== null) {
      zoneDuContexte.hidden = true;
      zoneDuContexte.dataset.genre = '';
    }
    if (listeDesCitations !== null) videLesCitations();
    if (quoiModif !== null) quoiModif.hidden = true;
    if (champReponse !== null) champReponse.value = '';
    if (champModification !== null) champModification.value = '';
    if (trombone !== null) trombone.hidden = false;
    champ.removeAttribute('lang');
  };

  const desarme = (): void => {
    if (contexteArme === null) return;
    videLeContexteArme();
    champ.value = brouillonAvantArmement ?? '';
    brouillonAvantArmement = null;
    ajusteLaHauteur(champ);
    compte();
    taisLeRefus();
    champ.focus();
  };

  const armeLaReponse = (citation: Citation): void => {
    if (zoneDuContexte === null || listeDesCitations === null || champReponse === null) return;
    if (brouillonAvantArmement === null) brouillonAvantArmement = champ.value;
    contexteArme = { genre: 'reponse', cible: citation.cible };
    zoneDuContexte.dataset.genre = 'reponse';
    zoneDuContexte.hidden = false;
    videLesCitations();
    remplisLesCitations(zoneDuContexte, [citation], gabarit, document.documentElement.lang || 'fr');
    if (quoiModif !== null) quoiModif.hidden = true;
    champReponse.value = citation.cible;
    if (champModification !== null) champModification.value = '';
    champ.focus();
  };

  const armeLaModification = ({
    id,
    texteOriginal,
    langue,
    avecPiece = false,
    texteServi,
  }: {
    readonly id: string;
    readonly texteOriginal: string;
    readonly langue: string | null;
    /** La cible porte une pièce jointe : un champ VIDE reste une édition valide (défaut #5163 §7). */
    readonly avecPiece?: boolean;
    /**
     * LA BASE DE COMPARAISON « rien n'a changé » (défaut #5163 §8), DISTINCTE
     * du texte PRÉREMPLI quand les deux divergent — le RÉARMEMENT après un
     * refus (`fil-gestes.ts` › `envoieLaModification`) préremplit le champ du
     * texte TENTÉ (pour ne pas le perdre) mais doit comparer au texte SERVI
     * par la passerelle, resté inchangé puisque le refus l'a empêché
     * d'écrire : sans cette distinction, retenter le MÊME texte refusé serait
     * lu comme « rien n'a changé » et désarmerait sans réessayer. Par défaut,
     * la base est `texteOriginal` (l'armement NOMINAL depuis le menu d'une
     * ligne, où préremplir et comparer sont la MÊME valeur).
     */
    readonly texteServi?: string;
  }): void => {
    if (zoneDuContexte === null || champModification === null) return;
    if (brouillonAvantArmement === null) brouillonAvantArmement = champ.value;
    contexteArme = { genre: 'modification', cible: id };
    texteOriginalArme = texteServi ?? texteOriginal;
    avecPieceArmee = avecPiece;
    zoneDuContexte.dataset.genre = 'modification';
    zoneDuContexte.hidden = false;
    if (listeDesCitations !== null) videLesCitations();
    if (quoiModif !== null) quoiModif.hidden = false;
    if (champReponse !== null) champReponse.value = '';
    champModification.value = id;
    if (trombone !== null) trombone.hidden = true;
    champ.value = texteOriginal;
    if (langue !== null) champ.setAttribute('lang', langue);
    else champ.removeAttribute('lang');
    ajusteLaHauteur(champ);
    compte();
    champ.focus();
  };

  const envoie = (): void => {
    const texte = champ.value.trim();
    const joints = fichiers();
    const enModification = contexteArme?.genre === 'modification';

    if (enModification) {
      // RIEN N'A CHANGÉ (défaut #5163 §8) : désarmer SANS émettre — un texte
      // IDENTIQUE forcerait la passerelle à marquer le message « modifié »
      // pour TOUS les participants et à effacer ses traductions POUR RIEN
      // (`MessageHandler.ts:911-1094`, la même écriture côté `PUT`).
      if (texte === (texteOriginalArme ?? '').trim()) {
        desarme();
        return;
      }
      // VIDE SANS PIÈCE (défaut #5163 §7) : la passerelle refuse un contenu
      // vide sauf pièce jointe (`messageEditContent.ts`) — le dire ICI, sans
      // requête, plutôt que sortir en silence comme pour un message nu. Une
      // cible AVEC pièce laisse partir le vide : retirer une légende est une
      // édition valide.
      if (texte === '' && !avecPieceArmee) {
        rends('', FIL.messageVide);
        return;
      }
    } else if (texte === '' && joints.length === 0) {
      return;
    }
    // `maxlength` retient la frappe ; une valeur posée autrement (brouillon, script) passe ici — et reste au lecteur.
    if (texte.length > LONGUEUR_MAX_DU_MESSAGE) {
      rends(champ.value, FIL.tropLong(texte.length, LONGUEUR_MAX_DU_MESSAGE));
      return;
    }
    taisLeRefus();
    cesse();
    const contexteEnvoye = contexteArme;
    surEnvoi(texte, joints, contexteEnvoye);
    if (contexteEnvoye !== null) videLeContexteArme();
    brouillonAvantArmement = null;
    champ.value = '';
    ajusteLaHauteur(champ);
    videLaPiece();
    surBrouillon('');
    champ.focus();
  };

  /**
   * ADOPTER LE CONTEXTE QUE LE SERVEUR A DÉJÀ ARMÉ (`?repondre=` / `?modifier=`).
   *
   * Le menu d'une ligne est un `<form method="get">` : cliqué AVANT que le
   * module ne soit chargé — le cas NOMINAL en 3G rurale, où il n'arrive
   * qu'après le premier pixel (§ 12.4) — il NAVIGUE, et la page revient avec
   * son bandeau, son champ prérempli et ses deux champs cachés. Sans cette
   * adoption, `contexteArme` restait `null` : le bandeau ANNONÇAIT une
   * réponse que l'envoi ne portait pas, et un `?modifier=` prérempli
   * REPOSTAIT le texte en message NEUF au lieu d'éditer le message visé.
   * L'état vient du DOM SERVI, jamais d'une seconde lecture de l'adresse :
   * le serveur reste l'unique compositeur (§ 12.11).
   */
  const adopteLeContexteServi = (): void => {
    if (zoneDuContexte === null || zoneDuContexte.hidden) return;
    const genre = zoneDuContexte.dataset.genre ?? '';
    const cible = (genre === 'modification' ? champModification?.value : champReponse?.value) ?? '';
    if (cible === '') return;
    if (genre === 'reponse') contexteArme = { genre: 'reponse', cible };
    else if (genre === 'modification') {
      contexteArme = { genre: 'modification', cible };
      // Le champ SERVI porte déjà le texte ORIGINAL (`fil-vue.ts` › `formulaire`,
      // `texteDuChamp`) — c'est lui qu'il faut retenir, pas ce que le lecteur y
      // tapera ensuite (défaut #5163 §8). `!champ.required` est le MÊME signal
      // que le serveur a posé pour `admetVide` (la cible porte une pièce,
      // défaut #5163 §7) : aucune seconde donnée à faire voyager pour ça.
      texteOriginalArme = champ.value;
      avecPieceArmee = !champ.required;
    } else return;
    // DÉSARMER rend ce qu'il y avait AVANT l'armement. Une réponse laisse le
    // brouillon en place (c'est le texte du lecteur) ; une modification, non
    // (le champ porte le texte du message VISÉ, qui n'a rien d'un brouillon).
    brouillonAvantArmement = genre === 'reponse' ? champ.value : '';
  };

  adopteLeContexteServi();

  const surSaisie = (): void => {
    ajusteLaHauteur(champ);
    compte();
    taisLeRefus();
    surBrouillon(champ.value);
    if (champ.value.trim() !== '') annonce();
    else cesse();
  };

  const surTouche = (evenement: KeyboardEvent): void => {
    if (evenement.key === 'Escape' && contexteArme !== null) {
      evenement.preventDefault();
      desarme();
      return;
    }
    if (evenement.key !== 'Enter' || evenement.shiftKey || evenement.isComposing) return;
    evenement.preventDefault();
    envoie();
  };

  const surSoumission = (evenement: SubmitEvent): void => {
    evenement.preventDefault();
    envoie();
  };

  /**
   * « ANNULER » DÉSARME SANS NAVIGUER (Q4, issue #5163) : sans JavaScript,
   * c'est un `<a href>` vers l'adresse nue ; avec, l'armement n'est pas une
   * navigation — le clic est intercepté.
   */
  const surAnnulerClic = (evenement: MouseEvent): void => {
    if (contexteArme === null) return;
    evenement.preventDefault();
    desarme();
  };

  champ.addEventListener('input', surSaisie);
  champ.addEventListener('keydown', surTouche);
  formulaire.addEventListener('submit', surSoumission);
  piece?.addEventListener('change', annonceLaPiece);
  annuler?.addEventListener('click', surAnnulerClic);
  if (annonceDePiece !== null) annonceDePiece.title = FIL.retirerLaPiece;

  return {
    champ,
    formulaire,
    ferme: (raison) => {
      cesse();
      const ferme = main.querySelector<HTMLElement>('#composeur-ferme');
      if (ferme !== null) {
        const texte = ferme.querySelector<HTMLElement>('.raison');
        if (texte !== null) texte.textContent = raison;
        ferme.hidden = false;
      }
      formulaire.hidden = true;
    },
    ouvre: () => {
      const ferme = main.querySelector<HTMLElement>('#composeur-ferme');
      if (ferme !== null) ferme.hidden = true;
      formulaire.hidden = false;
    },
    vide: () => {
      champ.value = '';
      ajusteLaHauteur(champ);
      compte();
      videLaPiece();
    },
    rends,
    armeLaReponse,
    armeLaModification,
    desarme,
    detruit: () => {
      cesse();
      champ.removeEventListener('input', surSaisie);
      champ.removeEventListener('keydown', surTouche);
      formulaire.removeEventListener('submit', surSoumission);
      piece?.removeEventListener('change', annonceLaPiece);
      annuler?.removeEventListener('click', surAnnulerClic);
    },
  };
};
