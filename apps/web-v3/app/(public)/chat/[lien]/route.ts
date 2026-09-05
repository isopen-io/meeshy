import { moi } from '@/lib/api/compte';
import { AUCUNE_PRESENCE, fil, languesDuLecteur, type Fil } from '@/lib/api/fil';
import { cookieDEffacement, cookieDeSession, jetonDuCookie, jetonsDesCookies } from '@/lib/api/guest-session';
import {
  apercuDeJonction,
  placeDetenue,
  rafraichis,
  reconnais,
  rejoins,
  type ApercuDeJonction,
  type Droits,
  type Place,
  type Refus,
} from '@/lib/api/invite';
import { PARAMETRE_DE_JONCTION_FRAICHE } from '@/lib/contenu/droits';
import { FIL, raisonDeFermeture } from '@/lib/contenu/fil';

import {
  accuseCeQuiEstServi,
  ancreDemandee,
  CACHE_PRIVE,
  curseurDemande,
  pleinDemande,
  lisLeFormulaire,
  redirection,
  rendu,
  soumissionDuFil,
  tempsReelDuDocument,
  traiteLaSoumission,
} from '@/app/connecte/fil-porte';
import { adresseDeLaPorte, documentDuFil, type Composeur } from '@/app/connecte/fil-vue';
import { chargeLeProfilSiDemande, traiteLActionDeProfil } from '@/app/connecte/profil-porte';
import { documentDePanne } from '@/app/connecte/vue';
import { chargementSpeculatif, navigationEtrangere, origineEtrangere, refusDOrigine, sansEffet } from '@/app/provenance';
import { estSecurisee, jetonDuLecteur } from '@/app/session';

import {
  CHAMP_DE_LA_LANGUE,
  CHAMP_DE_LA_NAISSANCE,
  CHAMP_DU_COURRIEL,
  CHAMP_DU_PSEUDO,
  documentDuChoix,
  SAISIE_VIDE,
  type Saisie,
} from './choix-vue';
import { langueProposee } from './langue';
import { CHAMP_DE_L_ADHESION, documentDeLAdhesion, documentDuLienIntrouvable, documentDuRefusDuMembre } from './membre-vue';

