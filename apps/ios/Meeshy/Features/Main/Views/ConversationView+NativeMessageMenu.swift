// MARK: - Extracted from ConversationView.swift
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// Extrait de `ConversationView.swift` (2 771 lignes, hors budget 1000-1200 : un
// fichier hors budget est interdit d'ajout). L'export d'un message en image
// ajoute deux entrées au menu natif : on extrait d'abord, on ajoute ensuite.

extension ConversationView {

    // MARK: - Menu message NATIF (iOS 26 Liquid Glass)

    /// Contenu du `.contextMenu` natif d'une bulle (iOS 26+, cf. MessageListView
    /// / MessageListViewController). Palette d'emojis rapides (`ControlGroup`,
    /// choix produit 2026-07-14) + actions primaires via `MessageActionResolver`
    /// — EXACTEMENT les mêmes callbacks que `overlayMenuContent` (SSOT).
    /// Reply/Forward restent dans « Plus… » (feuille détail) et via le swipe
    /// latéral, inchangés.
    ///
    /// **Plus d'exclusion des messages système depuis le 2026-08-24** : la
    /// parité qui la justifiait — « l'overlay n'en donne aucun » — a disparu
    /// avec le no-op de `onLongPress`. Ce chemin doit rendre le MÊME menu que
    /// l'overlay, résumé d'appel compris (dont l'entrée `.callDetail`).
    private func buildNativeMessageMenu(for msg: Message) -> AnyView {
        let hasText = !msg.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let ctx = MessageMenuContext(
            isMine: msg.isMe,
            canEdit: msg.isMe || isCurrentUserAdminOrMod,
            canDelete: msg.isMe || isCurrentUserAdminOrMod,
            hasText: hasText,
            hasMedia: !msg.attachments.isEmpty,
            hasTimebasedMedia: msg.attachments.contains {
                AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
            },
            isPinned: msg.pinnedAt != nil,
            isStarred: viewModel.isStarred(messageId: msg.id),
            isEdited: msg.isEdited,
            hasEditRevisions: true,
            hasCallSummary: msg.callSummary != nil,
            saveableAttachmentCount: msg.attachments.filter { $0.type != .location }.count,
            canComposeMedia: ComposableAttachment.offers(message: msg),
            showReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts,
            // `isForwardable` profitait ici de son défaut `true`, inoffensif
            // tant que `primaryActions` ne le lisait pas. Le lot 5 le rend
            // LOAD-BEARING : sans lui, « Composer » s'offrirait sur une vue
            // unique, et la clause O13 tomberait par un simple défaut.
            isForwardable: msg.isForwardable, isViewOnce: msg.holdsViewOnce, isBlurred: msg.holdsBlur,
            hasDefaultExportFormat: MessageCardExportMenu.hasDefaultFormat, hasPaintableMedia: !MessageCardSubject.paintableMedia(of: msg).isEmpty
        )
        let actions = MessageActionResolver.primaryActions(ctx)
        // 4 emojis les plus utilisés (fallback sur les défauts) — rangée rapide
        // du menu natif. PLAFOND à 4 : au-delà, `.compactMenu` passe à la ligne
        // (la rangée doit rester sur UNE seule ligne — feedback device 2026-07-14).
        let recentEmojis = EmojiUsageTracker.topEmojis(count: 4, defaults: Self.nativeQuickReactionEmojis)
        return AnyView(
            Group {
                // Réactions rapides = rangée horizontale d'emojis (4 plus
                // utilisés) via `ControlGroup` + `.controlGroupStyle(.compactMenu)`
                // — rendu système en rangée medium (pattern Messages/Photos, cf.
                // RecentMediaStrip). SANS ce style, le ControlGroup empile les
                // emojis (3 + 3 vertical, feedback device 2026-07-14). iOS 16.4+ ;
                // le menu natif n'existe que sur iOS 26 → toujours disponible.
                if #available(iOS 16.4, *) {
                    ControlGroup {
                        ForEach(recentEmojis, id: \.self) { emoji in
                            Button {
                                viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                            } label: {
                                Text(emoji)
                            }
                        }
                    }
                    .controlGroupStyle(.compactMenu)
                } else {
                    ForEach(recentEmojis, id: \.self) { emoji in
                        Button {
                            viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                        } label: {
                            Text(emoji)
                        }
                    }
                }

                // « Plus d'emojis » → picker complet (sous la rangée rapide).
                Button {
                    overlayState.fullReactionPickerMessage = msg
                } label: {
                    Label(
                        String(localized: "action.more_emojis", defaultValue: "Plus d'emojis", bundle: .main),
                        systemImage: "plus"
                    )
                }

                Divider()

                ForEach(actions, id: \.self) { action in
                    nativeMenuButton(action, msg: msg)
                }
            }
        )
    }

    /// Emojis de la palette rapide du menu natif (sous-ensemble des défauts de
    /// l'overlay — un menu système ne doit pas porter les 20).
    private static let nativeQuickReactionEmojis = ["😂", "❤️", "👍", "😮", "😢", "🔥"]

    /// Un item du menu natif pour une `PrimaryAction` — mêmes actions que
    /// l'overlay (`overlayMenuContent`). Épingler/favori/suppression sont
    /// routés vers « Plus… » (`MoreItem`), jamais affichés ici.
    @ViewBuilder
    private func nativeMenuButton(_ action: PrimaryAction, msg: Message) -> some View {
        switch action {
        case .select:
            Button {
                beginSelectionMode(seedingWith: msg.id)
            } label: {
                Label(
                    String(localized: "action.select", defaultValue: "Sélectionner", bundle: .main),
                    systemImage: "checkmark.circle"
                )
            }
        case .edit:
            Button {
                beginEdit(msg)
            } label: {
                Label(String(localized: "action.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
            }
        case .translate:
            Button {
                overlayState.moreSheetInitialItem = .language
                overlayState.detailSheetMessage = msg
            } label: {
                Label(String(localized: "action.translate", defaultValue: "Traduire", bundle: .main), systemImage: "globe")
            }
        case .copy:
            Button {
                UIPasteboard.general.string = msg.content
                HapticFeedback.success()
            } label: {
                Label(String(localized: "action.copy", defaultValue: "Copier", bundle: .main), systemImage: "doc.on.doc")
            }
        case .saveMedia:
            Button {
                guard let attachment = msg.attachments.first(where: { $0.type != .location }) else { return }
                HapticFeedback.light()
                mediaSaveCoordinator.save(MediaSaveRequest(
                    kind: attachment.kind,
                    origin: .transmitted,
                    remoteURLString: attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl,
                    suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                    attachmentId: attachment.id.isEmpty ? nil : attachment.id
                ))
            } label: {
                Label(String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main), systemImage: "arrow.down.to.line")
            }
        case .compose:
            Button {
                HapticFeedback.light()
                composerState.composeMediaTarget = ComposerSeedTarget(message: msg)
            } label: {
                Label(String(localized: "message.compose.title", defaultValue: "Composer", bundle: .main), systemImage: "wand.and.stars")
            }
        case .more:
            Button {
                overlayState.moreSheetInitialItem = nil
                overlayState.detailSheetMessage = msg
            } label: {
                Label(String(localized: "action.more", defaultValue: "Plus…", bundle: .main), systemImage: "ellipsis")
            }
        case .exportImage, .exportQuick:
            Button {
                beginMessageExport(msg, quick: action == .exportQuick)
            } label: {
                Label(
                    action == .exportQuick ? MessageCardExportMenu.quickLabel : MessageCardExportMenu.imageLabel,
                    systemImage: action == .exportQuick ? MessageCardExportMenu.quickSymbol : MessageCardExportMenu.imageSymbol
                )
            }
        case .callDetail:
            Button {
                overlayState.callDetailMessage = msg
            } label: {
                Label(
                    String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main),
                    systemImage: "info.circle"
                )
            }
        }
    }
}
