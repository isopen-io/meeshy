import SwiftUI
import MeeshyUI

// MARK: - Call Signal Strength

/// Force du signal affichée par le glyphe réseau de l'appel — dérivée
/// PUREMENT des niveaux de qualité déjà mesurés (`VideoQualityLevel`,
/// stats RTT + perte de paquets) avec l'état ICE en repli quand les stats
/// n'ont pas encore produit de tick. Aucune heuristique nouvelle : c'est un
/// mapping visuel des niveaux existants vers barres + code couleur, testable
/// sans UI.
enum CallSignalStrength: Equatable {
    case excellent
    case good
    case fair
    case poor
    case lost
    /// Négociation en cours — pas encore de mesure de lien exploitable.
    case connecting

    /// Priorité aux stats temps réel (mises à jour chaque tick) ; l'état ICE
    /// binaire ne sert que de repli avant le premier échantillon.
    static func from(level: VideoQualityLevel?, connection: PeerConnectionState) -> CallSignalStrength {
        if let level {
            switch level {
            case .excellent: return .excellent
            case .good: return .good
            case .fair: return .fair
            case .poor: return .poor
            case .critical: return .lost
            }
        }
        switch connection {
        case .connected: return .good
        case .reconnecting, .checking, .new: return .fair
        case .disconnected, .failed, .closed: return .lost
        case .connecting: return .connecting
        }
    }

    /// Fraction de barres remplies du SF Symbol `cellularbars` (variable value).
    var barsFraction: Double {
        switch self {
        case .excellent: return 1.0
        case .good: return 0.75
        case .fair: return 0.5
        case .poor: return 0.25
        case .lost: return 0.0
        case .connecting: return 0.5
        }
    }

    /// Code couleur sémantique : vert = sain, ambre = dégradé, rouge = critique.
    /// `.connecting` reste indigo (état neutre, pas un verdict de qualité) —
    /// même mapping que l'ancien point de qualité qu'il remplace.
    var color: Color {
        switch self {
        case .excellent, .good: return MeeshyColors.success
        case .fair: return MeeshyColors.warning
        case .poor, .lost: return MeeshyColors.error
        case .connecting: return MeeshyColors.indigo400
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .excellent, .good:
            return String(localized: "call.quality.good", defaultValue: "Connexion bonne", bundle: .main)
        case .fair:
            return String(localized: "call.quality.reconnecting", defaultValue: "Reconnexion", bundle: .main)
        case .poor, .lost:
            return String(localized: "call.quality.lost", defaultValue: "Connexion perdue", bundle: .main)
        case .connecting:
            return String(localized: "call.quality.inProgress", defaultValue: "Connexion en cours", bundle: .main)
        }
    }

    /// `true` quand le lien mérite l'attention de l'utilisateur (ambre/rouge).
    /// `.connecting` n'est PAS dégradé : la négociation initiale ne doit pas
    /// faire surgir le glyphe — seule une reconnexion mid-call (mappée `.fair`
    /// via `PeerConnectionState.reconnecting`) le déclenche.
    var isDegraded: Bool {
        switch self {
        case .fair, .poor, .lost: return true
        case .excellent, .good, .connecting: return false
        }
    }
}

// MARK: - Call Signal Glyph

/// Glyphe de signal réseau (barres cellulaires) code couleur, posé parmi les
/// autres indicateurs de l'appel (capsule durée, bannière d'appel réduite).
/// Rendu BRUT, toujours visible — la politique d'apparition/retrait vit dans
/// `TransientCallSignalGlyph`.
struct CallSignalGlyph: View {
    let strength: CallSignalStrength

    // Audit P2-iOS-9 — see CallView/IncomingCallView: skip animating
    // repeated bar-strength changes for motion-sensitive users.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Image(systemName: "cellularbars", variableValue: strength.barsFraction)
            .font(.caption.weight(.semibold))
            .foregroundStyle(strength.color)
            .accessibilityLabel(strength.accessibilityLabel)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: strength)
    }
}

// MARK: - Transient Call Signal Glyph

/// Cycle de vie du glyphe signal (retour user 2026-07-04) : INVISIBLE tant que
/// le lien est sain — un appel qui se passe bien n'affiche aucun indicateur.
/// Il APPARAÎT à la première dégradation (ambre/rouge), suit la qualité en
/// temps réel, puis — quand le lien redevient vert — RESTE affiché en vert
/// `recoveryLingerSeconds` (l'utilisateur voit la récupération) avant de se
/// retirer.
struct TransientCallSignalGlyph: View {
    let strength: CallSignalStrength

    /// Fenêtre de persistance du glyphe VERT après récupération, avant retrait.
    static let recoveryLingerSeconds: UInt64 = 30

    @State private var isVisible = false
    // Audit P2-iOS-9 — see CallView/IncomingCallView: the appear/disappear
    // scale+opacity transition is skipped for motion-sensitive users, matching
    // every other animated element in the call chrome.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if isVisible {
                CallSignalGlyph(strength: strength)
                    .transition(.opacity.combined(with: .scale(scale: 0.6)))
            }
        }
        .adaptiveOnChange(of: strength.isDegraded) { _, isDegraded in
            guard isDegraded else { return }
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { isVisible = true }
        }
        // Compte à rebours de retrait : armé quand le glyphe est visible sur un
        // lien redevenu sain ; toute re-dégradation change l'`id` → SwiftUI
        // annule le Task et le glyphe reste.
        .task(id: lingerKey) {
            guard isVisible, !strength.isDegraded else { return }
            try? await Task.sleep(nanoseconds: Self.recoveryLingerSeconds * 1_000_000_000)
            if !Task.isCancelled {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) { isVisible = false }
            }
        }
    }

    private var lingerKey: String {
        "\(isVisible)-\(strength.isDegraded)"
    }
}
