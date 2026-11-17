import Foundation

extension MeeshyKitRGB {
    /// Lit un code hexadécimal de six chiffres (avec ou sans « # ») ; tout autre texte rend `nil`.
    public nonisolated init?(hex: String) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
