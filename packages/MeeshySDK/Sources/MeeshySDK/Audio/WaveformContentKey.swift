import Foundation

// MARK: - L'identité d'un relevé

/// **La clé d'un relevé est l'empreinte du CONTENU, pas son nom.**
///
/// `lastPathComponent` confondait deux `recording.m4a` et recalculait une copie
/// sous un autre nom. L'empreinte (FNV-1a 64 bits) couvre la TAILLE, les premiers
/// et les derniers 64 Kio : assez pour distinguer deux sons, sans relire un
/// fichier de dix minutes. La voie Data et la voie fichier lisent les mêmes
/// octets et rendent donc la même clé.
///
/// Une URL distante n'est pas lue : elle est clé par son adresse.
public enum WaveformContentKey {

    static let window = 65_536

    public static func identity(of data: Data) -> String {
        digest(head: data.prefix(window), tail: data.suffix(window), length: UInt64(data.count))
    }

    public static func identity(of url: URL) -> String {
        guard url.isFileURL else { return addressKey(url.absoluteString) }
        return fileDigest(url) ?? addressKey(url.path)
    }

    private static func fileDigest(_ url: URL) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? handle.close() }
        guard let length = try? handle.seekToEnd(), length > 0,
              (try? handle.seek(toOffset: 0)) != nil,
              let head = try? handle.read(upToCount: window) else { return nil }
        let tailStart = length > UInt64(window) ? length - UInt64(window) : 0
        guard (try? handle.seek(toOffset: tailStart)) != nil,
              let tail = try? handle.read(upToCount: window) else { return nil }
        return digest(head: head, tail: tail, length: length)
    }

    private static func digest(head: Data, tail: Data, length: UInt64) -> String {
        let lengthBytes = withUnsafeBytes(of: length.littleEndian) { Data($0) }
        let mixed = fnv(tail, seed: fnv(head, seed: fnv(lengthBytes, seed: offsetBasis)))
        return "c-" + hex(mixed)
    }

    private static func addressKey(_ address: String) -> String {
        "u-" + hex(fnv(Data(address.utf8), seed: offsetBasis))
    }

    private static func hex(_ value: UInt64) -> String {
        String(format: "%016llx", value)
    }

    private static let offsetBasis: UInt64 = 14_695_981_039_346_656_037

    private static func fnv(_ data: Data, seed: UInt64) -> UInt64 {
        data.reduce(seed) { ($0 ^ UInt64($1)) &* 1_099_511_628_211 }
    }
}
