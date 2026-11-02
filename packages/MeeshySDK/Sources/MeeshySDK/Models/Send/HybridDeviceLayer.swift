import Foundation

/// Ce que la couche APPAREIL d'un message hybride dit du texte servi (#14369).
///
/// Le mode hybride chiffre deux fois : la passerelle scelle le clair au repos
/// (couche serveur, qu'elle lit pour traduire et chercher) et l'appareil de
/// l'auteur scelle le même texte sous libsignal pour chaque appareil
/// destinataire (couche appareil). Comparer les deux donne l'INTÉGRITÉ, jamais
/// la confidentialité vis-à-vis du serveur.
public enum HybridDeviceLayerIntegrity: Equatable, Sendable {
    /// Le texte servi est celui que l'appareil de l'auteur a scellé.
    case verified
    /// Le texte servi diffère : le serveur l'a altéré, ou les deux couches se
    /// sont désynchronisées. Le texte scellé par l'auteur est celui qui s'affiche.
    case mismatch(deviceText: String)
    /// Le message a été modifié après l'envoi : l'édition ne repart que par la
    /// couche serveur, la couche appareil ne prouve plus rien sur ce texte.
    case unverifiable

    /// Le texte servi a été contredit par la couche appareil.
    public var isMismatch: Bool {
        if case .mismatch = self { return true }
        return false
    }
}

/// Les lois PURES de la couche appareil d'un hybride (#14369).
public enum HybridDeviceLayer {
    /// Le mode d'une conversation hybride, tel que la passerelle le normalise.
    public static let mode = "hybrid"

    /// Le mode servi est-il `hybrid`, sans casse ni blancs ?
    public static func isHybrid(_ mode: String?) -> Bool {
        (mode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == Self.mode
    }

    /// Le verdict de la couche appareil sur le texte servi. La passerelle range
    /// le clair rogné de ses blancs : la comparaison les ignore des deux côtés,
    /// et rien d'autre (aucune normalisation qui masquerait une altération).
    public static func judge(served: String, sealed: String, edited: Bool) -> HybridDeviceLayerIntegrity {
        if edited { return .unverifiable }
        let servedText = served.trimmingCharacters(in: .whitespacesAndNewlines)
        let sealedText = sealed.trimmingCharacters(in: .whitespacesAndNewlines)
        return servedText == sealedText ? .verified : .mismatch(deviceText: sealedText)
    }
}

public extension SendMessageRequest {
    /// Le corps d'un envoi hybride à DEUX couches (#14369) : le clair de ce corps
    /// reste (la passerelle le scelle au repos), la couche appareil libsignal
    /// voyage à côté. Aucun `encryptedContent`, aucun `isEncrypted` : un serveur
    /// antérieur ignore les enveloppes et range la couche serveur seule.
    func withHybridDeviceLayer(
        senderDeviceId: UInt32,
        envelopes: [E2EEOutgoingEnvelope],
        unapprovedOwnDevices: [UInt32],
        regimeEpoch: Int?
    ) -> SendMessageRequest {
        var request = self
        request.encryptionMode = HybridDeviceLayer.mode
        request.encryptionProtocol = E2EEWire.libsignalProtocol
        request.encryptionMetadata = E2EEWireMetadata(senderDeviceId: senderDeviceId, regimeEpoch: regimeEpoch)
        request.envelopes = envelopes
        request.unapprovedOwnDevices = unapprovedOwnDevices.isEmpty ? nil : unapprovedOwnDevices
        request.isEncrypted = nil
        request.encryptedContent = nil
        return request
    }
}
