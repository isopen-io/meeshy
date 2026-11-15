/**
 * **Déduplication de REPLI : le même contenu, du même expéditeur, dans la même
 * conversation, à quelques secondes d'intervalle** (#6910).
 *
 * ### Ce que ce module garde, et pourquoi il ne suffit pas
 *
 * La déduplication NOMINALE est `(conversationId, clientMessageId)` — contrainte
 * unique partielle MongoDB, INSERT direct + rattrapage P2002 dans
 * `MessageProcessor`. Elle est correcte, et **elle fonctionne** : mesurée vivante
 * en production (`Idempotent dedup hit on clientMessageId`). Elle a un angle mort
 * unique, et c'est celui que ce module couvre : **un producteur qui REFABRIQUE sa
 * clé à chaque ré-émission.** La clé neuve ne peut par construction matcher
 * aucune ligne — la contrainte n'a rien à reconnaître, et une ligne de plus est
 * écrite.
 *
 * Mesuré en production le 2026-09-17 : sur les 28 groupes de messages dupliqués
 * des 7 derniers jours, **0 partageaient une clé et 28 en portaient une par
 * copie**. Le défaut est donc une RE-CLÉ, jamais un contournement de la garde.
 *
 * ### C'est un PALLIATIF, et il se dit tel
 *
 * Il ne corrige pas la cause (le client qui re-clé) : il empêche le symptôme
 * d'atteindre les utilisateurs pendant que la cause se traite, parce qu'un
 * correctif client iOS passe par l'App Store et met des jours à arriver. La
 * cause a sa propre issue.
 *
 * ### La fenêtre se choisit sur la MESURE, jamais au jugé
 *
 * Distribution des écarts entre deux messages de contenu identique (même
 * expéditeur, même conversation), 7 jours de production, 169 mesures :
 * **médiane 197 s, p75 7,9 h** — les gens répètent vraiment le même texte, et le
 * dédupliquer largement AVALERAIT des messages légitimes. Un palliatif qui
 * mange un vrai message est pire que le défaut qu'il corrige.
 *
 * Le gain s'aplatit vite, et le risque croît en face :
 *
 * | fenêtre | copies rattrapées (24 h) |
 * |---|---|
 * | 1 s | 14 |
 * | **2 s** | **17** |
 * | 5 s | 22 |
 * | 30 s | 28 |
 *
 * `2 s` retient les rafales — 3 à 5 copies en 75–100 ms, qu'aucun humain ne
 * produit — et reste loin de l'intervalle où répéter un texte redevient un
 * geste humain plausible.
 *
 * ### Un message fait UNIQUEMENT d'emojis ne se déduplique JAMAIS (#7985)
 *
 * Taper 😂 trois fois de suite est un geste humain voulu, et les clients ne
 * dédoublonnent plus par contenu (directive porteur 2026-09-25). Le filet
 * reste pour le TEXTE tant que la cause (#6915) n'est pas corrigée.
 *
 * ### Un contenu VIDE ne se déduplique JAMAIS
 *
 * Deux photos DISTINCTES portent toutes les deux `content: ''`. Les dédupliquer
 * entre elles ferait disparaître une vraie pièce jointe — exactement le défaut
 * que web-v2 a déjà rencontré et réglé par une signature de pièces
 * (`attachmentsSignatureOf`, #5668). Ici la réponse est plus simple et plus
 * sûre : **hors fenêtre d'éligibilité.** Un message sans texte est rendu à la
 * garde nominale `clientMessageId`, et à elle seule.
 */

import { isEmojiOnly } from '../../utils/emoji-only';

export const CONTENT_WINDOW_DEDUP_MS = 2000;

export type ContentWindowCandidate = {
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly attachmentIds?: readonly string[];
};

