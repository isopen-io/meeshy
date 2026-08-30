import Foundation

/// SSOT Swift du prédicat « cette chaîne est-elle un ObjectId MongoDB ? ».
///
/// Miroir des SSOT sœurs, une par package — `packages/shared/utils/object-id.ts`,
/// `apps/web/utils/object-id.ts`, `services/gateway/src/utils/object-id.ts`.
/// Les trois portent DÉLIBÉRÉMENT le même nom de constante et de fonction
/// « pour rester repérables d'un package à l'autre » ; ce type est le
/// quatrième, et il garde ce nom pour la même raison.
///
/// ## Pourquoi le client en a besoin, et pas seulement le serveur
///
/// Swift est le seul des quatre à FABRIQUER des identifiants locaux —
/// `ClientMessageId` (`cid_<uuid>`), `ClientMutationId` (`cmid_<uuid>`) et,
/// pour une story encore en file de publication, `pending_<uuid>`
/// (`StoryPublishQueue`). Ces identifiants nomment une chose qui existe
/// LOCALEMENT et que le serveur ne connaît pas encore.
///
/// Envoyé à une route qui attend une clé de document, un tel identifiant ne
/// produit pas un 404 : Prisma **lève** (`P2023`, « Malformed ObjectID »).
/// Selon que l'appelant garde ou non son accès, cela devient un 500 — c'est
/// très exactement ce qui a condamné dix-neuf lignes `markStoryViewed` sur un
/// appareil réel (#4044), retentées cinq fois chacune, épuisées pour toujours,
/// et qui alimentaient le bruit de la pastille de synchro.
///
/// Le gateway applique déjà cette doctrine à sa porte d'entrée temps réel :
/// « a client id (`cid_<uuid>`) — or anything not a 24-hex Mongo ObjectId —
/// must NEVER reach » (`socketio/handlers/ReactionHandler.ts`). Ce type permet
/// au client de tenir la MÊME frontière AVANT d'écrire dans une file durable :
/// une mutation que le serveur ne peut structurellement pas adresser n'y
/// attend pas un réseau, elle y pourrit.
public enum MeeshyObjectID {

    /// Un ObjectId MongoDB est exactement 24 caractères hexadécimaux, casse
    /// indifférente. Miroir de `OBJECT_ID_REGEX` (`/^[0-9a-fA-F]{24}$/`).
    public static let length = 24

    /// `true` uniquement pour une chaîne de 24 caractères hexadécimaux.
    ///
    /// Écrit sans `NSRegularExpression` : le prédicat est appelé sur des
    /// chemins chauds (chaque story révélée), et compiler une regex pour
    /// vingt-quatre comparaisons de caractères serait payer cher une règle
    /// triviale.
    public static func isValid(_ id: String) -> Bool {
        guard id.count == length else { return false }
        return id.utf8.allSatisfy { byte in
            (byte >= 0x30 && byte <= 0x39)   // 0-9
                || (byte >= 0x61 && byte <= 0x66) // a-f
                || (byte >= 0x41 && byte <= 0x46) // A-F
        }
    }
}
