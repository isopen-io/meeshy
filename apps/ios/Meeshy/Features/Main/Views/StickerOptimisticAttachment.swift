import UIKit
import MeeshySDK

enum StickerOptimisticAttachment {

    /// Le poids reste à 0 : il naît de l'encodage et toutes les surfaces le taisent.
    /// `alt` et `caption` portent le MÊME texte, celui que le sticker montre ;
    /// sans sticker (PNG de « Mes stickers »), ils restent nils.
    static func make(
        image: UIImage, attachmentId: String, mimeType: String, fileURL: URL,
        sticker: MessageSticker?, uploadedBy: String, color: String
    ) -> MeeshyMessageAttachment {
        let fileName = StickerSendPipeline.fileName(for: attachmentId, mimeType: mimeType)
        let localKey = fileURL.absoluteString
        var attachment = MeeshyMessageAttachment(
            id: attachmentId,
            fileName: fileName, originalName: fileName,
            mimeType: mimeType, fileSize: 0,
            fileUrl: localKey,
            width: Int(image.size.width * image.scale),
            height: Int(image.size.height * image.scale),
            thumbnailUrl: localKey,
            uploadedBy: uploadedBy,
            thumbnailColor: color
        )
        guard let texte = sticker.flatMap(StickerAltText.describe) else { return attachment }
        attachment.alt = texte
        attachment.caption = texte
        return attachment
    }
}
