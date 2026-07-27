import SwiftUI
import MeeshySDK
import MeeshyUI

/// Explorateur de langues du Prisme Linguistique pour une STORY, ouvert par le
/// « + » de la barre rapide (`StoryLanguageQuickBar`). Reprend le visuel de la
/// liste extraite de la vue de conversation (`MessageLanguageDetailView`) —
/// contenu de la langue courante en tête, liste de langues avec aperçu +
/// retraduire, action « Traduire » sur les langues absentes — mais câblé sur les
/// données story (`StoryItem.translations`) et le service story
/// (`StoryInteractionService.requestTranslation`). Remplace `LanguagePickerSheet`
/// dans le reader (mal intégré au liquid glass, sans dark/light — directive user
/// 2026-07-26).
///
/// App-side : orchestration UX produit (câble les traductions prêtes de la story
/// + décide « tap = explorer / traduire »). Feuille en verre, dark + light via
/// `@Environment(\.colorScheme)`.
struct StoryLanguageDetailView: View {
    let story: StoryItem
    /// Langue effectivement affichée (override d'exploration ou tête de chaine).
    let activeLanguageCode: String?
    /// Sélection d'une langue à AFFICHER (le reader prépose l'override + trace).
    let onSelectLanguage: (String) -> Void
    /// Demande de (re)traduction on-demand (le reader appelle le service story).
    /// `force` distingue « Traduire » (première demande) de « Retraduire » : sans
    /// lui, les deux appelaient la même route, qui sortait aussitôt sur ses gardes
    /// de cache — le bouton « Retraduire » ne faisait strictement rien.
    let onTranslate: (String, Bool) -> Void
    let onDismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    /// Langues pour lesquelles une traduction vient d'être demandée — l'anneau
    /// tourne tant qu'elle n'est pas arrivée dans `story.translations`.
    @State private var translatingLanguages: Set<String> = []

    /// Texte affiché au moment où « Retraduire » a été pressé, par langue.
    ///
    /// Une langue déjà traduite garde son aperçu : l'attente ne pouvait donc pas
    /// se déduire de « pas encore de traduction », et le bouton « Retraduire »
    /// ne donnait aucun signe de vie. On mémorise le texte de départ et on
    /// affiche l'anneau tant qu'il n'a pas changé — la nouvelle traduction
    /// arrive par socket (`post:translation-updated`), donc l'anneau s'éteint de
    /// lui-même à l'instant où le texte bascule. Aucun drapeau à éteindre à la
    /// main, aucun anneau orphelin si l'événement se perd (cf. le garde-fou de
    /// `retranslateExpiry`).
    @State private var retranslateBaseline: [String: String] = [:]

    /// Une retraduction peut rendre un texte IDENTIQUE — le modèle est
    /// déterministe. La comparaison seule laisserait alors l'anneau tourner sans
    /// fin. Ce garde-fou le coupe au bout d'un délai raisonnable.
    private static let retranslateTimeout: Duration = .seconds(20)

