import Foundation
import AVFoundation
import UIKit
@testable import Meeshy

/// La caméra du moment photo, sans objectif : ce qu'elle rend est décidé par le témoin.
@MainActor
final class MockGamePhotoCamera: GamePhotoCameraProviding {
    nonisolated deinit {}

    let session = AVCaptureSession()
    var startResult: CameraFailure?
    var shot: UIImage? = MockGamePhotoCamera.pixel()
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private(set) var captureCount = 0
    private var live = false

    func start() async -> CameraFailure? {
        startCount += 1
        live = startResult == nil
        return startResult
    }

    func stop() {
        stopCount += 1
        live = false
    }

    func capture() async -> UIImage? {
        captureCount += 1
        return live ? shot : nil
    }

    static func pixel() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }
}

/// Le compositeur : il note ce qu'on lui a donné et rend des octets reconnaissables.
@MainActor
final class MockGamePhotoComposer: GamePhotoComposing {
    nonisolated deinit {}

    var succeeds = true
    private(set) var composed: [(moment: PhotoMoment, hadSource: Bool, mode: PhotoMode)] = []

    func compose(moment: PhotoMoment, source: UIImage?, mode: PhotoMode, date: Date) -> ComposedPhoto? {
        composed.append((moment, source != nil, mode))
        guard succeeds else { return nil }
        let image = MockGamePhotoCamera.pixel()
        return ComposedPhoto(
            story: image, square: image,
            storyData: Data("story".utf8), squareData: Data("square".utf8), mode: mode
        )
    }
}

@MainActor
final class MockGameHaptics: GameHapticsProviding {
    nonisolated deinit {}

    private(set) var played: [[GameHapticTap]] = []

    func play(_ taps: [GameHapticTap]) {
        played.append(taps)
    }
}

/// La photothèque : ce qui lui est confié se relit, un refus se simule.
final class MockPhotoLibrarySaver: PhotoLibrarySaving, @unchecked Sendable {
    var fails = false
    private(set) var savedImages: [Data] = []

    func saveImage(_ data: Data) async throws {
        if fails { throw MediaSaveError.photoLibraryDenied }
        savedImages.append(data)
    }

    func saveVideo(at url: URL) async throws {}
}
