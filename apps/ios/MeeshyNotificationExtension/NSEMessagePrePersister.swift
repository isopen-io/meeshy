import Foundation
import GRDB
import MeeshySDK

/// Pré-enregistrement GRDB de la bulle d'un message qui arrive (extrait de
/// `NotificationService`, comportement identique).
nonisolated enum NSEMessagePrePersister {

    /// Writes the incoming message directly to the App Group GRDB store so that
    /// when the user taps the notification banner the message is already available
    /// locally — no network round-trip required on cold launch.
    ///
    /// This is a best-effort, fire-and-forget operation. Any failure is silently
    /// swallowed; the main app will fetch the message from the REST API on resume.
    ///
    /// #8656 — la base visée est celle du compte DESTINATAIRE (le compte actif
    /// publié dans l'App Group, dans son environnement), jamais une base
    /// commune : l'extension survit d'un push à l'autre, et un changement de
    /// compte entre deux pushes doit la faire écrire ailleurs. Personne de
    /// connecté ⇒ aucune base, aucune écriture.
    private static let poolLock = NSLock()
    nonisolated(unsafe) private static var poolsByPath: [String: DatabasePool] = [:]

    private static func recipientPool() -> DatabasePool? {
        guard let path = recipientDatabasePath() else { return nil }
        return poolLock.withLock {
            if let pool = poolsByPath[path] { return pool }
            do {
                // N1 — mirror of `DependencyContainer.dbConfig()`'s busy timeout:
                // the main app holds its own pool on this same file, and GRDB's
                // default `.immediateError` busy mode would turn a cross-process
                // write collision into an SQLITE_BUSY swallowed by the catch
                // below (pre-persisted bubble silently lost).
                var config = Configuration()
                config.busyMode = .timeout(5)
                let pool = try DatabasePool(path: path, configuration: config)
                try MessageDatabaseMigrations.runAll(on: pool)
                poolsByPath[path] = pool
                return pool
            } catch { return nil }
        }
    }

    /// Pré-enregistre la bulle d'un message qui ARRIVE, et rien d'autre.
    ///
    /// Deux verrous, et aucun ne subsume l'autre :
    ///
    ///  1. **le TYPE** — `prePersistedMessagePlan` refuse tout push dont le
    ///     `messageId` ne désigne pas un message qui arrive. Il n'y avait aucun
    ///     gate ici, alors que le frère d'en dessous (`postDeliveryReceipt`) en
    ///     porte un et que son commentaire NOMME le cas exclu. Une notification
    ///     de RÉACTION porte le `messageId` du message RÉAGI — celui que le
    ///     destinataire a le plus souvent écrit lui-même — et un `senderId` qui
    ///     est celui du réacteur : `save()` étant un UPSERT sur la clé primaire
    ///     `localId`, réagir à un message VIDAIT son texte en base, lui
    ///     réassignait son auteur, le rehorodatait à l'instant du push et
    ///     jetait ses pièces jointes, ses réactions et sa citation.
    ///
    ///  2. **la LIGNE** — une bulle pré-enregistrée est un PLACEHOLDER pour la
    ///     fenêtre qui précède la synchro REST. Elle n'a donc jamais à
    ///     remplacer une ligne canonique déjà là, quel que soit le type qui
    ///     l'amène : l'écriture est un INSERT, jamais un UPSERT. C'est ce
    ///     second verrou qui couvre le cas du chemin d'ÉDITION, où une mention
    ///     ajoutée à un message EXISTANT produit un `user_mentioned` légitime
    ///     sur un `messageId` que le destinataire peut déjà détenir.
    static func prePersist(from userInfo: [AnyHashable: Any]) {
        // Audit 2026-05-11: For E2EE messages we deliberately skip the
        // pre-persist path. The push payload's plaintext `content` field
        // is just the placeholder ("Encrypted message"), and writing
        // `isEncrypted: false` would let attacker-controlled push content
        // render in the bubble until NSEDataSync.syncMessage's API
        // response overwrites it. NSEDataSync already fetches the
        // canonical record from the gateway and writes it via the
        // pending-messages path — that's the trustworthy source.
        //
        // Audit 2026-08-13: that last sentence is a PREMISE, and it was false
        // from the day it was written until this audit — `syncMessage` aimed
        // at a route the gateway never registered, so an E2EE push staged
        // NOTHING: no pre-persist (skipped here, correctly) and no canonical
        // fetch (404). The skip is only safe while the fetch works; whoever
        // changes `NSEDataSync.syncMessage`'s endpoint owns this branch too.
        //
        // Ce refus, comme le gate de type et la lecture des champs GW5, vit
        // désormais dans `prePersistedMessagePlan` — pur, donc gardé par des
        // témoins.
        // #7168 — LE FILTRE DE TYPE D'ABORD. Une clause de `guard` s'évalue
        // dans l'ordre, et `Self.sharedPool` est une `static let` paresseuse
        // qui ouvre `DatabasePool` PUIS rejoue toutes les migrations, avec un
        // `busyMode` qui bloque jusqu'à cinq secondes sur collision avec l'app
        // principale. L'évaluer en premier faisait payer cette ouverture à
        // TOUT push qui n'annonce pas l'arrivée d'un message — like, réaction,
        // commentaire, demande d'ami, arrivée d'un membre — pour repartir les
        // mains vides, sur le budget qui sert à télécharger l'avatar et la
        // pièce jointe avant d'afficher la bannière.
        //
        // Le filtre est PUR et gardé en propre (`NSEMessageArrivalGateTests`) ;
        // l'ordre, lui, n'est pas observable d'ici — ce fichier n'est compilé
        // que dans la cible d'extension.
        guard NotificationPayloadHelpers.announcesMessageArrival(userInfo["type"] as? String) else { return }
        guard let plan = NotificationPayloadHelpers.prePersistedMessagePlan(
                  userInfo: userInfo,
                  now: Date()
              ),
              let pool = recipientPool()
        else { return }

        do {
            let now = Date()
            let record = MessageRecord(
                localId: plan.messageId, serverId: plan.messageId,
                conversationId: plan.conversationId, senderId: plan.senderId,
                // Don't hardcode "fr" — read from push payload if present, else
                // default to "en" (the safer fake for an unknown language than
                // the previous "fr" which guaranteed wrong Prisme Linguistique
                // resolution for non-French speakers). The NSEDataSync API
                // fetch will overwrite with the canonical value seconds later.
                content: plan.content,
                originalLanguage: plan.originalLanguage,
                messageType: plan.messageType, messageSource: "user",
                contentType: plan.contentType,
                // Incoming messages are .delivered (received by us), not
                // .sent (which means "sent BY us and acked by server").
                // The previous .sent value broke any GRDB query that
                // partitions by sender ownership.
                state: .delivered, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: nil, storyReplyToId: nil,
                forwardedFromId: nil, forwardedFromConversationId: nil,
                replyToJson: nil, forwardedFromJson: nil,
                // #7453 — la protection VOYAGE avec la bulle pré-enregistrée.
                // Ces deux champs valaient `nil` et `0` en dur : au démarrage
                // à froid depuis la bannière, un éphémère s'affichait comme un
                // message ordinaire (sans décompte) et une vue unique sans
                // voile, jusqu'à ce que la synchro REST rapporte la ligne
                // canonique — c'est-à-dire pendant les secondes où
                // l'utilisateur regarde.
                expiresAt: plan.expiresAt, effectFlags: plan.effectFlags,
                maxViewOnceCount: nil, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                // `senderName` était lu sous une clé qu'AUCUN producteur
                // n'émet : la bulle pré-enregistrée était anonyme. Les trois
                // clés réelles (`senderDisplayName`, `senderUsername`,
                // `senderAvatar`) sont celles que `applyCommunicationIntent`
                // lit cent lignes plus bas, dans ce même fichier.
                senderName: plan.senderName,
                senderUsername: plan.senderUsername,
                senderColor: nil, senderAvatarURL: plan.senderAvatarURL,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: plan.createdAt, sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: now,
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )

            // INSERT, jamais UPSERT (verrou 2 ci-dessus) : un placeholder ne
            // remplace pas une ligne canonique. `save()` écrasait TOUTES les
            // colonnes de la ligne existante.
            try pool.write { db in
                guard try MessageRecord.fetchOne(db, key: plan.messageId) == nil else { return }
                try record.insert(db)
            }
        } catch {
            // Silent fail — the app will fetch the message from the API on launch.
        }
    }

    /// Returns the path to the shared App Group SQLite database, or nil if
    /// the App Group entitlement is not available (misconfigured signing,
    /// stripped entitlement on Ad Hoc builds, etc.). Audit 2026-05-11
    /// removed the prior `containerURL!` force-unwrap which crashed the
    /// extension via EXC_BREAKPOINT on the very first push when the
    /// entitlement was absent — invisible to users, hard to diagnose
    /// without a sysdiagnose.
    ///
    /// #8656 — le fichier est celui du compte destinataire (utilisateur +
    /// environnement, `MessageStoreAccountKey`), la même clé que l'app ouvre.
    private static func recipientDatabasePath() -> String? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.me.meeshy.apps"
        ), let key = MessageStoreAccountKey.activeAccount(
            appGroupDefaults: UserDefaults(suiteName: "group.me.meeshy.apps"),
            serverOrigin: NSEDataSync.trustedApiBaseURL
        ) else { return nil }
        let dbDir = container.appendingPathComponent("Database")
        nseCreateDirectory(dbDir, context: "NSE database directory")
        return dbDir.appendingPathComponent(key.databaseFileName).path
    }
}
