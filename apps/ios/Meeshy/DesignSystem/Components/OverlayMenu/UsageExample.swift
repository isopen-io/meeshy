//
//  UsageExample.swift
//  Meeshy
//
//  Example implementation of MeeshyOverlayMenu
//  iOS 16+
//

import SwiftUI

// MARK: - Example View

struct OverlayMenuExampleView: View {
    @State private var showOverlay = false
    @State private var overlayMode: MeeshyOverlayMode = .actions

    // Preview data
    private let exampleMessage = Message(
        id: "example-message-id",
        conversationId: "conv-1",
        senderId: "sender-1",
        content: "Salut! Comment ça va?",
        createdAt: Date()
    )

    private var exampleParticipants: [ConversationMember] {
        [
            ConversationMember(
                id: "member-1",
                userId: "user-1",
                role: .member,
                user: .init(id: "user-1", username: "marie", displayName: "Marie", avatar: nil, isOnline: true, lastActiveAt: nil),
                readCursor: ReadCursor(
                    messageId: exampleMessage.id,
                    messageCreatedAt: exampleMessage.createdAt,
                    receivedAt: Date().addingTimeInterval(-3600),
                    readAt: Date().addingTimeInterval(-1800),
                    updatedAt: Date()
                )
            ),
            ConversationMember(
                id: "member-2",
                userId: "user-2",
                role: .member,
                user: .init(id: "user-2", username: "pierre", displayName: "Pierre", avatar: nil, isOnline: false, lastActiveAt: Date()),
                readCursor: ReadCursor(
                    messageId: exampleMessage.id,
                    messageCreatedAt: exampleMessage.createdAt,
                    receivedAt: Date().addingTimeInterval(-3600),
                    readAt: nil,
                    updatedAt: Date()
                )
            ),
            ConversationMember(
                id: "member-3",
                userId: "user-3",
                role: .member,
                user: .init(id: "user-3", username: "sophie", displayName: "Sophie", avatar: nil, isOnline: false, lastActiveAt: nil),
                readCursor: nil
            )
        ]
    }

    var body: some View {
        ZStack {
            Color.gray.opacity(0.2).ignoresSafeArea()

            VStack(spacing: 20) {
                // Demo message bubble
                Text("Salut! Comment ça va?")
                    .padding(16)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(16)
                    .onLongPressGesture(minimumDuration: 0.5) {
                        showOverlay = true
                    }

                Text("Long press pour ouvrir le menu")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .fullScreenCover(isPresented: $showOverlay) {
            MeeshyOverlayMenu(
                mode: $overlayMode,
                quickViewConfig: .init(
                    pages: [
                        // Emoji page
                        .emoji(.init(
                            recentEmojis: ["❤️", "👍", "😂", "🔥", "😮", "🙏", "👏", "🎉"],
                            popularEmojis: ["😊", "😍", "🥰", "😘", "🤔", "😢", "😡", "🤯"],
                            onSelect: { emoji in
                                print("Selected emoji: \(emoji)")
                                showOverlay = false
                            },
                            onBrowseAll: {
                                print("Browse all emojis")
                            }
                        )),
                        // Message info page - using cursor-based status calculation
                        .messageInfo(.init(
                            message: exampleMessage,
                            participants: exampleParticipants,
                            senderName: "Jean Dupont",
                            senderAvatar: nil,
                            location: "Paris, France",
                            onUserTap: { userId in print("Tapped user: \(userId)") }
                        )),
                        // Reactions page
                        .reactions(.init(
                            reactions: [
                                ("❤️", [
                                    ReactionUserInfo(id: "1", name: "Marie", avatar: nil),
                                    ReactionUserInfo(id: "2", name: "Julie", avatar: nil),
                                    ReactionUserInfo(id: "3", name: "Sophie", avatar: nil)
                                ]),
                                ("👍", [
                                    ReactionUserInfo(id: "4", name: "Pierre", avatar: nil),
                                    ReactionUserInfo(id: "5", name: "Marc", avatar: nil)
                                ]),
                                ("😂", [
                                    ReactionUserInfo(id: "6", name: "Emma", avatar: nil)
                                ])
                            ],
                            onUserTap: { userId in
                                print("Tapped user: \(userId)")
                            }
                        ))
                    ]
                ),
                preview: {
                    Text("Salut! Comment ça va?")
                        .padding(16)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(16)
                },
                actions: [
                    .init(
                        icon: "arrow.turn.up.left",
                        title: "Répondre",
                        subtitle: "Répondre à ce message"
                    ) {
                        print("Répondre")
                        showOverlay = false
                    },
                    .init(
                        icon: "pencil",
                        title: "Modifier"
                    ) {
                        overlayMode = .edit(.init(
                            title: "Modifier le message",
                            initialText: "Salut! Comment ça va?",
                            placeholder: "Entrez votre message",
                            onSave: { newText in
                                print("Save: \(newText)")
                                showOverlay = false
                            },
                            onCancel: {
                                overlayMode = .actions
                            }
                        ))
                    },
                    .init(
                        icon: "arrow.turn.up.right",
                        title: "Transférer"
                    ) {
                        print("Transférer")
                        showOverlay = false
                    },
                    .init(
                        icon: "doc.on.doc",
                        title: "Copier"
                    ) {
                        print("Copier")
                        showOverlay = false
                    },
                    .init(
                        icon: "trash",
                        title: "Supprimer",
                        style: .destructive
                    ) {
                        overlayMode = .alert(.init(
                            icon: "exclamationmark.triangle",
                            title: "Supprimer ce message ?",
                            message: "Cette action est irréversible.",
                            confirmButton: .init(
                                title: "Supprimer",
                                style: .destructive
                            ) {
                                print("Message supprimé")
                                showOverlay = false
                            },
                            cancelButton: .init(
                                title: "Annuler",
                                style: .cancel
                            ) {
                                overlayMode = .actions
                            }
                        ))
                    }
                ],
                onDismiss: {
                    showOverlay = false
                }
            )
            .background(ClearBackgroundForOverlay())
        }
    }
}

// MARK: - Clear Background Helper

/// Helper to make fullScreenCover background transparent
struct ClearBackgroundForOverlay: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        DispatchQueue.main.async {
            view.superview?.superview?.backgroundColor = .clear
        }
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

// MARK: - Preview

#Preview {
    OverlayMenuExampleView()
}
