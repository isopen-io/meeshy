import XCTest

final class SingleSourceOfTruthTests: XCTestCase {

    /// Phase 1 invariant: optimistic UI updates must NOT mutate
    /// `ConversationViewModel.messages` directly. They must write to
    /// `MessagePersistenceActor` and let the store observation surface
    /// the change.
    ///
    /// Exempt:
    /// - The single `subscribeToMessageStore` write (the observation OUTPUT)
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

    /// Group B Phase 2 invariant: whole-array `messages = ...` writes must only
    /// exist in `subscribeToMessageStore` (the GRDB observation OUTPUT) plus the
    /// deferred jump-to-message windowed state.
    ///
    /// Allowed writes (3 total):
    /// 1. `self.messages = mapped` — inside `subscribeToMessageStore` (legitimate output)
    /// 2. `messages = fetchedMessages` — `loadMessagesAround` (jump window, deferred)
    /// 3. `messages = saved` — `returnToLatest` (jump window restore, deferred)
    ///
    /// Note: `messages.append(contentsOf: genuinelyNew)` in `loadNewerMessages` is
    /// a fourth deferred jump-window site but is not matched by this pattern (no `=`).
    ///
    /// This test asserts the exact count so any new whole-array `messages = ...`
    /// write triggers a failure that forces the author to justify the addition.
    func test_wholeArrayMessagesWrite_countIsExact() throws {
        let filePath = #filePath
        let projectRoot = filePath
            .components(separatedBy: "/MeeshyTests/")
            .first ?? ""
        let viewModelPath = "\(projectRoot)/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift"

        let content = try String(contentsOfFile: viewModelPath, encoding: .utf8)
        let lines = content.components(separatedBy: "\n")

        // Match lines that write the whole array: `messages = ...` or `self.messages = ...`
        // Excludes: comments, variable declarations containing "messages", subscript writes (messages[i]).
        let wholeArrayWritePattern = #"^\s+(self\.)?messages\s*="#

        var matchingLines: [(Int, String)] = []
        for (i, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.hasPrefix("//"),
                  !trimmed.hasPrefix("*"),
                  !trimmed.contains("messages[")
            else { continue }
            if line.range(of: wholeArrayWritePattern, options: .regularExpression) != nil {
                matchingLines.append((i + 1, trimmed))
            }
        }

        // Expected: exactly 3 whole-array writes (1 legitimate + 2 deferred jump-window)
        let expectedCount = 3
        XCTAssertEqual(
            matchingLines.count, expectedCount,
            "Expected exactly \(expectedCount) whole-array `messages = ...` writes in ConversationViewModel.swift " +
            "(1 in subscribeToMessageStore + 2 deferred jump-window sites). " +
            "Found \(matchingLines.count):\n" +
            matchingLines.map { "Line \($0.0): \($0.1)" }.joined(separator: "\n")
        )
    }
}