/**
 * `/chat/:lien` — LA route de jonction ET de lecture de l'invité : une machine
 * à TROIS états, décidés par le SERVEUR d'après ce que le lecteur DÉTIENT
 * (conception § 12.3, directive du porteur 2026-09-01).
 *
 *   • MEMBRE — un jeton de compte (`meeshy_auth`) : le serveur JOINT le lecteur
 *     par la porte canonique `POST /links/:key/members` (`already-member`
 *     compris) et répond 302 vers `/chats/:cle`. Un lecteur connecté ne voit
 *     JAMAIS la modale — ni sur un lien clos avant tout choix, ni sur une
 *     jonction refusée (410, 409, 403, 404…) : il lit un document qui NOMME la
 *     raison et le ramène à ses conversations (`membre-vue.ts`). « Se
 *     connecter » et « Créer un compte » n'ont aucun sens pour lui. Le jeton
 *     est lu AVANT toute autre décision — y compris avant de regarder l'aperçu,
 *     qui, clos, rendait la modale sans avoir demandé qui lisait.
 *
 *     L'IDENTITÉ EST PROUVÉE AVANT TOUTE MUTATION. Un cookie `meeshy_auth` vit
 *     sept jours (`remise.ts`), un JWT vingt-quatre heures (`login.ts:168`) :
 *     un porteur peut présenter un jeton MORT. Or la porte de jonction est en
 *     `optionalAuth` : un `Bearer` illisible n'y vaut pas 401 mais un contexte
 *     NON authentifié (`middleware/auth.ts:494-515`, `:770-780`), dont
 *     `deriveLinkAdmissionIdentity` fait un VISITEUR (`link-admission.ts:
 *     101-108`) — la porte créait alors un invité FANTÔME au pseudo généré, en
 *     consommant une place, dont cette route jetait le `sessionToken` avant de
 *     mener le lecteur à `/login`. `GET /auth/me` (`moi`, `lib/api/compte.ts`)
 *     tranche donc d'abord, comme `/chats/:cle` le fait : un jeton qui ne vaut
 *     plus n'est pas un membre — le lecteur est ce qu'il détient d'autre (une
 *     place invitée, ou rien), et aucune porte n'est poussée en son nom. Une
 *     porte qui rendrait malgré tout une place INVITÉE à un porteur (le jeton
 *     mort entre les deux appels) est honorée pour ce qu'elle a servi — le
 *     cookie de la place, l'état INVITÉ —, jamais projetée sur le fil du membre.
 *
 *     UNE NAVIGATION NE JOINT QUE SI ELLE EST LE GESTE DU LECTEUR (`app/
 *     provenance.ts` › `navigationEtrangere`) : `meeshy_auth` est `SameSite=Lax`
 *     et part avec toute navigation de premier niveau, d'où qu'elle vienne. Un
 *     lien ouvert depuis WhatsApp, un favori, le retour de `/login` (`Sec-Fetch-
 *     Site: none` / `same-origin`) joignent en un saut, comme la directive le
 *     veut ; une navigation venue d'un autre site — ou d'un agent qui ne dit
 *     pas d'où — lit un document qui DEMANDE l'adhésion (`documentDeLAdhesion`,
 *     un bouton de 56 px qui POSTE ici), et c'est le POST, gardé par
 *     `origineEtrangere`, qui joint. Le choix de fond (l'adhésion sur une
 *     navigation, ou toujours un POST comme le legacy) reste au porteur
 *     (#4828) : ce défaut-ci est le choix SÛR en attendant.
 *   • INVITÉ — une session invitée VALIDE pour ce lien (le cookie que cette
 *     route a posé) : UNE `PATCH /guest-sessions/me` de re-validation au
 *     montage (§ 6.3.B), les droits que sa réponse SERT — l'instantané pris au
 *     join (`participant.permissions`, `link-admission.ts:554-577`) ; ce que
 *     l'hôte change ensuite arrive au module par `participant:rights-updated`,
 *     pas par ce battement —, puis le fil par le MÊME module de vue que le
 *     membre. 401 ⇒ la place n'existe plus (`isActive:false`, jamais une
 *     expiration temporelle) : le cookie s'efface — l'acte NOMMÉ de l'état F —
 *     et c'est l'état CHOIX qui est rendu, avec le pseudo à ressaisir ; JAMAIS
 *     une re-jonction silencieuse. 410 ⇒ le fil reste LU — la liste ne lit pas
 *     `isActive` —, la place se NOMME par la reconnaissance, aucun droit n'est
 *     rendu (rien n'a été relu), le composeur se ferme AVEC SA RAISON
 *     (état G). Et quand c'est la LISTE qui ferme la lecture (403
 *     `SHARE_LINK_EXPIRED` / `SHARE_LINK_MAX_USES` — le dernier admis d'un lien
 *     plein compris, `messages-list.ts:270-278`), c'est le même état G : la
 *     place tient, le composeur dit pourquoi, aucune carte « aucun message » ne
 *     prétend que le fil est vide.
 *   • CHOIX — rien : le CADRE du fil, inerte et flouté, et la modale. AUCUN
 *     message n'est chargé ni servi dans cet état, même si le lien autorise
 *     l'historique : rien ne part avant le choix.
 *
 * CE QUE LE LECTEUR DÉTIENT TRANCHE AVANT L'APERÇU (§ 6.3.B : « le jeton est
 * bon tant qu'il est bon »). L'aperçu (`GET /anonymous/link/:identifier`)
 * refuse 410 un lien inactif, échu ou PLEIN (`routes/anonymous.ts:602-613`) —
 * et un lien plein l'est PAR le dernier admis, dont la place est active. Le
 * battement, lui, ne connaît pas `maxUses` (`link-admission.ts:499-501`).
 * Laisser l'aperçu juger avant de regarder le cookie renvoyait donc à la
 * modale du visiteur un invité qui tenait sa place — le dernier admis dès sa
 * 303, tout invité revenu sur un lien devenu plein, tout invité d'un lien
 * fermé pendant sa lecture. Le 410 de l'aperçu ne porte aucun `linkId`, donc
 * le nom du cookie de CE lien n'est pas calculable : la route présente alors
 * chaque jeton invité que le navigateur porte (`jetonsDesCookies`) à la porte
 * qui sait dire s'il tient une place sur ce lien — `GET /links/:identifier`
 * (`retrieval.ts:196-197`), qui rend la clé canonique — et c'est le BATTEMENT
 * qui décide de l'état, jamais l'aperçu. Sans place reconnue, la modale CLOSE
 * ne dit que ce que la passerelle a servi : la raison, et le compte.
 *
 * POST distingue ses formulaires par leur CHAMP : `pseudo` rejoint (état
 * CHOIX → INVITÉ, puis 303 vers la même adresse avec `?bienvenue` pour que le
 * bandeau des droits s'ouvre — la vue `rights`), `texte` / `piece` envoie et
 * `reaction` bascule une réaction (état INVITÉ, Post/Redirect/Get vers la ligne
 * concernée). Un `pseudo` posté PAR QUI TIENT DÉJÀ UNE PLACE — double tap en
 * 3G, « renvoyer le formulaire ? » au retour arrière, rechargement de la 303 —
 * ne rejoint pas : la place existe, on y renvoie (303) ; seule une place MORTE
 * (401 de battement) laisse rejoindre, et le cookie mort est remplacé. Un
 * membre qui poste ici est joint et renvoyé vers l'interface connectée : il
 * n'écrit jamais dans `/chat/`. Il n'existe aucune route `/join` : un lien
 * reçu s'ouvre, se rejoint et se lit à UNE adresse.
 *
 * LA PROVENANCE EST GARDÉE (`app/provenance.ts`) : un préchargement ou un
 * prérendu (`Sec-Purpose: prefetch`) ne joint ni ne lit rien — 503 sans
 * corps, la navigation réelle repartira de zéro ; un formulaire soumis depuis
 * un autre site est refusé 403 avant tout appel.
 *
 * `:lien` est ce que le lecteur a en main — `linkId` ou `identifier` — ; la
 * place, elle, est rangée sous la `CleDeLien` que le SERVEUR rend (§ 6.3.E) :
 * c'est elle qui nomme le cookie, quelle que soit la forme de l'adresse. Un
 * lien que la passerelle ne connaît pas (404) n'est pas une panne : c'est une
 * page qui le dit, et qui ramène à l'accueil.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Contexte = { readonly params: Promise<{ lien: string }> };

const segmentDe = async (contexte: Contexte): Promise<string> => (await contexte.params).lien;

/**
 * L'adresse du VISITEUR, telle que le proxy qui précède la v3 l'a écrite —
 * `X-Real-IP` (Traefik), sinon le premier maillon de `X-Forwarded-For`. Relayée
 * à la porte de jonction, qui juge `allowedIpRanges` dessus ; sans elle, c'est
 * l'adresse de ce serveur que la passerelle jugerait (`lib/api/invite.ts`).
 */
