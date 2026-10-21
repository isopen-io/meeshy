import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La rangée de langues de la légende

// Extrait de `ConversationMediaGalleryView.swift` : la rangée ne lit que la
// liste des langues, l'active et l'écriture du choix — la racine garde l'état
// (`captionLanguage`) et le calcul (`+Captions.swift`). Corps déplacé à l'identique.

/// **La rangée de langues de la légende** (#4934) — au-DESSUS du bandeau,
/// jamais dedans.
///
/// Deux raisons, et la seconde est celle qui décide : le bandeau se DÉPLIE
/// au tap (`captionExpanded`), donc y loger des boutons ferait cohabiter
/// deux gestes sur la même surface — taper pour lire plus, taper pour
/// changer de langue. La rangée vit donc au-dessus, comme la rangée méta
/// d'un réel, et emprunte ses métriques (`.overlay`, 32 pt) pour la même
/// raison qu'elle : au-dessus d'un média, une bande de 44 pt volerait le tap
/// qui pilote la lecture.
///
/// **Absente dès qu'il n'y a rien à basculer** — pas grisée, pas vide : le
/// cas nominal d'un post à plusieurs médias n'offre aucune traduction de
/// légende (#4904), et une rangée fantôme y occuperait la place pour rien.
struct GalleryCaptionLanguageRow: View {
    let languages: [String]
    let active: String?
    let onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            ForEach(languages, id: \.self) { code in
                LanguageFlagChip(code: code,
                                 isActive: active == code,
                                 metrics: .overlay) {
                    // L'écriture est la SEULE ; le texte affiché et le
                    // libellé VoiceOver la relisent tous deux par
                    // `servedCaption`. Deux états parallèles auraient permis
                    // à l'un de dire une langue que l'autre ne sert pas.
                    onSelect(code)
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.xxs)
        .accessibilityLabel(String(localized: "gallery.caption.languages",
                                   defaultValue: "Langue de la légende",
                                   bundle: .main))
    }
}
