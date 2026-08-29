import SwiftUI
import MeeshySDK
import MeeshyUI

/// Rangées système NUES de la rangée plate — contrat §WS-3 : « rangées
/// centrées plates, sans capsule ; supprimé = rangée fantôme italique sans
/// fond ».
///
/// **RE-PREUVE (§0 avant écriture)** : le contrat nomme
/// `BubbleSystemNoticeView`/`BubbleDeletedView` comme réutilisation (§1.3 —
/// lus, jamais modifiés). Les DEUX dessinent INCONDITIONNELLEMENT leur
/// propre `Capsule()` de fond (`BubbleSystemViews.swift:29-35` /
/// `:106-113`) — aucun paramètre pour la retirer. « Sans capsule » (le
/// rendu Focal explicitement demandé) est donc INCOMPATIBLE avec une
/// réutilisation verbatim de leur CHROME. Résolu comme pour
/// `FocalQuotedReplyView`/`FocalAttachmentBlock` : le TEXTE et les CLÉS DE
/// LOCALISATION sont réutilisés à l'identique (`bubble.system.deleted`,
/// `bubble.system.burned` — un seul domicile i18n, jamais dupliqué) ; le
/// CHROME (capsule → texte plat) est natif Focal, seule façon de tenir
/// « sans capsule » sans éditer un fichier non possédé par WS-3.
///
/// `BubbleCallNoticeView` est, à l'inverse, RÉUTILISÉE TELLE QUELLE
/// (`FocalCallNoticeRow`) : ce n'est déjà pas une bulle de chat (pas de
/// `cornerRadius: 18`, pas de `BubbleBackground`) mais une carte compacte
/// avec son propre contour (`simpleContour`), et réimplémenter son
/// call-back/long-press/détail depuis zéro serait un risque sans
/// compilateur local pour un gain visuel marginal (contour existant déjà
/// proche du style « carte » du Fil, cf. `FocalMetrics.FocusCard`).

/// Message supprimé — rangée fantôme italique sans fond. Réutilise la
/// MÊME clé i18n que `BubbleDeletedView` (`bubble.system.deleted`).
struct FocalDeletedRow: View, Equatable {
    let isDark: Bool

    var body: some View {
        Text(String(localized: "bubble.system.deleted", defaultValue: "Message supprimé", bundle: .main))
            .font(MeeshyFont.relative(FocalMetrics.Text.size, weight: .regular))
            .italic()
            .foregroundColor(ThemeManager.shared.textMuted)
            .padding(.leading, FocalMetrics.Text.indent)
            .accessibilityElement(children: .combine)
    }
}

/// Message éphémère vu puis effacé — même traitement fantôme que
/// `FocalDeletedRow`, clé i18n de `BubbleBurnedView` (`bubble.system.burned`).
struct FocalBurnedRow: View, Equatable {
    let isDark: Bool

    var body: some View {
        Text(String(localized: "bubble.system.burned", defaultValue: "Vu et supprimé", bundle: .main))
            .font(MeeshyFont.relative(FocalMetrics.Text.size, weight: .regular))
            .italic()
            .foregroundColor(ThemeManager.shared.textMuted)
            .padding(.leading, FocalMetrics.Text.indent)
            .accessibilityElement(children: .combine)
    }
}

/// Notice système générique (ex. futur événement de conversation) — plate,
/// sans capsule, CENTRÉE (matrice §5 « Notices d'appel et système = rangées
/// centrées plates » — l'alignement au retrait 29 était un écart, corrigé
/// 2026-08-18). `text` porte déjà le libellé localisé par l'appelant (même
/// contrat d'entrée que `BubbleSystemNoticeView.text`).
struct FocalSystemNoticeRow: View, Equatable {
    let text: String
    let isDark: Bool
    /// Heure du fil (« 08:26 ») — gravée EN PREMIER, centrée, même sémantique
    /// que les stickers de date et `BubbleJoinNoticeView` : un message système
    /// est un jalon du fil, pas une parole.
    var timeString: String? = nil

    var body: some View {
        VStack(spacing: 3) {
            if let timeString, !timeString.isEmpty {
                Text(timeString)
                    .font(MeeshyFont.relative(9.5, weight: .semibold))
                    .foregroundColor(ThemeManager.shared.textMuted.opacity(0.7))
                    .accessibilityIdentifier("focal-system-notice-time")
            }
            Text(text)
                .font(MeeshyFont.relative(12.5, weight: .medium))
                .foregroundColor(ThemeManager.shared.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text)
    }
}

/// Notice d'appel — réutilise `BubbleCallNoticeView` TELLE QUELLE (voir doc
/// de tête). Pas de retrait `29` supplémentaire : la carte porte déjà son
/// propre padding horizontal (`16`, cf. `BubbleCallNoticeView.swift:76`) et
/// s'aligne comme une bulle (gauche/droite) — un retrait Focal en plus la
/// désaxerait de son alignement de card existant.
struct FocalCallNoticeRow: View, Equatable {
    let notice: BubbleContent.CallNotice
    let accentHex: String
    let isDark: Bool
    var onCallBack: ((CallSummaryMetadata) -> Void)? = nil
    var onLongPress: (() -> Void)? = nil

    static func == (lhs: FocalCallNoticeRow, rhs: FocalCallNoticeRow) -> Bool {
        lhs.notice == rhs.notice && lhs.accentHex == rhs.accentHex && lhs.isDark == rhs.isDark
    }

    var body: some View {
        BubbleCallNoticeView(
            notice: notice,
            accentHex: accentHex,
            isDark: isDark,
            onCallBack: onCallBack,
            onLongPress: onLongPress
        )
    }
}

/// Dispatch pur par `BubbleContent.Kind` — la rangée n'a qu'à passer
/// `content` entier, jamais à ré-inspecter `.kind`/`.callNotice` elle-même.
enum FocalSystemRows {
    @ViewBuilder
    static func view(
        for content: BubbleContent,
        accentHex: String,
        isDark: Bool,
        onCallBack: ((CallSummaryMetadata) -> Void)? = nil,
        onLongPress: (() -> Void)? = nil,
        /// Appui long sur un avis d'arrivée — ouvre la fiche de l'arrivant, par
        /// son `Participant.id`. La fiche de PARTICIPATION vaut pour les quatre
        /// portes : un arrivant qui a un compte y a son identité comme les
        /// autres, simplement sans conditions d'entrée.
        onOpenParticipantProfile: ((String) -> Void)? = nil
    ) -> some View {
        switch content.kind {
        case .deleted:
            FocalDeletedRow(isDark: isDark)
        case .burned:
            FocalBurnedRow(isDark: isDark)
        case .system:
            if let notice = content.callNotice {
                FocalCallNoticeRow(notice: notice, accentHex: accentHex, isDark: isDark, onCallBack: onCallBack, onLongPress: onLongPress)
            } else if let joinNotice = content.joinNotice {
                // Sans cette branche, l'arrivée tombait dans
                // `FocalSystemNoticeRow` et s'affichait dans la langue FIGÉE du
                // gateway (français), sans marquer que l'arrivant n'a pas de
                // compte. La vue Bulles porte la même branche — les deux modes
                // de lecture disent la même chose.
                BubbleJoinNoticeView(notice: joinNotice, isDark: isDark, onOpenProfile: onOpenParticipantProfile, timeString: content.meta.timeString)
            } else if let text = content.text?.raw, !text.isEmpty {
                FocalSystemNoticeRow(text: text, isDark: isDark, timeString: content.meta.timeString)
            } else {
                EmptyView()
            }
        case .standard, .ephemeralExpired:
            EmptyView()
        }
    }
}
