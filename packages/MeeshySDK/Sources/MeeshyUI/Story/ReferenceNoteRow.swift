import SwiftUI
import MeeshySDK

/// « Avec Alice, Bob » sous le contenu, et le marqueur personnel « Vous êtes
/// référencé·e ici » quand le LECTEUR lui-même porte une référence SILENT.
///
/// SILENT n'apparaît JAMAIS dans la rangée « Avec … », d'où qu'il vienne : un
/// post détaillé mis en cache puis réutilisé pour rendre une carte de feed
/// porte les silencieuses du lecteur — la garde est ICI, dans le composant de
/// rendu, pas dans la couche réseau qui n'a aucun moyen de savoir où sa charge
/// utile sera réaffichée. PINNED n'y figure pas non plus : la pastille posée
/// sur le canevas EST déjà son affichage, la doubler ferait redite.
///
/// Le marqueur personnel est la SEULE réponse que la personne référencée en
/// silence trouve dans le contenu à la notification qu'elle vient de
/// recevoir — sans lui, un SILENT reste invisible même pour son sujet.
///
/// Feuille : aucun `@ObservedObject` sur un singleton, que des valeurs — et
/// `Equatable` pour ne pas se redessiner à chaque frappe/scroll du parent.
public struct ReferenceNoteRow: View, Equatable {
    let references: [PostReference]
    let currentUserId: String?
    let accentColor: Color
    let onTapReference: (PostReference) -> Void

    public init(
        references: [PostReference],
        currentUserId: String?,
        accentColor: Color,
        onTapReference: @escaping (PostReference) -> Void
    ) {
        self.references = references
        self.currentUserId = currentUserId
        self.accentColor = accentColor
        self.onTapReference = onTapReference
    }

    /// `==` MANUEL : la closure n'est pas `Equatable`. Comparer l'état, jamais
    /// l'action.
    public static func == (lhs: ReferenceNoteRow, rhs: ReferenceNoteRow) -> Bool {
        lhs.references == rhs.references
            && lhs.currentUserId == rhs.currentUserId
            && lhs.accentColor == rhs.accentColor
    }

    /// Les deux gardes, extraites pour être vérifiables sans monter de vue —
    /// c'est ici, et nulle part ailleurs, que se joue la non-fuite des SILENT.
    ///
    /// **`public` depuis #5002** : le pied de la scène du composer doit poser la
    /// MÊME question (« qui paraît, qui ne paraît jamais ») avant même de
    /// décider s'il y a une ligne à peindre. La réponse ne pouvait pas être
    /// recopiée côté app — « ici, et nulle part ailleurs » est le contrat de
    /// cette fonction, et une copie l'aurait annulé au premier mode ajouté.
    public static func noted(in references: [PostReference]) -> [PostReference] {
        references.filter { $0.display == .note }
    }

    static func viewerIsSilentlyReferenced(
        in references: [PostReference],
        currentUserId: String?
    ) -> Bool {
        guard let currentUserId, !currentUserId.isEmpty else { return false }
        return references.contains { $0.display == .silent && $0.userId == currentUserId }
    }

    private var noted: [PostReference] { Self.noted(in: references) }

    private var viewerIsSilentlyReferenced: Bool {
        Self.viewerIsSilentlyReferenced(in: references, currentUserId: currentUserId)
    }

    public var body: some View {
        if !noted.isEmpty || viewerIsSilentlyReferenced {
            VStack(alignment: .leading, spacing: 4) {
                if !noted.isEmpty { notedRow }
                if viewerIsSilentlyReferenced { personalMarker }
            }
        }
    }

    private var notedRow: some View {
        HStack(spacing: 0) {
            Text(prefixLabel)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            ForEach(Array(noted.enumerated()), id: \.element.id) { index, reference in
                Button {
                    onTapReference(reference)
                } label: {
                    Text(" \(reference.label)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(accentColor)
                }
                .buttonStyle(.plain)
                if index < noted.count - 1 {
                    Text(",")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(prefixLabel) \(noted.map(\.label).joined(separator: ", "))")
    }

    private var personalMarker: some View {
        HStack(spacing: 4) {
            Image(systemName: "eye.fill")
                .font(.system(size: 11, weight: .semibold))
            Text(personalMarkerLabel)
                .font(.system(size: 12, weight: .medium))
        }
        .foregroundStyle(Color.secondary)
        .accessibilityElement(children: .combine)
    }

    private var prefixLabel: String {
        String(localized: "reference.note.prefix", defaultValue: "Avec", bundle: .module)
    }

    private var personalMarkerLabel: String {
        String(localized: "reference.note.viewerTagged", defaultValue: "Vous êtes référencé·e ici", bundle: .module)
    }
}
