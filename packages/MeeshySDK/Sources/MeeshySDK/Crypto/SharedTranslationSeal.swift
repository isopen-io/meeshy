import CryptoKit
import Foundation

// MARK: - SCELLER ET OUVRIR UNE TRADUCTION PARTAGÉE — sur l'appareil, jamais ailleurs (#9899)
//
// Miroir iOS de `packages/shared/utils/shared-translation-seal.ts` (le web et la
// coque Android). `packages/shared/fixtures/shared-translation/seal.vectors.json`,
// produit en EXÉCUTANT le module TypeScript, les tient ensemble : sur
// divergence, c'est le TypeScript qui a raison, et le miroir bouge.
//
// - clé : HKDF-SHA256, sel `meeshy-shared-translation/v1`, info
//   `<kdf>|<conversationId>|<messageId>|<targetLanguage>`, 32 octets ; matière
//   = le texte original en NFC (`message-content`) ou le secret du message
//   (`message-secret`) ;
// - scellement : AES-256-GCM, nonce aléatoire de 12 octets, tag de 16 ;
//   `payload` = base64(nonce ‖ chiffré ‖ tag) — la forme `combined` de CryptoKit ;
// - données associées : `meeshy-shared-translation/v1|<kdf>|<conversationId>|<messageId>|<targetLanguage>|<sha256 hex du texte original en NFC>`.
//   Elles lient l'enveloppe à UN message, UNE langue et UN état du texte : la
//   traduction d'un message depuis modifié ne s'ouvre plus, et l'empreinte ne
//   voyage jamais.
//
// Ouvrir ne lève jamais : toute enveloppe illisible, altérée, d'une autre langue
// ou d'un autre état du texte rend `nil`, et l'appareil garde ce qu'il avait.

/// Ce qui lie une enveloppe à un message, une langue et un état du texte source.
public struct SharedTranslationBinding: Sendable, Equatable {
    public let conversationId: String
    public let messageId: String
    public let targetLanguage: String
    /// Le texte original du message tel que l'appareil le lit — déchiffré s'il
    /// l'était.
    public let sourceContent: String

    public init(conversationId: String, messageId: String, targetLanguage: String, sourceContent: String) {
        self.conversationId = conversationId
        self.messageId = messageId
        self.targetLanguage = targetLanguage
        self.sourceContent = sourceContent
    }
}

/// D'où l'appareil tire la clé de l'enveloppe.
public enum SharedTranslationKeySource: Sendable, Equatable {
    case messageContent
    case messageSecret(Data)

    public var kdf: SharedTranslationKdf {
        switch self {
        case .messageContent: return .messageContent
        case .messageSecret: return .messageSecret
        }
    }
}

/// Pourquoi un appareil refuse de sceller — il ne partage alors pas, et garde sa
/// traduction.
public enum SharedTranslationSealError: Error, Sendable, Equatable {
    /// Un message sans texte ne se traduit pas : la clé `message-content` n'a
    /// pas de matière.
    case emptySourceContent
    /// Le secret d'un message fait 32 octets.
    case invalidSecretLength
    /// La traduction n'est pas ce que la passerelle accepterait de garder
    /// (vide, trop longue, langue ou moteur mal formés).
    case invalidInner
    /// Le nonce fait 12 octets.
    case invalidNonce
    /// L'enveloppe dépasserait ce que la passerelle accepte.
    case payloadTooLong
    /// CryptoKit n'a pas rendu la forme `combined`.
    case sealFailed
}

public enum SharedTranslationSeal {

    private static let keyByteCount = 32

    /// Scelle une traduction sous un nonce tiré au hasard. Lève si la traduction
    /// dépasse ce que la passerelle accepte — l'appareil ne partage pas alors.
    public static func seal(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        inner: SharedTranslationInner
    ) throws -> SharedTranslationEnvelope {
        try seal(binding: binding, key: key, inner: inner, nonce: nil)
    }

    /// Ouvre une enveloppe ; `nil` pour tout ce qui ne s'ouvre pas — jamais
    /// d'exception.
    public static func open(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        envelope: SharedTranslationEnvelope
    ) -> SharedTranslationInner? {
        guard envelope.v == SharedTranslationWire.version,
              envelope.alg == SharedTranslationWire.algorithm,
              envelope.kdf == key.kdf,
              let combined = Data(base64Encoded: envelope.payload),
              combined.count >= SharedTranslationLimits.nonceLength + SharedTranslationLimits.tagLength,
              let symmetricKey = try? derivedKey(binding: binding, key: key),
              let sealedBox = try? AES.GCM.SealedBox(combined: combined),
              let plaintext = try? AES.GCM.open(
                  sealedBox, using: symmetricKey, authenticating: Data(aad(binding: binding, kdf: key.kdf).utf8)
              ),
              let inner = try? JSONDecoder().decode(SharedTranslationInner.self, from: plaintext),
              inner.isSealable
        else { return nil }
        return inner
    }

