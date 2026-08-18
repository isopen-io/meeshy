import SwiftUI
import MeeshyUI

/// Grammaire pointillée — contrat §WS-10 : « anneau pointillé + étincelle ✦
/// appliqués à `FocalIdentityHeader` quand `input.isAgentAuthored` ». Trait
/// PLEIN = humain, POINTILLÉ + ✦ = assistance (contrat §6.3, interdit 4 :
/// « le déterministe et l'agent ne se mélangent pas visuellement »).
///
/// Cotes (`FocalMetrics.Agent`, §4.3 des maquettes — « rangée pont/agent bord
/// pointillé radius 14 ») : `borderWidth` `1.5` réutilisé ICI pour l'anneau
/// d'avatar — une seule cote pour toute la grammaire pointillée (garde R15 :
/// aucun `1.5` littéral hors `FocalMetrics`).
///
/// **Résolution PURE, séparée du rendu** (`Descriptor`, `Equatable`) — le
/// critère d'acceptation « `isAgentGrammarEnabled == false` ⇒ rendu
/// identique à un message humain » se prouve en comparant deux `Descriptor`,
/// jamais par un test de rendu/snapshot (R15, registre des risques §7).
nonisolated public enum AgentAuthoredStyle {
    public struct Descriptor: Equatable, Sendable {
        public let showsDashedRing: Bool
        public let showsSpark: Bool

        /// Rendu identique à un message humain — AUCUNE décoration.
        public static let human = Descriptor(showsDashedRing: false, showsSpark: false)

        public init(showsDashedRing: Bool, showsSpark: Bool) {
            self.showsDashedRing = showsDashedRing
            self.showsSpark = showsSpark
        }
    }

    /// `isAgentGrammarEnabled == false` ⇒ TOUJOURS `.human`, quel que soit
    /// `isAgentAuthored` — le drapeau prime, sans exception (critère §WS-10
    /// littéral).
    public static func resolve(isAgentAuthored: Bool, isAgentGrammarEnabled: Bool) -> Descriptor {
        guard isAgentGrammarEnabled, isAgentAuthored else { return .human }
        return Descriptor(showsDashedRing: true, showsSpark: true)
    }
}

/// Anneau pointillé appliqué EN SURCOUCHE d'un avatar déjà rendu (jamais un
/// second avatar, jamais une recomposition de `MeeshyAvatar`) — `overlay`
/// pur, zéro état, zéro re-mesure de layout.
struct AgentAuthoredAvatarRing: ViewModifier {
    let descriptor: AgentAuthoredStyle.Descriptor
    let diameter: CGFloat

    func body(content: Content) -> some View {
        content.overlay(
            Group {
                if descriptor.showsDashedRing {
                    Circle()
                        .strokeBorder(
                            MeeshyColors.indigo500,
                            style: StrokeStyle(lineWidth: FocalMetrics.Agent.borderWidth, dash: [4, 3])
                        )
                        .frame(width: diameter, height: diameter)
                }
            }
        )
    }
}

extension View {
    /// `diameter` : le diamètre de l'avatar habillé (`FocalMetrics.Avatar.size`
    /// au rang, un diamètre différent ailleurs — jamais recalculé ici).
    func agentAuthoredAvatarRing(_ descriptor: AgentAuthoredStyle.Descriptor, diameter: CGFloat) -> some View {
        modifier(AgentAuthoredAvatarRing(descriptor: descriptor, diameter: diameter))
    }
}

/// L'étincelle ✦ — glyphe discret à poser à côté du nom quand
/// `descriptor.showsSpark`. Vue à part (pas un `Text("✦")` en dur au site
/// d'appel) pour que la garde source WS-10 (« aucune chaîne littérale de
/// plus de 20 caractères ») ait un seul endroit à vérifier pour ce glyphe.
struct AgentSparkGlyph: View {
    var body: some View {
        Text("✦")
            .font(MeeshyFont.relative(11, weight: .heavy))
            .foregroundColor(MeeshyColors.indigo500)
            .accessibilityHidden(true) // décoration — le libellé "agent" porte l'information, pas ce glyphe seul
    }
}
