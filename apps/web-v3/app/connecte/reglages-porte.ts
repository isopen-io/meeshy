import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { COOKIE_DE_THEME, valeurDuCookie } from '@/lib/api/cookies';
import { moi, type Lecteur, type Recuperateur } from '@/lib/api/compte';
import {
  appareilsDuLecteur,
  changeLeMotDePasse,
  ecrisLeProfil,
  retireLAppareil,
  type Issue,
  type ProfilAEcrire,
} from '@/lib/api/reglages';

import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import {
  CHAMPS_DU_MOT_DE_PASSE,
  CHAMPS_DU_PROFIL,
  CHAMP_DE_L_APPAREIL,
  CHAMP_DU_THEME,
  THEMES,
  documentDeLApplication,
  documentDeLEdition,
  documentDeLaSecurite,
  documentDuCarrefour,
  documentDuMotDePasse,
  documentDuProfil,
  type ChoixDeTheme,
} from './reglages-vue';
import { documentDePanne } from './vue';

/**
 * LES PORTES DES SIX ÉCRANS DE RÉGLAGES — la loi de la zone connectée, et pas
 * un aller-retour de plus que ce que chaque écran REND.
 *
 * `app/connecte/porte.ts` demande TOUJOURS `/conversations` : c'est juste pour
 * le tableau de bord et pour `/chats`. Aucun de ces six écrans n'en rend une,
 * et le carrefour comme l'application n'ont même RIEN à demander — le premier
 * n'est que des liens, le second lit un cookie. Les servir en payant un appel
 * serait une lenteur, c'est-à-dire un bug.
 *
 * LES TROIS QUESTIONS SONT LES MÊMES QUE PARTOUT, dans le même ordre : un
 * jeton ? la passerelle l'accepte-t-elle ? a-t-elle répondu ? Un 401 renvoie se
 * connecter — le cas NOMINAL d'un retour après quelques jours — et un silence
 * dessine la panne plutôt qu'une page blanche.
 *
 * TOUT POST EST UN POST/REDIRECT/GET et vérifie son ORIGINE d'abord. Sans la
 * redirection, un rechargement rejouerait le retrait d'un appareil ; sans la
 * garde d'origine, un autre site changerait le profil du lecteur à son insu —
 * et, sur `/settings/security/password`, tenterait des mots de passe depuis son
 * navigateur.
 */

const versLaConnexion = (chemin: string): Response =>
  new Response(null, {
    status: 302,
    headers: { location: `/login?returnUrl=${encodeURIComponent(chemin)}`, 'cache-control': CACHE_PRIVE },
  });

const temoinDeLURL = (requete: Request, temoins: readonly string[]): string | null =>
  temoins.find((temoin) => new URL(requete.url).searchParams.has(temoin)) ?? null;

/**
 * LE GARDIEN COMMUN — un jeton, sinon la connexion. Il rend le jeton plutôt
 * qu'un booléen : c'est ce dont chaque porte a besoin ensuite, et le faire
 * relire deux fois par requête aurait été une seconde lecture du même cookie.
 */
const avecJeton = async (
  requete: Request,
  chemin: string,
  suite: (jeton: string) => Promise<Response>,
): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(chemin);
  return suite(jeton);
};

const avecLecteur = async ({
  jeton,
  chemin,
  recuperer,
  suite,
}: {
  readonly jeton: string;
  readonly chemin: string;
  readonly recuperer?: Recuperateur;
  readonly suite: (lecteur: Lecteur) => Response;
}): Promise<Response> => {
  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion(chemin);
  if (identite.genre === 'panne') return rendu(documentDePanne(), 503);
  return suite(identite.lecteur);
};

// ─── /settings ──────────────────────────────────────────────────────────────

const CHEMIN_DU_CARREFOUR = '/settings';

