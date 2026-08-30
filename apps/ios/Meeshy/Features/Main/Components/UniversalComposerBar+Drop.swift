import SwiftUI
import UniformTypeIdentifiers
import UIKit
import MeeshyUI
import MeeshySDK
import os

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Cible de dépôt & collage de fichiers
// ============================================================================
//
// Le dépôt (glisser-déposer depuis Files / le Finder) et le collage d'URLs
// `file://` aboutissent tous deux à `onIngest` : la barre résout le contenu
// en fichiers copiés dans notre conteneur, l'hôte orchestre (compression,
// tuile, envoi). Fichier séparé : le fichier principal fait déjà 1468 lignes.

/// Modificateur appliqué au conteneur EXTERNE du `body` de la barre, donc
/// couvrant toute la bande : champ de saisie, barre d'outils, bandeaux
/// (édition / réponse) et tiroir d'attachements.
///
/// `.onDrop` + `NSItemProvider` plutôt que `.dropDestination(for:)` : ce
/// dernier exige un `Transferable` concret et ne sait pas dire « n'importe
/// quel fichier ». `.item` est déclaré en DERNIER pour que l'inconnu
/// atterrisse quand même comme fichier.
struct ComposerDropTargetModifier: ViewModifier {

    /// Couleur d'accent (hex) de la barre — teinte le contour d'affordance.
    let accentColor: String

    /// Rappel `onIngest` de la barre, transmis tel quel.
    let onIngest: (([ComposerIngest]) -> Void)?

    @State private var isDropTargeted = false

    /// Types acceptés, `.item` en dernier (voir doc du modificateur).
    private static let acceptedTypes: [UTType] = [
        .image, .movie, .audio, .pdf, .text, .url, .fileURL, .item
    ]

    func body(content: Content) -> some View {
        content
            .onDrop(of: Self.acceptedTypes, isTargeted: $isDropTargeted) { providers in
                handleDrop(providers)
            }
            .overlay {
                if isDropTargeted {
                    dropAffordance
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.15), value: isDropTargeted)
    }

    // MARK: - Affordance

    /// Contour arrondi teinté d'accent + indice « Déposer ici ». Purement
    /// additif : aucun effet visuel existant de la barre n'est retiré ni
    /// remplacé, et l'overlay ne capte aucun événement.
    private var dropAffordance: some View {
        let accent = Color(hex: accentColor)
        return RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(accent, style: StrokeStyle(lineWidth: 2, dash: [7, 5]))
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(accent.opacity(0.08))
            )
            .overlay(
                Label {
                    Text(String(localized: "composer.drop.hint", defaultValue: "Déposer ici", bundle: .main))
                        .font(.footnote.weight(.semibold))
                } icon: {
                    Image(systemName: "arrow.down.doc.fill")
                        .font(.footnote.weight(.semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(accent))
            )
            .allowsHitTesting(false)
    }

    // MARK: - Dépôt

    /// Résout les N providers puis appelle `onIngest` UNE SEULE fois, dans
    /// l'ordre du dépôt. Les échecs produisent un toast nommant les fichiers
    /// concernés — jamais de tuile fantôme.
    ///
    /// Résolution SÉQUENTIELLE, et non par `withTaskGroup` : `NSItemProvider`
    /// n'est pas `Sendable`, donc le confier à une tâche enfant (paramètre
    /// `sending`) est refusé net par Swift 6 — et lui fabriquer une conformité
    /// `@unchecked Sendable` serait affirmer une sûreté que le compilateur ne
    /// peut pas vérifier. Le séquentiel ne bloque PAS le main : le travail
    /// disque vit dans la closure de complétion de `NSItemProvider`, qui
    /// rappelle hors du main ; ici `await` ne fait que suspendre.
    ///
    /// Renvoie `true` si au moins un provider est réclamable.
    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        let claimable = providers.contains { provider in
            Self.acceptedTypes.contains { provider.hasItemConformingToTypeIdentifier($0.identifier) }
        }
        guard claimable else { return false }

        let indexed = Array(providers.enumerated())
        Task {
            var resolved: [ComposerIngest?] = []
            resolved.reserveCapacity(indexed.count)
            for (_, provider) in indexed {
                resolved.append(await ComposerDropResolver.resolve(provider))
            }

            let ingests = resolved.compactMap { $0 }
            let failedNames = indexed
                .filter { resolved[$0.offset] == nil }
                .map { entry in
                    entry.element.suggestedName
                        ?? String(localized: "composer.drop.unnamedItem", defaultValue: "élément sans nom", bundle: .main)
                }
            if !failedNames.isEmpty {
                ComposerIngestFeedback.showFailure(names: failedNames)
            }
            if !ingests.isEmpty {
                onIngest?(ingests)
            }
        }
        return true
    }
}

