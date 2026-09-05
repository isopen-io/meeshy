import XCTest

@MainActor
final class SingleSourceOfTruthTests: XCTestCase {

    /// Depuis #4942, `ConversationViewModel` est une FAMILLE de fichiers — l'hôte
    /// `ConversationViewModel.swift` et ses extensions `ConversationViewModel+*.swift`.
    /// Une garde qui ne lisait que l'hôte passait À VIDE dès l'extraction : le code
    /// qu'elle interdit avait simplement changé de fichier, et rien ne rougissait.
    /// Les deux témoins balaient donc la famille entière, et attribuent chaque
    /// violation à son fichier.
    private func conversationViewModelFamily() throws -> [(name: String, lines: [String])] {
        let filePath = #filePath
        let projectRoot = filePath
            .components(separatedBy: "/MeeshyTests/")
            .first ?? ""
        let directory = "\(projectRoot)/Meeshy/Features/Main/ViewModels"
        let names = try FileManager.default.contentsOfDirectory(atPath: directory)
            .filter { $0 == "ConversationViewModel.swift" || ($0.hasPrefix("ConversationViewModel+") && $0.hasSuffix(".swift")) }
            .sorted()
        XCTAssertGreaterThan(
            names.count, 1,
            "La famille ConversationViewModel*.swift doit compter l'hôte ET ses extensions (#4942)"
        )
        return try names.map { name in
            let content = try String(contentsOfFile: "\(directory)/\(name)", encoding: .utf8)
            return (name: name, lines: content.components(separatedBy: "\n"))
        }
    }

    /// Phase 1 invariant: optimistic UI updates must NOT mutate
    /// `ConversationViewModel.messages` directly. They must write to
    /// `MessagePersistenceActor` and let the store observation surface
    /// the change.
    ///
    /// Exempt:
    /// - The single `subscribeToMessageStore` write (the observation OUTPUT)
    /// - Test files (test fixtures legitimately seed state directly)
    func test_noDirectOptimisticMutation_of_conversationViewModel_messages() throws {
        // Patterns that indicate direct mutation in optimistic-update flows.
        // These should be replaced by writes to MessagePersistenceActor;
        // the store observation surfaces changes to the view automatically.
        //
        // All patterns require an assignment operator (=) to avoid flagging
        // read-only accesses such as `.contains`, `.count`, etc.
        let forbiddenPatterns: [String] = [
            // Reaction field assignments on a messages element
            #"messages\[idx\]\.reactions\.(append|removeAll|remove)\b"#,
            // Direct delivery-status failure mark (covered by applyEvent(.sendFailed))
            #"messages\[idx\]\.deliveryStatus\s*=\s*\.failed"#,
            // Optimistic send append (covered by insertOptimistic via GRDB)
            #"messages\.append\(.*deliveryStatus.*\.sending"#,
            // Pin field mutations (covered by updatePinned)
            #"messages\[idx\]\.pinnedAt\s*="#,
            #"messages\[idx\]\.pinnedBy\s*="#,
            // Delete optimistic mutation (covered by markDeleted / markUndeleted)
            #"messages\[idx\]\.deletedAt\s*="#,
            // Edit optimistic mutation (covered by markEdited)
            #"messages\[idx\]\.content\s*="#,
            #"messages\[idx\]\.isEdited\s*="#,
            // Blur / consumed (covered by markConsumed / updateBlurred)
            #"messages\[idx\]\.isBlurred\s*="#,
            // ViewOnce count mutation (covered by updateViewOnceCount)
            #"messages\[idx\]\.viewOnceCount\s*="#,
            // Attachment assignment on a messages element (covered by updateAttachmentsJson)
            #"messages\[msgIdx\]\.attachments\s*="#,
        ]

        var violations: [(String, Int, String)] = []
        for file in try conversationViewModelFamily() {
            for (i, line) in file.lines.enumerated() {
                for pattern in forbiddenPatterns {
                    if line.range(of: pattern, options: .regularExpression) != nil {
                        violations.append((file.name, i + 1, line.trimmingCharacters(in: .whitespaces)))
                    }
                }
            }
        }

        XCTAssertTrue(
            violations.isEmpty,
            "Direct optimistic mutations of vm.messages found — write through MessagePersistenceActor instead:\n" +
            violations.map { "\($0.0):\($0.1): \($0.2)" }.joined(separator: "\n")
        )
    }

