import CommonCrypto
import CryptoKit
import Foundation
import Testing
@testable import MeeshyE2EE

/// **Le format `client-v1` d'une pièce jointe chiffrée de bout en bout** (#10789),
/// celui de Signal : clé de 64 octets, remplissage de Signal, `IV ‖ AES-256-CBC ‖
/// HMAC-SHA256`, condensat SHA-256 du blob. Rejoué sur les vecteurs écrits par
/// OpenSSL (`packages/shared/fixtures/e2ee-attachment/client-v1.vectors.json`),
/// que le module TypeScript reproduit aussi : deux implémentations
/// indépendantes, un même octet. Modèle de menace : serveur qui altère, tronque
/// ou remplace le blob — rien n'en sort.
@Suite("Une pièce jointe chiffrée de bout en bout suit le format de Signal")
struct E2EEAttachmentCipherTests {

    private struct VectorFile: Decodable {
        let format: String
        let vectors: [Vector]
    }

    private struct Vector: Decodable {
        let name: String
        let key: String
        let iv: String
        let plaintext: String
        let size: Int
        let paddedSize: Int
        let blob: String
        let digest: String
    }

    private static let nistF25Ciphertext =
        "f58c4c04d6e5f1ba779eabfb5f7bfbd69cfc4e967edb808d679f777bc6702c7d39f23369a9d9bacfa530e26304231461b2eb05e2c39be9fcda6c19078c6a9d1b"

    private static func vectors() throws -> VectorFile {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // E2EE
            .deletingLastPathComponent() // MeeshySDKTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK
            .deletingLastPathComponent() // packages
            .appendingPathComponent("shared/fixtures/e2ee-attachment/client-v1.vectors.json")
        return try JSONDecoder().decode(VectorFile.self, from: Data(contentsOf: url))
    }

    private static func vector(_ name: String) throws -> Vector {
        try #require(try vectors().vectors.first { $0.name == name })
    }

