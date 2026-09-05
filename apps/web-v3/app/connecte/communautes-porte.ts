import { origineEtrangere, refusDOrigine } from '@/app/provenance';
import { jetonDuLecteur } from '@/app/session';
import {
  communautesDuLecteur,
  conversationsDeLaCommunaute,
  creeUneCommunaute,
  type Communaute,
  type CommunauteACreer,
  type Recuperateur,
} from '@/lib/api/communautes';
import { COMMUNAUTES } from '@/lib/contenu/communautes';

import { espaceDemande } from './espace-vue';
import { CACHE_PRIVE, redirection, rendu } from './fil-porte';
import {
  CHAMPS_DE_LA_NOUVELLE_COMMUNAUTE,
  documentDesCommunautes,
  type Ouverte,
  type SaisieDeCommunaute,
} from './communautes-vue';
import { documentDePanne } from './vue';

/**
 * LA PORTE DE `/communities` — patron `appels-porte.ts` (consultation pure,
 * PAS de `/auth/me` : le méta d'une ligne vient déjà de la charge, § 2.1)
 * PLUS le verbe d'écriture de `liens-porte.ts` (`POST`, Post/Redirect/Get).
 *
 * DEUX APPELS AU PLUS, JAMAIS TROIS (T5). Le GET nu ne demande QUE la liste ;
 * `?ouverte=<id>` y ajoute UN second appel (`GET …/:id/conversations`) —
 * jamais un troisième pour le NOM de la communauté, tiré de la liste déjà en
 * main (`ouvertureDe`, ci-dessous).
 *
 * LES TROIS QUESTIONS SONT LES MÊMES QUE PARTOUT : un jeton ? la passerelle
 * l'accepte-t-elle ? a-t-elle répondu ? Un 401 renvoie se connecter, un
 * silence dessine la panne.
 */

const CHEMIN = '/communities';
const LIMITE = 20;