const ipDuVisiteur = (requete: Request): string | undefined => {
  const reelle = requete.headers.get('x-real-ip')?.trim();
  if (reelle !== undefined && reelle !== '') return reelle;
  const relayee = requete.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return relayee === undefined || relayee === '' ? undefined : relayee;
};

const versLeFilDuMembre = (cle: string): Response =>
  new Response(null, {
    status: 302,
    headers: { location: `/chats/${encodeURIComponent(cle)}`, 'cache-control': CACHE_PRIVE },
  });

/** Le pseudo qu'un bandeau « reprendre ma place » rapporte (§ 6.3 état F) : pré-rempli, jamais soumis. */
const pseudoDemande = (requete: Request): string => new URL(requete.url).searchParams.get('pseudo')?.trim() ?? '';

const choix = ({
  requete,
  segment,
  apercu,
  saisie = { ...SAISIE_VIDE, pseudo: pseudoDemande(requete) },
  langueSaisie,
  refus = null,
  clos = null,
  statut = 200,
  entetes = {},
}: {
  readonly requete: Request;
  readonly segment: string;
  readonly apercu: ApercuDeJonction | null;
  readonly saisie?: Saisie;
  readonly langueSaisie?: string;
  readonly refus?: Refus | null;
  readonly clos?: string | null;
  readonly statut?: number;
  readonly entetes?: Readonly<Record<string, string>>;
}): Response => {
  const commun = {
    segment,
    langueProposee: langueProposee(requete.headers.get('accept-language'), apercu?.languesAutorisees ?? []),
    ...(langueSaisie === undefined ? {} : { langueSaisie }),
    saisie,
    refus,
    maintenant: Date.now(),
  };
  return rendu(
    documentDuChoix(
      apercu === null
        ? { ...commun, apercu: null, clos: clos ?? 'LINK_INACTIVE' }
        : { ...commun, apercu, clos },
    ),
    statut,
    entetes,
  );
};

