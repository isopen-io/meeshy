import XCTest
@testable import MeeshySDK

/// **Une coupe CONTINUE la source** (#14224) : la seconde moitié d'une vidéo
/// ou d'un son coupé reprend la source là où la coupe a eu lieu, au lieu de la
/// rejouer depuis son début ; annuler rend l'original exact.
final class SplitClipSourceWindowTests: XCTestCase {

    private func project(video sourceStart: Double? = nil, sourceEnd: Double? = nil) -> TimelineProject {
        var project = TimelineProject(slideId: "s1", slideDuration: 10.0)
        project.mediaObjects = [
            StoryMediaObject(id: "v1", postMediaId: "pm", mediaType: "video", placement: "media",
                             aspectRatio: 1.0, startTime: 1, duration: 5.0,
                             sourceStart: sourceStart, sourceEnd: sourceEnd)
        ]
        return project
    }

    private func split(_ kind: TimelineClipKind, at seconds: Float, id: String = "v1") -> SplitClipCommand {
        SplitClipCommand(clipId: id, kind: kind, splitAtRelativeTime: seconds, leftId: "L", rightId: "R")
    }

    func test_laSecondeMoitieDUneVideo_reprendLaSourceAuPointDeCoupe() throws {
        var p = project(video: 3)
        try split(.video, at: 2).apply(to: &p)
        XCTAssertEqual(p.mediaObjects[0].sourceStart, 3)
        XCTAssertEqual(p.mediaObjects[0].sourceEnd, 5)
        XCTAssertEqual(p.mediaObjects[1].sourceStart, 5)
        XCTAssertNil(p.mediaObjects[1].sourceEnd)
    }

    func test_uneVideoSansBorne_seCoupeDepuisLeDebutDeLaSource() throws {
        var p = project()
        try split(.video, at: 2).apply(to: &p)
        XCTAssertEqual(p.mediaObjects[0].sourceEnd, 2)
        XCTAssertEqual(p.mediaObjects[1].sourceStart, 2)
    }

    func test_laSortieDeLaSource_resteCelleDeLaSecondeMoitie() throws {
        var p = project(video: 1, sourceEnd: 6)
        try split(.video, at: 2).apply(to: &p)
        XCTAssertEqual(p.mediaObjects[0].sourceEnd, 3)
        XCTAssertEqual(p.mediaObjects[1].sourceStart, 3)
        XCTAssertEqual(p.mediaObjects[1].sourceEnd, 6)
    }

    func test_annulerLaCoupe_rendLesBornesDOrigine() throws {
        var p = project(video: 1, sourceEnd: 6)
        let original = p.mediaObjects[0]
        let cmd = split(.video, at: 2)
        try cmd.apply(to: &p)
        try cmd.revert(from: &p)
        XCTAssertEqual(p.mediaObjects.count, 1)
        XCTAssertEqual(p.mediaObjects[0].sourceStart, original.sourceStart)
        XCTAssertEqual(p.mediaObjects[0].sourceEnd, original.sourceEnd)
        XCTAssertEqual(p.mediaObjects[0].duration, original.duration)
    }

    func test_annulerLaCoupeDUneVideoSansBorne_neLaisseAucuneBorne() throws {
        var p = project()
        let cmd = split(.video, at: 2)
        try cmd.apply(to: &p)
        try cmd.revert(from: &p)
        XCTAssertNil(p.mediaObjects[0].sourceStart)
        XCTAssertNil(p.mediaObjects[0].sourceEnd)
    }

    /// Une image n'a pas de temps de source : la coupe n'y écrit aucune borne.
    func test_uneImageCoupee_neRecoitAucuneBorneDeSource() throws {
        var p = TimelineProject(slideId: "s1", slideDuration: 10.0)
        p.mediaObjects = [StoryMediaObject(id: "i1", postMediaId: "pm", mediaType: "image", placement: "media",
                                           aspectRatio: 1.0, startTime: 0, duration: 4.0)]
        try split(.image, at: 1, id: "i1").apply(to: &p)
        XCTAssertNil(p.mediaObjects[1].sourceStart)
        XCTAssertNil(p.mediaObjects[0].sourceEnd)
    }

    func test_laSecondeMoitieDUnSon_reprendLaSourceAuPointDeCoupe() throws {
        var p = TimelineProject(slideId: "s1", slideDuration: 10.0)
        p.audioPlayerObjects = [StoryAudioPlayerObject(id: "a1", postMediaId: "pm", placement: "overlay",
                                                       waveformSamples: [], startTime: 0, duration: 6.0,
                                                       sourceStart: 4)]
        let cmd = split(.audio, at: 1.5, id: "a1")
        try cmd.apply(to: &p)
        XCTAssertEqual(p.audioPlayerObjects[0].sourceEnd, 5.5)
        XCTAssertEqual(p.audioPlayerObjects[1].sourceStart, 5.5)
        try cmd.revert(from: &p)
        XCTAssertEqual(p.audioPlayerObjects[0].sourceStart, 4)
        XCTAssertNil(p.audioPlayerObjects[0].sourceEnd)
    }
}
