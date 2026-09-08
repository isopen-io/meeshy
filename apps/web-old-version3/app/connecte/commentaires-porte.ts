import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import { actifsTempsReel } from '@/lib/actifs-rt';
import { moi } from '@/lib/api/compte';
import {
  chargeDeLaStory,
  ecrisUnCommentaire,
  filDeLaPublication,
  publicationLue,
  type Recuperateur,
} from '@/lib/api/publication';
import { COMMENTAIRES } from '@/lib/contenu/commentaires';

import {
  documentDesCommentaires,
  documentIndisponible,
  documentDInvitation,
} from './commentaires-vue';
import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/post/:id`.
 *
 * SANS SESSION, UNE INVITATION — ET AUCUN APPEL. Les trois routes sont en
 * `requiredAuth` (décision du porteur du 2026-09-02 : la v3 s'y conforme, elle
 * ne demande pas leur ouverture). Un visiteur sans jeton ne déclenche donc RIEN :
 * ni post, ni commentaires. C'est la règle que `story` a posée — « le lecteur
 * qui ouvre un lien reçu doit savoir CE QU'IL OUVRE » —, et son corollaire :
 * rien du contenu ne part avant la connexion.
 *
 * L'INVITATION N'EST PAS UNE ERREUR, et pas non plus une redirection sèche vers
 * `/login`. Elle DIT ce qui attend derrière et porte `?returnUrl=`, pour que le
 * lien reçu ramène là où il menait.
 *
 * UN 404 EST « INTROUVABLE », JAMAIS UNE PANNE. C'est le refus que la passerelle
 * sert quand le lecteur n'a pas le droit de voir la publication — délibérément
 * indiscernable d'une publication absente, « distinguer révélerait l'existence
 * du post ». L'écran le rend tel quel, et le DIT : « supprimée, ou pas partagée
 * avec vous ; les deux se ressemblent, et c'est voulu ».
 *
 * DEUX APPELS, EN PARALLÈLE — plus l'identité. Le fil a besoin de savoir QUI
 * lit pour distinguer mes commentaires des autres ; sans elle, aucun n'est « à
 * moi », et l'écran n'offre aucun geste d'auteur plutôt que d'en offrir un que
 * la passerelle refuserait.
 */

/**
 * LE SOCLE DU MODULE (#5091) — `null` tant que l'actif compilé est absent : le
 * Post/Redirect/Get reste alors le seul chemin (§ 12.4). Même origine, aucune
 * passerelle côté navigateur.
 */
const moduleDeParticipation = (): { readonly module: string } | null => {
  const actifs = actifsTempsReel();
  if (actifs.commentaires.corps === '') return null;
  return { module: actifs.commentaires.url };
};

export const COMMENTAIRES_SERVIS = async ({
  requete,
  id,
  recuperer,
  refus,
}: {
  readonly requete: Request;
  readonly id: string;
  readonly recuperer?: Recuperateur;
  /** Le POST refusé re-sert l'écran par ici : la saisie TENUE et le motif dit. */
  readonly refus?: { readonly saisieTenue: string; readonly motif: string };
}): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);

  // AUCUN APPEL SANS JETON. Les trois portes refuseraient, et l'invitation se
  // rend sans rien demander à la passerelle.
  if (jeton === null) return rendu(documentDInvitation({ id }));

  const identite = await moi({ jeton, recuperer });
  if (identite.genre === 'session-expiree') return rendu(documentDInvitation({ id }));
  if (identite.genre === 'panne') return rendu(documentDePanne(), 503);

  const langues = [
    identite.lecteur.systemLanguage,
    identite.lecteur.regionalLanguage,
    identite.lecteur.customDestinationLanguage,
  ].filter((langue): langue is string => langue !== null);

  const [charge, fil] = await Promise.all([
    chargeDeLaStory({ id, jeton, recuperer }),
    filDeLaPublication({ id, jeton, langues, moiId: identite.lecteur.id, recuperer }),
  ]);

  if (charge.genre === 'session-expiree' || fil.genre === 'session-expiree') {
    return rendu(documentDInvitation({ id }));
  }
  if (charge.genre === 'introuvable' || fil.genre === 'introuvable') {
    return rendu(documentIndisponible(), 404);
  }
  if (charge.genre === 'panne' || fil.genre === 'panne') return rendu(documentDePanne(), 503);

  // `?lang=` est un GESTE sur la publication — la « variante de partage
  // délibéré » du § 5.4 —, pas un réglage : il ne descend pas au fil.
  const langueDemandee = new URL(requete.url).searchParams.get('lang');
  const publication = publicationLue({ brut: charge.brut, langues, langueDemandee });

  // Un genre que cet écran ne sert pas (un STATUS, une humeur d'une heure) est
  // INTROUVABLE, jamais une panne : la publication existe, cet écran n'est
  // simplement pas le sien.
  if (publication === null) return rendu(documentIndisponible(), 404);

  return rendu(
    documentDesCommentaires({
      publication,
      commentaires: fil.commentaires,
      encore: fil.encore,
      maintenant: Date.now(),
      avis: new URL(requete.url).searchParams.has(TEMOIN_DU_COMMENTAIRE) ? 'commente' : null,
      saisieTenue: refus?.saisieTenue,
      motif: refus?.motif ?? null,
      tempsReel: moduleDeParticipation(),
    }),
  );
};

/**
 * `?commente` est posé par la REDIRECTION du POST, jamais par le lecteur :
 * c'est le Post/Redirect/Get qui porte le compte rendu — un rechargement ne
 * republie rien.
 */
const TEMOIN_DU_COMMENTAIRE = 'commente';

/**
 * LE POST DE `/post/:id` (#5091) — écrire un commentaire, le chemin pauvre.
 *
 * L'ORIGINE D'ABORD (la garde des autres surfaces d'écriture, jamais une
 * jumelle) ; SANS JETON, L'INVITATION (le même verdict que le GET — un POST
 * anonyme ne déclenche rien) ; un contenu VIDE est refusé ICI, sans appel :
 * la passerelle accepte un commentaire média-seul, mais cet écran ne sert que
 * du texte, et poster du vide serait un geste sans dire.
 *
 * UN REFUS RE-SERT L'ÉCRAN, saisie TENUE et motif dit — perdre un texte tapé
 * est le défaut le plus cher d'un formulaire. Le succès REDIRIGE (`?commente`) :
 * le commentaire est dans la liste re-servie, et l'avis le dit.
 */
export const COMMENTAIRE_POSTE = async ({
  requete,
  id,
  recuperer,
}: {
  readonly requete: Request;
  readonly id: string;
  readonly recuperer?: Recuperateur;
}): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return rendu(documentDInvitation({ id }));

  const saisie = await requete.formData().catch(() => null);
  const contenu = (saisie?.get('contenu') ?? '').toString().trim();
  if (contenu === '') {
    return COMMENTAIRES_SERVIS({ requete, id, recuperer, refus: { saisieTenue: '', motif: COMMENTAIRES.videRefuse } });
  }

  const issue = await ecrisUnCommentaire({ id, contenu, jeton, recuperer });
  if (issue === 'session-expiree') return rendu(documentDInvitation({ id }));
  if (issue === 'faite') {
    return redirection(`/post/${encodeURIComponent(id)}?${TEMOIN_DU_COMMENTAIRE}`, { 'cache-control': CACHE_PRIVE });
  }
  return COMMENTAIRES_SERVIS({
    requete,
    id,
    recuperer,
    refus: { saisieTenue: contenu, motif: COMMENTAIRES.refuse },
  });
};
