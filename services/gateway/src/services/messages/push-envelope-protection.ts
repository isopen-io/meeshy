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
import { isEndToEndMode } from '../messaging/e2eePlaintextAdmission';

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

/**
 * La ligne de protection telle qu'une relecture la rend — `null` quand il n'y a
 * PAS de ligne.
 *
 * Les deux états sont la garde : une ligne lue porte la vérité de la base, une
 * ligne absente dit « je n'ai pas relu », et `protectedBeyondEncryption` les
 * arbitre à l'opposé. Aplatir les cinq colonnes dans le type de la source
 * aurait confondu les deux — un objet tout-à-`null` se lit « ordinaire »,
 * c'est-à-dire le fail-OPEN exact qu'on refuse.
 */
export function messageProtectionRow(
  row: Partial<MessageProtectionRow> | null | undefined,
): MessageProtectionRow | null {
  if (!row) return null;
  return {
    isViewOnce: row.isViewOnce ?? null,
    isBlurred: row.isBlurred ?? null,
    effectFlags: row.effectFlags ?? null,
    expiresAt: row.expiresAt ?? null,
    ephemeralDuration: row.ephemeralDuration ?? null,
  };
}

/**
 * Le contexte de notification DÉBARRASSÉ de son enveloppe quand la protection
 * relue l'interdit — UNE application de la loi, dont le fil push et la ligne
 * PERSISTÉE sont deux projections.
 *
 * C'est la forme du cycle 123, et pour la raison qu'il a mesurée : le corps
 * servi et les champs du fil venaient de deux résolutions parallèles, gardées
 * différemment, si bien qu'une bannière affichait son placeholder pendant que
 * la charge transportait à côté le secret du texte masqué. Garder le seul
 * `data` push aurait rejoué ce défaut d'un cran — `NotificationContext` est
 * PERSISTÉ **et servi sur `notification:new`**, donc l'enveloppe d'un message à
 * vue unique serait restée déchiffrable par tout client in-app.
 *
 * > **Une protection de contenu se mesure sur tout ce que la charge
 * > TRANSPORTE, jamais sur sa seule projection la plus visible.**
 */
export function envelopeAwareContext<T extends { readonly encryptedContent?: string }>(
  context: T,
  row: MessageProtectionRow | null | undefined,
): T {
  if (!protectedBeyondEncryption(row)) return context;
  if (context.encryptedContent === undefined) return context;
  return { ...context, encryptedContent: undefined };
}

