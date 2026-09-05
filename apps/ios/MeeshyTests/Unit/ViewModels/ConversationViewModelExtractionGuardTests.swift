import XCTest

/// Garde de SOURCE du découpage de `ConversationViewModel` (#4942, D-MAINT-01).
///
/// ## Pourquoi une garde, et pas seulement le commit qui découpe
///
/// L'hôte portait **4 832 lignes** — quatre fois le plafond DUR de 1 200 posé par
/// la directive 2026-09-02. Ce n'était pas une gêne de lecture : la directive
/// **interdit d'AJOUTER à un fichier hors budget**, donc le chantier « la
/// conversation iOS sans aucune latence perçue » ne pouvait toucher ni le
/// chargement, ni l'envoi, ni l'observation du magasin avant d'avoir extrait. On
/// extrait d'abord, on ajoute ensuite.
///
/// `FileSizeBudgetGuardTests` mesure déjà le plafond sur TOUT le dépôt et
/// suffirait à faire rougir un retour en arrière par la taille. Cette garde-ci
/// dit ce que la taille ne dit pas : **où chaque responsabilité vit**. Un fichier
/// peut redescendre sous 1 200 lignes en poussant du code n'importe où ; ce qui
/// est acquis ici, c'est qu'`sendMessage` vit dans `+Send`, que `loadMessages`
/// vit dans `+InitialLoad`, et que l'hôte ne les redéclare pas. Sans ce second
/// versant, la prochaine session pourrait « re-rapatrier » une méthode dans
/// l'hôte tant qu'elle reste sous le plafond — et la dette recommencerait à
/// s'accréter par le même chemin qu'elle a pris la première fois.
///
/// ## Ce que l'hôte GARDE, et pourquoi ce n'est pas un découpage inachevé
///
/// Deux responsabilités entières restent chez l'hôte alors qu'elles auraient leur
/// place dans une extension : **la lecture audio de la conversation** et **le
/// suivi de lecture (mark-as-read)**. Elles y restent parce que trois gardes de
/// source du dépôt épinglent leur code À CE FICHIER par son chemin :
/// `PermissionGateSourceGuardTests` (`requestPermissionsThenStartCall`),
/// `FocalMatrixWiringGuardTests` (piste audio effective, `syncActiveTrack`,
/// `trackUrlResolver`) et `ConversationCatchUpLawTests`
/// (`ConversationCatchUpLaw.caughtUpId`). Les déplacer aurait rendu ces trois
/// gardes muettes sur un câblage qu'elles protègent réellement — un coût bien
/// supérieur à celui de deux blocs restés à la maison. Les assertions du bas
/// vérifient donc que ces ancres sont TOUJOURS dans l'hôte : c'est ce qui rend le
/// compromis relisible au lieu de le laisser deviner.
final class ConversationViewModelExtractionGuardTests: XCTestCase {

    /// Le plafond DUR de la directive 2026-09-02, mesuré comme
    /// `FileSizeBudgetGuardTests` le mesure (`components(separatedBy: .newlines)`,
    /// soit `wc -l` + 1 sur un fichier terminé par un saut de ligne). La
    /// cohérence avec l'autre cliquet compte plus que la convention choisie.
    private static let budget = 1_200

    private static let host = "ConversationViewModel.swift"

    /// Une responsabilité extraite, et les symboles qui prouvent qu'elle a
    /// bien changé de fichier. La liste est volontairement courte : elle nomme
    /// des points d'entrée, pas un inventaire à tenir à jour.
    private static let extractions: [(file: String, symbols: [String])] = [
        ("ConversationViewModel+Lifecycle.swift", [
            "func start()", "func observeSync()", "func prefetchRecentMedia()",
            "struct ConversationDependencies", "struct LiveCallJoinContext",
        ]),
        ("ConversationViewModel+StoreObservation.swift", [
            "func subscribeToMessageStore()", "func mergeIntoMessages(",
            "func handleRetryExhausted(", "func decryptMessagesIfNeeded(",
            "func persistMessagesUsingServerIds()",
        ]),
        ("ConversationViewModel+InitialLoad.swift", [
            "func loadMessages()", "func refreshMessagesFromAPI()",
            "func loadOlderMessages()", "func syncMissedMessages()",
            "func hydrateMetadataFromGRDB(",
        ]),
        ("ConversationViewModel+Send.swift", [
            "func withSendTimeout<", "func sendMessage(content:",
            "func finalizeSuccessfulSend(", "func retryMessage(",
            "func insertOptimisticMediaMessage(",
        ]),
        ("ConversationViewModel+ReplyReference.swift", [
            "func makeReplyReference(",
        ]),
        ("ConversationViewModel+MessageActions.swift", [
            "func toggleReaction(", "func deleteMessage(", "func editMessage(",
            "func togglePin(", "func startLiveLocation(",
        ]),
        ("ConversationViewModel+Search.swift", [
            "func searchMessages(", "func loadMoreSearchResults(",
        ]),
        ("ConversationViewModel+Translations.swift", [
            "struct MessageTranslation", "func extractTextTranslations(",
            "func extractAttachmentTranscriptions(", "func preferredTranslation(",
        ]),
        ("ConversationViewModel+Projections.swift", [
            "var messagesByDate", "var allAudioItems", "var mediaCaptionMap",
            "func topActiveMembersList(",
        ]),
        ("ConversationViewModel+SocketDelegate.swift", [
            "extension ConversationViewModel: ConversationSocketDelegate",
            "func applyAttachmentUpdate(",
        ]),
    ]

    // MARK: - Lecture

