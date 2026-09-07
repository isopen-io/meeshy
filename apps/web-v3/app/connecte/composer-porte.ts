import { isImageMimeType, isVideoMimeType } from '@meeshy/shared/types/attachment';

import { CACHE_PRIVE, rendu, versLaConnexion } from '@/app/connecte/porte';
import { actifsTempsReel } from '@/lib/actifs-rt';
import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { moi, type Lecteur } from '@/lib/api/compte';
import { relacheMediaDePost, televerseMediaDePost } from '@/lib/api/medias-de-post';
import { publie, type Recuperateur } from '@/lib/api/publication';
import {
  CHAMPS_DU_COMPOSER,
  CHAMP_DU_FORMAT,
  COMPOSER,
  estUnFormat,
  estUneAudience,
  FORMATS_SERVIS,
  MAX_POST_MEDIA,
  OCTETS_MAX_DE_LA_CHARGE,
  OCTETS_MAX_PAR_MEDIA,
  OCTETS_MAX_PAR_PUBLICATION,
  type Audience,
  type FormatServi,
} from '@/lib/contenu/composer';

import { ADRESSE_DU_COMPOSER, documentDuComposer, type EtatDuComposer } from './composer-vue';

/**
 * LA PORTE DE `/composer` (#4966) — deux méthodes, et la seconde publie sans un
 * octet de JavaScript.
 *
 * GET sert le formulaire dans le FORMAT demandé (`?format=`), lu contre un
 * vocabulaire CLOS (`estUnFormat`) : rien de ce qu'un tiers écrirait dans
 * l'adresse n'atteint le document. `?publie=1` dit qu'une publication vient de
 * partir — la seule voix qu'un Post/Redirect/Get ait.
 *
 * POST publie, puis REDIRIGE (Post/Redirect/Get). Sans la redirection, un
 * rechargement republierait — et le navigateur demanderait « voulez-vous
 * renvoyer le formulaire ? » sur un écran où la réponse « oui » poste une
 * seconde publication au monde entier.
 *
 * LA GARDE D'ORIGINE EST SUR LE POST, et il la lui faut plus qu'à tout autre
 * écran de la zone : un formulaire auto-soumis par un site tiers publierait au
 * nom du lecteur, publiquement. `meeshy_auth` est `SameSite=Lax` et ne part pas
 * avec un POST inter-sites ; la garde est la ceinture qui ne dépend pas de
 * cette seule propriété (leçon 451). Le GET, lui, n'a aucun effet.
 *
 * AUCUN `X-Client-Mutation-Id` SUR CE CHEMIN, et c'est délibéré. L'en-tête rend
 * l'appel idempotent pour un client qui REJOUE (retour en ligne, second
 * onglet) ; le chemin sans JavaScript ne rejoue pas — c'est le
 * Post/Redirect/Get qui empêche le double envoi, et fabriquer un `cmid` par
 * requête ne protégerait de rien (deux soumissions porteraient deux
 * identifiants). Il reviendra avec le module qui met la publication en file.
 */

const CHEMIN = ADRESSE_DU_COMPOSER;

/** Le format demandé par l'adresse, lu contre le vocabulaire clos. Défaut : le premier servi. */
const formatDemande = (valeur: string | null): FormatServi =>
  valeur !== null && estUnFormat(valeur) ? valeur : FORMATS_SERVIS[0].cle;

const audienceDemandee = (valeur: string | null): Audience =>
  valeur !== null && estUneAudience(valeur) ? valeur : 'PUBLIC';

const texteDe = (formulaire: FormData, nom: string): string => {
  const brut = formulaire.get(nom);
  return typeof brut === 'string' ? brut.trim() : '';
};

