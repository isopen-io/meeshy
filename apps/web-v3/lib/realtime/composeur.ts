import { LONGUEUR_MAX_DU_MESSAGE } from '@/lib/api/fil';
import { FIL } from '@/lib/contenu/fil';
import { poids } from '@/lib/poids';

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

export type ControleurDuComposeur = {
  readonly champ: HTMLTextAreaElement;
  readonly formulaire: HTMLFormElement;
  readonly ferme: (raison: string) => void;
  /** L'inverse de `ferme` — un droit RENDU par l'hôte, relu au battement. */
  readonly ouvre: () => void;
  readonly vide: () => void;
  /** Un texte que la passerelle a refusé revient dans le champ, avec sa raison — rien n'est perdu. */
  readonly rends: (texte: string, raison: string) => void;
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
  surEnvoi,
  frappe,
  surBrouillon,
  brouillon,
}: {
  readonly main: HTMLElement;
  readonly surEnvoi: (texte: string, fichiers: readonly File[]) => void;
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

  const envoie = (): void => {
    const texte = champ.value.trim();
    const joints = fichiers();
    if (texte === '' && joints.length === 0) return;
    // `maxlength` retient la frappe ; une valeur posée autrement (brouillon, script) passe ici — et reste au lecteur.
    if (texte.length > LONGUEUR_MAX_DU_MESSAGE) {
      rends(champ.value, FIL.tropLong(texte.length, LONGUEUR_MAX_DU_MESSAGE));
      return;
    }
    taisLeRefus();
    cesse();
    surEnvoi(texte, joints);
    champ.value = '';
    ajusteLaHauteur(champ);
    videLaPiece();
    surBrouillon('');
    champ.focus();
  };

  const surSaisie = (): void => {
    ajusteLaHauteur(champ);
    compte();
    taisLeRefus();
    surBrouillon(champ.value);
    if (champ.value.trim() !== '') annonce();
    else cesse();
  };

  const surTouche = (evenement: KeyboardEvent): void => {
    if (evenement.key !== 'Enter' || evenement.shiftKey || evenement.isComposing) return;
    evenement.preventDefault();
    envoie();
  };

  const surSoumission = (evenement: SubmitEvent): void => {
    evenement.preventDefault();
    envoie();
  };

  champ.addEventListener('input', surSaisie);
  champ.addEventListener('keydown', surTouche);
  formulaire.addEventListener('submit', surSoumission);
  piece?.addEventListener('change', annonceLaPiece);
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
    detruit: () => {
      cesse();
      champ.removeEventListener('input', surSaisie);
      champ.removeEventListener('keydown', surTouche);
      formulaire.removeEventListener('submit', surSoumission);
      piece?.removeEventListener('change', annonceLaPiece);
    },
  };
};
