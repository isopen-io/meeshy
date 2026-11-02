// Génère src/test/resources/ios-interop-vectors.properties avec CryptoKit.
// Usage (macOS) : swift scripts/GenerateIosInteropVectors.swift > src/test/resources/ios-interop-vectors.properties
// Même dérivation que E2EEService.deriveSymmetricKey (apps/ios).
import CryptoKit
import Foundation

func hex(_ data: some DataProtocol) -> String { data.map { String(format: "%02x", $0) }.joined() }

let alice = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: Data((1...32).map { UInt8($0) }))
let bob = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: Data((101...132).map { UInt8($0) }))
let secret = try alice.sharedSecretFromKeyAgreement(with: bob.publicKey)
let key = secret.hkdfDerivedSymmetricKey(using: SHA256.self, salt: Data(), sharedInfo: Data("MeeshyE2EE".utf8), outputByteCount: 32)

print("# Généré par scripts/GenerateIosInteropVectors.swift (CryptoKit). X25519 + HKDF-SHA256, sel vide, info MeeshyE2EE, 32 octets.")
print("alicePrivate=\(hex(alice.rawRepresentation))")
print("alicePublic=\(hex(alice.publicKey.rawRepresentation))")
print("bobPrivate=\(hex(bob.rawRepresentation))")
print("bobPublic=\(hex(bob.publicKey.rawRepresentation))")
print("sharedSecret=\(secret.withUnsafeBytes { hex(Data($0)) })")
print("derivedKey=\(key.withUnsafeBytes { hex(Data($0)) })")
