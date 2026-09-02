import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La description se LIT sous la scène, et se replie** (#4742, directive
/// porteur 2026-09-01).
///
/// > « Le texte de description doit se mettre dans la scène pliable avec un
/// > bouton V tout en bas de la scène tout de suite en dessous, et qui devient
/// > ^ après le repli pour afficher de nouveau. »
///
/// ## Ce que ça change
///
/// La description était un MODE : la porte du rail basculait
/// `editsSceneDescription`, une zone montait en bas de l'écran, et hors de ce
/// mode le texte n'était **visible nulle part**. L'auteur ne pouvait pas relire
/// ce qu'il avait écrit sans rouvrir la porte — un contenu qui part avec la
/// publication et qu'on ne voit pas est un contenu qu'on oublie.
///
/// Elle devient un volet PERSISTANT, collé sous la scène, que le chevron replie.
///
/// ## L'ordre, qui n'est pas un rangement
///
/// De haut en bas, le bas de l'écran descend les niveaux du modèle — l'objet
/// (les rails, sur la scène), la SCÈNE (la bande contextuelle), la SLIDE (cette
/// description), la PUBLICATION (le socle). `ComposerSceneSurface` porte déjà
/// cette doctrine dans ses commentaires ; ce volet la rend enfin vraie pour la
/// description, qui flottait en overlay.
struct ComposerSceneDescriptionPanel: View {

    let text: String
    let placeholder: String
    @Binding var isCollapsed: Bool
    /// Ouvre la saisie. Le volet LIT ; il n'écrit pas — c'est l'éditeur
    /// existant (`sceneDescriptionEditor`) qui écrit, et deux champs pour un
    /// texte auraient divergé au premier réglage.
    let onEdit: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            chevron
            if !isCollapsed { lecture }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Le chevron

    /// **44 pt de haut, quel que soit le glyphe** (dimension 5) : un chevron
    /// dessiné à sa taille naturelle donnerait une cible de 12 pt que personne
    /// n'atteint du pouce.
    private var chevron: some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                isCollapsed.toggle()
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: Self.chevronSymbol(isCollapsed: isCollapsed))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // **Le libellé dit l'ACTION, jamais l'état.** « Description repliée »
        // laisserait le lecteur d'écran deviner ce qu'un appui ferait ; les
        // deux formulations ci-dessous le disent.
        .accessibilityLabel(Self.chevronLabel(isCollapsed: isCollapsed))
    }

    /// **Le glyphe DIT ce qu'un appui fera, pas où l'on en est.**
    ///
    /// Déplié, le chevron pointe vers le BAS — « range ça » ; replié, vers le
    /// HAUT — « remonte-le ». C'est la directive du porteur mot pour mot :
    /// « un bouton V […] qui devient ^ après le repli ». Règle PURE, hors du
    /// corps : une condition écrite dans un `body` est invisible aux tests, et
    /// celle-ci est tout ce que l'affordance promet.
    nonisolated static func chevronSymbol(isCollapsed: Bool) -> String {
        isCollapsed ? "chevron.up" : "chevron.down"
    }

    /// Le libellé du lecteur d'écran dit l'ACTION, jamais l'ÉTAT. « Description
    /// repliée » laisserait deviner ce qu'un appui ferait — et c'est justement
    /// ce qu'un lecteur d'écran ne peut pas voir.
    ///
    /// Il ne se dérive PAS du glyphe : « chevron.up » se prononce mal, et une
    /// chaîne qui sert l'œil ET la voix n'en sert qu'un.
    @MainActor
    static func chevronLabel(isCollapsed: Bool) -> String {
        isCollapsed
            ? String(localized: "composer.description.expand",
                     defaultValue: "Afficher la description", bundle: .main)
            : String(localized: "composer.description.collapse",
                     defaultValue: "Replier la description", bundle: .main)
    }

    // MARK: - La lecture

    /// Le texte, ou son invite. Un tap ouvre la saisie — le volet est une
    /// AFFORDANCE, pas un décor : le toucher doit mener quelque part (loi 4).
    private var lecture: some View {
        Button(action: onEdit) {
            Text(text.isEmpty ? placeholder : text)
                .font(MeeshyFont.relative(14, design: .rounded))
                .foregroundStyle(text.isEmpty ? .secondary : .primary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(String(localized: "composer.description.editHint",
                                  defaultValue: "Touchez pour modifier la description",
                                  bundle: .main))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}
