import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le sélecteur de HASHTAGS** (#4636, directive porteur 2026-08-31 : « mettre
/// une section Hashtag, ainsi que l'outil hashtag dans la liste des outils »).
///
/// ## Ce qu'il ne fait PAS
///
/// Il ne tient aucune liste. Ce qu'on choisit ici s'écrit dans le TEXTE de la
/// publication (`ComposerHashtags.inserting`), qui reste la seule source des
/// balises — exactement comme le serveur dérive les mentions INLINE en relisant
/// les `@handle`. Une liste parallèle donnerait deux vérités : ce qu'on lit dans
/// le texte, et ce qu'on envoie.
///
/// ## Les tendances sont une SUGGESTION, jamais une condition
///
/// Elles se chargent en arrière-plan et leur absence ne bloque rien : le champ
/// de saisie suffit à poser n'importe quelle balise. Une liste vide est un état
/// NOMINAL (hors-ligne, aucune tendance), pas un chargement éternel — d'où
/// l'absence de spinner sur un écran dont le contrôle principal est déjà utile.
struct ComposerHashtagSheet: View {

    /// Les balises DÉJÀ dans le texte — servies, jamais recalculées ici : deux
    /// dérivations du même texte divergeraient au premier écart de motif.
    let current: [String]
    let trending: [APIHashtag]
    let onToggle: (String) -> Void

    @State private var saisie: String = ""
    @FocusState private var champActif: Bool

    @Environment(\.dismiss) private var dismiss

    /// **Les balises d'avant l'ouverture, retenues pour pouvoir les RENDRE**
    /// (#6134). Cette feuille écrit dans le TEXTE à chaque tap ; « Annuler » ne
    /// peut donc pas se contenter de fermer, sinon il ment.
    ///
    /// Posé une seule fois : réécrire l'instantané à chaque affichage ferait
    /// oublier le point de départ dès le premier retour de plan.
    @State private var instantane: [String]?

    private var propre: String {
        saisie.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
    }

    /// Une balise déjà posée ne se réajoute pas : la loi 4 veut qu'un bouton
    /// sans effet n'existe pas, et « ajouter » un hashtag présent n'en a aucun.
    private var peutAjouter: Bool {
        !propre.isEmpty && !current.contains { $0.lowercased() == propre.lowercased() }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Le MÊME en-tête que la feuille Mention (#6134) — et son titre a
            // désormais sa propre clé : réutiliser le libellé de la section
            // interne faisait porter deux rôles à un seul mot, que le premier
            // ajustement de l'un aurait cassé chez l'autre.
            MeeshySheetHeader(
                title: ComposerHashtagCopy.sheetTitle,
                onCancel: { annuler() },
                onDone: { dismiss() }
            )

            champ

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !current.isEmpty { bloc(titre: ComposerAudienceCopy.hashtagsSection, tags: current, posees: true) }
                    if !trending.isEmpty {
                        bloc(titre: ComposerHashtagCopy.trending,
                             tags: trending.map(\.tag).filter { tag in
                                 !current.contains { $0.lowercased() == tag.lowercased() }
                             },
                             posees: false)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .background(MeeshyColors.indigo950.ignoresSafeArea())
        .preferredColorScheme(.dark)
        // La MÊME présentation que la feuille Mention, par le MÊME modifieur
        // (#6134 : « la feuille s'affiche en moitié d'écran comme la feuille
        // mentionner en ce moment »). Recopier `[.medium, …]` ici donnerait deux
        // déclarations du même fait, que le premier ajustement ferait diverger.
        .modifier(AudiencePickerPresentationStyle())
        .onAppear {
            instantane = instantane ?? current
            champActif = true
        }
    }

    /// **Refuser, c'est REVENIR** — et la bascule étant son propre inverse, il
    /// suffit de rejouer la différence symétrique. La règle est pure et vit
    /// chez `ComposerHashtags`, parce qu'un « Annuler » qui ne défait rien
    /// ferme quand même la feuille : seul un test de VALEUR l'attrape.
    private func annuler() {
        for tag in ComposerHashtags.togglesRestoring(current, to: instantane ?? current) {
            onToggle(tag)
        }
        dismiss()
    }

    private var champ: some View {
        HStack(spacing: 10) {
            Text("#")
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundStyle(MeeshyColors.hashtagColor(isDark: true))
            TextField(ComposerHashtagCopy.placeholder, text: $saisie)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($champActif)
                .foregroundStyle(.white)
                .onSubmit { ajouter() }
            Button(action: ajouter) {
                Text(ComposerHashtagCopy.add)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundStyle(peutAjouter ? MeeshyColors.brandPrimary : .white.opacity(0.25))
            }
            .buttonStyle(.plain)
            .disabled(!peutAjouter)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(Color.white.opacity(0.07)))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private func ajouter() {
        guard peutAjouter else { return }
        onToggle(propre)
        saisie = ""
        HapticFeedback.light()
    }

    @ViewBuilder
    private func bloc(titre: String, tags: [String], posees: Bool) -> some View {
        if !tags.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(titre)
                    .font(MeeshyFont.relative(9.5, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(.white.opacity(0.5))
                FlowingChips(items: tags) { tag in
                    Button {
                        onToggle(tag)
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 6) {
                            Text("#\(tag)")
                                .font(MeeshyFont.relative(12, weight: .medium))
                                .foregroundStyle(posees
                                                 ? MeeshyColors.hashtagColor(isDark: true)
                                                 : .white.opacity(0.85))
                            Image(systemName: posees ? "xmark" : "plus")
                                .font(MeeshyFont.relative(9, weight: .bold))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                        .padding(.horizontal, 11)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(Color.white.opacity(posees ? 0.10 : 0.05)))
                        .overlay(Capsule().strokeBorder(
                            posees ? MeeshyColors.brandPrimary.opacity(0.4) : Color.white.opacity(0.12),
                            lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("#\(tag)")
                    .accessibilityAddTraits(posees ? [.isSelected] : [])
                }
            }
            .padding(.top, 10)
        }
    }
}

/// Les mots du sélecteur. Hors du `body` — une chaîne composée dans une vue est
/// hors de portée d'un témoin, et c'est du vocabulaire produit.
extension ComposerHashtagSheet {

    /// **La feuille sait d'où viennent ses suggestions ; le meuble, non.**
    ///
    /// `MeeshyComposerHost` ne doit nommer aucun service — la garde
    /// `test_host_opensNoSecondPublicationPath` prend `PostService` pour le
    /// témoin d'un second chemin de publication, et une lecture « inoffensive »
    /// dans l'unité du meuble y ressemblerait à s'y méprendre. Le fournisseur
    /// vit donc chez le seul consommateur des tendances.
    ///
    /// L'échec est SILENCIEUX et rend une liste vide : c'est l'état nominal de
    /// la feuille (hors-ligne, aucune tendance), jamais un chargement éternel.
    static func loadTrending(limit: Int = 20) async -> [APIHashtag] {
        (try? await PostService.shared.getTrendingHashtags(limit: limit)) ?? []
    }
}

nonisolated enum ComposerHashtagCopy {

    static var placeholder: String {
        String(localized: "composer.hashtag.placeholder",
               defaultValue: "Ajouter un hashtag", bundle: .main)
    }

    static var add: String {
        String(localized: "composer.hashtag.add", defaultValue: "Ajouter", bundle: .main)
    }

    /// Le titre de la FEUILLE — distinct du libellé de la section interne, qui
    /// nomme un bloc de contenu et non l'écran (#6134).
    static var sheetTitle: String {
        String(localized: "composer.hashtag.sheetTitle", defaultValue: "Hashtags", bundle: .main)
    }

    static var trending: String {
        String(localized: "composer.hashtag.trending", defaultValue: "TENDANCES", bundle: .main)
    }
}