const versLaConnexion = (): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`,
      'cache-control': CACHE_PRIVE,
    },
  });

/** Même lecture que `curseurDeLURL` (`appels-porte.ts`) — absent, zéro (Q8 : un offset, pas un curseur opaque). */
const offsetDeLURL = (requete: Request): number => {
  const brut = Number(new URL(requete.url).searchParams.get('offset') ?? '0');
  return Number.isFinite(brut) && brut >= 0 ? brut : 0;
};

const ouverteDemandee = (requete: Request): string | null => new URL(requete.url).searchParams.get('ouverte');

const nouvelleDemandee = (requete: Request): boolean => new URL(requete.url).searchParams.has('nouvelle');

type IssueDOuverture = Ouverte | { readonly genre: 'session-expiree' } | { readonly genre: 'panne' };

/**
 * LE NOM ET LA PRIVATE D'UNE COMMUNAUTÉ OUVERTE viennent de la LISTE déjà
 * chargée (T5) : `GET /communities/:id/conversations` (§ 2.2) ne sert AUCUN
 * champ `name`. Si l'id demandé n'est pas sur la page COURANTE (lien profond
 * au-delà de la pagination), le repli `COMMUNAUTES.communauteSansNom` évite
 * un titre vide — un cas que `GET /communities` rend improbable : elle ne
 * sert que les communautés dont le lecteur est créateur ou membre, exactement
 * celles que `?ouverte=` peut atteindre sans 403/404.
 */
const ouvertureDe = async ({
  jeton,
  id,
  communautes,
  recuperer,
}: {
  readonly jeton: string;
  readonly id: string;
  readonly communautes: readonly Communaute[];
  readonly recuperer?: Recuperateur;
}): Promise<IssueDOuverture> => {
  const issue = await conversationsDeLaCommunaute({ jeton, id, recuperer });
  if (issue.genre === 'session-expiree') return { genre: 'session-expiree' };
  if (issue.genre === 'panne') return { genre: 'panne' };
  if (issue.genre === 'refus') return { genre: 'refus' };
  if (issue.genre === 'introuvable') return { genre: 'introuvable' };

  const trouvee = communautes.find((c) => c.id === id);
  return {
    genre: 'ouverte',
    nom: trouvee?.nom ?? COMMUNAUTES.communauteSansNom,
    conversations: issue.conversations,
  };
};

const sert = async ({
  jeton,
  requete,
  recuperer,
  nouvelle,
  saisie,
  motif,
  statut = 200,
}: {
  readonly jeton: string;
  readonly requete: Request;
  readonly recuperer?: Recuperateur;
  readonly nouvelle?: boolean;
  readonly saisie?: SaisieDeCommunaute;
  readonly motif?: string | null;
  readonly statut?: number;
}): Promise<Response> => {
  const liste = await communautesDuLecteur({ jeton, offset: offsetDeLURL(requete), limite: LIMITE, recuperer });
  if (liste.genre === 'session-expiree') return versLaConnexion();
  if (liste.genre === 'panne') return rendu(documentDePanne(), 503);

  const idOuverte = ouverteDemandee(requete);
  const ouverte =
    idOuverte === null
      ? null
      : await ouvertureDe({ jeton, id: idOuverte, communautes: liste.communautes, recuperer });
  if (ouverte?.genre === 'session-expiree') return versLaConnexion();
  if (ouverte?.genre === 'panne') return rendu(documentDePanne(), 503);

  return rendu(
    documentDesCommunautes({
      communautes: liste.communautes,
      suite: liste.suite,
      ouverte: ouverte ?? null,
      nouvelle: nouvelle ?? nouvelleDemandee(requete),
      motif: motif ?? null,
      saisie,
      espace: espaceDemande(requete),
      maintenant: Date.now(),
    }),
    statut,
  );
};

export const COMMUNAUTES_DU_LECTEUR = async (requete: Request, recuperer?: Recuperateur): Promise<Response> => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  return sert({ jeton, requete, recuperer });
};

const texte = (formulaire: FormData, nom: string): string => {
  const valeur = formulaire.get(nom);
  return typeof valeur === 'string' ? valeur.trim() : '';
};

const saisieSoumise = (formulaire: FormData): SaisieDeCommunaute => ({
  nom: texte(formulaire, CHAMPS_DE_LA_NOUVELLE_COMMUNAUTE.nom),
  description: texte(formulaire, CHAMPS_DE_LA_NOUVELLE_COMMUNAUTE.description),
  prive: formulaire.has(CHAMPS_DE_LA_NOUVELLE_COMMUNAUTE.prive),
});

/**
 * CRÉER LA COMMUNAUTÉ — Post/Redirect/Get, la garde d'origine avant tout
 * (patron `liens-porte.ts` › `CREE_UN_LIEN`).
 *
 * `motif` EST TOUJOURS UNE COPIE FRANÇAISE DÉCIDÉE ICI, jamais le message
 * anglais de la passerelle : `COMMUNAUTES.sansNom` si le lecteur n'a rien
 * tapé (refusé avant tout appel réseau — la passerelle le refuserait aussi,
 * `name: z.string().min(1)`, mais son message ne nommerait pas le bon champ),
 * `COMMUNAUTES.conflit` sur un 409. Le REFUS NE REDIRIGE PAS : rien n'a été
 * écrit, une redirection coûterait la saisie.
 */
export const CREE_UNE_COMMUNAUTE = async (
  requete: Request,
  recuperer?: Recuperateur,
  formulaireDeja?: FormData,
): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);

  const jeton = jetonDuLecteur(requete);
  if (jeton === null) return versLaConnexion();

  const formulaire = formulaireDeja ?? (await requete.formData().catch(() => null));
  if (formulaire === null) return redirection(`${CHEMIN}?nouvelle`, { 'cache-control': CACHE_PRIVE });

  const saisie = saisieSoumise(formulaire);
  if (saisie.nom === '') {
    return sert({ jeton, requete, recuperer, nouvelle: true, saisie, motif: COMMUNAUTES.sansNom, statut: 422 });
  }

  const champs: CommunauteACreer = {
    nom: saisie.nom,
    prive: saisie.prive,
    ...(saisie.description === '' ? {} : { description: saisie.description }),
  };

  const issue = await creeUneCommunaute({ jeton, champs, recuperer });
  if (issue.genre === 'session-expiree') return versLaConnexion();
  if (issue.genre === 'creee') return redirection(CHEMIN, { 'cache-control': CACHE_PRIVE });

  return sert({
    jeton,
    requete,
    recuperer,
    nouvelle: true,
    saisie,
    motif: issue.genre === 'conflit' ? COMMUNAUTES.conflit : COMMUNAUTES.echecCreation,
    statut: issue.genre === 'panne' ? 503 : 409,
  });
};
