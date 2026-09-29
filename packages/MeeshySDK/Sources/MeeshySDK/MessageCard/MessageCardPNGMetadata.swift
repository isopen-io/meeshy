import Foundation

/// **LES MÉTADONNÉES D'UNE CARTE EXPORTÉE** — le PNG dit qui l'a CRÉÉ :
/// Meeshy. Miroir de `apps/web/src/lib/export/png-metadata.ts` : des blocs
/// `tEXt` (lus par les outils et les éditeurs) et un bloc XMP `iTXt`
/// (`xmp:CreatorTool`, lu par Photos et les galeries), posés juste après
/// `IHDR` comme le veut la norme, sans toucher un pixel.
///
/// Rien de l'exportateur n'y entre : son pseudo est dans le filigrane, qu'il
/// voit ; une métadonnée qu'il ne voit pas n'emporte rien de lui.
public struct MessageCardPNGMetadata: Equatable, Sendable {
    public struct Entry: Equatable, Sendable {
        public let keyword: String
        public let value: String

        public init(keyword: String, value: String) {
            self.keyword = keyword
            self.value = value
        }
    }

    /// Les blocs `tEXt`, dans l'ordre où ils sont écrits.
    public let text: [Entry]
    public let xmpCreatorTool: String

    public init(text: [Entry], xmpCreatorTool: String) {
        self.text = text
        self.xmpCreatorTool = xmpCreatorTool
    }

    public static let meeshy = MessageCardPNGMetadata(
        text: [
            Entry(keyword: "Software", value: "Meeshy"),
            Entry(keyword: "Source", value: "Meeshy"),
            Entry(keyword: "Comment", value: "Created with Meeshy (https://meeshy.me)"),
        ],
        xmpCreatorTool: "Meeshy"
    )

    private static let signature: [UInt8] = [137, 80, 78, 71, 13, 10, 26, 10]

    private static let crcTable: [UInt32] = (0..<256).map { n -> UInt32 in
        var c = UInt32(n)
        for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1 }
        return c
    }

    public static func crc32(_ bytes: some Sequence<UInt8>) -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in bytes { crc = crcTable[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8) }
        return crc ^ 0xFFFF_FFFF
    }

    private static func latin1(_ text: String) -> [UInt8] {
        text.unicodeScalars.map { $0.value < 256 ? UInt8($0.value) : 63 }
    }

    private static func bigEndian(_ value: UInt32) -> [UInt8] {
        [UInt8((value >> 24) & 0xFF), UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)]
    }

    private static func readUInt32(_ bytes: [UInt8], at offset: Int) -> UInt32 {
        bytes[offset..<offset + 4].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
    }

    private static func chunk(_ type: String, _ data: [UInt8]) -> [UInt8] {
        let typeAndData = latin1(type) + data
        return bigEndian(UInt32(data.count)) + typeAndData + bigEndian(crc32(typeAndData))
    }

    private static func xmpPacket(_ creatorTool: String) -> String {
        "<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?><x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"><rdf:Description rdf:about=\"\" xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\"><xmp:CreatorTool>\(creatorTool)</xmp:CreatorTool></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end=\"r\"?>"
    }

    private static func isPNG(_ bytes: [UInt8]) -> Bool {
        bytes.count > 33 && Array(bytes.prefix(8)) == signature
    }

    /// Le PNG avec ses métadonnées ; tout autre contenu ressort tel quel.
    public func stamp(_ png: Data) -> Data {
        let bytes = [UInt8](png)
        guard Self.isPNG(bytes) else { return png }
        let ihdrEnd = 8 + 12 + Int(Self.readUInt32(bytes, at: 8))
        guard ihdrEnd <= bytes.count else { return png }
        let textChunks = text.flatMap { Self.chunk("tEXt", Self.latin1($0.keyword) + [0] + Self.latin1($0.value)) }
        // iTXt non compressé : mot-clé, 0, drapeau 0, méthode 0, langue vide, 0, mot traduit vide, 0, texte UTF-8.
        let xmp = Self.chunk("iTXt", Self.latin1("XML:com.adobe.xmp") + [0, 0, 0, 0, 0] + Array(Self.xmpPacket(xmpCreatorTool).utf8))
        var stamped = Array(bytes[0..<ihdrEnd])
        stamped += textChunks
        stamped += xmp
        stamped += bytes[ihdrEnd...]
        return Data(stamped)
    }

    /// Les blocs texte d'un PNG (`tEXt` et `iTXt` non compressés) — pour les témoins et les outils.
    public static func textChunks(of png: Data) -> [String: String] {
        let bytes = [UInt8](png)
        var entries: [String: String] = [:]
        var offset = 8
        while offset + 12 <= bytes.count {
            let length = Int(readUInt32(bytes, at: offset))
            guard offset + 12 + length <= bytes.count else { break }
            let type = String(decoding: bytes[offset + 4..<offset + 8], as: UTF8.self)
            let data = Array(bytes[offset + 8..<offset + 8 + length])
            if let nul = data.firstIndex(of: 0), nul > 0 {
                let keyword = String(decoding: data[0..<nul], as: UTF8.self)
                if type == "tEXt" {
                    entries[keyword] = String(data[(nul + 1)...].map { Character(Unicode.Scalar($0)) })
                } else if type == "iTXt", nul + 3 < data.count,
                          let afterLanguage = data[(nul + 3)...].firstIndex(of: 0),
                          let afterTranslated = data[(afterLanguage + 1)...].firstIndex(of: 0) {
                    entries[keyword] = String(decoding: data[(afterTranslated + 1)...], as: UTF8.self)
                }
            }
            offset += 12 + length
        }
        return entries
    }
}
