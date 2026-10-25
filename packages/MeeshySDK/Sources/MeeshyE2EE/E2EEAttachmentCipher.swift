import CommonCrypto
import CryptoKit
import Foundation
import MeeshySDK
import Security

/// Ce qu'il faut pour rouvrir UNE pièce : sa clé, le condensat de son blob et
/// sa taille exacte. Voyage dans le pointeur de `E2EEContent`, donc sous
/// libsignal, jamais en clair au serveur.
public struct E2EEAttachmentSecret: Equatable, Sendable {
    public let key: Data
    public let digest: Data
    public let size: Int

    public init(key: Data, digest: Data, size: Int) {
        self.key = key
        self.digest = digest
        self.size = size
    }
}

/// Un blob chiffré en mémoire et ce qui le rouvre.
public struct E2EEAttachmentSealed: Equatable, Sendable {
    public let blob: Data
    public let secret: E2EEAttachmentSecret
}

public enum E2EEAttachmentCipherError: Error, Equatable {
    /// Le condensat du blob n'est pas celui que l'expéditeur a scellé : blob altéré ou remplacé.
    case digestMismatch
    /// Le HMAC ne correspond pas : mauvaise clé, ou blob forgé avec un condensat accordé.
    case macMismatch
    /// Clé, condensat ou blob de forme impossible.
    case malformed
    /// La taille annoncée dépasse le clair déchiffré.
    case sizeMismatch
    /// Le générateur aléatoire ou le disque a refusé.
    case unavailable
}

/// **Le format `client-v1` des pièces jointes chiffrées de bout en bout**
/// (#10789), celui de Signal, repris sans réglage :
/// - clé de 64 octets, 32 pour AES-256 et 32 pour HMAC-SHA256 (Signal-Android
///   `AttachmentCipherOutputStream`, `Util.split(key, 32, 32)`) ;
/// - clair complété de zéros à `paddedSize` (Signal-iOS `Cryptography.paddedSize`) ;
/// - blob `IV ‖ AES-256-CBC-PKCS7(clair complété) ‖ HMAC-SHA256(IV ‖ chiffré)` ;
/// - condensat SHA-256 du blob entier.
///
/// L'ouverture vérifie le condensat (temps constant), puis le HMAC (temps
/// constant), et ne déchiffre qu'après : un blob altéré ne rend rien, pas même
/// un fichier partiel. CommonCrypto pour AES-CBC, CryptoKit pour HMAC et
/// SHA-256 ; le jumeau TypeScript (`packages/shared/utils/e2ee-attachment-cipher.ts`)
/// reproduit les mêmes vecteurs, écrits par OpenSSL.
///
/// Modèle de menace : serveur compromis qui lit le disque (il ne voit que le
/// blob et sa taille arrondie) et qui altère, tronque ou remplace un blob (le
/// condensat et le HMAC le refusent). Composition écrite par Meeshy à partir de
/// primitives standard : surface de revue externe (#3710).
public enum E2EEAttachmentCipher {
    public static let scheme = "client-v1"

    static let keyBytes = 64
    static let ivBytes = 16
    static let macBytes = 32
    static let digestBytes = 32
    static let blockBytes = kCCBlockSizeAES128
    static let chunkBytes = 64 * 1024

    /// La taille que le serveur voit : le clair arrondi au palier de 5 % de Signal, 541 octets au moins.
    public static func paddedSize(_ size: Int) -> Int {
        guard size > 0 else { return 541 }
        return max(541, Int(floor(pow(1.05, ceil(log(Double(size)) / log(1.05))))))
    }

    /// La taille du blob d'un clair de `size` octets.
    public static func blobSize(forPlaintextSize size: Int) -> Int {
        ivBytes + (paddedSize(size) / blockBytes + 1) * blockBytes + macBytes
    }

    // MARK: - Scellement

    public static func seal(_ plaintext: Data, key: Data? = nil, iv: Data? = nil) throws -> E2EEAttachmentSealed {
        var blob = Data(capacity: blobSize(forPlaintextSize: plaintext.count))
        var offset = 0
        let secret = try seal(
            size: plaintext.count, key: key, iv: iv,
            read: {
                let end = min(offset + chunkBytes, plaintext.count)
                defer { offset = end }
                return plaintext.subdata(in: offset..<end)
            },
            write: { blob.append($0) }
        )
        return E2EEAttachmentSealed(blob: blob, secret: secret)
    }

    /// Chiffre un fichier en flux vers `destination`, sans jamais le charger entier.
    public static func seal(fileAt source: URL, to destination: URL, key: Data? = nil, iv: Data? = nil) throws -> E2EEAttachmentSecret {
        let size = try fileSize(of: source)
        let input = try FileHandle(forReadingFrom: source)
        defer { try? input.close() }
        let output = try newFile(at: destination, protection: nil)
        do {
            defer { try? output.close() }
            return try seal(
                size: size, key: key, iv: iv,
                read: { try input.read(upToCount: chunkBytes) ?? Data() },
                write: { try output.write(contentsOf: $0) }
            )
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw error
        }
    }

