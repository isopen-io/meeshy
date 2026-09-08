import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import {
  connexion,
  inscription,
  type Issue,
  type Recuperateur,
} from '@/lib/api/authentification';

import { CONNEXION, INSCRIPTION, selecteursDe, type Ecran, type Selecteur } from './contenu';
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
 *
 * LA PORTE NE SAIT PAS CE QU'EST UN PAYS. Elle sait qu'un écran peut porter des
 * SÉLECTEURS, que chacun connaît ses options et ce qu'il propose à un visiteur
 * dont on ne sait qu'un en-tête `Accept-Language`. Lui apprendre les pays y
 * ferait entrer un catalogue de 245 lignes pour un écran sur deux, et la
 * connexion paierait la lecture d'un en-tête qu'elle n'utilise pas.
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
 * CE QU'UN SÉLECTEUR VAUT — la valeur soumise si elle EXISTE, sinon celle que
 * le sélecteur propose.
 *
 * Le contrôle n'est pas une politesse : `<select>` est un contrôle du
 * navigateur, mais un POST se fabrique à la main aussi bien qu'il se soumet.
 * Un `pays=ZZ` partirait tel quel vers la passerelle en `phoneCountryCode`, et
 * un `pays` absent — ce que rend un formulaire tronqué — laisserait un numéro
 * sans indicatif. Retomber sur la proposition rend les deux cas identiques au
 * cas nominal du lecteur qui n'a touché à rien.
 */
const valeurDuSelecteur = (
  selecteur: Selecteur,
  formulaire: FormData,
  acceptLanguage: string | null,
): string => {
  const soumise = texte(formulaire.get(selecteur.nom));
  return selecteur.options().some(({ valeur }) => valeur === soumise)
    ? soumise
    : selecteur.propose(acceptLanguage);
};

const proposees = (ecran: Ecran, acceptLanguage: string | null): Readonly<Record<string, string>> =>
  Object.fromEntries(
    selecteursDe(ecran).map((selecteur) => [selecteur.nom, selecteur.propose(acceptLanguage)]),
  );

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
      {
        ecran,
        refus: null,
        valeurs: proposees(ecran, requete.headers.get('accept-language')),
        retour: retourDeLURL(requete.url),
      },
      200,
    ),

  POST: async (requete: Request): Promise<Response> => {
    // Un formulaire d'accès soumis depuis un autre site n'est pas le lecteur qui se connecte (`app/provenance.ts`).
    if (origineEtrangere(requete)) return refusDOrigine(requete);
    const acceptLanguage = requete.headers.get('accept-language');
    const formulaire = await requete.formData().catch(() => null);
    if (formulaire === null) {
      return rendLEcran(
        {
          ecran,
          refus: { message: CHAMPS_MANQUANTS, champ: null, recours: null },
          valeurs: proposees(ecran, acceptLanguage),
          retour: retourDeLURL(requete.url),
        },
        400,
      );
    }

    const choix = Object.fromEntries(
      selecteursDe(ecran).map((selecteur) => [
        selecteur.nom,
        valeurDuSelecteur(selecteur, formulaire, acceptLanguage),
      ]),
    );
    const valeurs = {
      ...choix,
      ...Object.fromEntries(ecran.champs.map(({ nom }) => [nom, texte(formulaire.get(nom))])),
    };
    // Le mot de passe ne repart jamais au navigateur (`vue.ts`) ; l'écarter ici
    // aussi rend la propriété vraie de la DONNÉE, pas seulement du rendu.
    const saisie = {
      ...choix,
      ...Object.fromEntries(
        ecran.champs.filter(({ type }) => type !== 'password').map(({ nom }) => [nom, valeurs[nom] ?? '']),
      ),
    };
    const retour = texte(formulaire.get(RETOUR)) || retourDeLURL(requete.url);

    // Le vide d'un champ NON REQUIS est une réponse, pas une omission : le
    // téléphone laissé vide ne doit pas faire rendre « tous les champs sont
    // requis » sur un formulaire que la passerelle aurait accepté.
    const manquant = ecran.champs
      .filter(({ requis }) => requis !== false)
      .some(({ nom }) => (valeurs[nom] ?? '') === '');
    if (manquant) {
      return rendLEcran(
        { ecran, refus: { message: CHAMPS_MANQUANTS, champ: null, recours: null }, valeurs: saisie, retour },
        400,
      );
    }

    const issue = await soumets(valeurs);

    if (issue.genre === 'session') {
      return rendLaRemise(remiseDeSession(issue.session, destination(retour)));
    }
    if (issue.genre === 'deuxieme-facteur') {
      return rendLaRemise(remiseDeDeuxiemeFacteur(issue.etape, versLaVerification(retour)));
    }
    return rendLEcran(
      {
        ecran,
        refus: { message: issue.message, champ: issue.champ, recours: issue.recours },
        valeurs: saisie,
        retour,
      },
      400,
    );
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
    nomAffiche: valeurs.nomAffiche ?? '',
    courriel: valeurs.courriel ?? '',
    motDePasse: valeurs.motDePasse ?? '',
    telephone: valeurs.telephone ?? '',
    pays: valeurs.pays ?? '',
    langue: valeurs.langue ?? '',
  }),
);
