import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que le Résumé dit d'un message PROTÉGÉ (#7452, exigence 3).
///
/// ## Deux règles, et elles tirent dans le même sens
///
/// 1. **Aucun texte DÉRIVÉ ne garde le contenu d'un éphémère au-delà de son
///    échéance.** Un digest est une COPIE : une fois composée, aucune
///    destruction serveur ne l'atteint, et le `LivingSummaryViewModel` ne
///    recompose jamais son digest (contrainte §WS-9, cache-first). La seule
///    façon qu'un résumé ne survive pas à l'échéance est donc qu'il ne
///    contienne JAMAIS le contenu protégé — c'est ce que
///    `LivingSummaryAssembly` applique en amont, en vidant le contenu des
///    messages protégés avant de bâtir le digest.
/// 2. **« S'il y figure, il porte son décompte. »** Le message EXISTE : le
///    masquer entièrement ferait mentir les comptes du digest. Il figure donc
///    ici, désigné par son chrome — le MÊME que celui des quatre autres modes
///    — et sans une ligne de son texte.
///
/// La liste est recomposée par le SITE DE MONTAGE à chaque passe de rendu de
/// `ConversationView` (elle dérive de `viewModel.messages`, qui est
/// `@Published`), jamais mémorisée dans le ViewModel du résumé : c'est ce qui
/// fait qu'un message échu en disparaît sans qu'on ait à rouvrir le mode.
struct SummaryProtectionEntry: Identifiable, Equatable {
    let id: String
    let senderDisplayName: String
    let descriptor: MessageProtectionDescriptor
    /// Ce message est en train d'être DÉTRUIT sous les yeux du lecteur
    /// (#7467). Le Résumé aussi montre la destruction : une ligne qui
    /// disparaît d'un coup d'une section intitulée « Ce qui va disparaître »
    /// serait la seule à ne pas le montrer.
    let isBurning: Bool
}

enum LivingSummaryProtections {

    /// Les messages protégés ENCORE VIVANTS de la fenêtre, dans l'ordre du fil.
    ///
    /// Un éphémère échu n'y figure pas : son descripteur est `.expired`, donc
    /// sans badge — et la règle 1 ci-dessus veut précisément qu'il ne reste
    /// aucune trace de lui dans le résumé.
    @MainActor
    static func entries(messages: [MeeshyMessage], now: Date = Date()) -> [SummaryProtectionEntry] {
        messages.compactMap { message in
            let descriptor = message.protection(now: now)
            guard !descriptor.isEmpty else { return nil }
            return SummaryProtectionEntry(
                id: message.id,
                senderDisplayName: message.senderName ?? message.senderUsername ?? message.senderId,
                descriptor: descriptor,
                isBurning: message.isBurning
            )
        }
    }
}

/// La section du Résumé qui porte les messages protégés.
struct SummaryProtectionsView: View {
    let entries: [SummaryProtectionEntry]
    let isDark: Bool

    var body: some View {
        if entries.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(String(localized: "focal.summary.protected.title",
                            defaultValue: "Ce qui va disparaître", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .heavy))
                    .foregroundColor(isDark ? .white.opacity(0.92) : .black.opacity(0.88))

                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    ForEach(entries) { entry in
                        HStack(spacing: MeeshySpacing.sm) {
                            Text(entry.senderDisplayName)
                                .font(MeeshyFont.relative(13, weight: .semibold))
                                .foregroundColor(isDark ? .white.opacity(0.9) : .black.opacity(0.85))
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            // Le MÊME chrome que la bulle, la rangée plate et
                            // la rivière. Le Résumé n'en peint pas un autre.
                            MessageProtectionChrome(descriptor: entry.descriptor, isDark: isDark)
                                .equatable()
                        }
                        .padding(.horizontal, MeeshySpacing.md)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(
                            RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                                .fill(isDark
                                      ? Color.white.opacity(FocalMetrics.SurfaceTint.darkFill)
                                      : Color.black.opacity(FocalMetrics.SurfaceTint.lightFill))
                        )
                        .accessibilityElement(children: .combine)
                        .ephemeralBurn(isBurning: entry.isBurning)
                    }
                }
            }
        }
    }
}
