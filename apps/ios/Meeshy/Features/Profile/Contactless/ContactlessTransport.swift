import Foundation
import MeeshySDK
import MultipeerConnectivity

/// Ce que le transport pair à pair rapporte : un téléphone joint, perdu, une charge reçue, ou l'impossibilité de
/// chercher (réseau local refusé).
nonisolated enum ContactlessTransportEvent: Equatable, Sendable {
    case connected
    case disconnected
    case received(Data)
    case failed
}

/// Le canal entre deux téléphones proches. Il ne connaît ni le jeton ni le bonjour : il porte des octets.
@MainActor
protocol ContactlessTransporting: AnyObject {
    func start(onEvent: @escaping @MainActor @Sendable (ContactlessTransportEvent) -> Void)
    func send(_ data: Data)
    func stop()
}

/// Le transport par MultipeerConnectivity : session chiffrée exigée, un seul partenaire, et rien dans l'annonce
/// Bonjour — l'identifiant du pair est un aléa par ouverture d'écran, jamais un nom.
///
/// Les deux téléphones annoncent et cherchent à la fois ; seul celui dont l'aléa est le plus petit invite, pour
/// qu'une seule session naisse. Les rappels de MultipeerConnectivity arrivent hors du fil principal : les objets du
/// canal et le partenaire vivent sous un verrou (`Locked`), et les événements repassent sur le MainActor.
nonisolated final class MultipeerContactlessTransport: NSObject, ContactlessTransporting, Sendable {
    static let serviceType = "meeshy-cx"

    nonisolated private struct Channel {
        let session: MCSession
        let advertiser: MCNearbyServiceAdvertiser
        let browser: MCNearbyServiceBrowser
        var partner: MCPeerID?
        var handler: (@MainActor @Sendable (ContactlessTransportEvent) -> Void)?
    }

    private let myName: String
    private let channel: Locked<Channel>

    override init() {
        let me = MCPeerID(displayName: UUID().uuidString)
        myName = me.displayName
        channel = Locked(uncheckedState: Channel(
            session: MCSession(peer: me, securityIdentity: nil, encryptionPreference: .required),
            advertiser: MCNearbyServiceAdvertiser(peer: me, discoveryInfo: nil, serviceType: Self.serviceType),
            browser: MCNearbyServiceBrowser(peer: me, serviceType: Self.serviceType)))
        super.init()
        let parts = channel.mutateUnchecked { $0 }
        parts.session.delegate = self
        parts.advertiser.delegate = self
        parts.browser.delegate = self
    }

    deinit {
        let parts = channel.mutateUnchecked { $0 }
        parts.advertiser.stopAdvertisingPeer()
        parts.browser.stopBrowsingForPeers()
        parts.session.disconnect()
    }

    func start(onEvent: @escaping @MainActor @Sendable (ContactlessTransportEvent) -> Void) {
        let parts = channel.mutateUnchecked { channel -> Channel in
            channel.handler = onEvent
            return channel
        }
        search(parts)
    }

    func send(_ data: Data) {
        let parts = channel.mutateUnchecked { $0 }
        guard let partner = parts.partner else { return }
        try? parts.session.send(data, toPeers: [partner], with: .reliable)
    }

    func stop() {
        let parts = channel.mutateUnchecked { channel -> Channel in
            channel.handler = nil
            channel.partner = nil
            return channel
        }
        parts.advertiser.stopAdvertisingPeer()
        parts.browser.stopBrowsingForPeers()
        parts.session.disconnect()
    }

    private func search(_ parts: Channel) {
        parts.advertiser.startAdvertisingPeer()
        parts.browser.startBrowsingForPeers()
    }

    fileprivate func isPartner(_ peer: MCPeerID) -> Bool {
        channel.mutateUnchecked { $0.partner == peer }
    }

    fileprivate func emit(_ event: ContactlessTransportEvent) {
        guard let handler = channel.mutateUnchecked({ $0.handler }) else { return }
        Task { @MainActor in handler(event) }
    }

    /// Le premier pair joint devient LE partenaire : la recherche s'arrête, les suivants sont ignorés.
    fileprivate func claim(_ peer: MCPeerID) -> Bool {
        let (claimed, parts) = channel.mutateUnchecked { channel -> (Bool, Channel) in
            guard channel.partner == nil else { return (channel.partner == peer, channel) }
            channel.partner = peer
            return (true, channel)
        }
        if claimed {
            parts.advertiser.stopAdvertisingPeer()
            parts.browser.stopBrowsingForPeers()
        }
        return claimed
    }

    /// Le partenaire perdu : la recherche reprend tant que l'écran est ouvert.
    fileprivate func release(_ peer: MCPeerID) -> Bool {
        let (released, parts) = channel.mutateUnchecked { channel -> (Bool, Channel) in
            guard channel.partner == peer else { return (false, channel) }
            channel.partner = nil
            return (true, channel)
        }
        if released, parts.handler != nil { search(parts) }
        return released
    }

    fileprivate func invite(_ peer: MCPeerID, from browser: MCNearbyServiceBrowser) {
        let parts = channel.mutateUnchecked { $0 }
        guard myName < peer.displayName, parts.partner == nil else { return }
        browser.invitePeer(peer, to: parts.session, withContext: nil, timeout: 20)
    }

    fileprivate func answer(_ invitationHandler: (Bool, MCSession?) -> Void) {
        let parts = channel.mutateUnchecked { $0 }
        invitationHandler(parts.partner == nil, parts.session)
    }
}

nonisolated extension MultipeerContactlessTransport: MCSessionDelegate {
    nonisolated func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        switch state {
        case .connected:
            guard claim(peerID) else { return }
            emit(.connected)
        case .notConnected:
            guard release(peerID) else { return }
            emit(.disconnected)
        default:
            break
        }
    }

    nonisolated func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard data.count <= ContactlessWire.maxBytes, isPartner(peerID) else { return }
        emit(.received(data))
    }

    nonisolated func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String,
                             fromPeer peerID: MCPeerID) {
        stream.close()
    }

    nonisolated func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String,
                             fromPeer peerID: MCPeerID, with progress: Progress) {
        progress.cancel()
    }

    nonisolated func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String,
                             fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

nonisolated extension MultipeerContactlessTransport: MCNearbyServiceAdvertiserDelegate {
    nonisolated func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID,
                                withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        answer(invitationHandler)
    }

    nonisolated func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        emit(.failed)
    }
}

nonisolated extension MultipeerContactlessTransport: MCNearbyServiceBrowserDelegate {
    nonisolated func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID,
                             withDiscoveryInfo info: [String: String]?) {
        invite(peerID, from: browser)
    }

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {}

    nonisolated func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        emit(.failed)
    }
}