/**
 * #13114 — le seul chiffré qui voyage sur le fil push est l'enveloppe qu'un
 * APPAREIL a scellée (`e2ee`), que la NSE ouvre avec ses propres clés. En
 * `server` et `hybrid`, `encryptedContent` est le chiffré AU REPOS, sous la clé
 * de conversation que seule la passerelle détient : il ne quitte pas le
 * serveur. Le mode de la LIGNE décide, celui de la conversation ne supplée
 * qu'une ligne héritée qui n'en porte aucun.
 *
 * #17191 — et le MODE ne suffisait pas. Cette enveloppe est du CONTENU : la NSE
 * la déchiffre et REMPLACE le corps de la bannière (`applyBodyRewrites`), en
 * posant `didDecrypt` qui saute la branche `notificationLocKey` douze lignes
 * plus bas. Un message à VUE UNIQUE / ÉPHÉMÈRE / FLOUTÉ en conversation
 * chiffrée affichait donc son texte ENTIER sur l'écran verrouillé, sous une
 * bannière que la passerelle venait de composer en « 👁️ 💬 ».
 *
 * **Pourquoi le SECOND VERROU du cycle 125 ne pouvait pas garder ce champ.** En
 * E2EE, `protectedPreview` rend toujours un verdict (`isEncrypted` est vrai
 * pour toute ligne de la conversation), donc `notificationLocKey` est TOUJOURS
 * posé — et l'enveloppe est précisément ce qui doit traverser ce verrou pour
 * que « 🔒 💬 » devienne le vrai texte chez le lecteur. Les quatre sites qui
 * s'en servent (`pushMediaFields`, `contentDetailPushFields`,
 * `prePersistedMessageFields`, `previewPrismSource`) retiennent leur charge
 * sans dommage ; ici le même verrou tuerait la feature.
 *
 * Le discriminant n'est donc pas « y a-t-il un verrou ? » mais **« la
 * protection posée est-elle PLUS FORTE que le chiffrement ? »** — la préséance
 * que `protectedPreview` écrit déjà : éphémère > vue unique > flouté > chiffré.
 * L'enveloppe ne voyage que quand `encrypted` est la SEULE protection.
 *
 * `isEncrypted` n'est délibérément PAS interrogé par cette loi : la question
 * posée ici n'est pas « ce message est-il protégé ? » (il l'est toujours, c'est
 * l'hypothèse) mais « l'est-il AUTREMENT que par son chiffrement ? ». La loi
 * partagée est appelée plutôt que ses drapeaux relus, pour qu'un canal de
 * protection ajouté à `effectFlags` arrive ici sans qu'on y pense.
 *
 * **Les cinq champs de protection sont REQUIS, et c'est la garde elle-même.**
 * Ils l'étaient d'abord par un `Pick<FanOutMessage, …>` — or `FanOutMessage` les
 * déclare tous optionnels, et un `Pick` de champs optionnels reste optionnel :
 * `deviceEnvelopeForPush({ encryptedContent, encryptionMode }, 'e2ee')`
 * COMPILAIT et rendait l'enveloppe d'un message à vue unique. C'est mot pour mot
 * l'interdit du cycle 123 bis — « une garde de confidentialité se relit CHEZ
 * ELLE, pas dans ses paramètres : un paramètre dont l'absence désactive une
 * garde est un demi-correctif ».
 *
 * Aucun appelant du dépôt ne la désarmait (les deux producteurs de fan-out
 * remettent la ligne Prisma entière, qui porte les cinq colonnes) : c'était un
 * PIÈGE ARMÉ, pas une panne — et le dépôt ne laisse pas un piège armé au motif
 * que personne n'a encore marché dessus (cycle 84). Un type pur ne peut pas
 * relire la base ; ce qu'il peut, c'est refuser de compiler quand l'appelant ne
 * s'est pas prononcé. `null` reste permis, mais il s'ÉCRIT.
 *
 * Le second verrou — ré-affirmer la protection depuis la relecture VIVANTE que
 * les trois créateurs font déjà — est POSÉ depuis #17195 : il vit au site unique
 * que les trois éventails traversent (`NotificationService.createNotification`,
 * paramètre `liveProtection`) et partage `protectedBeyondEncryption` ci-dessus.
 * Les cinq champs requis ci-dessous restent la garde du PREMIER verrou ; ils ne
 * sont plus la seule.
 *
 * **Cette fonction a REJOINT ce module avec #17195.** Elle vivait dans
 * `messageNotificationFanOut.ts`, qui a franchi le seuil de 1 000 lignes avec
 * ce lot — et la directive interdit d'ajouter à un fichier hors budget avant
 * d'en avoir extrait. Le découpage se fait par RESPONSABILITÉ, pas par tranche :
 * les deux verrous de l'enveloppe et la loi qu'ils partagent se lisent
 * ensemble, et plus personne ne peut toucher l'un sans voir l'autre.
 */
export function deviceEnvelopeForPush(
  message: {
    readonly encryptedContent?: string | null;
    readonly encryptionMode?: string | null;
    readonly isViewOnce: boolean | null;
    readonly isBlurred: boolean | null;
    readonly effectFlags: number | null;
    readonly expiresAt: Date | null;
    readonly ephemeralDuration: number | null;
  },
  conversationMode: string | null | undefined,
): string | undefined {
  if (!message.encryptedContent) return undefined;
  if (!isEndToEndMode(message.encryptionMode ?? conversationMode)) return undefined;

  // #17195 — la PRÉSÉANCE est une loi partagée, pas une boucle recopiée : le
  // second verrou (`createNotification`) pose la MÊME question depuis la
  // relecture vivante, et deux expressions d'une même règle divergent au
  // premier cycle qui en touche une — exactement comme les trois éventails
  // avant le cycle 127.
  if (protectedBeyondEncryption({
    isViewOnce: message.isViewOnce,
    isBlurred: message.isBlurred,
    effectFlags: message.effectFlags,
    expiresAt: message.expiresAt ?? null,
    ephemeralDuration: message.ephemeralDuration ?? null,
  })) return undefined;

  return message.encryptedContent;
}
