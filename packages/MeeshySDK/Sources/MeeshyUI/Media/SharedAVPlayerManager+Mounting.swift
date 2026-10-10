import AVFoundation

// MARK: - Une vidéo ne joue qu'à UN endroit (#9575)
//
// Le moteur tient un seul `AVPlayer`. Sept surfaces le montaient sur « l'URL
// active est la mienne », sans lire le PiP : pendant que la fenêtre PiP jouait,
// la bulle d'origine remontait le MÊME player dans sa couche — deux images pour
// une lecture. Le verdict vit ici, en fonction pure ; les surfaces le consomment
// et ne réécrivent plus le prédicat.

/// Le rôle d'une surface qui demande à monter le lecteur partagé.
public nonisolated enum VideoSurfaceRole: Hashable, Sendable {
    /// Dans un fil : bulle, carte, commentaire, carte de réel du fil.
    case inline
    /// Un visualiseur plein écran : galerie, lecteur plein écran, lecteur de réels.
    case fullscreen
    /// La fenêtre Picture in Picture elle-même.
    case pictureInPicture
}

/// Ce que devient la lecture quand le plein écran se ferme.
public nonisolated enum FullscreenCloseDisposition: Equatable, Sendable {
    case keepsPlayingInPip
    case stops
}

extension SharedAVPlayerManager {

    /// **Le verdict unique** : cette surface, de ce rôle, peut-elle monter le
    /// lecteur pour ce média ?
    ///
    /// `surfaceMedia` / `activeMedia` sont la même sorte d'identité des deux
    /// côtés (URL contre `activeURL`, ou identifiant de pièce jointe contre
    /// `attachmentId`). Deux identités vides ne sont pas « le même média ».
    public nonisolated static func mayMountPlayer(role: VideoSurfaceRole,
                                                  surfaceMedia: String,
                                                  activeMedia: String,
                                                  isPipActive: Bool) -> Bool {
        guard !surfaceMedia.isEmpty, surfaceMedia == activeMedia else { return false }
        switch role {
        case .inline: return !isPipActive
        case .fullscreen: return true
        case .pictureInPicture: return isPipActive
        }
    }

    /// Le verdict pour une surface PLEIN ÉCRAN : il ne dépend pas du PiP —
    /// c'est elle qui le reprend (`reclaimFromPip`).
    public nonisolated static func mayMountFullscreenPlayer(surfaceMedia: String,
                                                            activeMedia: String) -> Bool {
        mayMountPlayer(role: .fullscreen,
                       surfaceMedia: surfaceMedia,
                       activeMedia: activeMedia,
                       isPipActive: false)
    }

    /// Le plein écran qui reprend SA vidéo arrête le PiP qui la jouait.
    public nonisolated static func fullscreenReclaimsPip(surfaceMedia: String,
                                                         activeMedia: String,
                                                         isPipActive: Bool) -> Bool {
        isPipActive && mayMountPlayer(role: .fullscreen,
                                      surfaceMedia: surfaceMedia,
                                      activeMedia: activeMedia,
                                      isPipActive: isPipActive)
    }

    /// Fermer le plein écran n'abandonne la lecture qu'au PiP — jamais à la
    /// bulle restée derrière.
    public nonisolated static func fullscreenCloseDisposition(pipHandedOff: Bool) -> FullscreenCloseDisposition {
        pipHandedOff ? .keepsPlayingInPip : .stops
    }

    /// Le verdict, lu sur l'état VIVANT du moteur. Les vues qui en dépendent
    /// pour leur rendu passent par la forme statique et leurs miroirs.
    public func mayMountPlayer(role: VideoSurfaceRole, urlString: String) -> Bool {
        Self.mayMountPlayer(role: role,
                            surfaceMedia: urlString,
                            activeMedia: activeURL,
                            isPipActive: isPipActive)
    }

    /// Le player DÉJÀ chargé pour cette pièce jointe, si une surface de ce rôle
    /// peut le monter (O16). Lecture seule : ne charge rien, ne préempte rien.
    public func loadedPlayer(matching attachmentId: String, role: VideoSurfaceRole) -> AVPlayer? {
        guard Self.mayMountPlayer(role: role,
                                  surfaceMedia: attachmentId,
                                  activeMedia: self.attachmentId ?? "",
                                  isPipActive: isPipActive) else { return nil }
        return player
    }

    /// Une surface plein écran reprend sa vidéo (retour au premier plan,
    /// ouverture sur un média déjà en PiP) : la fenêtre PiP se referme, la
    /// lecture continue dans la surface.
    public func reclaimFromPip(urlString: String) {
        guard Self.fullscreenReclaimsPip(surfaceMedia: urlString,
                                         activeMedia: activeURL,
                                         isPipActive: isPipActive || isPipEngaged) else { return }
        stopPip()
    }
}
