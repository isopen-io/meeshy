import { CACHE_PRIVE, rendu, versLaConnexion } from '@/app/connecte/porte';
import { actifsTempsReel } from '@/lib/actifs-rt';
import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { moi, type Lecteur } from '@/lib/api/compte';
import { publie, type Recuperateur } from '@/lib/api/publication';
import {
  CHAMPS_DU_COMPOSER,
  CHAMP_DU_FORMAT,
  COMPOSER,
  estUnFormat,
  estUneAudience,
  FORMATS_SERVIS,
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

export const PUBLIE_DEPUIS_LE_COMPOSER = async (
  requete: Request,
  recuperer?: Recuperateur,
): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion(CHEMIN);

  const formulaire = await requete.formData().catch(() => null);
  if (formulaire === null) return versLeComposer(FORMATS_SERVIS[0].cle, false);

  const format = formatDemande(texteDe(formulaire, CHAMP_DU_FORMAT));
  const texte = texteDe(formulaire, CHAMPS_DU_COMPOSER.texte);
  const humeur = format === 'humeur' ? texteDe(formulaire, CHAMPS_DU_COMPOSER.humeur) : '';
  const audience = audienceDemandee(texteDe(formulaire, CHAMPS_DU_COMPOSER.audience));

  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return versLaConnexion(CHEMIN);
  const lecteur = identite.genre === 'lecteur' ? identite.lecteur : null;

  const repose = (erreur: string): Response =>
    rendu(
      documentDuComposer({
        format,
        texte,
        humeur: humeur === '' ? null : humeur,
        audience,
        langue: langueRevendiquee(lecteur),
        publie: false,
        erreur,
        // LE MODULE PART AUSSI SUR UN REFUS, et c'est ce qui rend la règle 1
        // du brouillon utile plutôt que théorique : la saisie est reposée par
        // le SERVEUR, le module la voit dans un champ non vide, et ne
        // l'écrase pas par une version plus ancienne d'elle-même.
        tempsReel: moduleDuBrouillon(),
      }),
      422,
    );

  /**
   * RIEN À PUBLIER SE DIT ICI, PAS À LA PASSERELLE. `hasAnyContentCarrier`
   * refuserait la charge avec sa propre phrase ; l'aller-retour serait payé par
   * le lecteur pour apprendre ce que le document savait déjà. Une humeur SANS
   * texte est valide — l'emoji EST le contenu ; un texte sans humeur l'est
   * aussi.
   */
  if (texte === '' && humeur === '') return repose(COMPOSER.vide);

  const issue = await publie({
    jeton,
    type: format === 'humeur' ? 'STATUS' : 'POST',
    texte,
    visibility: audience,
    emoji: humeur === '' ? null : humeur,
    langue: langueRevendiquee(lecteur),
    recuperer,
  });

  if (issue.genre === 'publie') return versLeComposer(format, true);
  if (issue.statut === 401) return versLaConnexion(CHEMIN);
  return repose(issue.message);
};