/**
 * LE CARREFOUR NE DEMANDE RIEN. Il ne rend que des liens : ni nom, ni avatar,
 * ni compteur. Appeler `/auth/me` pour décider s'il faut le servir serait payer
 * un aller-retour pour une page que la destination refusera de toute façon si
 * le jeton ne vaut plus.
 */
export const CARREFOUR = (requete: Request): Promise<Response> =>
  avecJeton(requete, CHEMIN_DU_CARREFOUR, async () => rendu(documentDuCarrefour()));

// ─── /settings/profile ──────────────────────────────────────────────────────

const CHEMIN_DU_PROFIL = '/settings/profile';

export const PROFIL = (requete: Request, recuperer?: Recuperateur): Promise<Response> =>
  avecJeton(requete, CHEMIN_DU_PROFIL, (jeton) =>
    avecLecteur({ jeton, chemin: CHEMIN_DU_PROFIL, recuperer, suite: (lecteur) => rendu(documentDuProfil(lecteur)) }),
  );

// ─── /settings/profile/edit ─────────────────────────────────────────────────

const CHEMIN_DE_L_EDITION = '/settings/profile/edit';

export const EDITION = (requete: Request, recuperer?: Recuperateur): Promise<Response> =>
  avecJeton(requete, CHEMIN_DE_L_EDITION, (jeton) =>
    avecLecteur({
      jeton,
      chemin: CHEMIN_DE_L_EDITION,
      recuperer,
      suite: (lecteur) =>
        rendu(
          documentDeLEdition({
            valeurs: lecteur,
            avis: temoinDeLURL(requete, ['enregistre']) === null ? null : 'enregistre',
          }),
        ),
    }),
  );

const brut = (formulaire: FormData, nom: string): string => {
  const valeur = formulaire.get(nom);
  return typeof valeur === 'string' ? valeur : '';
};

const texte = (formulaire: FormData, nom: string): string => brut(formulaire, nom).trim();

/**
 * UNE LANGUE VIDE EST UN RANG QU'ON DÉFAIT, et elle part telle quelle : la
 * chaîne vide est ce que `PATCH /users/me` accepte pour effacer un rang. La
 * confondre avec « champ non soumis » rendrait la langue de destination
 * indélébile une fois posée.
 */
const profilSoumis = (formulaire: FormData): ProfilAEcrire => ({
  displayName: texte(formulaire, CHAMPS_DU_PROFIL.nomAffiche),
  firstName: texte(formulaire, CHAMPS_DU_PROFIL.prenom),
  lastName: texte(formulaire, CHAMPS_DU_PROFIL.nom),
  bio: texte(formulaire, CHAMPS_DU_PROFIL.bio),
  systemLanguage: texte(formulaire, CHAMPS_DU_PROFIL.systemLanguage),
  regionalLanguage: texte(formulaire, CHAMPS_DU_PROFIL.regionalLanguage),
  customDestinationLanguage: texte(formulaire, CHAMPS_DU_PROFIL.customDestinationLanguage),
});

/**
 * LE REFUS RE-SERT LE FORMULAIRE AVEC CE QUI VIENT D'ÊTRE TAPÉ, et non une
 * redirection : la redirection est ce qui protège du REJEU, et il n'y a rien à
 * rejouer quand rien n'a été écrit. Elle coûterait en plus la saisie du
 * lecteur, qu'aucune URL ne peut porter sans l'exposer.
 */