    private var viewModelsDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/ViewModels
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/ViewModels")
    }

    private func source(_ fileName: String) throws -> String {
        try String(contentsOf: viewModelsDirectory.appendingPathComponent(fileName), encoding: .utf8)
    }

    private func lineCount(_ text: String) -> Int {
        text.components(separatedBy: .newlines).count
    }

    // MARK: - Le plafond

    func test_host_staysUnderTheHardLineBudget() throws {
        let count = lineCount(try source(Self.host))
        XCTAssertLessThanOrEqual(
            count, Self.budget,
            "\(Self.host) porte \(count) lignes (plafond \(Self.budget)). Ajouter à un fichier "
            + "hors budget est interdit par la directive : extraire une responsabilité dans une "
            + "extension `ConversationViewModel+…` d'abord, ajouter ensuite."
        )
    }

    func test_everyExtractedFile_staysUnderTheHardLineBudget() throws {
        for extraction in Self.extractions {
            let count = lineCount(try source(extraction.file))
            XCTAssertLessThanOrEqual(
                count, Self.budget,
                "\(extraction.file) porte \(count) lignes — une extraction qui dépasse le plafond "
                + "n'a fait que déplacer la dette."
            )
        }
    }

    // MARK: - Le placement

    func test_everyExtractedResponsibility_livesInItsOwnFile() throws {
        for extraction in Self.extractions {
            let text = try source(extraction.file)
            for symbol in extraction.symbols {
                XCTAssertTrue(
                    text.contains(symbol),
                    "\(extraction.file) doit déclarer `\(symbol)` — c'est la responsabilité qui "
                    + "justifie son existence."
                )
            }
        }
    }

    func test_hostNoLongerDeclares_whatWasExtracted() throws {
        let host = try source(Self.host)
        for extraction in Self.extractions {
            for symbol in extraction.symbols {
                XCTAssertFalse(
                    host.contains(symbol),
                    "`\(symbol)` est revenu dans \(Self.host) — il vit dans \(extraction.file). "
                    + "Une méthode rapatriée passe sous le plafond tant que le fichier est court, "
                    + "puis la dette se réaccrète par le chemin qu'elle avait déjà pris."
                )
            }
        }
    }

    /// Swift interdit les propriétés STOCKÉES en extension. Une extension qui en
    /// déclarerait une ne compilerait pas — mais un `@Published` y est le premier
    /// réflexe quand on ajoute de l'état, et l'erreur du compilateur ne dit pas
    /// où l'écrire. La règle est donc écrite ici, avec sa destination : l'hôte.
    func test_noExtractedFile_declaresPublishedState() throws {
        for extraction in Self.extractions {
            // Une LIGNE qui COMMENCE par `@Published` est un site de déclaration ;
            // les doc-comments de ces fichiers citent l'attribut en prose (« le PONT
            // entre GRDB et `@Published var messages` ») et ne déclarent rien.
            let declarations = try source(extraction.file)
                .components(separatedBy: "\n")
                .filter { $0.trimmingCharacters(in: .whitespaces).hasPrefix("@Published") }
            XCTAssertTrue(
                declarations.isEmpty,
                "\(extraction.file) déclare un `@Published` : une extension ne peut pas porter de "
                + "propriété stockée. L'état vit sur le type, dans \(Self.host). Lignes : "
                + declarations.joined(separator: " | ")
            )
        }
    }

    // MARK: - Ce que l'hôte garde, et pourquoi

    /// L'état que les extensions PILOTENT reste déclaré sur le type — c'est la
    /// contrainte Swift, pas un oubli du découpage. S'il disparaissait d'ici,
    /// l'extension qui le lit cesserait de compiler ; l'assertion documente le
    /// couple plutôt que de laisser le compilateur l'expliquer.
    func test_host_keepsTheStoredStateItsExtensionsDrive() throws {
        let host = try source(Self.host)
        for declaration in [
            "@Published var messages: [Message] = []",
            "var storeRefreshGeneration: Int = 0",
            "var hasCompletedInitialFetch = false",
            "var mediaPrefetchDebounce: Task<Void, Never>?",
            "var syncCancellable: AnyCancellable?",
        ] {
            XCTAssertTrue(
                host.contains(declaration),
                "\(Self.host) doit garder `\(declaration)` : une extension ne déclare pas de "
                + "propriété stockée, elle la PILOTE."
            )
        }
    }

    /// Les deux blocs volontairement NON extraits, et l'ancre que chacun porte
    /// pour une garde tierce. Si un découpage ultérieur les déplace, il doit
    /// élargir le corpus de la garde concernée dans le même commit — comme
    /// `ConversationCatchUpLawTests` le fait déjà pour
    /// `MessageListViewController+SeenTracking.swift`.
    func test_host_keepsWhatThreeOtherSourceGuardsPinToIt() throws {
        let host = try source(Self.host)
        let anchors: [(anchor: String, guardName: String)] = [
            ("requestPermissionsThenStartCall", "PermissionGateSourceGuardTests"),
            ("fileUrl: effectiveAudioTrackUrl(for: attachment, message: message)", "FocalMatrixWiringGuardTests"),
            ("audioCoordinator.syncActiveTrack(", "FocalMatrixWiringGuardTests"),
            ("trackUrlResolver:", "FocalMatrixWiringGuardTests"),
            ("ConversationCatchUpLaw.caughtUpId(", "ConversationCatchUpLawTests"),
        ]
        for entry in anchors {
            XCTAssertTrue(
                host.contains(entry.anchor),
                "`\(entry.anchor)` a quitté \(Self.host) : \(entry.guardName) l'y cherche PAR SON "
                + "CHEMIN et deviendrait muette sur un câblage qu'elle protège. Déplacer ce code "
                + "impose d'élargir le corpus de cette garde dans le MÊME commit."
            )
        }
    }
}
