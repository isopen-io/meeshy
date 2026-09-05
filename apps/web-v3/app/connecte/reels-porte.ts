import { rendu, versLaConnexion } from '@/app/connecte/porte';
import { documentDePanne } from '@/app/connecte/vue';
import { jetonDuLecteur } from '@/app/session';
import { moi } from '@/lib/api/compte';
import { languesDuLecteur } from '@/lib/api/fil';
import { baseDeLaPasserellePublique } from '@/lib/api/passerelle';
import { partageLu, type Recuperateur } from '@/lib/api/publication';
import { reelSuivant } from '@/lib/api/social';
import { GENRE_REEL } from '@/lib/contenu/partage';

import { documentDuPartage, documentIndisponible } from '@/app/(public)/partage-vue';
import { documentSansReel } from './reels-vue';

/**
 * LA PORTE DE `/feed/reels` — le fil de réels du lecteur CONNECTÉ (#5032).
 *
 * **UN SEUL LECTEUR SERT LES DEUX ROUTES, ET C'EST LE CRITÈRE DE FIN.** Cette
 * porte ne rend aucune vue : elle appelle `partageLu` puis `documentDuPartage`,
 * exactement les deux fonctions que `/reels/:id` appelle
 * (`app/(public)/partage-porte.ts`). Écrire ici un second lecteur — même
 * « juste pour le fil » — serait la jumelle que la matrice interdit en toutes
 * lettres (« aucune jumelle »), et le premier correctif appliqué à l'un des
 * deux aurait divergé.
 *
 * **CE QUI CHANGE ENTRE LES DEUX ROUTES EST L'ACQUISITION, PAS LE RENDU.**
 * `/reels/:id` connaît son identifiant et lit `GET /posts/:id` ; `/feed/reels`
 * ne connaît qu'un CURSEUR et demande à la passerelle quel réel vient ensuite.
 * La ligne qu'elle rend est hydratée par le MÊME include —
 * `feedPostInclude = postInclude` (`PostFeedService.ts:36`) —, donc `partageLu`
 * la lit telle quelle : **aucun aller-retour de plus**, et aucune seconde
 * projection à tenir.
 *
 * **UNE PAGE, UN RÉEL — et c'est ce qui rend « une seule vidéo décodée à la
 * fois » vrai par CONSTRUCTION.** La cible (`MeeshyWebV3.dc.html:180`) dessine
 * un réel plein écran, jamais une liste qui défile ; vingt réels dans un
 * document en feraient vingt `<video>` que seul un module pourrait éteindre, et
 * le socle sans JavaScript décoderait les vingt.
 *
 * **CE QUE CETTE PORTE NE FAIT PAS, ET POURQUOI.** Le cœur et la réponse du
 * lecteur postent vers `adresseDuPartage(GENRE_REEL, id)` — `/reels/<id>` —,
 * donc aimer depuis le fil dépose bien l'aime puis ATTERRIT sur l'adresse de
 * partage du même réel. Le geste a son effet (charte règle 7) ; ce qu'il perd
 * est la place dans le fil. La tenir demanderait de paramétrer l'action du
 * formulaire ET de dédoubler le gestionnaire de POST du partage : deux
 * changements pour un confort, dans un lot dont le critère porte sur le
 * LECTEUR. Dit ici plutôt que corrigé en douce.
 *
 * `recuperer` est la MÊME couture que partout ailleurs dans la zone : un témoin
 * oppose son serveur à la porte sans en lancer un. Jamais fournie en production.
 */

const CHEMIN = '/feed/reels';

/** L'adresse du réel SUIVANT — un pas de curseur, pas un nom. */
export const versLeReelSuivant = (curseur: string): string =>
  `${CHEMIN}?cursor=${encodeURIComponent(curseur)}`;

const curseurDemande = (requete: Request): string | undefined => {
  const valeur = new URL(requete.url).searchParams.get('cursor');
  return valeur === null || valeur.trim() === '' ? undefined : valeur;
};

const langueDemandee = (requete: Request): string | null => {
  const valeur = new URL(requete.url).searchParams.get('lang');
  return valeur === null || valeur.trim() === '' ? null : valeur.trim();
};

export const LIS_LE_FIL_DES_REELS = async (
  requete: Request,
  recuperer?: Recuperateur,
): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  const maintenant = Date.now();
  // LES DEUX APPELS PARTENT ENSEMBLE : les langues du Prisme et le réel à
  // servir ne dépendent pas l'un de l'autre, et les enchaîner doublerait la
  // latence du seul aller-retour que cet écran paie sur une 3G rurale.
  const [identite, suite] = await Promise.all([
    moi({ jeton, recuperer }),
    reelSuivant({ jeton, curseur: curseurDemande(requete), recuperer }),
  ]);

  if (identite.genre === 'session-expiree' || suite.genre === 'session-expiree') {
    return versLaConnexion(CHEMIN);
  }
  if (suite.genre === 'panne') return rendu(documentDePanne(), 503);
  // LE FIL VIDE EST DESSINÉ (charte règle 18) — et il n'est pas une erreur : un
  // compte neuf, ou un lecteur arrivé au bout de la file, n'a rien à découvrir.
  if (suite.genre === 'vide') return rendu(documentSansReel());

  const story = partageLu({
    genre: GENRE_REEL.type,
    brut: suite.brut,
    langues: languesDuLecteur(identite.genre === 'lecteur' ? identite.lecteur : {}),
    langueDemandee: langueDemandee(requete),
    maintenant,
    origine: baseDeLaPasserellePublique(),
  });
  // La passerelle a servi une ligne que le lecteur ne sait pas lire (un genre
  // qui n'est pas REEL, une ligne supprimée) : le même écran que `/reels/:id`
  // rend dans ce cas, jamais un document à moitié peint.
  if (story === null) return rendu(documentIndisponible(GENRE_REEL), 404);

  return rendu(
    documentDuPartage({
      genre: GENRE_REEL,
      story,
      // AUCUNE PRÉCÉDENTE, ET CE N'EST PAS UN OUBLI. Le curseur de la
      // passerelle est FORWARD-ONLY (`createdAt+id` décroissant) : il n'existe
      // pas d'adresse « le réel d'avant ». Le retour arrière du navigateur le
      // fait, lui, exactement — et un tap qui ne mènerait nulle part serait le
      // contrôle sans effet de la charte règle 7.
      voisinage: {
        segments: [],
        rang: 0,
        precedente: null,
        suivante: suite.curseurSuivant === null ? null : versLeReelSuivant(suite.curseurSuivant),
      },
      // L'ADRESSE DE CET ÉCRAN — les liens de LECTURE (puce des langues, « voir
      // l'original ») s'y recomposent au lieu de renvoyer vers `/reels/<id>`.
      // Le curseur est REPORTÉ : changer de langue ne doit pas ramener au
      // premier réel du fil.
      adresseDeLEcran: curseurDemande(requete) === undefined ? CHEMIN : versLeReelSuivant(curseurDemande(requete) ?? ''),
      // LA CROIX REMONTE AU FIL, pas à l'accueil : c'est d'où l'on vient
      // (`MeeshyWebV3.dc.html:871`).
      retourDeLEcran: '/feed',
      maintenant,
      confirmation: false,
      erreur: null,
      brouillon: '',
    }),
  );
};