/**
 * LA LANGUE REVENDIQUÉE — celle que le lecteur a DÉCLARÉE, jamais celle que le
 * Prisme de LECTURE lui sert à défaut.
 *
 * **LE PIÈGE, ET LE TÉMOIN QUI L'A ATTRAPÉ.** La première écriture prenait
 * `languesDuLecteur(lecteur)[0]` — le site unique qui ORDONNE le Prisme. C'est
 * le bon site pour LIRE et le mauvais pour ÉCRIRE : `languesDuLecteur` ne rend
 * JAMAIS une liste vide, elle retombe sur `REPLI_DE_LANGUE` (`lib/api/fil.ts`,
 * « fr »), parce qu'un lecteur doit toujours avoir une langue dans laquelle
 * lire. Un compte qui n'a rien configuré aurait donc publié tout son contenu
 * ÉTIQUETÉ FRANÇAIS.
 *
 * Ce n'est pas un défaut d'affichage : `originalLanguage` est « le pivot de
 * toute la descente du Prisme chez les LECTEURS » (doc-comment de `publie`).
 * Une personne écrivant en yoruba sans langue configurée aurait vu chacun de
 * ses lecteurs traduire depuis un français qu'elle n'a jamais écrit — et
 * l'erreur ne se voit jamais chez l'auteur.
 *
 * LE REPLI D'UNE LECTURE N'EST PAS LA VALEUR D'UNE ÉCRITURE. `systemLanguage`
 * est ce que le lecteur a DIT ; `null` — rien de déclaré — se traduit par
 * l'ABSENCE de revendication, et la passerelle détecte alors depuis le texte,
 * ce qu'elle a toujours fait. Une chaîne vide, elle, poserait un
 * `originalLanguage` vide dans le corps.
 */
const langueRevendiquee = (lecteur: Lecteur | null): string | null => lecteur?.systemLanguage ?? null;

const etatNeuf = ({
  format,
  lecteur,
  publieOk,
  tempsReel,
}: {
  readonly format: FormatServi;
  readonly lecteur: Lecteur | null;
  readonly publieOk: boolean;
  readonly tempsReel: { readonly module: string } | null;
}): EtatDuComposer => ({
  format,
  texte: '',
  humeur: null,
  audience: 'PUBLIC',
  langue: langueRevendiquee(lecteur),
  publie: publieOk,
  erreur: null,
  refusDesMedias: null,
  tempsReel,
});

/**
 * LE SOCLE DU MODULE (#4966) — `null` tant que l'actif compilé est absent : le
 * Post/Redirect/Get reste alors le seul chemin, et il suffit (§ 12.4). Le
 * module ne parle à personne : il tient le BROUILLON dans `sessionStorage`,
 * que le `no-store` du document ne peut pas tenir à sa place.
 */
const moduleDuBrouillon = (): { readonly module: string } | null => {
  const actifs = actifsTempsReel();
  if (actifs.composer.corps === '') return null;
  return { module: actifs.composer.url };
};

export const LIS_LE_COMPOSER = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  const adresse = new URL(requete.url);
  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion(CHEMIN);

  return rendu(
    documentDuComposer(
      etatNeuf({
        format: formatDemande(adresse.searchParams.get(CHAMP_DU_FORMAT)),
        lecteur: identite.genre === 'lecteur' ? identite.lecteur : null,
        publieOk: adresse.searchParams.get('publie') === '1',
        tempsReel: moduleDuBrouillon(),
      }),
    ),
  );
};

const versLeComposer = (format: FormatServi, publieOk: boolean): Response =>
  new Response(null, {
    status: 303,
    headers: {
      location: `${CHEMIN}?${CHAMP_DU_FORMAT}=${format}${publieOk ? '&publie=1' : ''}`,
      'cache-control': CACHE_PRIVE,
    },
  });

/**
 * LES FICHIERS DU FORMULAIRE (#5390) — UNIQUEMENT en format `post` (une
 * humeur est un emoji, aucun média). `FormData.getAll` rend aussi bien des
 * `string` que des `File` selon le champ posé ; un navigateur qui n'a RIEN
 * sélectionné envoie quand même la part `medias` — un `File` de taille 0 et
 * de nom vide (P7 de la spécification) — qui n'est pas une sélection et ne
 * doit produire aucun refus.
 */
