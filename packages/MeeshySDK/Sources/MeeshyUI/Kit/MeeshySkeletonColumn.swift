import SwiftUI

/// **Une liste au premier chargement (K38)** : la même silhouette répétée — des billets pour une page de liens,
/// des rangées pour une liste — à la place d'une roue. Chaque silhouette est l'atome `MeeshySkeleton`, muet ;
/// l'hôte donne la phrase que VoiceOver entend (`loadingLabel`), une seule pour toute la colonne.
public struct MeeshySkeletonColumn: View {
    private let shape: MeeshySkeletonShape
    private let count: Int
    private let loadingLabel: String

    public init(shape: MeeshySkeletonShape,
                count: Int = MeeshySkeletonRecipe.defaultColumnCount,
                loadingLabel: String) {
        self.shape = shape
        self.count = count
        self.loadingLabel = loadingLabel
    }

    public var body: some View {
        VStack(spacing: CGFloat(MeeshySkeletonRecipe.columnSpacing)) {
            ForEach(0..<MeeshySkeletonRecipe.columnCount(count), id: \.self) { _ in
                MeeshySkeleton(shape: shape)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(loadingLabel)
    }
}
