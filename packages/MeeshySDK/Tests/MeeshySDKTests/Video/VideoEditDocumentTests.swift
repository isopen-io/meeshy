import Testing
import Foundation
@testable import MeeshySDK

private func makeDocument(duration: Double = 10) -> VideoEditDocument {
    VideoEditDocument(
        sourceURL: URL(fileURLWithPath: "/tmp/sample.mp4"),
        sourceDuration: duration,
        naturalWidth: 1920,
        naturalHeight: 1080,
        hasAudioTrack: true
    )
}

@Suite("VideoEditDocument operations")
struct VideoEditDocumentTests {

    @Test("pristine document has one full-length segment and no edits")
    func pristineDocument() {
        let doc = makeDocument()
        #expect(doc.segments.count == 1)
        #expect(doc.segments[0].start == 0)
        #expect(abs(doc.segments[0].end - 10) < 0.001)
        #expect(doc.hasEdits == false)
        #expect(abs(doc.editedDuration - 10) < 0.001)
    }

    @Test("setting the in-point trims the first segment")
    func inPointTrim() {
        let doc = makeDocument().settingInPoint(3)
        #expect(abs(doc.inPoint - 3) < 0.001)
        #expect(doc.hasTimelineEdits)
    }

    @Test("in-point is clamped so the segment keeps a minimum duration")
    func inPointClamped() {
        let doc = makeDocument().settingInPoint(999)
        #expect(doc.inPoint <= 10 - VideoEditLimits.minSegmentDuration + 0.001)
    }

    @Test("setting the out-point trims the last segment")
    func outPointTrim() {
        let doc = makeDocument().settingOutPoint(6)
        #expect(abs(doc.outPoint - 6) < 0.001)
    }

    @Test("splitting at a valid time produces two segments")
    func splitProducesTwoSegments() {
        let doc = makeDocument().splitting(atEditedTime: 4)
        #expect(doc.segments.count == 2)
        #expect(abs(doc.segments[0].end - 4) < 0.001)
        #expect(abs(doc.segments[1].start - 4) < 0.001)
    }

    @Test("splitting too close to a boundary is a no-op")
    func splitNearBoundaryIgnored() {
        let doc = makeDocument()
        let split = doc.splitting(atEditedTime: 0.05)
        #expect(split.segments.count == 1)
    }

    @Test("removing a segment keeps at least one segment")
    func removeKeepsOne() {
        let doc = makeDocument().splitting(atEditedTime: 4)
        let firstID = doc.segments[0].id
        let after = doc.removingSegment(id: firstID)
        #expect(after.segments.count == 1)
        let cannotRemove = after.removingSegment(id: after.segments[0].id)
        #expect(cannotRemove.segments.count == 1)
    }

    @Test("global speed shortens the edited duration")
    func globalSpeed() {
        let doc = makeDocument().settingGlobalSpeed(2)
        #expect(abs(doc.editedDuration - 5) < 0.001)
        #expect(doc.hasTimelineEdits)
    }

    @Test("speed is clamped to the allowed range")
    func speedClamped() {
        let doc = makeDocument().settingGlobalSpeed(99)
        #expect(doc.segments[0].speed <= VideoEditLimits.maxSpeed + 0.001)
    }

    @Test("rotation cycles through four quarter turns")
    func rotationCycles() {
        var doc = makeDocument()
        for _ in 0..<4 { doc = doc.rotatedClockwise() }
        #expect(doc.rotationQuarterTurns == 0)
        #expect(doc.rotatedClockwise().rotationQuarterTurns == 1)
        #expect(doc.rotatedCounterClockwise().rotationQuarterTurns == 3)
    }

    @Test("applying a filter marks the document as edited")
    func filterMarksEdited() {
        let doc = makeDocument().settingFilter(.vivid)
        #expect(doc.hasEdits)
        #expect(doc.filter == .vivid)
    }

    @Test("source time maps onto the edited timeline after trimming")
    func sourceToEditedMapping() {
        let doc = makeDocument().settingInPoint(2)
        #expect(doc.editedTime(forSourceTime: 5).map { abs($0 - 3) < 0.001 } == true)
        #expect(doc.editedTime(forSourceTime: 1) == nil)
    }

    @Test("locate resolves an edited time to a segment and source time")
    func locateResolves() {
        let doc = makeDocument()
        let located = doc.locate(editedTime: 4)
        #expect(located?.index == 0)
        #expect(located.map { abs($0.sourceTime - 4) < 0.001 } == true)
    }

    @Test("every operation bumps the revision counter")
    func revisionBumps() {
        let doc = makeDocument()
        #expect(doc.rotatedClockwise().revision == doc.revision + 1)
        #expect(doc.settingFilter(.noir).revision == doc.revision + 1)
    }

    @Test("reset returns the document to a pristine state")
    func resetClearsEdits() {
        let edited = makeDocument()
            .settingFilter(.warm)
            .rotatedClockwise()
            .splitting(atEditedTime: 4)
        #expect(edited.hasEdits)
        #expect(edited.resettingAllEdits().hasEdits == false)
    }
}