const fichiersDuFormulaire = (formulaire: FormData, format: FormatServi): readonly File[] => {
  if (format === 'humeur') return [];
  return formulaire
    .getAll(CHAMPS_DU_COMPOSER.medias)
    .filter((valeur): valeur is File => valeur instanceof File && valeur.size > 0 && valeur.name !== '');
};

/**
 * LES LÉGENDES DU FORMULAIRE (#5390, revue — défaut 3) — le MÊME champ
 * RÉPÉTÉ que `composer-vue.ts` sert toujours (dix lignes, repliées ou non) :
 * la porte ne sait PAS lequel des dix champs porte quel texte, et n'a pas
 * besoin de le savoir — seul l'ORDRE compte, et `FormData.getAll` le rend
 * dans l'ordre du DOM, exactement comme `fichiersDuFormulaire` ci-dessus.
 * Le RANG `i` de ce tableau se ZIPPE avec le RANG `i` des fichiers VALIDÉS
 * (§ boucle de téléversement) — jamais avec la sélection brute, qui peut
 * contenir un fichier déjà refusé par une autre garde.
 */
const altsDuFormulaire = (formulaire: FormData, format: FormatServi): readonly string[] => {
  if (format === 'humeur') return [];
  return formulaire.getAll(CHAMPS_DU_COMPOSER.mediasAlt).map((valeur) => (typeof valeur === 'string' ? valeur.trim() : ''));
};

/**
 * LE MESSAGE DU PREMIER FICHIER REFUSÉ — type OU taille. `null` : tous passent
 * la garde.
 *
 * `isImageMimeType`/`isVideoMimeType` viennent de `@meeshy/shared` : le
 * vocabulaire de TYPE est celui de la passerelle, jamais une seconde liste.
 * La BORNE DE TAILLE, elle, appartient à la v3 — voir `OCTETS_MAX_PAR_MEDIA`
 * (`lib/contenu/composer.ts`) : la porte relaie en tampon, la passerelle
 * accepte 4 Go.
 *
 * EXPORTÉE (#5389) — `story-neuve-porte.ts` applique EXACTEMENT la même
 * règle sur son unique fichier ; la recopier y créerait la jumelle que le
 * § 3.2 interdit, divergente au premier type accepté ajouté ici.
 */
export const premierRefusDeFichier = (fichiers: readonly File[]): string | null => {
  for (const fichier of fichiers) {
    if (!isImageMimeType(fichier.type) && !isVideoMimeType(fichier.type)) return COMPOSER.mediasRefuse(fichier.name);
    if (fichier.size > OCTETS_MAX_PAR_MEDIA) return COMPOSER.mediasVolumineux(fichier.name);
  }
  return null;
};

/**
 * LA GARDE DE SOMME (revue #5390, défaut 2) — DISTINCTE de la garde
 * `Content-Length` posée plus bas sur `OCTETS_MAX_DE_LA_CHARGE` : celle-là
 * juge ce que le client ANNONCE, avant toute lecture ; celle-ci juge ce que
 * les fichiers VALIDES PÈSENT VRAIMENT (`File.size`), après lecture — une
 * sélection de dix fichiers légitimes à 50 Mo chacun (aucun ne déclenche
 * `premierRefusDeFichier`) reste une sélection qu'aucun usage réel n'atteint,
 * et que `OCTETS_MAX_PAR_PUBLICATION` (150 Mo) refuse au lieu de la relayer
 * en amont vers `televerseMediaDePost`.
 */
const depasseLaChargeTotale = (fichiers: readonly File[]): boolean =>
  fichiers.reduce((somme, fichier) => somme + fichier.size, 0) > OCTETS_MAX_PAR_PUBLICATION;