export const ENREGISTRE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  return avecJeton(requete, CHEMIN_DE_L_EDITION, async (jeton) => {
    const formulaire = await requete.formData().catch(() => null);
    if (formulaire === null) return redirection(CHEMIN_DE_L_EDITION, { 'cache-control': CACHE_PRIVE });

    const champs = profilSoumis(formulaire);
    const issue = await ecrisLeProfil({ jeton, champs, recuperer });
    if (issue.genre === 'fait') {
      return redirection(`${CHEMIN_DE_L_EDITION}?enregistre`, { 'cache-control': CACHE_PRIVE });
    }

    return rendu(
      documentDeLEdition({
        valeurs: {
          id: null,
          prenom: champs.firstName ?? null,
          nom: champs.lastName ?? null,
          nomAffiche: champs.displayName ?? null,
          pseudonyme: null,
          bio: champs.bio ?? null,
          email: null,
          telephone: null,
          systemLanguage: champs.systemLanguage === '' ? null : (champs.systemLanguage ?? null),
          regionalLanguage: champs.regionalLanguage === '' ? null : (champs.regionalLanguage ?? null),
          customDestinationLanguage:
            champs.customDestinationLanguage === '' ? null : (champs.customDestinationLanguage ?? null),
        },
        avis: 'refuse',
        motif: issue.genre === 'refus' ? issue.message : null,
      }),
      issue.genre === 'panne' ? 503 : 422,
    );
  });
};

// ─── /settings/application ──────────────────────────────────────────────────

const CHEMIN_DE_L_APPLICATION = '/settings/application';

/** Un an : la durée au-delà de laquelle un choix d'apparence non revu ne dit plus rien. */
const AN_EN_SECONDES = 60 * 60 * 24 * 365;

const themeDuCookie = (requete: Request): ChoixDeTheme => {
  const valeur = valeurDuCookie(requete.headers.get('cookie'), COOKIE_DE_THEME);
  if (valeur === 'light') return 'clair';
  if (valeur === 'dark') return 'sombre';
  return 'systeme';
};

/**
 * « SYSTÈME » EFFACE LE COOKIE plutôt que d'y écrire une troisième valeur : ne
 * rien garder est la seule façon de suivre un système qui change, et c'est
 * aussi la seule qui ne laisse rien derrière quand le lecteur reprend son
 * choix. `max-age=0` est ce qu'un navigateur comprend comme « oublie ».
 */
const cookieDuTheme = (choix: ChoixDeTheme): string =>
  choix === 'systeme'
    ? `${COOKIE_DE_THEME}=;path=/;max-age=0;samesite=lax`
    : `${COOKIE_DE_THEME}=${choix === 'clair' ? 'light' : 'dark'};path=/;max-age=${AN_EN_SECONDES};samesite=lax`;

export const APPLICATION = (requete: Request): Promise<Response> =>
  avecJeton(requete, CHEMIN_DE_L_APPLICATION, async () =>
    rendu(
      documentDeLApplication({
        theme: themeDuCookie(requete),
        applique: temoinDeLURL(requete, ['applique']) !== null,
      }),
    ),
  );

const choixDuTheme = (valeur: FormDataEntryValue | null): ChoixDeTheme | null =>
  THEMES.find((theme) => theme === valeur) ?? null;

export const CHANGE_LE_THEME = async (requete: Request): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  return avecJeton(requete, CHEMIN_DE_L_APPLICATION, async () => {
    const formulaire = await requete.formData().catch(() => null);
    const choix = choixDuTheme(formulaire?.get(CHAMP_DU_THEME) ?? null);
    // RIEN DE RECONNAISSABLE ⇒ RIEN D'ÉCRIT. Un POST sans thème valide n'a rien
    // demandé ; poser un cookie « par défaut » changerait l'apparence sans
    // qu'on l'ait choisie.
    if (choix === null) return redirection(CHEMIN_DE_L_APPLICATION, { 'cache-control': CACHE_PRIVE });

    return redirection(`${CHEMIN_DE_L_APPLICATION}?applique`, {
      'cache-control': CACHE_PRIVE,
      'set-cookie': cookieDuTheme(choix),
    });
  });
};

// ─── /settings/security ─────────────────────────────────────────────────────

const CHEMIN_DE_LA_SECURITE = '/settings/security';

const TEMOINS_DE_LA_SECURITE = ['retire', 'echoue'] as const;

