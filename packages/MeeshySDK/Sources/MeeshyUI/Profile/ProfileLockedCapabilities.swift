import SwiftUI
import UIKit
import MeeshySDK

/// « Pas encore ouvert » (#18870, loi 4) : ce que le cercle commun n'ouvre pas, une rangée verrouillée (K37) par cercle
/// qui l'ouvrirait — « Talkie, Ensemble · dès Proche ». La rangée ne porte que des NOMS : jamais la donnée protégée,
/// jamais un champ voisin. Rien quand tout est ouvert.
public struct ProfileLockedCapabilities: View {
    private let level: RelationLevel
    private let tint: Color?

    public init(level: RelationLevel, tint: Color? = nil) {
        self.level = level
        self.tint = tint
    }

    public var body: some View {
        let groups = RelationCapability.lockedGroups(at: level)
        if !groups.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshySectionHeader(
                    title: String(localized: "profile.relation.section.locked", defaultValue: "Pas encore ouvert", bundle: .module),
                    form: .overline
                )
                ForEach(groups, id: \.opensAt) { group in
                    MeeshyLockedRow(
                        title: group.title(),
                        requirement: group.requirement,
                        systemImage: group.systemImage,
                        tint: tint
                    )
                }
            }
        }
    }
}

/// La feuille de partage du système, pour envoyer un profil (planche `Autre-Actions`, « Envoyer son profil »).
struct ProfileActivitySheet: UIViewControllerRepresentable {
    let items: [URL]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