    private static func seal(
        size: Int, key fixedKey: Data?, iv fixedIV: Data?,
        read: () throws -> Data, write: (Data) throws -> Void
    ) throws -> E2EEAttachmentSecret {
        let key = try fixedKey ?? randomBytes(keyBytes)
        let iv = try fixedIV ?? randomBytes(ivBytes)
        guard key.count == keyBytes, iv.count == ivBytes else { throw E2EEAttachmentCipherError.malformed }
        let cryptor = try AESCBC(operation: CCOperation(kCCEncrypt), key: Data(key.prefix(32)), iv: iv)
        var mac = HMAC<SHA256>(key: SymmetricKey(data: key.suffix(32)))
        var digest = SHA256()
        let emit: (Data) throws -> Void = { chunk in
            guard !chunk.isEmpty else { return }
            digest.update(data: chunk)
            try write(chunk)
        }
        let encrypted: (Data) throws -> Void = { chunk in
            mac.update(data: chunk)
            try emit(chunk)
        }
        mac.update(data: iv)
        try emit(iv)
        var consumed = 0
        while consumed < size {
            let chunk = try read()
            guard !chunk.isEmpty else { throw E2EEAttachmentCipherError.unavailable }
            consumed += chunk.count
            try encrypted(try cryptor.update(chunk))
        }
        guard consumed == size else { throw E2EEAttachmentCipherError.unavailable }
        var padding = paddedSize(size) - size
        while padding > 0 {
            let zeros = min(padding, chunkBytes)
            try encrypted(try cryptor.update(Data(count: zeros)))
            padding -= zeros
        }
        try encrypted(try cryptor.finish())
        let tag = Data(mac.finalize())
        try emit(tag)
        return E2EEAttachmentSecret(key: key, digest: Data(digest.finalize()), size: size)
    }

    // MARK: - Ouverture

    public static func open(_ blob: Data, with secret: E2EEAttachmentSecret) throws -> Data {
        try verify(digestOf: { body in try body(blob) }, blobSize: blob.count, secret: secret)
        let authenticated = blob.subdata(in: 0..<(blob.count - macBytes))
        try verifyMAC(Data(HMAC<SHA256>.authenticationCode(for: authenticated, using: SymmetricKey(data: secret.key.suffix(32)))),
                      against: blob.suffix(macBytes))
        let cryptor = try AESCBC(operation: CCOperation(kCCDecrypt), key: Data(secret.key.prefix(32)), iv: Data(blob.prefix(ivBytes)))
        var padded = try cryptor.update(blob.subdata(in: ivBytes..<(blob.count - macBytes)))
        padded.append(try cryptor.finish())
        guard secret.size <= padded.count else { throw E2EEAttachmentCipherError.sizeMismatch }
        return Data(padded.prefix(secret.size))
    }

    /// Ouvre un blob sur disque vers `destination`, après vérification complète.
    /// Le clair n'est écrit que si condensat ET HMAC sont justes, dans un fichier
    /// à la protection `protection` ; un échec n'en laisse aucun.
    public static func open(
        fileAt source: URL,
        to destination: URL,
        with secret: E2EEAttachmentSecret,
        protection: FileProtectionType? = .complete
    ) throws {
        let size = try fileSize(of: source)
        try verify(digestOf: { body in try chunks(of: source, body) }, blobSize: size, secret: secret)
        var mac = HMAC<SHA256>(key: SymmetricKey(data: secret.key.suffix(32)))
        try chunks(of: source, upTo: size - macBytes) { mac.update(data: $0) }
        try verifyMAC(Data(mac.finalize()), against: try bytes(of: source, at: size - macBytes, count: macBytes))

        let partial = destination.appendingPathExtension("partial")
        do {
            try decrypt(source, blobSize: size, secret: secret, into: partial, protection: protection)
            if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
            try FileManager.default.moveItem(at: partial, to: destination)
        } catch {
            try? FileManager.default.removeItem(at: partial)
            throw error
        }
    }

    private static func decrypt(_ source: URL, blobSize: Int, secret: E2EEAttachmentSecret, into partial: URL, protection: FileProtectionType?) throws {
        let iv = try bytes(of: source, at: 0, count: ivBytes)
        let cryptor = try AESCBC(operation: CCOperation(kCCDecrypt), key: Data(secret.key.prefix(32)), iv: iv)
        let output = try newFile(at: partial, protection: protection)
        defer { try? output.close() }
        var remaining = secret.size
        let keep: (Data) throws -> Void = { chunk in
            let kept = chunk.prefix(remaining)
            remaining -= kept.count
            if !kept.isEmpty { try output.write(contentsOf: kept) }
        }
        try chunks(of: source, from: ivBytes, upTo: blobSize - macBytes) { try keep(try cryptor.update($0)) }
        try keep(try cryptor.finish())
        guard remaining == 0 else { throw E2EEAttachmentCipherError.sizeMismatch }
    }