/** La modale CLOSE — un lien que l'aperçu refuse, à qui ne tient aucune place dessus : la raison, et le compte. */
const close = (requete: Request, segment: string, code: string, entetes: Readonly<Record<string, string>> = {}): Response =>
  choix({ requete, segment, apercu: null, clos: code, statut: 410, entetes });

const FIL_VIDE = (id: string, titre: string): Fil => ({ id, titre, membres: 0, presence: AUCUNE_PRESENCE, messages: [], plusAncien: null });

/**
 * Le composeur, régi par ce que la passerelle a SERVI : un lien clos le ferme
 * pour de bon (`cause: 'lien'`) ; un droit retiré le ferme jusqu'à ce que l'hôte
 * le rende — en direct, sans rechargement (`cause: 'droit'`, `fil-vue.ts`).
 * Sans droit servi (battement 410), c'est toujours le lien qui ferme.
 */
const composeurDe = (droits: Droits | null, clos: string | null): Composeur => {
  if (clos !== null || droits === null) return { genre: 'ferme', raison: raisonDeFermeture(clos ?? 'LINK_DEACTIVATED'), cause: 'lien' };
  if (!droits.canSendMessages) return { genre: 'ferme', raison: raisonDeFermeture('DROIT_RETIRE'), cause: 'droit' };
  return { genre: 'ouvert' };
};

/**
 * QUI TIENT LA PLACE quand le battement REFUSE (410, état G) : sa réponse ne
 * nomme personne, et la liste ne sait pas quelles lignes sont celles du
 * lecteur sans son `Participant.id`. La reconnaissance (`GET /links/
 * :identifier?limit=1`, `retrieval.ts:248-262`) le nomme — elle a déjà été
 * consultée quand l'aperçu avait refusé ; elle ne l'est ICI que si la place
 * ne porte encore aucun occupant. Muette, elle ne ferme rien : le fil se lit
 * sans nom, jamais avec un nom vide.
 */
const occupantDeLaPlace = async ({ place, segment, jeton }: { readonly place: Place; readonly segment: string; readonly jeton: string }): Promise<Place['participant']> => {
  if (place.participant !== null) return place.participant;
  const issue = await reconnais({ identifiant: segment, jeton });
  return issue.genre === 'place' ? issue.place.participant : null;
};

/**
 * Ce qui est rendu quand la session s'avère MORTE (401) : la modale du CHOIX
 * quand l'aperçu a répondu, la modale CLOSE quand il a refusé — dans les deux
 * cas avec le cookie effacé, l'acte nommé de l'état F.
 */
type Repli = { readonly genre: 'choix'; readonly apercu: ApercuDeJonction } | { readonly genre: 'clos'; readonly code: string };

const repli = ({
  requete,
  segment,
  vers,
  lien,
}: {
  readonly requete: Request;
  readonly segment: string;
  readonly vers: Repli;
  readonly lien: Place['lien'];
}): Response => {
  const entetes = { 'set-cookie': cookieDEffacement({ lien, secure: estSecurisee(requete) }) };
  return vers.genre === 'choix' ? choix({ requete, segment, apercu: vers.apercu, entetes }) : close(requete, segment, vers.code, entetes);
};

/**
 * L'état INVITÉ, rendu : le fil de la conversation lu avec la session, les
 * droits relus, le composeur régi par eux. Un fil que la passerelle refuse au
 * nom du lien (403 `SHARE_LINK_*` sur la liste) reste un fil — vide, composeur
 * fermé avec SA raison — jamais une modale sous les yeux de qui lisait.
 */
