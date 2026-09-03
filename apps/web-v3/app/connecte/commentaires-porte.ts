import { jetonDuLecteur } from '@/app/session';
import { moi } from '@/lib/api/compte';
import {
  chargeDeLaStory,
  filDeLaPublication,
  publicationLue,
  type Recuperateur,
} from '@/lib/api/publication';

import {
  documentDesCommentaires,
  documentIndisponible,
  documentDInvitation,
} from './commentaires-vue';
import { rendu } from './fil-porte';
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

export const COMMENTAIRES_SERVIS = async ({
  requete,
  id,
  recuperer,
}: {
  readonly requete: Request;
  readonly id: string;
  readonly recuperer?: Recuperateur;
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
    }),
  );
};