    /// Traductions prêtes, dérivées EN DIRECT de la story (le reader re-rend la
    /// feuille quand la story se met à jour par socket) : `code → contenu`.
    private var translations: [String: String] {
        Dictionary(
            (story.translations ?? []).map { ($0.language.lowercased(), $0.content) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    /// Contenu de la LANGUE COURANTE : sa traduction si disponible, sinon le
    /// texte source de la story.
    private var currentContent: String? {
        if let code = activeLanguageCode?.lowercased(), let translated = translations[code] {
            return translated
        }
        return story.content
    }

    // MARK: - Feuille redimensionnable

    /// Hauteur choisie par l'utilisateur au grabber, comme la feuille des
    /// réactions (`EmojiFullPickerSheet`) : la liste des langues est longue et
    /// le contenu original peut l'être aussi, si bien qu'une hauteur figée
    /// obligeait à scroller dans une lucarne. Tirer vers le haut agrandit,
    /// vers le bas réduit puis ferme.
    @State private var sheetHeight: CGFloat = 460
    @State private var dragOffset: CGFloat = 0
    /// Dernière hauteur du conteneur : le geste et les bornes vivent hors du
    /// `GeometryReader`, ils ont besoin de cette valeur pour se cadrer.
    @State private var containerHeight: CGFloat = 460

    private let minHeight: CGFloat = 320

    private func maxHeight(for containerHeight: CGFloat) -> CGFloat {
        min(containerHeight * 0.85, 720)
    }

    private func currentHeight(for containerHeight: CGFloat) -> CGFloat {
        min(max(sheetHeight - dragOffset, minHeight), maxHeight(for: containerHeight))
    }

    /// Même loi que la feuille des réactions : un geste franc vers le bas
    /// replie d'abord à la hauteur minimale, puis ferme ; vers le haut, il
    /// déploie au maximum.
    private var sheetDragGesture: some Gesture {
        DragGesture()
            .onChanged { value in dragOffset = value.translation.height }
            .onEnded { value in
                let dy = value.translation.height
                let velocity = value.predictedEndTranslation.height
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    if dy > 100 || velocity > 300 {
                        if sheetHeight > minHeight + 50 { sheetHeight = minHeight }
                        else { onDismiss(); return }
                    } else if dy < -80 || velocity < -300 {
                        sheetHeight = maxHeight(for: containerHeight)
                    }
                    dragOffset = 0
                }
            }
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                // Scrim discret — tap pour fermer (la story reste visible derrière).
                Color.black.opacity(0.35)
                    .ignoresSafeArea()
                    .onTapGesture { onDismiss() }

                panel
                    .frame(height: currentHeight(for: geo.size.height))
                    .gesture(sheetDragGesture)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            .onAppear { containerHeight = geo.size.height }
            .adaptiveOnChange(of: geo.size.height) { _, newValue in
                containerHeight = newValue
            }
        }
    }

    private var panel: some View {
        VStack(spacing: 0) {
            handle
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 12) {
                    currentContentCard
                    Rectangle()
                        .fill(Color.white.opacity(isDark ? 0.06 : 0.04))
                        .frame(height: 0.5)
                    originalRow
                    ForEach(LanguageDisplay.translationPickerLanguages, id: \.code) { lang in
                        languageRow(lang)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .frame(maxWidth: .infinity)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(isDark ? 0.1 : 0.06), lineWidth: 0.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.3), radius: 16, y: 6)
        .padding(.horizontal, 8)
        .accessibilityElement(children: .contain)
    }

    private var handle: some View {
        VStack(spacing: 8) {
            Capsule()
                .fill(theme.textMuted.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.top, 10)
            HStack(spacing: 8) {
                Image(systemName: "character.book.closed.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.indigo400)
                Text(String(localized: "story.language.detail.title",
                            defaultValue: "Langues", bundle: .main))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 6)
        }
    }

    /// En-tête : le contenu textuel de la langue COURANTE (demande explicite user).
    @ViewBuilder
    private var currentContentCard: some View {
        if let content = currentContent, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let code = Self.displayCode(for: activeLanguageCode)
            let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Circle().fill(langColor).frame(width: 6, height: 6)
                    Text(StoryLanguageDetailView.languageName(for: code))
                        .font(.caption.weight(.semibold))
                        .foregroundColor(langColor)
                    Spacer()
                    if !code.isEmpty {
                        Text(code.uppercased())
                            .font(.system(.caption2, design: .monospaced).weight(.bold))
                            .foregroundColor(langColor)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(Capsule().fill(langColor.opacity(0.12)))
                    }
                }
                Text(content)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
            .padding(.top, 4)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(langColor.opacity(isDark ? 0.08 : 0.05))
                    .overlay(RoundedRectangle(cornerRadius: 12)
                        .stroke(langColor.opacity(0.15), lineWidth: 0.5))
            )
        }
    }

    /// Entrée « Original » — le seul choix qui n'est pas une langue.
    ///
    /// Directive user 2026-07-27 : plusieurs bouts d'une même story peuvent être
    /// écrits dans des langues différentes ; il faut pouvoir revenir à
    /// l'original QUOI QU'IL ARRIVE. Choisir la langue d'origine de la story ne
    /// le permet pas — un overlay français dans une story marquée `en` possède
    /// une traduction `en` qui serait servie à la place de son texte réel.
    /// Sélectionner « Original » vide la chaîne préférée : chaque overlay
    /// retombe sur son propre texte, dans sa propre langue.
    private var originalRow: some View {
        let isActive = activeLanguageCode == StoryViewerView.originalLanguageOverride
        let accent = theme.textMuted

        return Button {
            HapticFeedback.light()
            onSelectLanguage(StoryViewerView.originalLanguageOverride)
            onDismiss()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "text.quote")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? MeeshyColors.indigo400 : accent)
                    .frame(width: 8 + 6)
                Text(String(localized: "story.language.detail.original",
                            defaultValue: "Original", bundle: .main))
                    .font(.footnote.weight(.medium))
                    .foregroundColor(isActive ? MeeshyColors.indigo400 : theme.textPrimary)
                Spacer()
                Text(String(localized: "story.language.detail.original.hint",
                            defaultValue: "Chaque texte dans sa langue", bundle: .main))
                    .font(.caption2)
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
                if isActive {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption.weight(.medium))
                        .foregroundColor(MeeshyColors.indigo400)
                }
            }
            .padding(.vertical, 9)
            .padding(.horizontal, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isActive ? MeeshyColors.indigo400.opacity(isDark ? 0.08 : 0.05) : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "story.language.detail.original",
                                        defaultValue: "Original", bundle: .main)))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    private func languageRow(_ lang: LanguageDisplay) -> some View {
        let langColor = Color(hex: LanguageDisplay.colorHex(for: lang.code))
        let translated = translations[lang.code.lowercased()]
        let hasTranslation = translated != nil
        let isTranslating = translatingLanguages.contains(lang.code) && !hasTranslation
        let isRetranslating = Self.isRetranslating(
            baseline: retranslateBaseline[lang.code],
            currentText: translated
        )
        let isActive = StoryLanguageQuickBar.isActive(lang.code, active: activeLanguageCode)

        return Button {
            HapticFeedback.light()
            if hasTranslation {
                onSelectLanguage(lang.code)
                onDismiss()
            } else {
                translatingLanguages.insert(lang.code)
                onTranslate(lang.code, false)
            }
        } label: {
            HStack(spacing: 10) {
                Circle().fill(langColor).frame(width: 8, height: 8)
                Text(lang.flag).font(.callout)
                Text(lang.name)
                    .font(.footnote.weight(.medium))
                    .foregroundColor(isActive ? langColor : theme.textPrimary)
                Spacer()
                if isTranslating {
                    ProgressView().scaleEffect(0.7).tint(langColor)
                } else if let translated {
                    Text(String(translated.prefix(50)) + (translated.count > 50 ? "…" : ""))
                        .font(.caption2)
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                        .frame(maxWidth: 150, alignment: .trailing)
                    // Retraduire
                    Button {
                        HapticFeedback.light()
                        retranslateBaseline[lang.code] = translated
                        onTranslate(lang.code, true)
                        let code = lang.code
                        Task {
                            try? await Task.sleep(for: Self.retranslateTimeout)
                            retranslateBaseline[code] = nil
                        }
                    } label: {
                        Group {
                            if isRetranslating {
                                ProgressView().scaleEffect(0.6)
                            } else {
                                Image(systemName: "arrow.clockwise")
                                    .font(.caption2.weight(.medium))
                            }
                        }
                        .foregroundColor(langColor.opacity(0.7))
                        .tint(langColor)
                        .frame(width: 26, height: 26)
                        .contentShape(Circle())
                    }
                    .disabled(isRetranslating)
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(String(localized: "story.language.detail.retranslate",
                                                    defaultValue: "Retraduire", bundle: .main)))
                    Image(systemName: isActive ? "checkmark.circle.fill" : "chevron.forward")
                        .font(.caption.weight(.medium))
                        .foregroundColor(isActive ? langColor : theme.textMuted.opacity(0.5))
                } else {
                    Text(String(localized: "story.language.detail.translate",
                                defaultValue: "Traduire", bundle: .main))
                        .font(.caption2.weight(.medium))
                        .foregroundColor(langColor)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(langColor.opacity(0.12)))
                }
            }
            .padding(.vertical, 9)
            .padding(.horizontal, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isActive ? langColor.opacity(isDark ? 0.08 : 0.05) : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(lang.name))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    /// Code langue AFFICHABLE de la sélection courante.
    ///
    /// `activeLanguageCode` porte la sentinelle « Original » quand l'utilisateur
    /// a choisi ce mode. Passée telle quelle au résolveur de nom, elle retombe
    /// sur `code.uppercased()` — la feuille aurait affiché
    /// « __MEESHY.ORIGINAL__ » comme nom de langue et dans la pastille du code.
    /// La sentinelle se ramène au code vide, qui EST déjà le cas « Original »
    /// du résolveur.
    nonisolated static func displayCode(for active: String?) -> String {
        guard let active, active != StoryViewerView.originalLanguageOverride else { return "" }
        return active
    }

    /// Une retraduction est en vol tant que le texte affiché n'a pas bougé
    /// depuis la demande. Pur, donc testable sans faire tourner la vue.
    nonisolated static func isRetranslating(baseline: String?, currentText: String?) -> Bool {
        guard let baseline else { return false }
        return baseline == currentText
    }

    /// Nom lisible d'une langue (repli sur le code brut si inconnu) — même
    /// résolution que `MessageLanguageDetailView.languageName`.
    static func languageName(for code: String) -> String {
        guard !code.isEmpty else {
            return String(localized: "story.language.detail.original", defaultValue: "Original", bundle: .main)
        }
        return LanguageDisplay.from(code: code)?.name ?? code.uppercased()
    }
}
