import { ECHEANCES, type Echeance } from '@/lib/contenu/liens';

import { CHAMPS_DU_NOUVEAU_LIEN, PERMISSIONS_DU_LIEN, SAISIE_NEUVE, type SaisieDuLien } from './nouveau-lien-vue';

/**
 * CE QUE LES DEUX PORTES DE LA FEUILLE « NOUVEAU LIEN » PARTAGENT (#5034) —
 * lire le formulaire, et composer ce que `createLinkSchema` ATTEND, hors la
 * CIBLE (`newConversation` pour `/links`, `conversationId` pour le fil) que
 * chaque hôte connaît seul et que rien ici ne devine.
 *
 * `/links` (`liens-porte.ts`) et le fil (`app/chats/[cle]/route.ts`) lisent
 * le MÊME champ `conversation` — texte libre sur l'un, valeur verrouillée
 * envoyée par un `<input type="hidden">` sur l'autre — et les cinq mêmes
 * permissions, la même échéance en radios, la même capacité. Écrire cette
 * lecture deux fois aurait fait, au premier champ ajouté au schéma, une
 * jumelle qui n'aurait suivi que sur l'un des deux hôtes.
 */

const texte = (formulaire: FormData, nom: string): string => {
  const valeur = formulaire.get(nom);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

const echeanceSoumise = (formulaire: FormData): Echeance =>
  (Object.keys(ECHEANCES) as readonly Echeance[]).find(
    (cle) => cle === formulaire.get(CHAMPS_DU_NOUVEAU_LIEN.echeance),
  ) ?? SAISIE_NEUVE.echeance;

export const saisieSoumise = (formulaire: FormData): SaisieDuLien => ({
  conversation: texte(formulaire, CHAMPS_DU_NOUVEAU_LIEN.conversation),
  nom: texte(formulaire, CHAMPS_DU_NOUVEAU_LIEN.nom),
  echeance: echeanceSoumise(formulaire),
  capacite: texte(formulaire, CHAMPS_DU_NOUVEAU_LIEN.capacite),
  permissions: new Set(PERMISSIONS_DU_LIEN.map(({ champ }) => champ).filter((champ) => formulaire.has(champ))),
});

/**
 * CE QUE LES DEUX HÔTES ENVOIENT, HORS LA CIBLE — un booléen EXPLICITE par
 * permission (une case décochée n'enverrait rien sinon, et décocher n'aurait
 * alors aucun effet), l'échéance calculée sur l'HORLOGE DU SERVEUR (celle du
 * navigateur peut avoir des heures de retard), la capacité seulement quand
 * elle est un entier positif, le nom seulement quand il n'est pas vide.
 */
export const champsCommuns = (
  saisie: SaisieDuLien,
  maintenant: number,
): {
  readonly name?: string;
  readonly expiresAt?: string;
  readonly maxUses?: number;
  readonly allowAnonymousMessages: boolean;
  readonly allowAnonymousFiles: boolean;
  readonly allowAnonymousImages: boolean;
  readonly allowViewHistory: boolean;
  readonly requireNickname: boolean;
} => {
  const duree = ECHEANCES[saisie.echeance];
  const capacite = Number.parseInt(saisie.capacite, 10);

  return {
    ...(saisie.nom === '' ? {} : { name: saisie.nom }),
    ...(duree === null ? {} : { expiresAt: new Date(maintenant + duree).toISOString() }),
    ...(Number.isFinite(capacite) && capacite > 0 ? { maxUses: capacite } : {}),
    // L'ASSERTION EST CE QUE `Object.fromEntries` COÛTE, et rien de plus :
    // TypeScript lui donne `{ [k: string]: boolean }`, qui ne satisfait pas les
    // cinq champs NOMMÉS que ce type de retour promet, alors que la source de
    // la boucle — `PERMISSIONS_DU_LIEN`, un tuple `as const` — les porte tous
    // exactement une fois. Elle ne fabrique donc aucune garantie : elle rend au
    // compilateur ce que la constante sait déjà, et un champ ajouté à
    // `PERMISSIONS_DU_LIEN` élargit les DEUX côtés ensemble.
    ...(Object.fromEntries(
      PERMISSIONS_DU_LIEN.map(({ champ }) => [champ, saisie.permissions.has(champ)]),
    ) as Record<(typeof PERMISSIONS_DU_LIEN)[number]['champ'], boolean>),
  };
};