    // MARK: - Les pièces, internes — les vecteurs les rejouent une à une

    /// `nonce` n'est fixé que par les vecteurs : en usage, il est tiré au hasard
    /// par CryptoKit. Un nonce public réutilisé sous une même clé romprait GCM.
    static func seal(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        inner: SharedTranslationInner,
        nonce: Data?
    ) throws -> SharedTranslationEnvelope {
        guard inner.isSealable else { throw SharedTranslationSealError.invalidInner }
        let plaintext = Data(try canonicalInnerJSON(inner).utf8)
        let payload = try sealedPayload(plaintext: plaintext, binding: binding, key: key, nonce: nonce)
        return SharedTranslationEnvelope(kdf: key.kdf, payload: payload)
    }

    static func sealedPayload(
        plaintext: Data,
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        nonce: Data?
    ) throws -> String {
        let symmetricKey = try derivedKey(binding: binding, key: key)
        let authenticated = Data(aad(binding: binding, kdf: key.kdf).utf8)
        let sealedBox: AES.GCM.SealedBox
        if let nonce {
            guard nonce.count == SharedTranslationLimits.nonceLength else { throw SharedTranslationSealError.invalidNonce }
            let fixedNonce = try AES.GCM.Nonce(data: nonce)
            sealedBox = try AES.GCM.seal(plaintext, using: symmetricKey, nonce: fixedNonce, authenticating: authenticated)
        } else {
            sealedBox = try AES.GCM.seal(plaintext, using: symmetricKey, authenticating: authenticated)
        }
        guard let combined = sealedBox.combined else { throw SharedTranslationSealError.sealFailed }
        let payload = combined.base64EncodedString()
        guard payload.utf8.count <= SharedTranslationLimits.payloadMaxLength else {
            throw SharedTranslationSealError.payloadTooLong
        }
        return payload
    }

    /// Les clés dans l'ordre alphabétique, sans espace, les barres obliques non
    /// échappées : exactement le `JSON.stringify({ engine, sourceLanguage, text, v: 1 })`
    /// du module TypeScript. Seuls les caractères de commande hors `\b \f \n \r \t`
    /// pourraient s'écrire autrement (casse de l'hexadécimal) — l'ouverture ne
    /// lit que le JSON décodé, donc l'interopérabilité n'en dépend pas.
    static func canonicalInnerJSON(_ inner: SharedTranslationInner) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(inner)
        guard let json = String(data: data, encoding: .utf8) else { throw SharedTranslationSealError.invalidInner }
        return json
    }

    /// L'empreinte du texte original en NFC, en hexadécimal minuscule.
    static func sourceDigest(_ sourceContent: String) -> String {
        SHA256.hash(data: Data(sourceContent.precomposedStringWithCanonicalMapping.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    static func aad(binding: SharedTranslationBinding, kdf: SharedTranslationKdf) -> String {
        [
            SharedTranslationWire.protocolIdentifier,
            kdf.rawValue,
            binding.conversationId,
            binding.messageId,
            binding.targetLanguage,
            sourceDigest(binding.sourceContent),
        ].joined(separator: "|")
    }

    static func derivedKey(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource
    ) throws -> SymmetricKey {
        HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: try keyMaterial(binding: binding, key: key)),
            salt: Data(SharedTranslationWire.protocolIdentifier.utf8),
            info: Data(
                [key.kdf.rawValue, binding.conversationId, binding.messageId, binding.targetLanguage]
                    .joined(separator: "|").utf8
            ),
            outputByteCount: keyByteCount
        )
    }

    private static func keyMaterial(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource
    ) throws -> Data {
        switch key {
        case .messageSecret(let secret):
            guard secret.count == SharedTranslationLimits.secretLength else {
                throw SharedTranslationSealError.invalidSecretLength
            }
            return secret
        case .messageContent:
            guard !binding.sourceContent.isEmpty else { throw SharedTranslationSealError.emptySourceContent }
            return Data(binding.sourceContent.precomposedStringWithCanonicalMapping.utf8)
        }
    }
}
