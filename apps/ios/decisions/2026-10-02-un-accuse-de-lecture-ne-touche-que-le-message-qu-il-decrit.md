## 2026-10-02 : un accusé de lecture ne touche que le message qu'il DÉCRIT — et le REST guérit les coches déjà fausses
**Statut**: Accepté (#7433, chantier « lecture et accusés », milestone #105). Remplace, pour le chemin temps réel, la décision I3 du 2026-09-21.

**Contexte**: retour porteur du 2026-10-02 : des coches violettes « Lu » apparaissent sur iOS alors que le message n'a pas été lu, et la fiche « Vu par » ne montre pas le destinataire. Trois causes, relevées sur `dev` :
1. `ConversationSocketHandler` (le chemin GRDB, celui que la bulle lit) et `ConversationSyncEngine.applyReadReceipt` (le cache) appliquaient un `read-status:updated` à TOUS les messages envoyés avant `event.updatedAt`. Or `updatedAt` vaut l'instant d'ÉMISSION (`broadcastReadStatus.ts`), et le résumé ne décrit qu'UN message (`summary.messageId`, G-5). Le pair ouvre le fil sur le séparateur et lit M1…M5 : M1…M20 passaient violets.
2. Le résumé agrégé de la passerelle (`getLatestMessageSummary`, utilisé par l'auto-remise, le drain, le rattrapage à l'entrée en room et la lecture sans lot exact) décrit le DERNIER message du fil, quel qu'en soit l'auteur. Quand c'est celui du pair, ses compteurs disent si MOI je l'ai lu — iOS les appliquait à mes messages.
3. La fausse coche était DÉFINITIVE : `batchDeliverySync` gravait `state = .read` (terminal) et `readByAllAt`, que le REST fusionnait en `max(…)` / `api ?? existant`. Les compteurs serveur justes ne la défaisaient jamais. Et la fiche choisissait son onglet d'ouverture sur les compteurs LOCAUX, jamais sur le décompte serveur qu'elle venait de charger.

**Décision**:
- La passerelle NOMME le message de son résumé agrégé (`messageId`). Chaque `read-status:updated` dit désormais de quel message il parle ; le contrat le prévoyait en optionnel et le web le lisait déjà.
- iOS a UNE règle, `ReadStatusReceipt` (SDK, pure), partagée par ses deux réducteurs et miroir de `applyReadStatusUpdated` (web) : le résumé porte sur le message nommé, sinon sur le dernier message acquitté du fil (passerelle ancienne) ; il ne s'applique que si l'utilisateur courant en est l'auteur ; les compteurs fusionnent sans recul et le dénominateur est adopté. La coche se DÉRIVE des compteurs (`DeliveryStatusResolver`, tout-ou-rien en groupe) : aucun état « lu » n'est plus fabriqué à côté. `batchDeliverySync` est supprimé, et la persistance pose le résumé par `bufferReadStatusSummary` (`MessagePersistenceActor+ReadStatusReceipt.swift`), dans le flux d'écriture ordonné.
- Quand le REST sert un dénominateur, il fait autorité sur la ligne, à la baisse comme à la hausse, marqueurs « tous » compris (`MessageRecord.adoptServedReceipts`) : une ligne déjà corrompue retombe sur la vérité serveur au prochain rafraîchissement. Sans dénominateur, rien de confirmé n'est effacé. `recipientCount` rejoint la comparaison d'égalité de l'upsert.
- L'onglet d'ouverture de la fiche « Vu par » suit le décompte serveur dès qu'il est chargé.

**Alternatives rejetées**:
- Garder la frontière temporelle en la resserrant sur la date du message nommé : la lecture exacte (post-bascule) ne garantit pas qu'un message plus ancien a été lu, et c'est précisément ce que la fiche affiche message par message.
- Propager « distribué » aux messages plus anciens que celui nommé : vrai pour le curseur de remise, faux pour un reçu figé seul. Le web ne le fait pas non plus ; ces bulles se règlent par leurs propres résumés et par le REST.

**Conséquences**:
- Une bulle n'est violette que si le serveur dit que CE message a été lu — la même vérité que la fiche « Vu par ».
- Un REST calculé AVANT une lecture et reçu APRÈS l'événement fait redescendre la coche jusqu'au prochain événement ou rafraîchissement. Les compteurs avaient déjà cette exposition ; seuls l'état et les marqueurs y échappaient, et c'est ce qui rendait les faux « Lu » définitifs.
- Des messages plus anciens, remis pendant une absence du pair, peuvent rester en coche simple jusqu'au rafraîchissement, quand le drain n'en résume qu'un. C'est une sous-affirmation, jamais une fausse coche.
