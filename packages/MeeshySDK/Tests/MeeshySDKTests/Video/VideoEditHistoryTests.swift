import Testing
import Foundation
@testable import MeeshySDK

private func makeDocument() -> VideoEditDocument {
    VideoEditDocument(
        sourceURL: URL(fileURLWithPath: "/tmp/history.mp4"),
        sourceDuration: 12,
        naturalWidth: 1080,
        naturalHeight: 1920,
        hasAudioTrack: true
    )
}

@Suite("VideoEditHistory undo / redo")
struct VideoEditHistoryTests {

    @Test("a fresh history cannot undo or redo")
    func freshHistory() {
        let history = VideoEditHistory(initial: makeDocument())
        #expect(history.canUndo == false)
        #expect(history.canRedo == false)
    }

    @Test("commit then undo restores the previous document")
    func commitThenUndo() {
        var history = VideoEditHistory(initial: makeDocument())
        let edited = makeDocument().settingFilter(.noir)
        history.commit(edited)
        #expect(history.current.filter == .noir)
        #expect(history.canUndo)

        history.undo()
        #expect(history.current.filter == .none)
        #expect(history.canRedo)
    }

    @Test("redo re-applies an undone change")
    func redoReapplies() {
        var history = VideoEditHistory(initial: makeDocument())
        history.commit(makeDocument().settingFilter(.warm))
        history.undo()
        history.redo()
        #expect(history.current.filter == .warm)
        #expect(history.canRedo == false)
    }

    @Test("committing an identical document is ignored")
    func identicalCommitIgnored() {
        var history = VideoEditHistory(initial: makeDocument())
        history.commit(history.current)
        #expect(history.canUndo == false)
    }

    @Test("a new commit clears the redo branch")
    func newCommitClearsRedo() {
        var history = VideoEditHistory(initial: makeDocument())
        history.commit(makeDocument().settingFilter(.warm))
        history.undo()
        #expect(history.canRedo)
        history.commit(makeDocument().settingFilter(.cool))
        #expect(history.canRedo == false)
        #expect(history.current.filter == .cool)
    }

    @Test("history depth is bounded")
    func depthBounded() {
        var history = VideoEditHistory(initial: makeDocument(), depth: 3)
        for turn in 1...10 {
            var doc = makeDocument()
            for _ in 0..<turn { doc = doc.rotatedClockwise() }
            history.commit(doc)
        }
        var undos = 0
        while history.undo() != nil { undos += 1 }
        #expect(undos == 3)
    }
}
