import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - FocalNonMediaGate — décision pure, extraite pour rester testable
// sans hôte SwiftUI (même patron que `FocalAudioRouting.mode(for:)`,
// « types purs à extraire », contrat §3).

/// Faut-il monter `FocalNonMediaBlock` pour cette rangée ? Même garde que
/// `FocalRow.textOrEmojiBlock` : jamais quand l'audio héberge déjà la
/// légende dans son propre widget (`audioMode == .hostsCaption` — parité
/// bulle assumée, `FocalAudioRouting` doc de tête : la bulle n'atteint pas
/// non plus `textBubbleContent`, donc pas le lieu/fichier, dans ce cas
/// résiduel), jamais quand il n'y a ni lieu ni fichier à décrire.
nonisolated enum FocalNonMediaGate {
    static func shouldRender(hasSharedPlace: Bool, nonMediaCount: Int, audioMode: FocalAudioMode) -> Bool {
        audioMode != .hostsCaption && (hasSharedPlace || nonMediaCount > 0)
    }
}

// MARK: - FocalNonMediaBlock (correctif « rangée vide », 2026-08-17)

/// Bloc « lieu / fichier » NU de la rangée plate — retrait `29`
/// (`FocalMetrics.Text.indent`), AUCUNE carte enrichie (pas de
/// `LocationMessageView`/carte fichier — non budgétées par ce chantier),
/// texte descriptif honnête, jamais vide, jamais inventé.
///
/// **Corrige le fil VIDE du 2026-08-17.** `content.location != nil` et le
/// panier `.nonMedia` de `content.attachments` (fichier, ou lieu hérité du
/// cache local) font tous deux compter `BubbleContent.hasTextOrNonMediaContent`
/// comme VRAI (`BubbleContent.swift:192-217`) — c'est ce booléen, et lui
/// seul, qui décidait jusqu'ici si `FocalRow.textOrEmojiBlock` montait
/// `textBlock`. Mais `textBlock` ne rend QUE
/// `content.translation?.preferredContent ?? content.text?.raw ?? ""` : un
/// message « lieu seul » ou « fichier seul » (aucun texte propre) atteignait
/// donc bien une rangée, mais avec une CHAÎNE VIDE — visuellement blanche,
/// alors que la bulle historique rend `LocationMessageView`/`attachmentView`
/// pour le même message (`BubbleStandardLayout.swift:967-984`, seul chemin
/// qui les monte aujourd'hui : WS-3 n'a construit `FocalAttachmentBlock`/
/// `FocalAudioBlock` que pour le visuel et l'audio, jamais pour ce panier).
/// `BubbleLocationRenderingTests.test_messageLocation_isPropagated_andCountsAsContent`
/// documentait déjà EXACTEMENT cette même classe de bug côté bulle (« sinon
/// un message lieu seul … ne rendrait rien du tout ») — le Fil en avait
/// hérité sans le correctif équivalent.
///
/// Aucun bloc riche n'est budgété par ce chantier pour ce panier : repli
/// DESCRIPTIF honnête plutôt qu'une rangée vide. Réutilise TELLE QUELLE la
/// loi déjà écrite pour VoiceOver, `MessageAccessibilityLabelComposer.
/// nonMediaAccessibilityParts` (elle-même miroir de
/// `BubbleStandardLayout.nonMediaAccessibilityParts`, §1.3) — jamais une
/// seconde résolution : les MÊMES clés i18n que VoiceOver annonce déjà
/// (`a11y.message.location` / `a11y.message.file`), simplement rendues à
/// l'écran ici plutôt que seulement lues.
struct FocalNonMediaBlock: View, Equatable {
    let hasSharedPlace: Bool
    let items: [MessageAttachment]
    let isDark: Bool

    static func == (lhs: FocalNonMediaBlock, rhs: FocalNonMediaBlock) -> Bool {
        lhs.hasSharedPlace == rhs.hasSharedPlace
            && lhs.items.map(\.id) == rhs.items.map(\.id)
            && lhs.isDark == rhs.isDark
    }

    private var parts: [String] {
        MessageAccessibilityLabelComposer.nonMediaAccessibilityParts(hasSharedPlace: hasSharedPlace, nonMedia: items)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, text in
                Text(text)
                    .font(MeeshyFont.relative(FocalMetrics.Text.size))
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
        }
        .padding(.leading, FocalMetrics.Text.indent)
    }
}
