import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Trois crans » de « Voir comme » (planche `Moi-Apercu`) : Public, Ami et Sang côte à côte, chacun disant ce que la
/// Vitrine lui ouvre. Lu dans la loi (`ProfileCircleView.seenAs` → `VitrineSeenAs`), jamais dans une liste à la main :
/// une carte ne porte que des NOMS de rangées, aucune valeur.
struct VitrineCran: Identifiable, Equatable {
    let level: RelationLevel
    let opened: [VitrineSeenAs.Row]
    let contact: VitrineSeenAs.Contact
    var id: RelationLevel { level }

    /// Les trois crans de la planche : le plancher, le premier cercle d'amitié, le plus intime.
    static let levels: [RelationLevel] = [.public, .friend, .blood]

    static func make(ownerRole: PlatformRole?) -> [VitrineCran] {
        levels.map { level in
            let seen = VitrineSeenAs.make(view: ProfileCircleView.seenAs(level, ownerRole: ownerRole))
            let locked = Set(seen.lockedRows.map(\.row))
            return VitrineCran(level: level,
                               opened: VitrineSeenAs.Row.allCases.filter { !locked.contains($0) },
                               contact: seen.contact)
        }
    }

    /// « Ami : Présence, Niveau et rang. Écrire » — le cran, ce qu'il ouvre, puis le geste de contact.
    var spokenLabel: String {
        let opens = opened.isEmpty ? VitrineSeenAsCopy.cranNothing : opened.map(VitrineSeenAsCopy.rowTitle).joined(separator: ", ")
        let contactWord = VitrineCran.contactWord(contact)
        let head = "\(CircleLevelNames.title(of: level)) : \(opens)"
        return contactWord.map { "\(head). \($0)" } ?? head
    }

    static func contactWord(_ contact: VitrineSeenAs.Contact) -> String? {
        switch contact {
        case .write: return VitrineSeenAsCopy.write
        case .requestToWrite: return VitrineSeenAsCopy.requestToWrite
        case .unavailable: return nil
        }
    }
}

/// Les trois cartes. Toucher une carte montre la Vitrine à ce cercle.
struct VitrineCransSection: View {
    let crans: [VitrineCran]
    let current: RelationLevel
    let accentColor: String
    let onSelect: (RelationLevel) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: VitrineSeenAsCopy.cransTitle)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: MeeshySpacing.sm) { cards }
                VStack(spacing: MeeshySpacing.sm) { cards }
            }
        }
    }

    private var cards: some View {
        ForEach(crans.map { AsyncRenderRow(id: $0.id, content: card($0)) }, content: asyncRenderRowContent)
    }

    private func card(_ cran: VitrineCran) -> some View {
        let isCurrent = cran.level == current
        return Button {
            HapticFeedback.light()
            onSelect(cran.level)
        } label: {
            MeeshyGroupCard(surface: isCurrent ? .accent : .raised, tint: Color(hex: accentColor)) {
                cranLines(cran, isCurrent: isCurrent)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(cran.spokenLabel)
        .accessibilityAddTraits(isCurrent ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("profile.seenAs.cran.\(cran.level.rawValue.lowercased())")
    }

    private func cranLines(_ cran: VitrineCran, isCurrent: Bool) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            MeeshyBadge(.label(CircleLevelNames.title(of: cran.level)),
                        leading: .systemImage(VitrineSeenAsCopy.glyph(of: cran.level)),
                        surface: isCurrent ? .solid : .tonal, kind: .accent, tint: Color(hex: accentColor))
            if cran.opened.isEmpty {
                line(VitrineSeenAsCopy.cranNothing, glyph: "eye.slash")
            }
            ForEach(cran.opened.map { row in
                AsyncRenderRow(id: row, content: line(VitrineSeenAsCopy.rowTitle(row), glyph: VitrineSeenAsCopy.rowGlyph(row)))
            }, content: asyncRenderRowContent)
            if let word = VitrineCran.contactWord(cran.contact) {
                line(word, glyph: "bubble.left")
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(MeeshySpacing.sm)
    }

    private func line(_ text: String, glyph: String) -> some View {
        Label {
            Text(text).lineLimit(2).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: glyph).accessibilityHidden(true)
        }
        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
        .foregroundStyle(ThemeManager.shared.textPrimary)
    }
}
