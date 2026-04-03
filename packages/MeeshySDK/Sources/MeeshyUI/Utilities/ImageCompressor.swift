import UIKit

public enum ImageCompressor {
    public static func compress(_ image: UIImage, maxSizeKB: Int) -> Data {
        var compression: CGFloat = 0.8
        var compressed = image.jpegData(compressionQuality: compression) ?? Data()
        while compressed.count > maxSizeKB * 1024, compression > 0.1 {
            compression -= 0.1
            compressed = image.jpegData(compressionQuality: compression) ?? Data()
        }
        return compressed
    }
}
