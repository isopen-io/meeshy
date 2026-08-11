import SwiftUI
import MeeshyUI
import MeeshySDK

/// Barre horizontale des langues déjà prêtes pour la story courante, ouverte
/// par le bouton « Abc » du rail. Chaque pastille bascule instantanément la
/// langue d'exploration (Prisme Linguistique — « Exploration ») ; la pastille
/// « + » en fin de rangée ouvre la liste complète (toutes les langues, avec
/// demande de traduction).
///
/// Taille et style STRICTEMENT ALIGNÉS SUR LA BARRE DE RÉACTION de la story
/// (directive user 2026-07-26 : « la même taille que la barre de réaction !!! ») :
/// mêmes chips glyphe 22pt, même « + » (cercle 32pt), même pilule flottante
/// partagée (`quickReactionStripChrome`), et — comme la barre de réaction — la
/// pilule ÉPOUSE son contenu (présentée en `.fixedSize()`), jamais une largeur
/// fixe vide. Deux modes :
/// - liste courte (≤ `inlineCap`) : rangée simple qui hug son contenu, exactement
///   comme la barre de réaction (cas quasi-toujours vrai — peu de langues prêtes) ;
/// - liste longue : la rangée défile derrière un masque en fondu, le « + » épinglé
///   hors du défilement reste visible (directive Part A du 2026-07-26).
///
/// Le seul écart sémantique avec la barre de réaction : la langue lue est mise en
/// avant (pleine opacité + souligné indigo), là où la réaction n'a pas d'état actif.
///
/// App-side : orchestration UX produit (câble les langues prêtes + décide « le +
/// ouvre la liste complète »). Le SDK fournit `LanguagePickerSheet` (liste complète)
/// et `quickReactionStripChrome` (le chrome partagé de la pilule).
struct StoryLanguageQuickBar: View {
    let languages: [TranslationLanguage]
    /// Langue effectivement affichée (override d'exploration ou tête de chaine
    /// préférée) — la pastille correspondante est surlignée.
    let activeLanguageCode: String?
    let onSelect: (String) -> Void
    let onOpenFullPicker: () -> Void

    /// Index de la pastille survolée par le scrub (« + » = languages.count).
    var highlightedIndex: Int? = nil
    /// CoordinateSpace nommé dans lequel publier les cadres des pastilles.
    var scrubFrameSpace: String? = nil
    /// Reçoit les cadres publiés (hit-testing du scrub côté sidebar).
    var onTileFrames: (([Int: CGRect]) -> Void)? = nil

    /// Au-delà de ce nombre, la rangée défile (avec « + » épinglé) au lieu de
    /// s'étaler ; en-deçà, elle épouse son contenu comme la barre de réaction.
    private let inlineCap = 5
    /// Largeur du défilement quand la liste est longue : ~5 drapeaux 22pt visibles
    /// (aligné sur la largeur de la barre de réaction).
    private let scrollWidth: CGFloat = 180

    var body: some View {
        Group {
            if languages.count > inlineCap {
                scrollingRow
            } else {
                inlineRow
            }
        }
        .onPreferenceChange(ScrubTileFramesKey.self) { frames in
            onTileFrames?(frames)
        }
        // Pilule IDENTIQUE à la barre de réaction (Liquid Glass iOS 26 / voile de
        // matière avant) — un seul point de vérité, partagé depuis le SDK.
        .quickReactionStripChrome(style: .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(String(localized: "story.viewer.language.bar",
                                         defaultValue: "Langues disponibles", bundle: .main)))
    }

    /// Rangée simple — épouse son contenu (comme la barre de réaction non-défilante).
    private var inlineRow: some View {
        HStack(spacing: 6) {
            flagStrip
                .padding(.vertical, 6)
                .padding(.leading, 10)
            plusChip
                .padding(.trailing, 10)
        }
    }

    /// Rangée défilante — les ~5 premières langues visibles, le reste au scroll
    /// derrière un masque en fondu ; le « + » NE défile PAS (épinglé à droite,
    /// hors du ScrollView).
    private var scrollingRow: some View {
        HStack(spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                flagStrip
                    .padding(.vertical, 6)
                    .padding(.leading, 10)
                    .padding(.trailing, 4)
            }
            .frame(width: scrollWidth)
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .black, location: 0),
                        .init(color: .black, location: 0.92),
                        .init(color: .black.opacity(0.0), location: 1.0)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            plusChip
                .padding(.trailing, 10)
        }
    }

    private var flagStrip: some View {
        HStack(spacing: 6) {
            ForEach(languages) { language in
                chip(language)
            }
        }
    }

    /// Chip DRAPEAU SEUL, à la TAILLE des emojis de la barre de réaction (22pt).
    /// L'actif (langue lue) est à pleine opacité et souligné d'indigo ; les autres
    /// sont légèrement estompés — AUCUNE variation de taille, pour que la bande
    /// garde exactement la hauteur de la barre de réaction. Le code lisible reste
    /// sur le badge accolé au bouton « Abc ».
    private func chip(_ language: TranslationLanguage) -> some View {
        let isActive = StoryLanguageQuickBar.isActive(language.id, active: activeLanguageCode)
        return Button {
            HapticFeedback.light()
            onSelect(language.id)
        } label: {
            Text(language.flag)
                .font(.system(size: 22))
                .opacity(isActive ? 1 : 0.55)
                .overlay(alignment: .bottom) {
                    Capsule()
                        .fill(MeeshyColors.indigo400)
                        .frame(width: 14, height: 2)
                        .opacity(isActive ? 1 : 0)
                        .offset(y: 3)
                }
                .scaleEffect(highlightedIndex == index(of: language) ? 1.35 : 1.0)
                .animation(.spring(response: 0.25, dampingFraction: 0.5), value: highlightedIndex)
                .background(tileFrameReader(index: index(of: language)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(language.name))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    /// « + » IDENTIQUE au bouton d'expansion de la barre de réaction : cercle 32pt
    /// (blanc 15 %) + glyphe 14pt gras.
    private var plusChip: some View {
        Button {
            HapticFeedback.light()
            onOpenFullPicker()
        } label: {
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white.opacity(0.8))
            }
            .scaleEffect(highlightedIndex == languages.count ? 1.35 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: highlightedIndex)
            .background(tileFrameReader(index: languages.count))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "story.viewer.language.more",
                                         defaultValue: "Autres langues", bundle: .main)))
    }

    /// Une pastille est active si sa langue est celle actuellement affichée.
    /// Comparaison insensible à la casse et sur la base BCP-47 (`pt-BR` ↔ `pt`)
    /// pour que la langue lue soit toujours surlignée, variantes régionales
    /// comprises. Pur et sans effet de bord — testé isolément.
    nonisolated static func isActive(_ id: String, active: String?) -> Bool {
        guard let active else { return false }
        let lhs = id.lowercased()
        let rhs = active.lowercased()
        if lhs == rhs { return true }
        let lhsBase = lhs.split(separator: "-").first.map(String.init)
        let rhsBase = rhs.split(separator: "-").first.map(String.init)
        return lhsBase != nil && lhsBase == rhsBase
    }

    private func index(of language: TranslationLanguage) -> Int {
        languages.firstIndex(where: { $0.id == language.id }) ?? -1
    }

    @ViewBuilder
    private func tileFrameReader(index: Int) -> some View {
        if let scrubFrameSpace {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: ScrubTileFramesKey.self,
                    value: [index: proxy.frame(in: .named(scrubFrameSpace))]
                )
            }
        }
    }
}
