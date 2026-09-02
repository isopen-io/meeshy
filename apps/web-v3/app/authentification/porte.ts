import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import {
  connexion,
  inscription,
  type Issue,
  type Recuperateur,
} from '@/lib/api/authentification';

import { CONNEXION, INSCRIPTION, type Ecran } from './contenu';
import {
  ECRAN_DEUXIEME_FACTEUR,
  destination,
  remiseDeDeuxiemeFacteur,
  remiseDeSession,
  rendLaRemise,
} from './remise';
import { rendLEcran } from './vue';

/**
 * LA PORTE — un seul gestionnaire pour les deux écrans d'accès.
 *
 * `GET` rend le formulaire. `POST` le soumet à la passerelle et rend l'une des
 * trois issues : une session, une étape de vérification, ou le formulaire
 * À NOUVEAU avec son message. Deux gestionnaires seraient deux jumeaux, et le
 * second oublierait un jour le `no-store`, le `noindex` ou la garde de
 * redirection.
 *
 * POURQUOI L'ÉCHEC EST UN 400 QUI REND, ET NON UN 303 QUI RENVOIE. Une
 * redirection perdrait la saisie — quatre champs sur l'écran d'inscription — et
 * ferait voyager le message dans la barre d'adresse. Le prix est le
 * « voulez-vous renvoyer le formulaire ? » au rechargement ; il ne se paie
 * qu'après un échec, et jamais après un succès, qui part en remise.
 *
 * LE CHAMP `returnUrl` PORTE LE NOM DU LEGACY, pas un nom à nous : les liens
 * existants de l'application (`/login?returnUrl=…`) continuent de marcher, et
 * il n'y a rien à traduire d'un bord à l'autre de la frontière de zone.
 */

const RETOUR = 'returnUrl';

const CHAMPS_MANQUANTS = 'Tous les champs sont requis';

export type Soumission = (
  valeurs: Readonly<Record<string, string>>,
  recuperer?: Recuperateur,
) => Promise<Issue>;

const texte = (valeur: FormDataEntryValue | null): string =>
  typeof valeur === 'string' ? valeur.trim() : '';

const retourDeLURL = (url: string): string | null =>
  new URL(url).searchParams.get(RETOUR);

/**
 * `buildVerifyTwoFactorUrl` du legacy, à l'identique : l'écran de vérification
 * lit `returnUrl` dans SA propre barre d'adresse. Le chemin passe par la même
 * garde de redirection ouverte que la destination d'une session.
 */
const versLaVerification = (retour: string | null): string =>
  retour === null
    ? ECRAN_DEUXIEME_FACTEUR
    : `${ECRAN_DEUXIEME_FACTEUR}?${RETOUR}=${encodeURIComponent(destination(retour))}`;

export const porteDe = (ecran: Ecran, soumets: Soumission) => ({
  GET: (requete: Request): Response =>
    rendLEcran(
      { ecran, erreur: null, valeurs: {}, retour: retourDeLURL(requete.url) },
      200,
    ),

  POST: async (requete: Request): Promise<Response> => {
    // Un formulaire d'accès soumis depuis un autre site n'est pas le lecteur qui se connecte (`app/provenance.ts`).
    if (origineEtrangere(requete)) return refusDOrigine(requete);
    const formulaire = await requete.formData().catch(() => null);
    if (formulaire === null) {
      return rendLEcran(
        { ecran, erreur: CHAMPS_MANQUANTS, valeurs: {}, retour: retourDeLURL(requete.url) },
        400,
      );
    }

    const valeurs = Object.fromEntries(
      ecran.champs.map(({ nom }) => [nom, texte(formulaire.get(nom))]),
    );
    // Le mot de passe ne repart jamais au navigateur (`vue.ts`) ; l'écarter ici
    // aussi rend la propriété vraie de la DONNÉE, pas seulement du rendu.
    const saisie = Object.fromEntries(
      ecran.champs.filter(({ type }) => type !== 'password').map(({ nom }) => [nom, valeurs[nom] ?? '']),
    );
    const retour = texte(formulaire.get(RETOUR)) || retourDeLURL(requete.url);

    if (ecran.champs.some(({ nom }) => (valeurs[nom] ?? '') === '')) {
      return rendLEcran({ ecran, erreur: CHAMPS_MANQUANTS, valeurs: saisie, retour }, 400);
    }

    const issue = await soumets(valeurs);

    if (issue.genre === 'session') {
      return rendLaRemise(remiseDeSession(issue.session, destination(retour)));
    }
    if (issue.genre === 'deuxieme-facteur') {
      return rendLaRemise(remiseDeDeuxiemeFacteur(issue.etape, versLaVerification(retour)));
    }
    return rendLEcran({ ecran, erreur: issue.message, valeurs: saisie, retour }, 400);
  },
});

export const PORTE_DE_CONNEXION = porteDe(CONNEXION, (valeurs) =>
  connexion({
    identifiant: valeurs.identifiant ?? '',
    motDePasse: valeurs.motDePasse ?? '',
  }),
);

export const PORTE_D_INSCRIPTION = porteDe(INSCRIPTION, (valeurs) =>
  inscription({
    prenom: valeurs.prenom ?? '',
    nom: valeurs.nom ?? '',
    identifiant: valeurs.identifiant ?? '',
    courriel: valeurs.courriel ?? '',
    motDePasse: valeurs.motDePasse ?? '',
  }),
);
