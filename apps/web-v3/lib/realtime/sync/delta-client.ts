import type { MessageServi } from '@/app/(public)/chats/[lien]/fil-modele';
import {
  enTetesDeLaPlace,
  messagesDepuis,
  verdictDeLaReponse,
  type AppelDeLaPlace,
  type Verdict,
} from '@/lib/api/messagerie';
import {
  baseDeLaPasserelle,
  champ,
  cheminDeLaPasserelle,
  donneeDe,
  objet,
  recupere,
  texte,
} from '@/lib/api/passerelle';

/**
 * LE RATTRAPAGE — `GET /sync`, la porte que `apps/web` n'appelle NULLE PART
 * (§ 2, ligne « Delta / rattrapage » : grep vérifié, zéro appelant, pendant que
 * le web réimplémente deux moteurs plus pauvres).
 *
 * Elle existe côté serveur, elle est déjà `allowAnonymous: true`
 * (`services/gateway/src/routes/sync.ts`), et elle porte l'ETag/304 ainsi que
 * le curseur keyset. Il n'y a donc RIEN à construire côté passerelle pour
 * l'invité : ce module est le seul maillon qui manquait.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * `hasGap` NE SE LÈVERA JAMAIS POUR UN INVITÉ — et le dire est la moitié du
 * travail de ce module
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ce doc-comment vendait `hasGap` comme LA raison d'appeler `/sync`. C'est faux
 * pour l'unique audience de cet écran, et mesurément :
 *
 *   `hasGap = seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD`
 *   (`routes/sync/index.ts`), où `checkpointSeq` vaut **0 en dur** pour une
 *   identité anonyme (« Une session anonyme n'a pas de curseur à lire » :
 *   `UserEventSeq` est indexée par `User.id`, un `Participant.id` n'y désigne
 *   rien) et `GAP_THRESHOLD = 10_000`. Il faudrait donc `seq < -10000` là où
 *   `syncQuerySchema` borne `seq` à `nonnegative` — et ce client n'envoie
 *   d'ailleurs aucun `seq`, ce qui rend la condition fausse une seconde fois.
 *
 * Le drapeau reste LU (un membre connecté le lèvera un jour, et le taire serait
 * le défaut inverse), mais il n'est plus le mécanisme sur lequel le séparateur
 * du § 7 repose. Ce qui le lève pour un invité, c'est la TRONCATURE — voir
 * ci-dessous. Donner un curseur de séquence aux sessions anonymes est une issue
 * HORS-WEB (`gw:seq-anonyme`), déclarée dans `e2e/visual/lib/lifecycle.ts`
 * (cas `D-hasGap`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA TRONCATURE EST LE VRAI TROU, ET ELLE SE PAGINE AVANT DE SE PEINDRE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `/sync` borne une page à 1000 lignes ET à 512 Ko (`routes/sync/budget.ts`).
 * Au-delà, elle rend `truncated: true` + `nextCursor`, et — c'est le point qui
 * compte — elle NE FAIT PAS AVANCER le checkpoint
 * (`checkpoint: coveredTheWindow ? checkpoint : sinceDate`). Un client qui
 * ignorerait `hasMore` rangerait donc un watermark INCHANGÉ et redemanderait
 * éternellement la même première page : un trou réel dans le fil, jamais
 * paginé, et — `hasGap` étant mort — jamais signalé.
 *
 * Ce module suit donc le curseur tant que la passerelle en donne un, dans la
 * limite de `PLAFOND_DE_TOURS`. Ce qu'il n'a pas réussi à couvrir dans ces
 * tours-là est une lacune HONNÊTE : le séparateur se peint parce qu'il manque
 * vraiment quelque chose, pas parce qu'un drapeau l'a dit.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE SOCKET NE SUFFIT PAS, ET POURQUOI CE N'EST PAS UNE OPTION
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le socket ne REJOUE pas ce qui s'est dit pendant une absence (§ 7, ligne
 * « socket tombée 30 s – 5 min »). Un onglet qui revient d'arrière-plan après
 * dix minutes a donc un trou, et un écran qui se contenterait de rebrancher son
 * transport afficherait une conversation dont il manque le milieu — sans le
 * dire. C'est le cas C de la recette du § 6.5 : « le premier message reçu
 * pendant l'absence apparaît ».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE WATERMARK, ET POURQUOI ON RELIT PARFOIS DEUX FOIS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `checkpoint` est un WATERMARK que le client renvoie en `since` au tour
 * suivant, et la passerelle le RECULE volontairement de `SYNC_CHECKPOINT_LAG_MS`
 * (`routes/sync/index.ts`) : la fenêtre ne saute jamais une mise à jour réelle,
 * au pire elle en relit. La déduplication est donc à la charge du client, par
 * `id` — c'est `filAPeindre` qui la tient, et c'est la seule direction sûre.
 */

const CHEMIN = cheminDeLaPasserelle('/sync');

export type Rattrapage = {
  /** Ce qui est apparu ou a changé depuis le watermark, déjà projeté. */
  readonly messages: readonly MessageServi[];
  /** Le watermark du tour SUIVANT — `null` quand la réponse ne l'a pas dit. */
  readonly curseur: string | null;
  /**
   * Le trou. `true` ⇒ la fenêtre demandée n'a pas pu être servie ENTIÈREMENT,
   * et l'écran peint le séparateur « des messages manquent ici » (§ 7).
   * L'inventer serait faire douter d'un fil complet ; le taire serait afficher
   * une conversation à trous sans le dire.
   *
   * DEUX causes, et une seule est atteignable par un invité aujourd'hui :
   * la TRONCATURE non résorbée en `PLAFOND_DE_TOURS` tours (nominale), et le
   * gap de SÉQUENCE `hasGap` (structurellement faux pour une session anonyme —
   * voir le doc-comment du module).
   */
  readonly lacune: boolean;
};

