import XCTest
@testable import MeeshySDK

/// Règle de capacité plateforme du composant unifié « Enregistrer » :
/// quelles destinations sont proposées pour chaque famille d'attachment.
/// La photothèque n'accepte QUE les images et les vidéos (contrainte
/// PHPhotoLibrary) ; tout le reste passe par Fichiers ou le partage.
final class MediaSaveDestinationTests: XCTestCase {

    func test_available_image_offersPhotoLibraryFirst() {
        XCTAssertEqual(
            MediaSaveDestination.available(for: .image),
            [.photoLibrary, .files, .share]
        )
    }

    func test_available_video_offersPhotoLibraryFirst() {
        XCTAssertEqual(
            MediaSaveDestination.available(for: .video),
            [.photoLibrary, .files, .share]
        )
    }

    func test_available_audio_neverOffersPhotoLibrary() {
        XCTAssertEqual(
            MediaSaveDestination.available(for: .audio),
            [.files, .share]
        )
    }

    func test_available_documentFamilies_neverOfferPhotoLibrary() {
        let documentKinds: [AttachmentKind] = [
            .pdf, .spreadsheet, .document, .presentation, .archive, .code, .text, .other
        ]
        for kind in documentKinds {
            XCTAssertEqual(
                MediaSaveDestination.available(for: kind),
                [.files, .share],
                "kind \(kind) must not offer the photo library"
            )
        }
    }

    func test_available_coversEveryAttachmentKind_nonEmpty() {
        for kind in AttachmentKind.allCases {
            XCTAssertFalse(
                MediaSaveDestination.available(for: kind).isEmpty,
                "every kind must have at least one save destination (\(kind))"
            )
        }
    }

    func test_accepts_photoLibrary_onlyForImageAndVideo() {
        for kind in AttachmentKind.allCases {
            let expected = (kind == .image || kind == .video)
            XCTAssertEqual(
                MediaSaveDestination.photoLibrary.accepts(kind), expected,
                "photoLibrary.accepts(\(kind)) must be \(expected)"
            )
        }
    }

    func test_accepts_filesAndShare_acceptEveryKind() {
        for kind in AttachmentKind.allCases {
            XCTAssertTrue(MediaSaveDestination.files.accepts(kind))
            XCTAssertTrue(MediaSaveDestination.share.accepts(kind))
        }
    }

    func test_sfSymbolName_isStablePerDestination() {
        XCTAssertEqual(MediaSaveDestination.photoLibrary.sfSymbolName, "photo.on.rectangle")
        XCTAssertEqual(MediaSaveDestination.files.sfSymbolName, "folder")
        XCTAssertEqual(MediaSaveDestination.share.sfSymbolName, "square.and.arrow.up")
    }
}