    /// Condensat d'abord, puis la forme : un blob tronqué que l'expéditeur n'a
    /// pas scellé échoue sur son condensat, un blob scellé tronqué sur sa forme.
    private static func verify(
        digestOf feed: ((Data) throws -> Void) throws -> Void,
        blobSize: Int,
        secret: E2EEAttachmentSecret
    ) throws {
        guard secret.key.count == keyBytes, secret.digest.count == digestBytes, secret.size >= 0 else {
            throw E2EEAttachmentCipherError.malformed
        }
        var digest = SHA256()
        try feed { digest.update(data: $0) }
        guard constantTimeEqual(Data(digest.finalize()), secret.digest) else { throw E2EEAttachmentCipherError.digestMismatch }
        let ciphertext = blobSize - ivBytes - macBytes
        guard ciphertext >= blockBytes, ciphertext % blockBytes == 0 else { throw E2EEAttachmentCipherError.malformed }
    }

    private static func verifyMAC(_ computed: Data, against received: Data) throws {
        guard constantTimeEqual(computed, received) else { throw E2EEAttachmentCipherError.macMismatch }
    }

    /// Égalité sans court-circuit : la durée ne dit pas où les deux valeurs diffèrent.
    static func constantTimeEqual(_ left: Data, _ right: Data) -> Bool {
        guard left.count == right.count else { return false }
        return zip(left, right).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
    }

    // MARK: - Octets et fichiers

    private static func randomBytes(_ count: Int) throws -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else {
            throw E2EEAttachmentCipherError.unavailable
        }
        return Data(bytes)
    }

    private static func fileSize(of url: URL) throws -> Int {
        guard let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber else {
            throw E2EEAttachmentCipherError.unavailable
        }
        return size.intValue
    }

    private static func newFile(at url: URL, protection: FileProtectionType?) throws -> FileHandle {
        let attributes: [FileAttributeKey: Any]? = protection.map { [.protectionKey: $0] }
        guard FileManager.default.createFile(atPath: url.path, contents: nil, attributes: attributes) else {
            throw E2EEAttachmentCipherError.unavailable
        }
        return try FileHandle(forWritingTo: url)
    }

    private static func bytes(of url: URL, at offset: Int, count: Int) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        return try handle.read(upToCount: count) ?? Data()
    }

    private static func chunks(of url: URL, _ body: (Data) throws -> Void) throws {
        try chunks(of: url, from: 0, upTo: try fileSize(of: url), body)
    }

    private static func chunks(of url: URL, from start: Int = 0, upTo end: Int, _ body: (Data) throws -> Void) throws {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(start))
        var position = start
        while position < end {
            guard let chunk = try handle.read(upToCount: min(chunkBytes, end - position)), !chunk.isEmpty else {
                throw E2EEAttachmentCipherError.unavailable
            }
            position += chunk.count
            try body(chunk)
        }
    }
}

/// AES-256-CBC-PKCS7 de CommonCrypto, en flux.
private final class AESCBC {
    private var ref: CCCryptorRef?

    init(operation: CCOperation, key: Data, iv: Data) throws {
        guard key.count == kCCKeySizeAES256, iv.count == kCCBlockSizeAES128 else { throw E2EEAttachmentCipherError.malformed }
        let status = key.withUnsafeBytes { keyBytes in
            iv.withUnsafeBytes { ivBytes in
                CCCryptorCreate(operation, CCAlgorithm(kCCAlgorithmAES), CCOptions(kCCOptionPKCS7Padding),
                                keyBytes.baseAddress, key.count, ivBytes.baseAddress, &ref)
            }
        }
        guard status == kCCSuccess, ref != nil else { throw E2EEAttachmentCipherError.unavailable }
    }

    deinit { CCCryptorRelease(ref) }

    func update(_ input: Data) throws -> Data {
        guard !input.isEmpty else { return Data() }
        var output = Data(count: CCCryptorGetOutputLength(ref, input.count, false))
        var moved = 0
        let capacity = output.count
        let status = input.withUnsafeBytes { inBytes in
            output.withUnsafeMutableBytes { outBytes in
                CCCryptorUpdate(ref, inBytes.baseAddress, input.count, outBytes.baseAddress, capacity, &moved)
            }
        }
        guard status == kCCSuccess else { throw E2EEAttachmentCipherError.malformed }
        return output.prefix(moved)
    }

    func finish() throws -> Data {
        var output = Data(count: kCCBlockSizeAES128)
        var moved = 0
        let capacity = output.count
        let status = output.withUnsafeMutableBytes { outBytes in
            CCCryptorFinal(ref, outBytes.baseAddress, capacity, &moved)
        }
        guard status == kCCSuccess else { throw E2EEAttachmentCipherError.malformed }
        return output.prefix(moved)
    }
}

public extension E2EEAttachmentPointer {
    /// Ce qui rouvre la pièce.
    var secret: E2EEAttachmentSecret { E2EEAttachmentSecret(key: key, digest: digest, size: size) }
}

public extension E2EEAttachmentPointer.Thumbnail {
    /// Ce qui rouvre l'affiche.
    var secret: E2EEAttachmentSecret { E2EEAttachmentSecret(key: key, digest: digest, size: size) }
}
