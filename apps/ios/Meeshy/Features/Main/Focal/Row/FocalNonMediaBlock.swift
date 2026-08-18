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
/// résiduel), jamais quand il n'y a ni lieu ni fichier à rendre.
nonisolated enum FocalNonMediaGate {
    static func shouldRender(hasSharedPlace: Bool, nonMediaCount: Int, audioMode: FocalAudioMode) -> Bool {
        audioMode != .hostsCaption && (hasSharedPlace || nonMediaCount > 0)
    }
}

// MARK: - FocalNonMediaBlock (LOT 3.2, rendu réel — 2026-08-18)

/// Bloc « lieu / fichier » NU de la rangée plate — retrait
/// `FocalMetrics.Text.indent`, aucune bulle, aucune capsule.
///
/// **LOT 3.2 (matrice §5 « Focal Grandeur Nature »)** : remplace le repli
/// texte inerte du correctif « rangée vide » (2026-08-17) par le rendu RÉEL,
/// « posé nu dans la rangée. États de téléchargement (`DownloadBadgeView`)
/// et visionneuse inchangés » — par RÉUTILISATION, jamais par
/// réimplémentation :
/// - **Lieu** : `LocationMessageView(place:accentColor:onTapFullscreen:)`
///   (MeeshyUI, réutilisée telle quelle — même vue que le chemin bulle).
///   Le tap remonte `onTapLocation` vers l'hôte (plein écran).
/// - **Fichiers** : une `BubbleAttachmentView` par pièce jointe du panier
///   `.nonMedia` — elle dispatche par type (code/document/lieu hérité) et
///   porte déjà la carte fichier, le badge de téléchargement et la
///   visionneuse. Un attachment `.location` du cache local passe par le
///   MÊME `onTapLocation`, converti en `SharedPlace` (parité avec le
///   convertisseur interne de `BubbleAttachmentView`).
///
/// **Compatibilité de transition** : le site d'appel historique de
/// `FocalRow` passe `hasSharedPlace: content.location != nil` sans le
/// `SharedPlace` lui-même — ce label est conservé (défaut `false`) et,
/// tant que `location` n'est pas câblé, le lieu se rend en libellé
/// descriptif (même loi que VoiceOver,
/// `MessageAccessibilityLabelComposer.nonMediaAccessibilityParts` — jamais
/// une seconde résolution). Dès que l'hôte passe `location:`, la carte
/// réelle prend le relais.
///
/// **Accessibilité** : la lecture de la rangée reste portée par
/// `FocalRow` (`MessageAccessibilityLabelComposer.compose`, inchangé) ;
/// la carte lieu porte en plus le label de la même loi pour rester
/// auto-descriptive hors de cet hôte.
///
/// Contraintes §WS-4 : aucun `@State` ici (les sous-vues réutilisées ont le
/// leur), `Equatable` sur ids + présence lieu + primitives de rendu — les
/// closures ne participent jamais à l'égalité.
struct FocalNonMediaBlock: View, Equatable {
    var hasSharedPlace: Bool = false
    let items: [MessageAttachment]
    let isDark: Bool
    var location: SharedPlace? = nil
    var accentHex: String = MeeshyColors.brandPrimaryHex
    var isMe: Bool = false
    var onTapLocation: ((SharedPlace) -> Void)? = nil
    var onShareFile: ((URL) -> Void)? = nil

    /// Présence d'un lieu, quel que soit le canal (nouveau `location` ou
    /// label de transition `hasSharedPlace` du site d'appel historique).
    private var showsPlace: Bool { hasSharedPlace || location != nil }

    static func == (lhs: FocalNonMediaBlock, rhs: FocalNonMediaBlock) -> Bool {
        lhs.showsPlace == rhs.showsPlace
            && lhs.items.map(\.id) == rhs.items.map(\.id)
            && lhs.isDark == rhs.isDark
            && lhs.accentHex == rhs.accentHex
            && lhs.isMe == rhs.isMe
    }

    /// Libellé « lieu » de la loi partagée — sert de label d'accessibilité
    /// à la carte réelle ET de repli de transition pour le site d'appel
    /// historique (qui n'a pas encore de `SharedPlace` à donner).
    private var locationLabel: String {
        MessageAccessibilityLabelComposer.nonMediaAccessibilityParts(hasSharedPlace: true, nonMedia: []).first ?? ""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let place = location {
                LocationMessageView(
                    place: place,
                    accentColor: accentHex,
                    onTapFullscreen: { onTapLocation?(place) }
                )
                .accessibilityLabel(locationLabel)
            } else if hasSharedPlace {
                Text(locationLabel)
                    .font(MeeshyFont.relative(FocalMetrics.Text.size))
                    .foregroundColor(ThemeManager.shared.textMuted)
            }

            ForEach(items) { attachment in
                BubbleAttachmentView(
                    attachment: attachment,
                    isMe: isMe,
                    isDark: isDark,
                    accentHex: accentHex,
                    onShareFile: onShareFile,
                    onTapLocation: { tapped in
                        guard let lat = tapped.latitude, let lon = tapped.longitude else { return }
                        onTapLocation?(SharedPlace(
                            latitude: lat,
                            longitude: lon,
                            name: tapped.originalName.isEmpty ? nil : tapped.originalName
                        ))
                    }
                )
            }
        }
        .padding(.leading, FocalMetrics.Text.indent)
    }
}
