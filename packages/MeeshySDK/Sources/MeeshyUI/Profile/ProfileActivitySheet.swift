import SwiftUI
import UIKit

/// La feuille de partage du système, pour envoyer un profil (planche `Autre-Actions`, « Envoyer son profil »).
struct ProfileActivitySheet: UIViewControllerRepresentable {
    let items: [URL]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
