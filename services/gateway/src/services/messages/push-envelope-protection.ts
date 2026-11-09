/**
 * **La** question que l'enveloppe de l'appareil doit franchir avant de voyager :
 * ce message est-il protégé AUTREMENT que par son chiffrement ?
 *
 * `encryptedContent` est le seul champ de contenu que le second verrou du
 * cycle 125 (`notificationLocKey`) ne peut pas garder. En E2EE,
 * `protectedPreview` rend TOUJOURS un verdict — `isEncrypted` est vrai pour
 * toute ligne de la conversation — donc le verrou est toujours posé, et
 * l'enveloppe est précisément ce qui doit le traverser pour que « 🔒 💬 »
 * devienne le vrai texte chez le lecteur. Le garder par ce verrou tuerait la
 * feature ; ne pas le garder du tout laissait la fuite du cycle 151 (#17191) —
 * un message à VUE UNIQUE, ÉPHÉMÈRE ou FLOUTÉ en conversation chiffrée
 * affichait son texte ENTIER sur l'écran verrouillé, la NSE déchiffrant
 * l'enveloppe et SAUTANT la branche `notificationLocKey` douze lignes plus bas.
 *
 * Le discriminant juste est la PRÉSÉANCE que `protectedPreview` écrit déjà —
 * éphémère > vue unique > flouté > chiffré : l'enveloppe ne voyage que quand
 * `encrypted` est la SEULE protection.
 *
 * **Cette unité existe parce que la règle a DEUX verrous et doit rester UNE
 * loi** (#17195). Le premier est dans l'éventail (`deviceEnvelopeForPush`), qui
 * élit l'enveloppe depuis la ligne qu'il tient ; le second est au site unique
 * que les trois éventails traversent (`NotificationService.createNotification`),
 * qui la ré-affirme depuis la relecture VIVANTE. Deux expressions de la même
 * préséance auraient divergé au premier cycle qui en touche une — exactement
 * comme les trois éventails avant le cycle 127.
 *
 * `isEncrypted` n'est délibérément PAS interrogé : la question posée ici n'est
 * pas « ce message est-il protégé ? » (il l'est toujours, c'est l'hypothèse de
 * la branche) mais « l'est-il AUTREMENT ? ». Le passer rendrait le prédicat vrai
 * partout et retiendrait l'enveloppe pour tout le monde — le mode d'échec
 * silencieux du correctif.
 */

import { messageProtection } from '@meeshy/shared/utils/message-protection';

/**
 * Les cinq colonnes que la préséance interroge, telles que la BASE les porte.
 *
 * Toutes REQUISES, et c'est la garde : `null` reste permis, mais il s'ÉCRIT.
 * Un `Pick` de champs optionnels resterait optionnel, et
 * `protectedBeyondEncryption({ })` compilerait en rendant « ordinaire » — c'est
 * mot pour mot l'interdit du cycle 123 bis, « une garde de confidentialité se
 * relit CHEZ ELLE, pas dans ses paramètres : un paramètre dont l'absence
 * désactive une garde est un demi-correctif ».
 */
export type MessageProtectionRow = {
  readonly isViewOnce: boolean | null;
  readonly isBlurred: boolean | null;
  readonly effectFlags: number | null;
  readonly expiresAt: Date | null;
  readonly ephemeralDuration: number | null;
};

/**
 * Les colonnes que tout consommateur de la loi doit `select` — publiées pour la
 * raison que `MESSAGE_LIVENESS_SELECT` documente : **le `select` est la seule
 * des conditions qu'aucun témoin de verdict ne peut voir.** Un double Prisma
 * rend ce qu'on lui dit quel que soit le `select`, donc un témoin passe au vert
 * sur un site dont la requête ne ramène pas les colonnes, et la garde est morte
 * en production.
 */
export const MESSAGE_PROTECTION_SELECT = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  expiresAt: true,
  ephemeralDuration: true,
} as const;

/**
 * `true` ⇒ une protection PLUS FORTE que le chiffrement est posée : l'enveloppe
 * se retient.
 *
 * **Fail-CLOSED sur l'absence de ligne.** `null`/`undefined` dit « je n'ai pas
 * relu », jamais « ce message est ordinaire » : une relecture qui ne conclut pas
 * répond « protégé », comme les deux relectures d'édition du cycle 123 bis. Une
 * bannière appauvrie se rattrape — elle reste « 🔒 💬 », l'état d'avant #17080 ;
 * un secret poussé sur un écran verrouillé, non.
 *
 * C'est l'arbitrage INVERSE de `messageLivenessOf`, et les deux sont justes :
 * là c'est une LIVRAISON qui est en jeu (fail-OPEN sur l'absence de preuve),
 * ici c'est un SECRET.
 *
 * La loi partagée est APPELÉE plutôt que ses drapeaux relus, pour qu'un canal
 * de protection ajouté à `effectFlags` arrive ici sans qu'on y pense.
 */
export function protectedBeyondEncryption(
  row: MessageProtectionRow | null | undefined,
): boolean {
  if (!row) return true;
  const protection = messageProtection({
    isViewOnce: row.isViewOnce,
    isBlurred: row.isBlurred,
    effectFlags: row.effectFlags,
    expiresAt: row.expiresAt,
    ephemeralDuration: row.ephemeralDuration,
  });
  return protection.ephemeral || protection.viewOnce || protection.blurred;
}