const invite = async ({
  requete,
  segment,
  place,
  jeton,
  vers,
  erreur,
  brouillon,
  statut = 400,
}: {
  readonly requete: Request;
  readonly segment: string;
  readonly place: Place;
  readonly jeton: string;
  readonly vers: Repli;
  readonly erreur: string | null;
  readonly brouillon: string;
  readonly statut?: number;
}): Promise<Response> => {
  const battement = await rafraichis({ jeton });

  if (battement.genre === 'panne') return rendu(documentDePanne(), 503);
  if (battement.genre === 'invalide') return repli({ requete, segment, vers, lien: place.lien });

  // Un battement 410 ferme le COMPOSEUR, pas la LECTURE (état G, « contenu
  // conservé ») : la liste ne lit pas `isActive` et sert une place active d'un
  // lien fermé (`messages-list.ts`, gagé par `messages-routes.test.ts:854-885`).
  // Il ne sert aucun droit — aucun verdict ne se fabrique — ni aucun nom : la
  // place se NOMME par la reconnaissance.
  const clos = battement.genre === 'clos' ? battement.code : null;
  const participant =
    battement.genre === 'valide'
      ? { id: battement.participant.id, pseudo: battement.participant.pseudo, langue: battement.participant.langue }
      : await occupantDeLaPlace({ place, segment, jeton }).then((occupant) => (occupant === null ? null : { ...occupant, langue: null }));
  const droits: Droits | null = battement.genre === 'valide' ? battement.droits : null;
  const conversation =
    (battement.genre === 'valide' ? battement.conversation.id : null) ?? place.conversationId ?? segment;
  const titre = (battement.genre === 'valide' ? battement.conversation.titre : null) ?? place.nom ?? FIL.conversation;
  const langues = languesDuLecteur({ systemLanguage: participant?.langue ?? null });

  const plein = pleinDemande(requete);
  const issue = await fil({
    cle: conversation,
    creance: { genre: 'invite', jeton },
    moi: participant?.id ?? null,
    langues,
    avant: curseurDemande(requete),
    // La tranche que le lien d'un média nomme (§ 12.10.1) : sans elle, la pièce
    // d'un message ancien n'était dans aucune tranche servie, et le tap
    // n'ouvrait rien.
    autour: ancreDemandee(requete),
  });

  if (issue.genre === 'panne') return rendu(documentDePanne(), 503);
  if (issue.genre === 'session-expiree') return repli({ requete, segment, vers, lien: place.lien });

  const lu = issue.genre === 'fil' ? issue.fil : FIL_VIDE(conversation, titre);
  const bienvenue = new URL(requete.url).searchParams.has(PARAMETRE_DE_JONCTION_FRAICHE);
  const fermeture = issue.genre === 'lien-clos' ? issue.code : issue.genre === 'introuvable' ? 'INTROUVABLE' : clos;

  if (issue.genre === 'fil' && erreur === null) accuseCeQuiEstServi({ fil: lu, creance: { genre: 'invite', jeton }, plein });

  // `?profil=` (§ 12.10.3) — l'invité n'a AUCUN compte : la route du profil
  // n'est jamais présentée de jeton, donc jamais de `relation` autre que
  // `'none'`, et la vue ne rend aucune des trois actions (`peutAgir: false`,
  // porte `invite`).
  const profil = await chargeLeProfilSiDemande({ requete, jeton: null });

  return rendu(
    documentDuFil({
      porte: {
        genre: 'invite',
        lien: place.lien,
        segment,
        pseudo: participant?.pseudo ?? null,
        droits,
        jonctionFraiche: bienvenue,
      },
      fil: lu,
      lecteur: { id: participant?.id ?? null, nom: participant?.pseudo ?? '', langues },
      erreur,
      brouillon,
      maintenant: Date.now(),
      composeur: composeurDe(droits, fermeture),
      tempsReel: tempsReelDuDocument(),
      plein,
      profil,
    }),
    erreur === null ? 200 : statut,
  );
};

