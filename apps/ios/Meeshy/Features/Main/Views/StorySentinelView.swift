import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La sentinelle — vue `2j` de la planche** (#4088).
///
/// > « Une rupture se raconte, elle ne se subit pas. Jamais un écran noir ni un
/// > fond par défaut à la place de la scène : la sentinelle dit ce qui manque,
/// > ce qui est intact, et le seul geste utile. »
///
/// ## Ce qu'elle remplace, et qui existait déjà
///
/// Le décodeur garde un kind inconnu en `ObjectKind.reserved(raw)` — « le SDK ne
/// perd jamais un kind qu'un futur serveur accepterait » — puis la conversion le
/// SAUTE (`case .reserved: continue`). Aujourd'hui, une story composée avec un
/// format plus récent arrive, se décode, et le lecteur peint **ce qui reste**,
/// sans un mot.
///
/// > La rupture ne manquait pas : elle était SILENCIEUSE. Une scène amputée
/// > rendue comme si elle était la composition de l'auteur est pire qu'un refus
/// > — le lecteur croit avoir vu la story.
///
/// ## Les trois choses que la maquette exige, dans cet ordre
///
/// 1. **ce qui manque** — « cette story utilise un format plus récent » ;
/// 2. **ce qui est intact** — « elle n'est pas perdue : elle s'affichera telle
///    que son auteur l'a composée après la mise à jour » ;
/// 3. **le seul geste utile** — mettre à jour, et passer à la suivante.
///
/// L'ordre porte le sens : dire d'abord la perte, puis la rassurer, puis
/// agir. Inverser laisserait le lecteur devant un bouton avant d'avoir compris
/// pourquoi.
///
/// ## Ce qu'elle ne fait PAS
///
/// Elle ne nomme pas les kinds inconnus. Ce sont des identifiants de protocole
/// (`"poll"`, `"gif3d"`…) : les afficher ferait porter au lecteur un vocabulaire
/// qui n'est pas le sien, pour une information dont il ne peut rien faire.
struct StorySentinelView: View {

    /// Ce que le lecteur voit en haut — l'auteur reste nommé, parce que la
    /// story n'est pas perdue et qu'elle reste la sienne. Le chrome du viewer
    /// (barres de progression, avatar, fermeture) est monté par l'hôte : cette
    /// vue ne peint QUE la zone de la scène.
    let onUpdate: () -> Void
    let onSkip: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            marque
                .padding(.bottom, 28)
            titre
                .padding(.bottom, 14)
            explication
                .padding(.bottom, 32)
            boutonMettreAJour
                .padding(.bottom, 18)
            boutonPasser
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // Le fond est celui de la scène ABSENTE : sombre et uni, jamais une
        // image par défaut. « Aucun cadre vide, aucun fond par défaut » —
        // peindre un dégradé de marque ici reviendrait à inventer une scène.
        .background(MeeshyColors.indigo950)
        .accessibilityElement(children: .contain)
    }

    /// Le losange en pointillés : un cadre qui DIT qu'il est vide, là où un
    /// cadre plein prétendrait montrer quelque chose.
    private var marque: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
            .foregroundStyle(MeeshyColors.indigo400.opacity(0.55))
            .frame(width: 132, height: 132)
            .overlay(
                Image(systemName: "diamond")
                    .font(MeeshyFont.relative(30, weight: .light))
                    .foregroundStyle(MeeshyColors.indigo400)
            )
            .accessibilityHidden(true)
    }

    private var titre: some View {
        Text(StorySentinelCopy.title)
            .font(MeeshyFont.relative(28, weight: .bold))
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var explication: some View {
        Text(StorySentinelCopy.body)
            .font(MeeshyFont.relative(MeeshyFont.bodySize))
            .foregroundStyle(.white.opacity(0.72))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var boutonMettreAJour: some View {
        Button(action: onUpdate) {
            Text(StorySentinelCopy.update)
                .font(MeeshyFont.relative(15, weight: .semibold))
                .tracking(1.4)
                .foregroundStyle(MeeshyColors.indigo950)
                .frame(maxWidth: .infinity)
                // 52 pt : au-delà des 44 pt minimum, parce que c'est le seul
                // geste qui répare (dimension 5).
                .frame(height: 52)
                .background(
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .fill(MeeshyColors.indigo400)
                )
        }
        .buttonStyle(.plain)
    }

    private var boutonPasser: some View {
        Button(action: onSkip) {
            Text(StorySentinelCopy.skip)
                .font(MeeshyFont.relative(13, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.66))
                .frame(maxWidth: .infinity)
                .frame(height: 44)
        }
        .buttonStyle(.plain)
    }
}

/// **Les quatre phrases de la sentinelle, hors de la vue.**
///
/// Séparées pour la même raison que partout ailleurs dans ce dossier : une
/// chaîne enfermée dans un corps de `View` ne s'interroge qu'au rendu, et une
/// garde de localisation ne peut pas la voir.
enum StorySentinelCopy {

    static var title: String {
        String(localized: "story.sentinel.title",
               defaultValue: "Cette story utilise un format plus récent",
               bundle: .main)
    }

    /// Deux phrases en une : ce qui manque, puis ce qui est INTACT. La seconde
    /// est celle qui distingue une sentinelle d'un message d'erreur — sans
    /// elle, le lecteur croit la story perdue.
    static var body: String {
        // Un SEUL littéral : `defaultValue:` attend une `String.LocalizationValue`
        // que le compilateur construit à partir d'une chaîne littérale — une
        // concaténation `+` produit une `String` runtime, qu'il refuse. La
        // phrase est longue ; la couper aurait coûté sa clé.
        String(localized: "story.sentinel.body",
               defaultValue: "Votre version de l'application ne sait pas encore la peindre. Elle n'est pas perdue : elle s'affichera telle que son auteur l'a composée après la mise à jour.",
               bundle: .main)
    }

    static var update: String {
        String(localized: "story.sentinel.update", defaultValue: "METTRE À JOUR", bundle: .main)
    }

    static var skip: String {
        String(localized: "story.sentinel.skip", defaultValue: "PASSER À LA SUIVANTE", bundle: .main)
    }
}
