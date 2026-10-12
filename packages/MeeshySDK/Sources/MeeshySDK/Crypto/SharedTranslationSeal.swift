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
//   `payload` = base64 CANONIQUE de (nonce ‖ chiffré ‖ tag) — la forme
//   `combined` de CryptoKit. Canonique : remplissage présent, bits de remplissage
//   nuls, aucun blanc ; une même enveloppe n'a qu'une écriture, et seule cette
//   écriture s'ouvre. Aucun appelant public ne choisit le nonce : les vecteurs
//   rejouent leur propre scellement à nonce fixé par les pièces internes ;
// - données associées : `meeshy-shared-translation/v1|<kdf>|<conversationId>|<messageId>|<targetLanguage>|<sha256 hex du texte original en NFC>`.
//   Elles lient l'enveloppe à UN message, UNE langue et UN état du texte : la
//   traduction d'un message modifié depuis ne s'ouvre plus, et l'empreinte ne
//   voyage jamais.
//
// Les champs liés (conversation, message, langue) ne peuvent porter aucun
// séparateur : un identifiant, une langue, rien d'autre — sceller lève
// (`invalidBinding`), ouvrir rend `nil`. Un `String` Swift ne porte jamais de
// moitié de paire de substitution seule : la règle « texte bien formé » du module
// TypeScript est tenue par le type.
//
// Ouvrir ne lève jamais : toute enveloppe illisible, altérée, autrement écrite,
// d'une autre langue ou d'un autre état du texte rend `nil`, et l'appareil garde
// ce qu'il avait.

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

    /// `isSoundBinding` du module TypeScript : les champs que l'enveloppe lie
    /// s'écrivent dans les données associées et dans l'`info` de la clé, séparés
    /// par `|`. Un identifiant, une langue, rien d'autre — sans quoi deux liaisons
    /// différentes pourraient s'écrire pareil.
    var isSound: Bool {
        SharedTranslationFormat.isObjectId(conversationId)
            && SharedTranslationFormat.isObjectId(messageId)
            && SharedTranslationFormat.isLanguageCode(targetLanguage)
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
    /// La conversation ou le message n'est pas un identifiant, ou la langue
    /// n'en est pas une : l'enveloppe ne se lie qu'à des champs sans ambiguïté
    /// (un message pas encore envoyé, par exemple, n'a pas d'identifiant serveur).
    case invalidBinding
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

    /// Scelle une traduction sous un nonce tiré au hasard — l'appelant ne le
    /// choisit jamais. Lève si la liaison est mal formée, ou si la traduction
    /// dépasse ce que la passerelle accepte : l'appareil ne partage pas alors, et
    /// garde sa traduction.
    public static func seal(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        inner: SharedTranslationInner
    ) throws -> SharedTranslationEnvelope {
        try seal(binding: binding, key: key, inner: inner, nonce: nil)
    }

    /// Ouvre une enveloppe ; `nil` pour tout ce qui ne s'ouvre pas — jamais
    /// d'exception. Une enveloppe dont le `payload` n'est pas en base64 canonique
    /// ne s'ouvre pas, même si les octets qu'il désigne seraient les bons.
    public static func open(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        envelope: SharedTranslationEnvelope
    ) -> SharedTranslationInner? {
        guard envelope.v == SharedTranslationWire.version,
              envelope.alg == SharedTranslationWire.algorithm,
              envelope.kdf == key.kdf,
              binding.isSound,
              let combined = canonicalBytes(of: envelope.payload),
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
        guard binding.isSound else { throw SharedTranslationSealError.invalidBinding }
        guard inner.isSealable else { throw SharedTranslationSealError.invalidInner }
        let plaintext = Data(try canonicalInnerJSON(inner).utf8)
        let payload = try sealedPayload(plaintext: plaintext, binding: binding, key: key, nonce: nonce)
        return SharedTranslationEnvelope(kdf: key.kdf, payload: payload)
    }

    /// Les octets d'un base64 CANONIQUE, `nil` pour toute autre écriture : ce
    /// qu'accepte `Data(base64Encoded:)` déborde ce que le contrat valide
    /// (bits de remplissage non nuls, remplissage absent, blancs glissés). Le
    /// décodage doit donc se REFERMER sur le texte reçu — ce qui ne vaut que pour
    /// l'unique écriture que le scellement produit.
    static func canonicalBytes(of payload: String) -> Data? {
        guard let bytes = Data(base64Encoded: payload), bytes.base64EncodedString() == payload else {
            return nil
        }
        return bytes
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