/**
 * L'état MEMBRE : jonction par la porte canonique, puis l'INTERFACE CONNECTÉE.
 * Un jeton que la passerelle ne reconnaît plus (401) n'est pas un membre : le
 * lecteur choisit, comme tout visiteur. TOUT AUTRE refus est un refus DU LIEN,
 * servi au membre comme tel — jamais la modale.
 */
const membre = async ({
  requete,
  segment,
  jeton,
  adhesion,
}: {
  readonly requete: Request;
  readonly segment: string;
  readonly jeton: string;
  /** La navigation est le geste du lecteur, ou le formulaire d'adhésion a été posté : la porte peut être poussée. */
  readonly adhesion: boolean;
}): Promise<Response | null> => {
  const identite = await moi({ jeton });
  if (identite.genre === 'panne') return rendu(documentDePanne(), 503);
  if (identite.genre === 'session-expiree') return null;

  const lu = await apercuDeJonction({ identifiant: segment });
  if (lu.genre === 'panne') return rendu(documentDePanne(), 503);
  if (lu.genre === 'introuvable') return rendu(documentDuLienIntrouvable(), 404);
  if (lu.genre === 'clos') return rendu(documentDuRefusDuMembre({ code: lu.code, message: null }), 410);

  const { apercu } = lu;
  if (!adhesion) return rendu(documentDeLAdhesion({ segment, nom: apercu.nom }));

  const jonction = await rejoins({
    cle: apercu.lien,
    langue: langueProposee(requete.headers.get('accept-language'), apercu.languesAutorisees),
    jeton,
    ipDuVisiteur: ipDuVisiteur(requete),
  });

  if (jonction.genre === 'panne') return rendu(documentDePanne(), 503);
  if (jonction.genre === 'membre') return versLeFilDuMembre(jonction.conversationId ?? apercu.conversationId ?? apercu.lien);
  if (jonction.genre === 'invite') {
    return redirection(`/chat/${encodeURIComponent(segment)}?${PARAMETRE_DE_JONCTION_FRAICHE}=1`, {
      'set-cookie': cookieDeSession({ lien: apercu.lien, jeton: jonction.jeton, secure: estSecurisee(requete) }),
    });
  }
  return rendu(documentDuRefusDuMembre({ code: jonction.code, message: jonction.message }), jonction.statut);
};

/**
 * OÙ EN EST L'INVITÉ — décidé d'après ce qu'il DÉTIENT, l'aperçu ne tranchant
 * que pour qui ne tient rien. Quand l'aperçu répond, sa clé nomme le cookie ;
 * quand il refuse, les jetons présentés sont reconnus par la passerelle.
 */
type Situation =
  | { readonly genre: 'panne' }
  | { readonly genre: 'introuvable' }
  | { readonly genre: 'choix'; readonly apercu: ApercuDeJonction }
  | { readonly genre: 'clos'; readonly code: string }
  | { readonly genre: 'invite'; readonly jeton: string; readonly place: Place; readonly vers: Repli };

const situeLInvite = async (requete: Request, segment: string): Promise<Situation> => {
  const cookie = requete.headers.get('cookie');
  const lu = await apercuDeJonction({ identifiant: segment });
  if (lu.genre === 'panne') return { genre: 'panne' };
  if (lu.genre === 'introuvable') return { genre: 'introuvable' };

  if (lu.genre === 'apercu') {
    const { apercu } = lu;
    const jeton = jetonDuCookie(cookie, apercu.lien);
    if (jeton === null) return { genre: 'choix', apercu };
    return {
      genre: 'invite',
      jeton,
      // L'aperçu ne nomme pas l'occupant d'une place : la reconnaissance le fera, si le battement refuse.
      place: { lien: apercu.lien, nom: apercu.nom, conversationId: apercu.conversationId, participant: null },
      vers: { genre: 'choix', apercu },
    };
  }

  const jetons = jetonsDesCookies(cookie);
  const detenue = jetons.length === 0 ? ({ genre: 'aucune' } as const) : await placeDetenue({ identifiant: segment, jetons });
  if (detenue.genre === 'panne') return { genre: 'panne' };
  if (detenue.genre === 'aucune') return { genre: 'clos', code: lu.code };
  return { genre: 'invite', jeton: detenue.jeton, place: detenue.place, vers: { genre: 'clos', code: lu.code } };
};