/**
 * Un candidat est ÉLIGIBLE au repli quand il porte du TEXTE et AUCUNE pièce
 * jointe. Pure, donc testable sans base — et c'est la moitié du module qui doit
 * l'être, la seconde n'étant qu'une requête.
 *
 * **Les deux exclusions disent la même chose** : ce repli ne compare QUE du
 * texte, il n'a donc le droit de conclure que sur un message dont le texte est
 * tout le contenu.
 *
 * - **Contenu vide** : deux photos distinctes portent toutes deux `content: ''`.
 * - **Pièces jointes présentes** : deux envois du même texte peuvent porter des
 *   médias DIFFÉRENTS — une légende répétée sur deux photos est un usage
 *   ordinaire, et les confondre ferait disparaître une vraie pièce jointe.
 *   C'est le défaut que web-v2 a déjà rencontré et réglé par une signature de
 *   pièces (`attachmentsSignatureOf`, #5668) ; ici la réponse sûre est de ne
 *   pas se prononcer. Un tableau VIDE n'est pas une pièce jointe.
 *
 * Un message écarté n'est pas moins gardé : il reste rendu à la déduplication
 * NOMINALE `clientMessageId`, qui, elle, ne se trompe jamais de message.
 */
export function isContentWindowDedupEligible(candidate: ContentWindowCandidate): boolean {
  if ((candidate.attachmentIds?.length ?? 0) > 0) return false;
  if (isEmojiOnly(candidate.content)) return false;
  return candidate.content.trim().length > 0;
}

/**
 * La requête est INJECTÉE, jamais écrite ici : un faux Prisma accepte
 * n'importe quelle forme, et seul `tsc` valide une requête. En la laissant à
 * `MessageProcessor` — qui la construit avec son `select` typé — la forme est
 * gardée par le compilateur là où elle est écrite, et ce module reste
 * décidable sans base.
 *
 * `since` est une BORNE BASSE : l'appelant cherche les messages créés À PARTIR
 * de cet instant.
 */
export type ContentWindowLookup<TMessage> = (args: {
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly since: Date;
}) => Promise<TMessage | null>;

/**
 * Rend le message IDENTIQUE déjà écrit dans la fenêtre, ou `null`.
 *
 * **Le contenu cherché est ROGNÉ**, parce que c'est sous cette forme que
 * `MessageProcessor` le STOCKE (`processedContent.trim()`). Chercher la forme
 * non rognée ne trouverait jamais rien dès que l'expéditeur laisse une espace
 * — une garde qui ne rougit nulle part et ne garde personne.
 *
 * **Ce repli RÉDUIT la fenêtre de collision, il ne la ferme pas.** La lecture
 * précède l'écriture sans être atomique : deux envois strictement concurrents
 * peuvent la franchir tous les deux, exactement comme le dit déjà le
 * commentaire du chemin `clientMessageId` à propos d'un `findUnique`
 * pré-INSERT. La fermer demanderait un index unique sur une empreinte du
 * contenu — ce qui ferait ÉCHOUER une répétition légitime au niveau de la
 * base, un prix qu'un palliatif n'a pas à faire payer. Les ré-émissions
 * mesurées sont séquentielles (même socket, 75 ms à 1,9 s d'écart) : elles
 * passent toutes par cette lecture.
 */
export async function findRecentIdenticalMessage<TMessage>(params: {
  readonly candidate: ContentWindowCandidate;
  readonly now: Date;
  readonly lookup: ContentWindowLookup<TMessage>;
  readonly windowMs?: number;
  readonly onError?: (error: unknown) => void;
}): Promise<TMessage | null> {
  const { candidate, now, lookup, windowMs = CONTENT_WINDOW_DEDUP_MS, onError } = params;

  if (!isContentWindowDedupEligible(candidate)) return null;

  try {
    return await lookup({
      conversationId: candidate.conversationId,
      senderId: candidate.senderId,
      content: candidate.content.trim(),
      since: new Date(now.getTime() - windowMs),
    });
  } catch (error) {
    // **FAIL-OPEN, et c'est l'arbitrage du dépôt, pas une commodité.** Un verdict
    // qui ne PROUVE rien ne conclut rien : ici la lecture n'a pas prouvé que le
    // message existe déjà, donc on le crée. Le pire cas est le défaut qu'on
    // corrige — un doublon — tandis qu'un fail-closed perdrait un message que
    // l'utilisateur a réellement envoyé. Un palliatif n'a pas le droit d'être
    // plus cher que ce qu'il soigne.
    onError?.(error);
    return null;
  }
}
