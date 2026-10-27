import Foundation

/// **QUI EST QUI DANS UNE CAPTURE** (#8743) — les personnes de l'appel, moi compris, telles
/// qu'un cadre les écrit : le nom qu'on voit déjà dans l'appel, le @pseudo quand il est connu,
/// et MOI marqué. Une caméra coupée garde sa case : seul `showsVideo` le dit.
enum CallCaptureIdentity {
    static let remoteDuoId = "duo-remote"
    static let localDuoId = "duo-local"

    /// Un pseudo vide n'en est pas un : le cadre écrit alors le nom à sa place.
    static func handle(_ username: String?) -> String? {
        guard let trimmed = username?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    /// Mon nom sur une image qui PART : celui que les autres me connaissent, jamais « Vous »,
    /// qui ne se lit que sur mon écran. Nom affiché, sinon pseudo, sinon le libellé local.
    static func myName(displayName: String?, username: String?, fallback: String) -> String {
        [displayName, username]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? fallback
    }

    static func me(name: String, username: String?, isMirrored: Bool, showsVideo: Bool) -> CallCaptureSubject {
        CallCaptureSubject(
            id: localDuoId,
            name: name,
            handle: handle(username),
            isSelf: true,
            isMirrored: isMirrored,
            showsVideo: showsVideo
        )
    }

    /// Le duo : l'autre et moi, dans l'ordre de l'écran (`meFirst` quand les flux sont permutés).
    static func duo(me: CallCaptureSubject, remoteName: String, remoteUsername: String?, remoteShowsVideo: Bool, meFirst: Bool) -> [CallCaptureSubject] {
        let remote = CallCaptureSubject(
            id: remoteDuoId,
            name: remoteName,
            handle: handle(remoteUsername),
            isSelf: false,
            isMirrored: false,
            showsVideo: remoteShowsVideo
        )
        return meFirst ? [me, remote] : [remote, me]
    }

    /// Le groupe : une personne par tuile de la scène, dans son ordre. Le pseudo des autres
    /// n'est pas dans la liste de l'appel : le cadre écrit leur nom.
    static func group(tiles: [GroupCallStageTile], myName: String, myUsername: String?, isMyCaptureMirrored: Bool) -> [CallCaptureSubject] {
        tiles.map { tile in
            CallCaptureSubject(
                id: tile.id,
                name: tile.isLocal ? myName : tile.displayName,
                handle: tile.isLocal ? handle(myUsername) : nil,
                isSelf: tile.isLocal,
                isMirrored: tile.isLocal && isMyCaptureMirrored,
                showsVideo: tile.showsVideo
            )
        }
    }
}