/** Relâche MEILLEUR EFFORT — un échec de relâchement ne doit jamais faire échouer la réponse déjà décidée. */
const relacheTout = async (ids: readonly string[], jeton: string, recuperer?: Recuperateur): Promise<void> => {
  await Promise.all(ids.map((id) => relacheMediaDePost({ jeton, id, recuperer })));
};

export const PUBLIE_DEPUIS_LE_COMPOSER = async (
  requete: Request,
  recuperer?: Recuperateur,
): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  /**
   * LA CHARGE SE MESURE AVANT D'ÊTRE LUE (revue #5390) — `formData()` met le
   * multipart ENTIER en mémoire, et TOUTES les gardes de cette porte (nombre,
   * type, taille) s'exécutent APRÈS lui. Un `Content-Length` au-dessus de ce
   * que les règles déclarées permettent (`OCTETS_MAX_DE_LA_CHARGE`) ne peut
   * appartenir à aucun lecteur légitime : on refuse sans lire un octet.
   *
   * LE DOCUMENT REPOSÉ EST VIDE, et il ne peut pas l'être autrement : rien
   * n'a été lu, donc il n'y a rien à reposer. La saisie n'est pas perdue pour
   * autant — le brouillon (`lib/realtime/composer.ts`) la tient en
   * `sessionStorage`, et la prochaine ARRIVÉE sur `/composer` (un GET, qui ne
   * porte pas `data-refuse`) la restitue. Différée d'un chargement, jamais
   * perdue.
   *
   * CE N'EST PAS UNE BORNE DE PROXY, et ça ne la remplace pas : un envoi en
   * transfert fragmenté n'annonce aucune longueur. Le routeur Traefik
   * `frontend-v3` ne porte aucun middleware `buffering` — suivi ouvert.
   */
  const longueurAnnoncee = Number(requete.headers.get('content-length') ?? '0');
  if (Number.isFinite(longueurAnnoncee) && longueurAnnoncee > OCTETS_MAX_DE_LA_CHARGE) {
    return rendu(
      documentDuComposer({
        format: FORMATS_SERVIS[0].cle,
        texte: '',
        humeur: null,
        audience: 'PUBLIC',
        langue: null,
        publie: false,
        erreur: null,
        refusDesMedias: COMPOSER.mediasCharge,
        tempsReel: moduleDuBrouillon(),
      }),
      413,
    );
  }

  const formulaire = await requete.formData().catch(() => null);
  if (formulaire === null) return versLeComposer(FORMATS_SERVIS[0].cle, false);

  const format = formatDemande(texteDe(formulaire, CHAMP_DU_FORMAT));
  const texte = texteDe(formulaire, CHAMPS_DU_COMPOSER.texte);
  const humeur = format === 'humeur' ? texteDe(formulaire, CHAMPS_DU_COMPOSER.humeur) : '';
  const audience = audienceDemandee(texteDe(formulaire, CHAMPS_DU_COMPOSER.audience));
  const fichiers = fichiersDuFormulaire(formulaire, format);
  const alts = altsDuFormulaire(formulaire, format);

  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion(CHEMIN);
  const lecteur = identite.genre === 'lecteur' ? identite.lecteur : null;

  const repose = ({
    erreur = null,
    refusDesMedias = null,
  }: {
    readonly erreur?: string | null;
    readonly refusDesMedias?: string | null;
  }): Response =>
    rendu(
      documentDuComposer({
        format,
        texte,
        humeur: humeur === '' ? null : humeur,
        audience,
        langue: langueRevendiquee(lecteur),
        publie: false,
        erreur,
        refusDesMedias,
        // LE MODULE PART AUSSI SUR UN REFUS, et c'est ce qui rend la règle 1
        // du brouillon utile plutôt que théorique : la saisie est reposée par
        // le SERVEUR, le module la voit dans un champ non vide, et ne
        // l'écrase pas par une version plus ancienne d'elle-même.
        tempsReel: moduleDuBrouillon(),
      }),
      422,
    );

  /**
   * LES GARDES DES MÉDIAS SE DISENT AVANT TOUT OCTET ENVOYÉ (#5390, § étape 4
   * de la spécification) : le nombre, PUIS le type/la taille de chacun. Un
   * fichier hors vocabulaire ne part NULLE PART — ni vers l'upload, ni vers
   * la publication (P3/P6 du plan de témoins).
   */
  if (fichiers.length > MAX_POST_MEDIA) return repose({ refusDesMedias: COMPOSER.mediasTrop(MAX_POST_MEDIA) });
  const refusDUnFichier = premierRefusDeFichier(fichiers);
  if (refusDUnFichier !== null) return repose({ refusDesMedias: refusDUnFichier });
  if (depasseLaChargeTotale(fichiers)) return repose({ refusDesMedias: COMPOSER.mediasChargeTrop });

  /**
   * RIEN À PUBLIER SE DIT ICI, PAS À LA PASSERELLE. `hasAnyContentCarrier`
   * refuserait la charge avec sa propre phrase ; l'aller-retour serait payé par
   * le lecteur pour apprendre ce que le document savait déjà. Une humeur SANS
   * texte est valide — l'emoji EST le contenu ; un texte sans humeur l'est
   * aussi ; UN MÉDIA SEUL L'EST TOUT AUTANT (#5390, P2) — un post média sans
   * légende n'est pas un post vide.
   */
  if (texte === '' && humeur === '' && fichiers.length === 0) return repose({ erreur: COMPOSER.vide });

  /**
   * LE TÉLÉVERSEMENT EST SÉQUENTIEL — un seul fichier en vol (borne mémoire
   * et 3G, § étape 4). Le PREMIER échec relâche les médias déjà réclamés
   * (P4) : aucun orphelin dont la porte a connaissance ne reste réclamable
   * par un autre lecteur, et la publication elle-même n'est jamais tentée
   * avec une liste `mediaIds` incomplète.
   */
  const mediaIds: string[] = [];
  // LA LÉGENDE SE ZIPPE AU MÊME RANG QUE LE FICHIER (#5390, revue — défaut
  // 3), JAMAIS À UN CHAMP NOMMÉ : `alts[i]` accompagne `fichiers[i]`, quel
  // que soit celui des dix champs `medias-alt` qui la portait. Une légende
  // vide (rang non décrit, ou rang au-delà de la sélection) ne pose AUCUNE
  // clé — `publie()` n'envoie `mediaAlt` que pour ce qui a été RÉELLEMENT
  // décrit.
  const mediaAlt: Record<string, string> = {};
  for (const [rang, fichier] of fichiers.entries()) {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const issue = await televerseMediaDePost({
      jeton,
      fichier: { nom: fichier.name, type: fichier.type, octets },
      recuperer,
    });
    if (issue.genre === 'refus') {
      await relacheTout(mediaIds, jeton, recuperer);
      return repose({ refusDesMedias: COMPOSER.mediasEchec });
    }
    mediaIds.push(issue.id);
    const alt = alts[rang];
    if (alt !== undefined && alt !== '') mediaAlt[issue.id] = alt;
  }

  const issue = await publie({
    jeton,
    type: format === 'humeur' ? 'STATUS' : 'POST',
    texte,
    visibility: audience,
    emoji: humeur === '' ? null : humeur,
    langue: langueRevendiquee(lecteur),
    mediaIds,
    mediaAlt,
    recuperer,
  });

  if (issue.genre === 'publie') return versLeComposer(format, true);
  if (issue.statut === 401) return versLaConnexion(CHEMIN);
  // LE REFUS DE LA PASSERELLE RELÂCHE AUSSI (P5) — un média déjà téléversé
  // pour une publication que la passerelle a refusée reste réclamable au
  // prochain essai, jamais orphelin en attente pour rien.
  await relacheTout(mediaIds, jeton, recuperer);
  return repose({ erreur: issue.message });
};