const sertLaSecurite = async ({
  jeton,
  requete,
  recuperer,
}: {
  readonly jeton: string;
  readonly requete: Request;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  const appareils = await appareilsDuLecteur({ jeton, recuperer });
  if (appareils.genre === 'session-expiree') return versLaConnexion(CHEMIN_DE_LA_SECURITE);
  if (appareils.genre === 'panne') return rendu(documentDePanne(), 503);

  const temoin = temoinDeLURL(requete, [...TEMOINS_DE_LA_SECURITE]);
  return rendu(
    documentDeLaSecurite({
      appareils: appareils.appareils,
      maintenant: Date.now(),
      avis: temoin === null ? null : temoin === 'retire' ? 'retire' : 'refuse',
    }),
  );
};

export const SECURITE = (requete: Request, recuperer?: Recuperateur): Promise<Response> =>
  avecJeton(requete, CHEMIN_DE_LA_SECURITE, (jeton) => sertLaSecurite({ jeton, requete, recuperer }));

export const RETIRE_UN_APPAREIL = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  return avecJeton(requete, CHEMIN_DE_LA_SECURITE, async (jeton) => {
    const formulaire = await requete.formData().catch(() => null);
    const id = formulaire?.get(CHAMP_DE_L_APPAREIL);
    if (typeof id !== 'string' || id === '') return sertLaSecurite({ jeton, requete, recuperer });

    const issue = await retireLAppareil({ jeton, id, recuperer });
    return redirection(`${CHEMIN_DE_LA_SECURITE}?${issue.genre === 'fait' ? 'retire' : 'echoue'}`, {
      'cache-control': CACHE_PRIVE,
    });
  });
};

// ─── /settings/security/password ────────────────────────────────────────────

const CHEMIN_DU_MOT_DE_PASSE = '/settings/security/password';

export const MOT_DE_PASSE = (requete: Request): Promise<Response> =>
  avecJeton(requete, CHEMIN_DU_MOT_DE_PASSE, async () =>
    rendu(documentDuMotDePasse({ avis: temoinDeLURL(requete, ['change']) === null ? null : 'change' })),
  );

const refusDuMotDePasse = (issue: Issue): Response =>
  rendu(
    documentDuMotDePasse({ avis: 'refuse', motif: issue.genre === 'refus' ? issue.message : null }),
    issue.genre === 'panne' ? 503 : 422,
  );

/**
 * LE SUCCÈS REDIRIGE, LE REFUS NON — la même règle que l'édition, pour une
 * raison de plus : une redirection après un refus laisserait le lecteur devant
 * un formulaire vide sans savoir lequel des deux champs a déplu, et le message
 * de la passerelle (« Current password is incorrect ») ne peut voyager dans une
 * URL sans finir dans l'historique.
 */
export const CHANGE_LE_MOT_DE_PASSE = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  return avecJeton(requete, CHEMIN_DU_MOT_DE_PASSE, async (jeton) => {
    const formulaire = await requete.formData().catch(() => null);
    if (formulaire === null) return rendu(documentDuMotDePasse({ avis: 'vide' }), 422);

    // UN MOT DE PASSE NE SE ROGNE PAS. Les espaces de tête et de fin en font
    // partie ; les retirer refuserait silencieusement un mot de passe juste, et
    // en ENREGISTRERAIT un autre que celui que le lecteur croit avoir choisi.
    const actuel = brut(formulaire, CHAMPS_DU_MOT_DE_PASSE.actuel);
    const nouveau = brut(formulaire, CHAMPS_DU_MOT_DE_PASSE.nouveau);
    if (actuel === '' || nouveau === '') return rendu(documentDuMotDePasse({ avis: 'vide' }), 422);

    const issue = await changeLeMotDePasse({ jeton, actuel, nouveau, recuperer });
    if (issue.genre !== 'fait') return refusDuMotDePasse(issue);

    return redirection(`${CHEMIN_DU_MOT_DE_PASSE}?change`, { 'cache-control': CACHE_PRIVE });
  });
};