/**
 * Combien de pages le rattrapage suit avant de déclarer une lacune.
 *
 * Il en faut un : `nextCursor` est produit par le serveur, et une boucle qui le
 * suivrait sans borne rendrait un rattrapage non borné en temps sur un
 * téléphone en 3G — c'est-à-dire l'inverse du geste (« revenir d'absence et
 * revoir sa conversation »). Cinq tours couvrent 5 000 messages ou 2,5 Mo de
 * JSON : au-delà, un fil rendu incomplet AVEC son séparateur est meilleur qu'un
 * écran qui charge indéfiniment.
 */
export const PLAFOND_DE_TOURS = 5;

type Tour = {
  readonly messages: readonly MessageServi[];
  readonly checkpoint: string | null;
  readonly curseurSuivant: string | null;
  /** `truncated` sur au moins une collection : la fenêtre n'est pas couverte. */
  readonly encore: boolean;
  readonly gapDeSequence: boolean;
};

const collectionDesMessages = (donnee: object): unknown[] => {
  const collections = objet(champ(donnee, 'collections'));
  const messages = collections === null ? null : objet(champ(collections, 'messages'));
  if (messages === null) return [];

  const ajoutes = champ(messages, 'added');
  const modifies = champ(messages, 'modified');

  return [
    ...(Array.isArray(ajoutes) ? ajoutes : []),
    ...(Array.isArray(modifies) ? modifies : []),
  ];
};

/**
 * `since` est OBLIGATOIRE côté passerelle (`syncQuerySchema`, `z.string().datetime()`)
 * : un premier rattrapage sans watermark en fabrique un depuis l'instant de
 * chargement plutôt que d'omettre le paramètre — omettre rendrait 400, et un
 * 400 se lit ici en « indisponible », c'est-à-dire en silence.
 */
const litUnTour = async ({
  conversationId,
  participantId,
  depuis,
  curseur,
  jeton,
  identite,
  base,
  recuperer,
}: AppelDeLaPlace & {
  readonly conversationId: string;
  readonly participantId: string;
  readonly depuis: string;
  readonly curseur: string | null;
}): Promise<Verdict<Tour>> => {
  const requete = new URLSearchParams({
    since: depuis,
    collections: 'messages',
    scope: conversationId,
    ...(curseur === null ? {} : { cursor: curseur }),
  });

  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN}?${requete.toString()}`,
    { method: 'GET', headers: enTetesDeLaPlace({ jeton, identite }) },
    recuperer,
  ).catch(() => null);

  return verdictDeLaReponse(reponse, async (servie) => {
    const donnee = await donneeDe(servie);
    if (donnee === null) return null;

    return {
      messages: messagesDepuis(collectionDesMessages(donnee), participantId),
      checkpoint: texte(champ(donnee, 'checkpoint')),
      curseurSuivant: texte(champ(donnee, 'nextCursor')),
      encore: champ(donnee, 'hasMore') === true,
      gapDeSequence: champ(donnee, 'hasGap') === true,
    };
  });
};

export const rattrape = async ({
  conversationId,
  participantId,
  depuis,
  jeton,
  identite,
  base,
  recuperer,
}: AppelDeLaPlace & {
  readonly conversationId: string;
  readonly participantId: string;
  readonly depuis: string;
}): Promise<Verdict<Rattrapage>> => {
  const recoltes: MessageServi[] = [];
  let curseur: string | null = null;
  let checkpoint: string | null = null;

  for (let tour = 0; tour < PLAFOND_DE_TOURS; tour += 1) {
    const verdict = await litUnTour({
      conversationId,
      participantId,
      depuis,
      curseur,
      jeton,
      identite,
      base,
      recuperer,
    });

    /**
     * Une coupure au DEUXIÈME tour n'annule pas le premier : ce qui est déjà
     * lu est servi, et la fenêtre non couverte se DIT. Rendre `indisponible`
     * ici jetterait des messages qu'on tient déjà, et le curseur ne bougerait
     * pas — donc rien ne serait perdu DÉFINITIVEMENT, mais l'écran resterait
     * muet sur un trou qu'il connaît.
     */
    if (verdict.etat !== 'servi') {
      if (tour === 0) return verdict;
      return { etat: 'servi', valeur: { messages: recoltes, curseur: checkpoint, lacune: true } };
    }

    const page = verdict.valeur;
    recoltes.push(...page.messages);
    checkpoint = page.checkpoint;

    if (page.gapDeSequence) {
      return { etat: 'servi', valeur: { messages: recoltes, curseur: checkpoint, lacune: true } };
    }
    if (!page.encore) {
      return { etat: 'servi', valeur: { messages: recoltes, curseur: checkpoint, lacune: false } };
    }
    /**
     * `hasMore` sans `nextCursor` : la passerelle dit qu'il reste quelque chose
     * et ne dit pas où. Insister redemanderait la MÊME page — c'est la boucle
     * infinie que `truncated` + curseur inchangé produit —, donc on s'arrête et
     * on peint le trou.
     */
    if (page.curseurSuivant === null) break;
    curseur = page.curseurSuivant;
  }

  return { etat: 'servi', valeur: { messages: recoltes, curseur: checkpoint, lacune: true } };
};
