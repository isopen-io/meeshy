/**
 * **Quel chiffré a le droit de voyager vers un appareil** — et pour quel
 * message.
 *
 * L'enveloppe de l'appareil (`Message.encryptedContent`) est la seule chose que
 * la NSE iOS sache déchiffrer : `applyBodyRewrites` remplace le corps de la
 * bannière par le clair quand `userInfo["encryptedContent"]` est non vide. Elle
 * est donc le MÉDIUM par lequel une conversation de bout en bout affiche quoi
 * que ce soit sur un écran verrouillé — et, pour la même raison, le médium par
 * lequel elle peut en afficher trop.
 *
 * ## Les deux moitiés de la règle
 *
 * 1. **Le régime** (#13114) — le seul chiffré qui voyage est l'enveloppe qu'un
 *    APPAREIL a scellée (`e2ee`), que la NSE ouvre avec ses propres clés. En
 *    `server` et `hybrid`, `encryptedContent` est le chiffré AU REPOS, sous la
 *    clé de conversation que seule la passerelle détient : il ne quitte pas le
 *    serveur, et aucun lecteur ne saurait l'ouvrir. Le mode se lit sur la LIGNE
 *    d'abord, celui de la conversation ne supplée qu'une ligne héritée qui n'en
 *    porte aucun — un message chiffré d'hier vit dans une conversation repassée
 *    en clair et reste chiffré à jamais (#12881).
 * 2. **La protection** (#17177) — `protectedPreview` a pour préséance
 *    *éphémère > vue unique > flouté > chiffré*. Dès qu'une protection de CYCLE
 *    DE VIE gagne, la passerelle compose un placeholder qui n'est PAS celui du
 *    chiffrement (`👁️ 🖼️`, `🌫️ 💬`, `🔥 🎵 5min`) — et la NSE, qui ne consulte
 *    pas `declaresProtection` avant de réécrire le corps, l'écrasait par le
 *    texte entier. Le même message en mode `server` est protégé : la fuite
 *    n'était pas une décision de produit, c'était une asymétrie de régime.
 *
 * > Leçon 275, dans le médium que cinq passes n'avaient pas compté : une
 * > protection de CONTENU se mesure sur tout ce que la charge TRANSPORTE. Le
 * > texte, la base du Prisme, le verrou, le FICHIER et la piste traduite ont
 * > chacun reçu leur garde (cycles 123 → 128) ; l'enveloppe n'en avait aucune,
 * > parce qu'elle ne compose aucune chaîne et ne transporte aucun fichier —
 * > **c'est la charge que le LECTEUR compose lui-même.**
 *
 * ## Pourquoi la garde relit les drapeaux CHEZ ELLE
 *
 * Elle ne prend pas un verdict de protection en paramètre : « une garde de
 * confidentialité se relit CHEZ ELLE, pas dans ses paramètres » — un paramètre
 * dont l'absence désactive une garde est un demi-correctif, et les appelants de
 * cette famille construisent chacun leur propre enregistrement de message.
 *
 * Le SECOND verrou, lui, est posé là où le champ part sur le fil
 * (`sanitizeNotificationInputs`) : il lit la clé qui DÉCLARE la protection,
 * comme le verrou du média (cycle 125).
 */

import { messageProtection, type MessageProtectionInput } from '@meeshy/shared/utils/message-protection';

import { isEndToEndMode } from '../messaging/e2eePlaintextAdmission';
import { ENCRYPTED_MESSAGE_LOC_KEY } from './notification-preview';

/**
 * Ce qu'il faut d'un message pour décider de son enveloppe : son chiffré, son
 * régime, et tout ce qui DÉCLARE une protection de cycle de vie.
 */
export type DeviceEnvelopeMessage = MessageProtectionInput & {
  readonly encryptedContent?: string | null;
  readonly encryptionMode?: string | null;
};

/**
 * L'enveloppe que la bannière de ce message a le droit de transporter, ou
 * `undefined` — la seule forme qui ne dise rien à la NSE.
 *
 * `conversationMode` n'est qu'un REPLI : la ligne décide quand elle porte son
 * propre mode.
 */
export function deviceEnvelopeForPush(
  message: DeviceEnvelopeMessage,
  conversationMode: string | null | undefined,
): string | undefined {
  if (!message.encryptedContent) return undefined;
  if (!isEndToEndMode(message.encryptionMode ?? conversationMode)) return undefined;

  const { ephemeral, viewOnce, blurred } = messageProtection(message);
  if (ephemeral || viewOnce || blurred) return undefined;

  return message.encryptedContent;
}

/**
 * Le SECOND verrou : cette clé de protection laisse-t-elle passer un chiffré ?
 *
 * Les quatre clés de protection ont un site de DÉFINITION unique
 * (`notification-preview.ts`), et tout producteur les en importe — y compris le
 * masque fail-closed du chemin d'édition, qui écrivait son littéral à la main.
 * La valeur est donc une DÉCLARATION, jamais un indice. Une clé de cycle de vie
 * retient l'enveloppe ; celle du CHIFFREMENT la laisse passer — c'est
 * précisément elle que la NSE est censée remplacer.
 *
 * Dire « `protectedPreview` est l'unique PRODUCTEUR » serait faux, et l'était
 * déjà quand ce lot l'a écrit : `messageMentions.ts` en compose un second. Ce
 * qui tient la garde n'est pas le nombre de producteurs, c'est que tous
 * nomment la même constante — le cliquet du lot le vérifie.
 *
 * Aucune clé ⇒ aucune protection déclarée ⇒ rien à retenir. Et une clé INCONNUE
 * retient : une porte de confidentialité échoue en montrant moins.
 */
export function envelopeSurvivesProtectionLock(notificationLocKey: string | null | undefined): boolean {
  const declared = notificationLocKey?.trim();
  return !declared || declared === ENCRYPTED_MESSAGE_LOC_KEY;
}
