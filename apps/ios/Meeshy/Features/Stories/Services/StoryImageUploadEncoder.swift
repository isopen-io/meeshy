import Foundation
import UIKit
import MeeshySDK

/// Le fichier temporaire qu'un média image de story remet au téléversement.
nonisolated struct StoryImageUploadFile: Sendable {
    let url: URL
    let mimeType: String
}

/// **Une image de story part par les OCTETS de son fichier** (#11847) : ceux de
/// la prise, écrits une fois par le viseur, passent par la loi unique
/// (`OutgoingImagePreparer`) — lieu retiré sans ré-encoder, HD gardée, une
/// génération au plus. Sans fichier lisible (fond de slide, brouillon repris),
/// l'image décodée part en UNE génération JPEG, comme avant.
nonisolated enum StoryImageUploadEncoder {

    @concurrent
    static func temporaryFile(for image: UIImage, file: URL?, policy: OutgoingImagePolicy,
                              compressor: MediaCompressor = .shared) async throws -> StoryImageUploadFile {
        let encoded = await encode(image, file: file, policy: policy, compressor: compressor)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("image_\(UUID().uuidString).\(encoded.fileExtension)")
        try encoded.data.write(to: url)
        return StoryImageUploadFile(url: url, mimeType: encoded.mimeType)
    }

    /// Le fichier local d'un média, quand son adresse en désigne un.
    static func localFile(_ mediaURL: String?) -> URL? {
        guard let mediaURL, let url = URL(string: mediaURL), url.isFileURL else { return nil }
        return url
    }

    private static func encode(_ image: UIImage, file: URL?, policy: OutgoingImagePolicy,
                               compressor: MediaCompressor) async -> CompressedImageResult {
        guard let file, let data = try? Data(contentsOf: file),
              let prepared = await compressor.compressImageData(data, policy: policy),
              prepared.pixelSize != nil else {
            return await compressor.compressImage(image)
        }
        return prepared
    }
}
