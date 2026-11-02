import XCTest
import AVFoundation
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// Le son de la marque, tel qu'AVFoundation le reçoit : la piste d'un jingle
/// reste lisible après son chargement, et l'export en une passe pose sur la
/// story la même enveloppe que `StoryExportBranding.wrap`.
@MainActor
final class StoryExportBrandAudioTests: XCTestCase {

    private func time(_ seconds: TimeInterval) -> CMTime {
        CMTime(seconds: seconds, preferredTimescale: 600)
    }

    private func assertRamps(_ got: [StoryExportJingleMix.Ramp], _ expected: [StoryExportJingleMix.Ramp],
                             file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(got.count, expected.count, "\(got) au lieu de \(expected)", file: file, line: line)
        for (ramp, want) in zip(got, expected) {
            XCTAssertEqual(ramp.from, want.from, accuracy: 0.001, file: file, line: line)
            XCTAssertEqual(ramp.to, want.to, accuracy: 0.001, file: file, line: line)
            XCTAssertEqual(ramp.start, want.start, accuracy: 0.01, file: file, line: line)
            XCTAssertEqual(ramp.end, want.end, accuracy: 0.01, file: file, line: line)
        }
    }

    /// Une `AVAssetTrack` ne retient pas son asset : rendue seule, elle fait
    /// échouer l'insertion (`-11800` / `-12780`) et tout l'emballage de marque
    /// avec elle — la story partait alors nue, sans interlude ni carte de fin.
    func test_loadJingle_theTrackStaysInsertableOnceTheCallReturns() async throws {
        let jingle = try await StoryExportBranding.loadJingle(.intro)
        let composition = AVMutableComposition()
        let track = try XCTUnwrap(composition.addMutableTrack(
            withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid))

        XCTAssertNoThrow(try track.insertTimeRange(CMTimeRange(start: .zero, duration: jingle.duration),
                                                   of: jingle.track, at: .zero),
                         "la piste du jingle doit rester insérable une fois chargée")
    }

    func test_volumeRamps_readBackTheEnvelopeTheParametersHold() {
        let parameters = AVMutableAudioMixInputParameters()
        parameters.setVolume(0.6, at: .zero)
        parameters.setVolumeRamp(fromStartVolume: 0, toEndVolume: 0.6,
                                 timeRange: CMTimeRange(start: time(1), duration: time(1)))
        parameters.setVolume(0.3, at: time(3))

        XCTAssertEqual(StoryExportBranding.volumeRamps(of: parameters), [
            .init(from: 0.6, to: 0.6, start: 0, end: 1),
            .init(from: 0, to: 0.6, start: 1, end: 2),
            .init(from: 0.3, to: 0.3, start: 3, end: 3)
        ])
    }

    func test_volumeRamps_withoutAnyVolume_isEmpty() {
        XCTAssertTrue(StoryExportBranding.volumeRamps(of: AVMutableAudioMixInputParameters()).isEmpty)
    }

    /// L'export en une passe suit `StoryExportJingleMix` : le jingle d'ouverture
    /// joue en entier et sans rampe, la story monte sous sa queue jusqu'au
    /// volume de l'auteur, puis s'éteint depuis ce volume avant le jingle de
    /// fermeture — une seule entrée par piste, aucune rampe qui se chevauche.
    func test_composeBrandAudio_followsTheJingleLaw_fromTheAuthorLevel() async throws {
        let composition = AVMutableComposition()
        let authoredTrack = try XCTUnwrap(composition.addMutableTrack(
            withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid))
        let nominalTrack = try XCTUnwrap(composition.addMutableTrack(
            withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid))
        let story = CMTimeRange(start: time(StoryExportIntro.holdDuration), duration: time(4))
        let authored = AVMutableAudioMixInputParameters(track: authoredTrack)
        authored.setVolume(0.5, at: story.start)

        let introJingle = try await StoryExportBranding.brandJingle(.intro)
        let outroJingle = try await StoryExportBranding.brandJingle(.outro)
        let jingleEnd = try await AVURLAsset(url: introJingle).load(.duration)
        let plan = StoryExportBranding.Plan(
            introClip: nil, introJingle: introJingle, outroClip: outroJingle, outroJingle: outroJingle,
            storyStart: story.start,
            introFade: CMTimeRange(start: story.start, duration: time(StoryExportIntro.crossfadeDuration)),
            outroDuration: time(StoryExportOutro.duration), outroJingleOffset: .zero)
        let outroFade = CMTimeRange(start: CMTimeSubtract(story.end, time(StoryExportBranding.outroOverlap)),
                                    end: story.end)

        let parameters = try await StoryExporter.composeBrandAudio(
            plan: plan, composition: composition, story: story, outroFade: outroFade,
            storyAudioTracks: [authoredTrack, nominalTrack], storyParameters: [authored])

        XCTAssertEqual(parameters.map(\.trackID), [authoredTrack.trackID, nominalTrack.trackID],
                       "une entrée par piste de la story ; les jingles jouent tels qu'ils ont été synthétisés")
        let introTrack = try XCTUnwrap(composition.tracks(withMediaType: .audio).first {
            ![authoredTrack.trackID, nominalTrack.trackID].contains($0.trackID)
        })
        XCTAssertEqual(introTrack.timeRange.end.seconds, jingleEnd.seconds, accuracy: 0.01,
                       "le jingle d'ouverture joue en entier")

        func law(_ author: [StoryExportJingleMix.Ramp]) -> [StoryExportJingleMix.Ramp] {
            StoryExportJingleMix.storyRamps(over: author, storyStart: story.start.seconds,
                                            storyEnd: story.end.seconds, introJingleEnd: jingleEnd.seconds,
                                            outroJingleStart: outroFade.start.seconds,
                                            outroFade: StoryExportJingleMix.logoOutroDuck)
        }
        assertRamps(StoryExportBranding.volumeRamps(of: parameters[0]),
                    law([.init(from: 0.5, to: 0.5, start: story.start.seconds, end: story.start.seconds)]))
        assertRamps(StoryExportBranding.volumeRamps(of: parameters[1]), law([]))
    }
}
