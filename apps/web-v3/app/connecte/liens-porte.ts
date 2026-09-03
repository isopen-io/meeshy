import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { carnetDeLiens, creeUnLien, type LienACreer, type Recuperateur } from '@/lib/api/compte';
import { ECHEANCES, NOUVEAU_LIEN, type Echeance } from '@/lib/contenu/liens';

import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import {
  CHAMPS_DU_NOUVEAU_LIEN,
  PERMISSIONS_DU_LIEN,
  SAISIE_NEUVE,
  documentDesLiens,
  type SaisieDuLien,
} from './liens-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/links` — un seul appel, et c'est tout ce dont l'écran a besoin.
 *
 * NI `/auth/me` NI `/conversations`. La zone connectée demande toujours les
 * deux ; cet écran ne rend ni le nom du lecteur ni ses conversations, et son
 * unique appel lui dit déjà tout — y compris si le jeton vaut encore. Deux
 * aller-retours économisés sur une 3G rurale, sur un écran qui n'aurait rien su
 * en faire.
 *
 * C'est le même raisonnement que `/notifications` et `/contacts`, poussé d'un
 * cran : là-bas `/auth/me` restait nécessaire — pour le chrome de la boîte,
 * pour CLASSER les demandes des contacts. Ici, rien.
 *
 * LES TROIS QUESTIONS SONT LES MÊMES, dans le même ordre : un jeton ? la
 * passerelle l'accepte-t-elle ? a-t-elle répondu ? Un 401 renvoie se
 * connecter — le cas NOMINAL d'un retour après quelques jours — et un silence
 * dessine la panne plutôt qu'une page blanche.
 */

const CHEMIN = '/links';

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

/**
 * SERVIR LE CARNET, dans l'état que l'adresse déclare. `?nouveau` ouvre la
 * feuille de création, `?cree` porte le compte rendu du POST — deux états
 * d'ADRESSE, donc partageables, rechargeables et annulables par le bouton
 * « précédent », ce qu'aucun état de JavaScript n'offre.
 */
const sert = async ({
  jeton,
  requete,
  recuperer,
  saisie,
  motif,
  statut = 200,
}: {
  readonly jeton: string;
  readonly requete: Request;
  readonly recuperer?: Recuperateur;
  readonly saisie?: SaisieDuLien;
  readonly motif?: string | null;
  readonly statut?: number;
}): Promise<Response> => {
  const carnet = await carnetDeLiens({ jeton, recuperer });
  if (carnet.genre === 'session-expiree') return versLaConnexion();
  if (carnet.genre === 'panne') return rendu(documentDePanne(), 503);

  const parametres = new URL(requete.url).searchParams;
  return rendu(
    documentDesLiens({
      liens: carnet.liens,
      actifs: carnet.actifs,
      nouveau: parametres.has('nouveau') || saisie !== undefined,
      avis: parametres.has('cree') ? 'cree' : null,
      saisie,
      motif: motif ?? null,
    }),
    statut,
  );
};

export const CARNET_DE_LIENS = async (
  requete: Request,
  recuperer?: Recuperateur,
): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  return sert({ jeton, requete, recuperer });
};

const texte = (formulaire: FormData, nom: string): string => {
  const valeur = formulaire.get(nom);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

const echeanceSoumise = (formulaire: FormData): Echeance => {
  const valeur = formulaire.get(CHAMPS_DU_NOUVEAU_LIEN.echeance);
  return (Object.keys(ECHEANCES) as readonly Echeance[]).find((cle) => cle === valeur) ?? SAISIE_NEUVE.echeance;
};

const saisieSoumise = (formulaire: FormData): SaisieDuLien => ({
  conversation: texte(formulaire, CHAMPS_DU_NOUVEAU_LIEN.conversation),
  nom: texte(formulaire, CHAMPS_DU_NOUVEAU_LIEN.nom),
  echeance: echeanceSoumise(formulaire),
  capacite: texte(formulaire, CHAMPS_DU_NOUVEAU_LIEN.capacite),
  permissions: new Set(PERMISSIONS_DU_LIEN.map(({ champ }) => champ).filter((champ) => formulaire.has(champ))),
});

/**
 * UNE CASE NON COCHÉE N'ENVOIE RIEN, et c'est pourquoi chaque permission part
 * en booléen EXPLICITE. Omettre le champ laisserait la passerelle poser son
 * propre défaut : décocher « Joindre des fichiers » n'aurait alors aucun
 * effet — le contrôle mentirait.
 *
 * L'ÉCHÉANCE EST CALCULÉE ICI, sur l'horloge du SERVEUR. Celle du navigateur
 * peut avoir des heures de retard, et une date d'expiration fausse ne se
 * découvre qu'au moment où le lien meurt trop tôt.
 */
const lienASoumettre = (saisie: SaisieDuLien, maintenant: number): LienACreer => {
  const duree = ECHEANCES[saisie.echeance];
  const capacite = Number.parseInt(saisie.capacite, 10);

  return {
    newConversation: { title: saisie.conversation },
    ...(saisie.nom === '' ? {} : { name: saisie.nom }),
    ...(duree === null ? {} : { expiresAt: new Date(maintenant + duree).toISOString() }),
    ...(Number.isFinite(capacite) && capacite > 0 ? { maxUses: capacite } : {}),
    ...Object.fromEntries(
      PERMISSIONS_DU_LIEN.map(({ champ }) => [champ, saisie.permissions.has(champ)]),
    ),
  };
};

/**
 * CRÉER LE LIEN — Post/Redirect/Get, et la garde d'origine AVANT tout.
 *
 * Sans la redirection, un rechargement créerait un SECOND lien et une seconde
 * conversation ; sans la garde, un autre site ferait ouvrir au lecteur une
 * conversation publique à son insu, avec un lien que lui seul croit privé.
 *
 * LE REFUS NE REDIRIGE PAS : rien n'a été écrit, donc il n'y a rien à protéger
 * du rejeu, et une redirection coûterait la saisie — un nom de conversation et
 * six cases qu'aucune URL ne peut porter sans les exposer.
 */
export const CREE_UN_LIEN = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  const formulaire = await requete.formData().catch(() => null);
  if (formulaire === null) return redirection(`${CHEMIN}?nouveau`, { 'cache-control': CACHE_PRIVE });

  const saisie = saisieSoumise(formulaire);
  // SANS NOM DE CONVERSATION, RIEN NE PART. La passerelle le refuserait
  // (`title: z.string().min(1)`), mais son message parlerait anglais d'un
  // champ que le lecteur n'a pas nommé ainsi.
  if (saisie.conversation === '') {
    return sert({ jeton, requete, recuperer, saisie, motif: NOUVEAU_LIEN.sansTitre, statut: 422 });
  }

  const issue = await creeUnLien({ jeton, champs: lienASoumettre(saisie, Date.now()), recuperer });
  if (issue.genre === 'session-expiree') return versLaConnexion();
  if (issue.genre === 'fait') return redirection(`${CHEMIN}?cree`, { 'cache-control': CACHE_PRIVE });

  return sert({
    jeton,
    requete,
    recuperer,
    saisie,
    motif: issue.genre === 'refus' ? issue.message : '',
    statut: issue.genre === 'panne' ? 503 : 422,
  });
};