    private func temporaryFile(_ data: Data? = nil) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("e2ee-att-\(UUID().uuidString)")
        if let data { try data.write(to: url) }
        return url
    }

    // MARK: - Format

    @Test func itNamesItsScheme() throws {
        #expect(E2EEAttachmentCipher.scheme == "client-v1")
        #expect(try Self.vectors().format == E2EEAttachmentCipher.scheme)
    }

    /// Signal-iOS, `CryptographyTests.test_paddedSizeSpotChecks` et `test_spotCheckBucketBoundaries`.
    @Test(arguments: [
        (0, 541), (1, 541), (540, 541), (541, 541), (542, 568), (567, 568), (568, 568), (569, 596),
        (1_234, 1_240), (12_345, 12_903), (64_562, 67_789), (67_790, 71_178), (123_456, 127_826),
        (1_234_567, 1_266_246), (12_345_678, 12_543_397), (92_720_647, 97_356_678), (123_456_789, 124_254_533),
    ])
    func itPadsLikeSignal(size: Int, padded: Int) {
        #expect(E2EEAttachmentCipher.paddedSize(size) == padded)
    }

    @Test(arguments: ["nist-sp800-38a-f25", "short-text", "bucket-1234", "full-pkcs7-block", "beyond-64-kib"])
    func itReproducesTheOpenSSLVector(name: String) throws {
        let vector = try Self.vector(name)
        let sealed = try E2EEAttachmentCipher.seal(Data(hex: vector.plaintext), key: Data(hex: vector.key), iv: Data(hex: vector.iv))
        #expect(sealed.blob.hex == vector.blob)
        #expect(sealed.secret.digest.hex == vector.digest)
        #expect(sealed.secret.size == vector.size)
        #expect(sealed.secret.key.hex == vector.key)
    }

    @Test func itEncryptsTheFirstBlocksLikeNISTSP80038A() throws {
        let vector = try Self.vector("nist-sp800-38a-f25")
        let sealed = try E2EEAttachmentCipher.seal(Data(hex: vector.plaintext), key: Data(hex: vector.key), iv: Data(hex: vector.iv))
        #expect(sealed.blob.subdata(in: 16..<80).hex == Self.nistF25Ciphertext)
    }

    @Test(arguments: ["nist-sp800-38a-f25", "short-text", "bucket-1234", "full-pkcs7-block", "beyond-64-kib"])
    func itOpensTheVectorToItsExactSize(name: String) throws {
        let vector = try Self.vector(name)
        let secret = E2EEAttachmentSecret(key: Data(hex: vector.key), digest: Data(hex: vector.digest), size: vector.size)
        #expect(try E2EEAttachmentCipher.open(Data(hex: vector.blob), with: secret).hex == vector.plaintext)
    }

    // MARK: - Chaque couche sur son vecteur OFFICIEL, telle que ce module s'en sert

    @Test func aesLayer_reproducesNISTSP80038AF25() throws {
        let cryptor = try AESCBC(
            operation: CCOperation(kCCEncrypt),
            key: Data(hex: "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4"),
            iv: Data(hex: "000102030405060708090a0b0c0d0e0f")
        )
        var out = try cryptor.update(Data(hex: "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710"))
        out.append(try cryptor.finish())
        #expect(out.prefix(64).hex == Self.nistF25Ciphertext)
    }

    @Test func hmacLayer_reproducesRFC4231Case2() {
        let mac = HMAC<SHA256>.authenticationCode(for: Data("what do ya want for nothing?".utf8), using: SymmetricKey(data: Data("Jefe".utf8)))
        #expect(Data(mac).hex == "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843")
    }

    @Test func digestLayer_reproducesFIPS1802Abc() {
        #expect(Data(SHA256.hash(data: Data("abc".utf8))).hex == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    /// Une tranche de `Data` garde ses indices d'origine : l'ouverture ne s'y trompe pas.
    @Test func itOpensABlobHandedAsASlice() throws {
        let vector = try Self.vector("short-text")
        let padded = Data([0xAA, 0xBB]) + Data(hex: vector.blob)
        let slice = padded.dropFirst(2)
        let secret = E2EEAttachmentSecret(key: Data(hex: vector.key), digest: Data(hex: vector.digest), size: vector.size)
        #expect(try E2EEAttachmentCipher.open(slice, with: secret).hex == vector.plaintext)
    }

    @Test func eachFileDrawsAFreshKeyAndIV() throws {
        let plaintext = Data("la même photo".utf8)
        let first = try E2EEAttachmentCipher.seal(plaintext)
        let second = try E2EEAttachmentCipher.seal(plaintext)
        #expect(first.secret.key.count == 64)
        #expect(first.secret.key != second.secret.key)
        #expect(first.blob.prefix(16) != second.blob.prefix(16))
        #expect(try E2EEAttachmentCipher.open(first.blob, with: first.secret) == plaintext)
    }

    @Test func noPlaintextByteReachesTheBlob() throws {
        let sentinel = Data("sentinelle-\(UUID().uuidString)".utf8)
        let sealed = try E2EEAttachmentCipher.seal(sentinel)
        #expect(sealed.blob.range(of: sentinel) == nil)
        #expect(sealed.blob.count == 16 + (E2EEAttachmentCipher.paddedSize(sentinel.count) / 16 + 1) * 16 + 32)
    }

    // MARK: - Fichiers, en flux

    @Test func aFileSealsInStreamToTheSameBytesAsInMemory() throws {
        let vector = try Self.vector("bucket-1234")
        let source = try temporaryFile(Data(hex: vector.plaintext))
        let blob = try temporaryFile()
        defer { [source, blob].forEach { try? FileManager.default.removeItem(at: $0) } }

        let secret = try E2EEAttachmentCipher.seal(fileAt: source, to: blob, key: Data(hex: vector.key), iv: Data(hex: vector.iv))

        #expect(try Data(contentsOf: blob).hex == vector.blob)
        #expect(secret.digest.hex == vector.digest)
        #expect(secret.size == vector.size)
    }

    @Test func aLargeFileRoundTripsInStream() throws {
        let plaintext = Data((0..<3_000_001).map { UInt8(truncatingIfNeeded: $0 &* 31) })
        let source = try temporaryFile(plaintext)
        let blob = try temporaryFile()
        let opened = try temporaryFile()
        defer { [source, blob, opened].forEach { try? FileManager.default.removeItem(at: $0) } }

        let secret = try E2EEAttachmentCipher.seal(fileAt: source, to: blob)
        try E2EEAttachmentCipher.open(fileAt: blob, to: opened, with: secret)

        #expect(try Data(contentsOf: opened) == plaintext)
        #expect(try Data(contentsOf: blob).count == 16 + (E2EEAttachmentCipher.paddedSize(plaintext.count) / 16 + 1) * 16 + 32)
        #expect(Data(SHA256.hash(data: try Data(contentsOf: blob))) == secret.digest)
    }

    // MARK: - Fail-closed : rien ne sort d'un blob altéré

    private func secret(of vector: Vector, key: Data? = nil, digest: Data? = nil, size: Int? = nil) -> E2EEAttachmentSecret {
        E2EEAttachmentSecret(key: key ?? Data(hex: vector.key), digest: digest ?? Data(hex: vector.digest), size: size ?? vector.size)
    }

    @Test func aFlippedCiphertextByte_isRefusedByTheDigest() throws {
        let vector = try Self.vector("bucket-1234")
        var blob = Data(hex: vector.blob)
        blob[40] ^= 0x01
        #expect(throws: E2EEAttachmentCipherError.digestMismatch) { try E2EEAttachmentCipher.open(blob, with: secret(of: vector)) }
    }

    @Test func aWrongDigest_isRefusedBeforeAnyMAC() throws {
        let vector = try Self.vector("bucket-1234")
        var digest = Data(hex: vector.digest)
        digest[0] ^= 0x80
        #expect(throws: E2EEAttachmentCipherError.digestMismatch) {
            try E2EEAttachmentCipher.open(Data(hex: vector.blob), with: secret(of: vector, digest: digest))
        }
    }

    /// Le serveur remplace le blob ET le condensat qu'il ne connaît pas : il ne
    /// peut pas les accorder, le condensat voyage dans le chiffré libsignal.
    /// S'il les accordait quand même, le HMAC le refuse.
    @Test func aReplacedBlobWithItsOwnDigest_isRefusedByTheMAC() throws {
        let vector = try Self.vector("bucket-1234")
        var forged = Data(hex: vector.blob)
        forged[40] ^= 0x01
        #expect(throws: E2EEAttachmentCipherError.macMismatch) {
            try E2EEAttachmentCipher.open(forged, with: secret(of: vector, digest: Data(SHA256.hash(data: forged))))
        }
    }

    @Test func aWrongKey_isRefusedByTheMAC() throws {
        let vector = try Self.vector("bucket-1234")
        var key = Data(hex: vector.key)
        key[63] ^= 0x01
        #expect(throws: E2EEAttachmentCipherError.macMismatch) {
            try E2EEAttachmentCipher.open(Data(hex: vector.blob), with: secret(of: vector, key: key))
        }
    }

    @Test func aTruncatedBlob_isRefused() throws {
        let vector = try Self.vector("bucket-1234")
        let blob = Data(hex: vector.blob).prefix(40)
        #expect(throws: E2EEAttachmentCipherError.malformed) {
            try E2EEAttachmentCipher.open(Data(blob), with: secret(of: vector, digest: Data(SHA256.hash(data: blob))))
        }
    }

    @Test func aSizeBeyondThePlaintext_isRefused() throws {
        let vector = try Self.vector("bucket-1234")
        #expect(throws: E2EEAttachmentCipherError.sizeMismatch) {
            try E2EEAttachmentCipher.open(Data(hex: vector.blob), with: secret(of: vector, size: vector.paddedSize + 1))
        }
    }

    @Test func aKeyOfTheWrongLength_isRefused() throws {
        let vector = try Self.vector("bucket-1234")
        #expect(throws: E2EEAttachmentCipherError.malformed) {
            try E2EEAttachmentCipher.open(Data(hex: vector.blob), with: secret(of: vector, key: Data(hex: vector.key).prefix(32)))
        }
    }

    /// En flux, un blob altéré ne laisse AUCUN octet clair derrière lui.
    @Test func aTamperedFile_leavesNoPlaintextFile() throws {
        let vector = try Self.vector("bucket-1234")
        var tampered = Data(hex: vector.blob)
        tampered[tampered.count - 1] ^= 0x01
        let blob = try temporaryFile(tampered)
        let opened = try temporaryFile()
        defer { [blob, opened].forEach { try? FileManager.default.removeItem(at: $0) } }

        #expect(throws: E2EEAttachmentCipherError.macMismatch) {
            try E2EEAttachmentCipher.open(fileAt: blob, to: opened, with: secret(of: vector, digest: Data(SHA256.hash(data: tampered))))
        }
        #expect(!FileManager.default.fileExists(atPath: opened.path))
    }
}

fileprivate extension Data {
    init(hex: String) {
        var bytes = [UInt8]()
        bytes.reserveCapacity(hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            bytes.append(UInt8(hex[index..<next], radix: 16) ?? 0)
            index = next
        }
        self.init(bytes)
    }

    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