export const GET = async (requete: Request, contexte: Contexte): Promise<Response> => {
  if (chargementSpeculatif(requete)) return sansEffet();
  const segment = await segmentDe(contexte);
  const jetonDeCompte = jetonDuLecteur(requete);
  if (jetonDeCompte !== null) {
    const reponse = await membre({ requete, segment, jeton: jetonDeCompte, adhesion: !navigationEtrangere(requete) });
    if (reponse !== null) return reponse;
  }

  const situation = await situeLInvite(requete, segment);
  if (situation.genre === 'panne') return rendu(documentDePanne(), 503);
  if (situation.genre === 'introuvable') return rendu(documentDuLienIntrouvable(), 404);
  if (situation.genre === 'choix') return choix({ requete, segment, apercu: situation.apercu });
  if (situation.genre === 'clos') return close(requete, segment, situation.code);
  return invite({ requete, segment, place: situation.place, jeton: situation.jeton, vers: situation.vers, erreur: null, brouillon: '' });
};

const texteDe = (formulaire: FormData, nom: string): string => {
  const brut = formulaire.get(nom);
  return typeof brut === 'string' ? brut.trim() : '';
};

/** Une saisie vide n'est pas envoyée : c'est à la porte de dire ce qui manque, avec sa phrase. */
const ouRien = (valeur: string): string | undefined => (valeur === '' ? undefined : valeur);

const jonctionAnonyme = async ({
  requete,
  segment,
  apercu,
  formulaire,
  entetes = {},
}: {
  readonly requete: Request;
  readonly segment: string;
  readonly apercu: ApercuDeJonction;
  readonly formulaire: FormData;
  /** Ce que tout refus emporte avec lui — l'effacement d'une place morte, quand c'est le cas. */
  readonly entetes?: Readonly<Record<string, string>>;
}): Promise<Response> => {
  const saisie: Saisie = {
    pseudo: texteDe(formulaire, CHAMP_DU_PSEUDO),
    courriel: texteDe(formulaire, CHAMP_DU_COURRIEL),
    naissance: texteDe(formulaire, CHAMP_DE_LA_NAISSANCE),
  };
  const langueSaisie = texteDe(formulaire, CHAMP_DE_LA_LANGUE);
  const langue = langueSaisie !== '' ? langueSaisie : langueProposee(requete.headers.get('accept-language'), apercu.languesAutorisees);

  const jonction = await rejoins({
    cle: apercu.lien,
    pseudo: ouRien(saisie.pseudo),
    courriel: ouRien(saisie.courriel),
    naissance: ouRien(saisie.naissance),
    langue,
    ipDuVisiteur: ipDuVisiteur(requete),
  });

  if (jonction.genre === 'panne') return rendu(documentDePanne(), 503);
  if (jonction.genre === 'refus') {
    return choix({ requete, segment, apercu, saisie, langueSaisie: langue, refus: jonction, statut: jonction.statut, entetes });
  }
  if (jonction.genre === 'membre') return versLeFilDuMembre(jonction.conversationId ?? apercu.lien);

  return redirection(`/chat/${encodeURIComponent(segment)}?${PARAMETRE_DE_JONCTION_FRAICHE}=1`, {
    'set-cookie': cookieDeSession({ lien: apercu.lien, jeton: jonction.jeton, secure: estSecurisee(requete) }),
  });
};

/**
 * Un `pseudo` posté par qui tient DÉJÀ une place : la place est relue, jamais
 * recréée. Vivante ou close, on y renvoie — le GET dira l'état. Morte (401),
 * le cookie s'efface et, si l'aperçu répond encore, la jonction a lieu avec le
 * formulaire posté ; si le lien est clos, il ne reste que le compte.
 */
