import XCTest

final class SingleSourceOfTruthTests: XCTestCase {

    /// Phase 1 invariant: optimistic UI updates must NOT mutate
    /// `ConversationViewModel.messages` directly. They must write to
    /// `MessagePersistenceActor` and let the store observation surface
    /// the change.
    ///
    /// Exempt:
    /// - The single `subscribeToMessageStore` write (the observation OUTPUT)
    /// - Cache/load/refresh paths (Group B — Phase 2 will refactor)
    /// - Test files (test fixtures legitimately seed state directly)
    func test_noDirectOptimisticMutation_of_conversationViewModel_messages() throws {
        let filePath = #filePath
        let projectRoot = filePath
            .components(separatedBy: "/MeeshyTests/")
            .first ?? ""
        let viewModelPath = "\(projectRoot)/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift"

        let content = try String(contentsOfFile: viewModelPath, encoding: .utf8)
        let lines = content.components(separatedBy: "\n")

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

        var violations: [(Int, String)] = []
        for (i, line) in lines.enumerated() {
            for pattern in forbiddenPatterns {
                if line.range(of: pattern, options: .regularExpression) != nil {
                    violations.append((i + 1, line.trimmingCharacters(in: .whitespaces)))
                }
            }
        }

        XCTAssertTrue(
            violations.isEmpty,
            "Direct optimistic mutations of vm.messages found — write through MessagePersistenceActor instead:\n" +
            violations.map { "Line \($0.0): \($0.1)" }.joined(separator: "\n")
        )
    }
}
