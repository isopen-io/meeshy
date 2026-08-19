import SwiftUI
import MeeshySDK

// MARK: - Les deux entrées de référence d'un composer

/// Deux entrées, deux défauts, un seul menu — spec §7.
///
/// Ces deux vues sont les BLOCS que chaque composer pose où sa mise en page le
/// veut : la liste sous le champ de saisie, la barre au-dessus de la barre
/// d'outils. Elles ne décident ni quand publier ni comment, et ne lisent aucun
/// singleton produit : ce qu'elles savent faire tient dans leurs paramètres.
///
/// Elles vivent ici plutôt que dans l'app parce que la grammaire de geste
/// (`ReferencePickerLogic`), les pastilles (`PostReferenceDisplay.symbolName`)
/// et le catalogue de libellés sont déjà ici — les recopier côté app
/// dupliquerait sept langues et deux règles.

/// La liste `@` qui suit la frappe.
///
/// Tap = INLINE : la personne est nommée PAR LE TEXTE, et le serveur relira son
/// `@handle` lui-même — rien n'est déclaré. Appui long = le menu, dont tout
/// choix autre qu'« insérer » RETIRE le `@handle` du texte : c'est exactement
/// l'intérêt du geste.
public struct ReferenceMentionSuggestions: View {
    @Binding private var text: String
    @Binding private var references: [ComposerReference]
    private let hasCanvas: Bool
    private let background: Color

    /// - Parameter hasCanvas: `false` pour un post, un réel ou un statut —
    ///   aucun d'eux n'a de couche de positionnement, donc le badge n'y est pas
    ///   proposé (spec §9).
    public init(text: Binding<String>,
                references: Binding<[ComposerReference]>,
                hasCanvas: Bool = false,
                background: Color = Color(.secondarySystemBackground)) {
        self._text = text
        self._references = references
        self.hasCanvas = hasCanvas
        self.background = background
    }

    public var body: some View {
        // Le fragment en cours de frappe est DÉRIVÉ du texte à chaque
        // évaluation, jamais recopié dans un `@State` : deux extractions
        // divergeraient dès la première frappe qu'un `onChange` manquerait.
        if let query = ComposerMentionQuery.trailingHandle(in: text) {
            MentionSuggestionList(query: query) { user in
                insert(user)
            } contextMenu: { user in
                ReferenceModeMenu(modes: PostReferenceDisplay.textListMenu(forCanvas: hasCanvas)) { mode in
                    choose(mode, for: user)
                }
            }
            .background(RoundedRectangle(cornerRadius: 12).fill(background))
            .transition(.opacity)
        }
    }

    /// Tap = INLINE. Une déclaration antérieure pour la même personne PART :
    /// une personne, un mode, et c'est le texte qui la porte désormais.
    private func insert(_ user: UserSearchResult) {
        text = ComposerMentionQuery.replacingTrailingHandle(in: text, with: user.username)
        references = ComposerReferences.remove(username: user.username, from: references)
    }

    private func choose(_ mode: PostReferenceDisplay, for user: UserSearchResult) {
        // Le fragment en cours de frappe (`@ali`) est d'abord COMPLÉTÉ : c'est
        // la seule forme que la règle de retrait sache reconnaître, et les deux
        // règles pures se composent ainsi sans qu'aucune ne connaisse l'autre.
        let inserted = ComposerMentionQuery.replacingTrailingHandle(in: text, with: user.username)
        guard mode != .inline else {
            insert(user)
            return
        }
        text = ComposerReferences.removingHandle(user.username, from: inserted)
        references = ReferencePickerLogic.apply(
            .choose(mode), username: user.username, userId: user.id,
            to: references, context: .textList
        )
    }
}

/// Le chip « Mentionner » et la rangée d'état, qui ouvrent la MÊME feuille.
///
/// Les deux ensemble parce qu'ils partagent cette feuille : les séparer
/// obligerait chaque composer à porter le drapeau de présentation et à le
/// passer aux deux, pour un gain de mise en page nul.
///
/// La rangée disparaît d'elle-même quand rien n'est déclaré
/// (`ReferenceChipRow`), si bien qu'un composer vierge ne montre que le chip.
public struct ReferenceComposerBar: View {
    @Binding private var references: [ComposerReference]
    private let accentColor: Color
    private let hasCanvas: Bool
    @State private var showPicker = false

    public init(references: Binding<[ComposerReference]>,
                accentColor: Color,
                hasCanvas: Bool = false) {
        self._references = references
        self.accentColor = accentColor
        self.hasCanvas = hasCanvas
    }

    public var body: some View {
        HStack(spacing: 12) {
            chip
            ReferenceChipRow(references: references, accentColor: accentColor) {
                showPicker = true
            }
            .equatable()
            Spacer(minLength: 0)
        }
        .sheet(isPresented: $showPicker) {
            StoryMentionPickerSheet(references: references,
                                    modes: PostReferenceDisplay.declarable(forCanvas: hasCanvas)) { updated in
                references = updated
            }
        }
    }

    /// La seconde porte : nommer quelqu'un SANS l'écrire. La première reste la
    /// frappe `@`, dont la liste sert le même menu.
    private var chip: some View {
        Button {
            showPicker = true
            HapticFeedback.light()
        } label: {
            Label(String(localized: "reference.sheet.title", defaultValue: "Mentionner", bundle: .module),
                  systemImage: "at")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(accentColor)
        }
        .buttonStyle(.plain)
    }
}