const rejonction = async ({
  requete,
  segment,
  situation,
  formulaire,
}: {
  readonly requete: Request;
  readonly segment: string;
  readonly situation: Extract<Situation, { readonly genre: 'invite' }>;
  readonly formulaire: FormData;
}): Promise<Response> => {
  const battement = await rafraichis({ jeton: situation.jeton });
  if (battement.genre === 'panne') return rendu(documentDePanne(), 503);
  if (battement.genre !== 'invalide') return redirection(`/chat/${encodeURIComponent(segment)}`);

  const entetes = { 'set-cookie': cookieDEffacement({ lien: situation.place.lien, secure: estSecurisee(requete) }) };
  if (situation.vers.genre === 'clos') return close(requete, segment, situation.vers.code, entetes);
  return jonctionAnonyme({ requete, segment, apercu: situation.vers.apercu, formulaire, entetes });
};

export const POST = async (requete: Request, contexte: Contexte): Promise<Response> => {
  if (origineEtrangere(requete)) return refusDOrigine(requete);
  const segment = await segmentDe(contexte);
  const jetonDeCompte = jetonDuLecteur(requete);
  if (jetonDeCompte !== null) {
    // Un POST est un geste — le formulaire d'adhésion (`CHAMP_DE_L_ADHESION`) comme tout autre formulaire posé ici.
    const reponse = await membre({ requete, segment, jeton: jetonDeCompte, adhesion: true });
    if (reponse !== null) return reponse;
  }

  const situation = await situeLInvite(requete, segment);
  if (situation.genre === 'panne') return rendu(documentDePanne(), 503);
  if (situation.genre === 'introuvable') return rendu(documentDuLienIntrouvable(), 404);
  if (situation.genre === 'clos') return close(requete, segment, situation.code);

  const formulaire = await lisLeFormulaire(requete);
  const jonctionDemandee = formulaire?.has(CHAMP_DU_PSEUDO) === true;
  // Le formulaire d'adhésion d'un membre posté par qui ne l'est PLUS (jeton mort entre les deux pages) : rien n'est
  // choisi ni envoyé — le GET de la même adresse dira l'état que le lecteur détient (Post/Redirect/Get).
  if (formulaire?.has(CHAMP_DE_L_ADHESION) === true && !jonctionDemandee) return redirection(`/chat/${encodeURIComponent(segment)}`);

  if (situation.genre === 'choix') {
    return formulaire !== null && jonctionDemandee
      ? jonctionAnonyme({ requete, segment, apercu: situation.apercu, formulaire })
      : choix({ requete, segment, apercu: situation.apercu });
  }

  if (formulaire !== null && jonctionDemandee) return rejonction({ requete, segment, situation, formulaire });

  const { place, jeton, vers } = situation;
  // Défense en profondeur (§ 12.10.3 point 5) : l'invité n'a aucun compte, la
  // vue ne rend donc aucun des trois formulaires d'action du profil — mais un
  // POST forgé à la main les présenterait quand même, et `jeton: null` (jamais
  // la session invitée, qui n'est pas un JWT) fait échouer les trois routes de
  // la passerelle avant même d'être tentées.
  const actionDeProfil = await traiteLActionDeProfil({
    formulaire,
    jeton: null,
    adresseHote: adresseDeLaPorte({ genre: 'invite', lien: place.lien, segment, pseudo: null, droits: null, jonctionFraiche: false }),
  });
  if (actionDeProfil !== null) return actionDeProfil;

  const soumission = soumissionDuFil(formulaire);
  if (soumission.genre === 'message' && soumission.texte === '' && soumission.fichiers.length === 0) {
    return invite({ requete, segment, place, jeton, vers, erreur: FIL.messageVide, brouillon: '' });
  }

  const battement = await rafraichis({ jeton });
  const conversation = (battement.genre === 'valide' ? battement.conversation.id : null) ?? place.conversationId ?? segment;
  const issue = await traiteLaSoumission({
    soumission,
    creance: { genre: 'invite', jeton },
    conversation,
    adresse: adresseDeLaPorte({ genre: 'invite', lien: place.lien, segment, pseudo: null, droits: null, jonctionFraiche: false }),
  });
  if (issue.genre === 'redirection') return redirection(issue.vers);
  return invite({ requete, segment, place, jeton, vers, erreur: issue.message, brouillon: issue.brouillon, statut: issue.statut });
};
