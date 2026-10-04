import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les mots du cadre en direct (#9214). Les noms des cadres sont des noms propres
/// (`CallFrameDesign.name`) et les ambiances viennent de `CallFrameCopy`.
enum CallLiveFrameCopy {
    static var label: String {
        String(localized: "call.liveFrame.label", defaultValue: "Cadre en direct", bundle: .main)
    }

    static var caption: String {
        String(localized: "call.liveFrame.caption", defaultValue: "Cadre", bundle: .main)
    }

    static var none: String {
        String(localized: "call.liveFrame.none", defaultValue: "Aucun cadre", bundle: .main)
    }

    static var none: String {
        String(localized: "call.liveFrame.none", defaultValue: "Aucun cadre", bundle: .main)
    }

    static var hint: String {
        String(localized: "call.liveFrame.hold.hint", defaultValue: "Garde ce cadre autour des deux vidéos pendant tout l'appel, et le propose à votre correspondant", bundle: .main)
    }

    static var notProposed: String {
        String(localized: "call.liveFrame.notProposed", defaultValue: "Le cadre est appliqué chez vous, mais n'a pas pu être proposé", bundle: .main)
    }

    static func proposal(from name: String?, frame: String) -> String {
        guard let name, !name.isEmpty else {
            return String(format: String(localized: "call.liveFrame.proposal.anonymous", defaultValue: "Votre correspondant vous propose le cadre « %@ »", bundle: .main), frame)
        }
        return String(format: String(localized: "call.liveFrame.proposal", defaultValue: "%1$@ vous propose le cadre « %2$@ »", bundle: .main), name, frame)
    }

    static var accept: String {
        String(localized: "call.liveFrame.accept", defaultValue: "Appliquer", bundle: .main)
    }

    static var decline: String {
        String(localized: "call.liveFrame.decline", defaultValue: "Non merci", bundle: .main)
    }

    static func answered(_ reply: CallLiveFrameReply, by name: String?) -> String {
        let who = name.flatMap { $0.isEmpty ? nil : $0 }
        switch (reply, who) {
        case (.accepted, let who?):
            return String(format: String(localized: "call.liveFrame.answer.accepted", defaultValue: "%@ a appliqué votre cadre", bundle: .main), who)
        case (.accepted, nil):
            return String(localized: "call.liveFrame.answer.accepted.anonymous", defaultValue: "Votre correspondant a appliqué votre cadre", bundle: .main)
        case (.declined, let who?):
            return String(format: String(localized: "call.liveFrame.answer.declined", defaultValue: "%@ garde son affichage", bundle: .main), who)
        case (.declined, nil):
            return String(localized: "call.liveFrame.answer.declined.anonymous", defaultValue: "Votre correspondant garde son affichage", bundle: .main)
        }
    }

    static func surface(_ name: String) -> String {
        String(format: String(localized: "call.liveFrame.surface", defaultValue: "Cadre %@ autour des deux vidéos", bundle: .main), name)
    }

    static func suspended(_ reason: CallLiveFrameSuspension) -> String {
        switch reason {
        case .deviceConstrained:
            return String(localized: "call.liveFrame.suspended.device", defaultValue: "Cadre en pause : l'appareil se protège (chaleur ou économie d'énergie)", bundle: .main)
        case .reduceMotion:
            return String(localized: "call.liveFrame.suspended.motion", defaultValue: "Ce cadre est animé : il reste masqué tant que « Réduire les animations » est activé", bundle: .main)
        }
    }
}

/// **LA PROPOSITION D'UN CADRE** (#9287) — l'autre m'invite à appliquer son cadre ; rien ne
/// change chez moi tant que je n'ai pas touché « Appliquer ». Posée en haut de l'écran
/// d'appel, sous l'en-tête, elle laisse la vidéo et les commandes à leur place.
struct CallLiveFrameProposalCard: View {
    let text: String
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                Image(systemName: "photo.artframe")
                    .font(.body.weight(.semibold))
                    .foregroundColor(.white)
                    .accessibilityHidden(true)
                Text(text)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: MeeshySpacing.sm) {
                Button(action: onDecline) {
                    Text(CallLiveFrameCopy.decline)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Capsule().fill(Color.white.opacity(0.16)))
                }
                .buttonStyle(.plain)
                Button(action: onAccept) {
                    Text(CallLiveFrameCopy.accept)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Capsule().fill(MeeshyColors.brandGradient))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.ultraThinMaterial).environment(\.colorScheme, .dark))
        .accessibilityElement(children: .contain)
    }
}

/// Une ligne d'état du cadre : la réponse de l'autre, ou la raison d'une pause.
struct CallLiveFrameNotice: View {
    let text: String

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "photo.artframe")
                .accessibilityHidden(true)
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.footnote.weight(.semibold))
        .foregroundColor(.white)
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(Capsule().fill(.ultraThinMaterial).environment(\.colorScheme, .dark))
        .accessibilityElement(children: .combine)
    }
}
