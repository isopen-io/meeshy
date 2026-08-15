/**
 * Vecteurs inter-plateformes pour `buildBridgeData`
 * (`packages/shared/utils/conversation-bridge.ts`).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/bridge.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — voir C-024,
 * `tasks/lentille-workshop-execution.md`.
 *
 * ── Sémantique de l'adaptateur (à reproduire à l'identique côté Swift/Kotlin) ──
 * Entrée JSON → appel loi : AUCUNE conversion de date — `buildBridgeData` ne
 * lit aucun timestamp, seulement `messages[].senderId/senderName/attachments`,
 * `viewerId`, `unreadCount`. L'entrée JSON est déjà la forme exacte de
 * `BuildBridgeDataParams` ; l'adaptateur ne fait qu'un passage direct (aucune
 * transformation de type, contrairement à `sections`/`sort` qui parsent des
 * dates ISO). `attachments` absent d'un message ⇒ `undefined`, jamais `[]`
 * inventé par l'adaptateur — la loi le normalise elle-même (`attachments ?? []`).
 *
 * Sortie loi → forme JSON `expected` : le retour de `buildBridgeData` est DÉJÀ
 * une forme JSON simple (`ConversationBridgeData | null`), sérialisé tel
 * quel — pas de transformation en sortie. Points de contrat à vérifier par le
 * miroir :
 *   - `unreadCount === 0` ⇒ `null` (jamais un pont aux champs vides) ;
 *   - `authors` : au plus 2 entrées, dans l'ORDRE D'APPARITION des messages
 *     d'AUTRUI (messages du `viewerId` totalement exclus du calcul, y compris
 *     de `messageCount`), dédupliqué par `senderId` (pas par `senderName`) ;
 *   - `extraAuthorCount` : le nombre d'auteurs distincts AU-DELÀ des 2 déjà
 *     nommés dans `authors` ;
 *   - `mediaCounts` : bucket `images` = attachements `type: 'image'`,
 *     `audio` = `type: 'audio'`, `files` = TOUT LE RESTE (`video`, `file`,
 *     `location`, et tout type futur inconnu) — toujours les 3 clés
 *     présentes, même à 0.
 */
import { buildBridgeData, type BridgeMessage } from '../../utils/conversation-bridge.js';
import type { ConversationBridgeData } from '../../types/conversation-bridge.js';
import { runVectors } from './harness.js';

type BridgeVectorInput = {
  readonly messages: readonly BridgeMessage[];
  readonly viewerId: string;
  readonly unreadCount: number;
};

const adaptBridge = (input: BridgeVectorInput): ConversationBridgeData | null =>
  buildBridgeData({
    messages: input.messages,
    viewerId: input.viewerId,
    unreadCount: input.unreadCount,
  });

runVectors<BridgeVectorInput, ConversationBridgeData | null>('bridge', adaptBridge);