// MARK: - Collage d'une URL file://

extension UniversalComposerBar {

    /// Résout des URLs `file://` collées (déjà extraites et retirées du champ
    /// par `FileURLPasteDetector`) et les émet par `onIngest`, comme un dépôt.
    ///
    /// Ordre, par URL :
    /// 1. l'URL est lisible telle quelle (notre conteneur, App Group, ou
    ///    extension sandbox encore active) → copie dans notre conteneur ;
    /// 2. sinon, `UIPasteboard.general.itemProviders` est consulté et le
    ///    provider correspondant est résolu par `ComposerDropResolver` —
    ///    la SEULE voie qui porte l'autorisation sandbox, au prix de la
    ///    bannière système « Coller ? », jamais atteinte quand la branche 1
    ///    a suffi pour toutes les URLs ;
    /// 3. sinon AUCUNE pièce jointe : toast d'erreur nommant le fichier.
    ///
    /// On n'appelle JAMAIS `startAccessingSecurityScopedResource` sur une URL
    /// fabriquée depuis une chaîne sans signet : elle renvoie `false` et
    /// continuer comme si elle avait réussi masquerait une lecture morte.
    func ingestPastedFileURLs(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        Task {
            var ingests: [ComposerIngest] = []
            var unresolved: [URL] = []

            // Branche 1 — lecture directe, sans toucher au presse-papier.
            for url in urls {
                if let ingest = await PastedFileCopier.copyIfReadable(url) {
                    ingests.append(ingest)
                } else {
                    unresolved.append(url)
                }
            }

            var failedNames: [String] = []
            if !unresolved.isEmpty {
                // Branche 2 — seule lecture du presse-papier (bannière système).
                let providers = UIPasteboard.general.itemProviders
                for url in unresolved {
                    let name = url.lastPathComponent
                    let provider = providers.first { $0.suggestedName == name }
                        ?? (unresolved.count == 1 && providers.count == 1 ? providers.first : nil)
                    if let provider,
                       let resolvedIngest = await ComposerDropResolver.resolve(provider),
                       case .file = resolvedIngest {
                        ingests.append(resolvedIngest)
                    } else {
                        // Branche 3 — pas de repli fabriqué : on refuse et on le dit.
                        failedNames.append(name)
                    }
                }
            }

            if !failedNames.isEmpty {
                ComposerIngestFeedback.showFailure(names: failedNames)
            }
            if !ingests.isEmpty {
                onIngest?(ingests)
            }
        }
    }
}

// MARK: - Toast d'échec partagé (dépôt + collage)

enum ComposerIngestFeedback {

    /// Toast d'erreur nommant les fichiers qui n'ont pas pu être ingérés.
    static func showFailure(names: [String]) {
        let list = names.joined(separator: ", ")
        FeedbackToastManager.shared.showError(
            String(localized: "composer.ingest.failed", defaultValue: "Impossible d'importer : \(list)", bundle: .main)
        )
    }
}

// MARK: - Copie d'une URL collée lisible

/// `enum` `nonisolated` à fonction `static async` : la copie disque vit hors
/// du main, et aucune instance n'existe — donc aucune `deinit` isolée
/// implicite (SE-0466) qui double-libérerait sur iOS < 26.
nonisolated enum PastedFileCopier {

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "composer-drop")

    /// Copie l'URL vers `temporaryDirectory/paste_<uuid>_<nom>` si elle est
    /// lisible telle quelle. Refuse un dossier et un fichier de 0 octet.
    /// Renvoie `nil` sans fabriquer de repli : l'appelant tentera le
    /// presse-papier, puis le toast.
    static func copyIfReadable(_ url: URL) async -> ComposerIngest? {
        let fm = FileManager.default
        guard fm.isReadableFile(atPath: url.path) else { return nil }
        do {
            let values = try url.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
            if values.isDirectory == true {
                logger.info("Collage refusé : le chemin \(url.lastPathComponent, privacy: .public) est un dossier")
                return nil
            }
            guard (values.fileSize ?? 0) > 0 else {
                logger.info("Collage refusé : fichier de 0 octet (\(url.lastPathComponent, privacy: .public))")
                return nil
            }
            let name = url.lastPathComponent
            let destination = fm.temporaryDirectory
                .appendingPathComponent("paste_\(UUID().uuidString)_\(name)")
            try fm.copyItem(at: url, to: destination)
            return .file(
                url: destination,
                name: name,
                mime: MimeTypeResolver.mimeType(forURL: destination)
            )
        } catch {
            logger.error("Copie du fichier collé impossible (\(url.lastPathComponent, privacy: .public)) : \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
