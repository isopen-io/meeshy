import Foundation

/// Ce que la couche APPAREIL d'un message hybride dit du texte servi (#14369).
///
/// Le mode hybride chiffre deux fois : la passerelle scelle le clair au repos
/// (couche serveur, qu'elle lit pour traduire et chercher) et l'appareil de
/// l'auteur scelle le même texte sous libsignal pour chaque appareil
/// destinataire (couche appareil). Comparer les deux donne l'INTÉGRITÉ du texte
/// ORIGINAL, jamais celle d'une traduction, jamais la confidentialité vis-à-vis
/// du serveur.
public enum HybridDeviceLayerIntegrity: Equatable, Sendable {
    /// Le texte original servi est celui que l'appareil de l'auteur a scellé.
    case verified
    /// Le texte servi diffère de celui que l'appareil de l'auteur a scellé.
    /// Le texte SERVI reste affiché (c'est lui que la modération, le
    /// signalement et la recherche voient) ; celui de l'appareil se dévoile à
    /// la demande. Aucune cause n'est désignée : un serveur qui altère et un
    /// auteur qui envoie deux textes différents produisent le même écart.
    /// `servedAsEdited` : le serveur présente le message comme modifié, sans
    /// qu'aucune édition scellée par l'auteur ne le prouve.
    case mismatch(deviceText: String, servedAsEdited: Bool)
    /// La couche appareil existe mais ne peut pas être rattachée à ce message
    /// avec certitude (identifiant client absent ou différent, horodatage hors
    /// fenêtre) : aucun verdict ne s'affiche.
    case unverifiable

    /// Le texte servi a été contredit par la couche appareil.
    public var isMismatch: Bool {
        if case .mismatch = self { return true }
        return false
    }

    /// Le texte que l'appareil de l'auteur a scellé, quand il contredit le texte servi.
    public var deviceText: String? {
        if case .mismatch(let deviceText, _) = self { return deviceText }
        return nil
    }
}

/// Les lois PURES de la couche appareil d'un hybride (#14369).
public enum HybridDeviceLayer {
    /// Le mode d'une conversation hybride, tel que la passerelle le normalise.
    public static let mode = "hybrid"

    /// L'écart toléré entre l'instant scellé par l'auteur (`E2EEContent.sentAt`)
    /// et l'instant servi par la passerelle (`createdAt`) : dix minutes, de
    /// part et d'autre. Au-delà, l'enveloppe peut appartenir à un autre envoi
    /// rejoué : le message est invérifiable, jamais vérifié.
    public static let sentAtWindow: TimeInterval = 10 * 60

    /// Le mode servi est-il `hybrid`, sans casse ni blancs ?
    public static func isHybrid(_ mode: String?) -> Bool {
        (mode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == Self.mode
    }

    /// La couche appareil appartient-elle à CE message ? L'identifiant client
    /// scellé doit être présent des DEUX côtés et égal, et l'instant scellé
    /// tenir dans `sentAtWindow` autour de l'instant servi.
    public static func isBound(
        sealedClientMessageId: String?,
        servedClientMessageId: String?,
        sealedAtMilliseconds: Int64,
        servedCreatedAt: Date
    ) -> Bool {
        guard let sealed = sealedClientMessageId, !sealed.isEmpty,
              let served = servedClientMessageId, served == sealed else { return false }
        let sealedAt = Date(timeIntervalSince1970: TimeInterval(sealedAtMilliseconds) / 1000)
        return abs(sealedAt.timeIntervalSince(servedCreatedAt)) <= sentAtWindow
    }

    /// Le verdict de la couche appareil sur le texte servi. La passerelle range
    /// le clair rogné de ses blancs : la comparaison les ignore des deux côtés,
    /// et rien d'autre (aucune normalisation qui masquerait une altération).
    /// Une édition ne repasse que par la couche serveur : aucune n'est prouvée
    /// par l'auteur, donc un texte modifié qui diffère du texte scellé est un
    /// écart (« modifié — original disponible »), jamais un silence.
    public static func judge(served: String, sealed: String, edited: Bool) -> HybridDeviceLayerIntegrity {
        let servedText = served.trimmingCharacters(in: .whitespacesAndNewlines)
        let sealedText = sealed.trimmingCharacters(in: .whitespacesAndNewlines)
        return servedText == sealedText ? .verified : .mismatch(deviceText: sealedText, servedAsEdited: edited)
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