    /// Group B Phase 2 invariant (fully realised): whole-array `messages = ...`
    /// writes must only exist inside `subscribeToMessageStore` — the GRDB
    /// observation OUTPUT and the single sanctioned site that reflects the
    /// `MessageStore` snapshot into the `@Published messages` array.
    ///
    /// `subscribeToMessageStore` legitimately assigns the whole array from two
    /// branches, both fed by the same store snapshot:
    ///   1. `self.messages = mapped`    — non-E2EE fast path
    ///   2. `self.messages = decrypted` — E2EE DM path, after an in-memory
    ///      decryption pass on that same snapshot
    ///
    /// All 3 jump-to-message sites route through `MessageStore.loadWindow(around:)`
    /// and `MessageStore.restoreLatestWindow()`. Any whole-array write that lands
    /// in another method is a single-source-of-truth violation — route it through
    /// `MessageStore` instead. This check verifies the LOCATION of every write
    /// rather than a count, so legitimate additions/removals inside the
    /// sanctioned method never trip it while writes elsewhere always do.
    func test_wholeArrayMessagesWrite_onlyInSubscribeToMessageStore() throws {
        // Attribute any line to its enclosing method by scanning upward for the
        // nearest `func` declaration. Closures carry no `func` keyword, so a
        // write inside `subscribeToMessageStore`'s `.sink`/`Task` closures still
        // resolves to `subscribeToMessageStore`.
        let funcDeclPattern = #"(^|\s)func\s+(\w+)\s*\("#
        func enclosingFunction(in lines: [String], ofLineAt index: Int) -> String? {
            for i in stride(from: index, through: 0, by: -1) {
                guard let match = lines[i].range(of: funcDeclPattern, options: .regularExpression)
                else { continue }
                return String(lines[i][match])
                    .replacingOccurrences(of: "func", with: "")
                    .replacingOccurrences(of: "(", with: "")
                    .trimmingCharacters(in: .whitespaces)
            }
            return nil
        }

        // Match lines that write the whole array: `messages = ...` or `self.messages = ...`
        // Excludes: comments, variable declarations containing "messages", subscript writes (messages[i]).
        let wholeArrayWritePattern = #"^\s+(self\.)?messages\s*="#

        var violations: [(String, Int, String, String)] = []
        var sanctionedWrites = 0
        for file in try conversationViewModelFamily() {
            for (i, line) in file.lines.enumerated() {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                guard !trimmed.hasPrefix("//"),
                      !trimmed.hasPrefix("*"),
                      !trimmed.contains("messages[")
                else { continue }
                guard line.range(of: wholeArrayWritePattern, options: .regularExpression) != nil
                else { continue }
                let owner = enclosingFunction(in: file.lines, ofLineAt: i) ?? "<unknown>"
                if owner == "subscribeToMessageStore" {
                    sanctionedWrites += 1
                } else {
                    violations.append((file.name, i + 1, trimmed, owner))
                }
            }
        }

        // Le site sanctionné DOIT exister quelque part dans la famille : un
        // balayage qui ne trouve plus aucune écriture ne prouve pas l'invariant,
        // il prouve qu'il lit les mauvais fichiers.
        XCTAssertGreaterThan(
            sanctionedWrites, 0,
            "Aucune écriture pleine-array trouvée dans `subscribeToMessageStore` : la garde ne lit plus le bon fichier"
        )
        XCTAssertTrue(
            violations.isEmpty,
            "Whole-array `messages = ...` writes must only exist inside " +
            "`subscribeToMessageStore` (the GRDB observation output). " +
            "Single-source-of-truth requires every other site to write through " +
            "MessageStore instead. Found writes in other methods:\n" +
            violations.map { "\($0.0):\($0.1) [in \($0.3)]: \($0.2)" }.joined(separator: "\n")
        )
    }
}
