//
//  MeeshyContextMenuExamples.swift
//  Meeshy
//
//  Comprehensive examples showing different ways to use the Meeshy context menu
//

import SwiftUI

// MARK: - Example 1: Conversation Row

struct ConversationRowExample: View {
    let conversation: MockConversation

    var body: some View {
        HStack(spacing: 12) {
            // Avatar
            Circle()
                .fill(Color.blue.gradient)
                .frame(width: 50, height: 50)
                .overlay {
                    Text(conversation.initials)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                }

            // Content
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(conversation.name)
                        .font(.system(size: 16, weight: .semibold))
                    Spacer()
                    Text(conversation.time)
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }

                Text(conversation.lastMessage)
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(.systemBackground))
        .meeshyContextMenu(
            sections: [
                MeeshyContextMenuSection(title: "Quick Actions", items: [
                    MeeshyContextMenuItem(
                        icon: conversation.isPinned ? "pin.slash.fill" : "pin.fill",
                        title: conversation.isPinned ? "Unpin" : "Pin",
                        subtitle: conversation.isPinned ? nil : "Keep at top"
                    ) {
                        print("Toggle pin for \(conversation.name)")
                    },
                    MeeshyContextMenuItem(
                        icon: conversation.isRead ? "envelope.badge.fill" : "envelope.open.fill",
                        title: conversation.isRead ? "Mark as Unread" : "Mark as Read"
                    ) {
                        print("Toggle read status")
                    }
                ]),
                MeeshyContextMenuSection(title: "Manage", items: [
                    MeeshyContextMenuItem(
                        icon: "bell.slash.fill",
                        title: "Mute",
                        subtitle: "For 1 hour"
                    ) {
                        print("Mute conversation")
                    },
                    MeeshyContextMenuItem(
                        icon: "archivebox.fill",
                        title: "Archive"
                    ) {
                        print("Archive conversation")
                    },
                    MeeshyContextMenuItem(
                        icon: "eye.slash.fill",
                        title: "Hide"
                    ) {
                        print("Hide conversation")
                    }
                ]),
                MeeshyContextMenuSection(items: [
                    MeeshyContextMenuItem(
                        icon: "trash.fill",
                        title: "Delete Conversation",
                        isDestructive: true
                    ) {
                        print("Delete conversation")
                    }
                ])
            ]
        )
    }
}

// MARK: - Example 2: Message Bubble

struct MessageBubbleExample: View {
    let message: MockMessage

    var body: some View {
        HStack {
            if message.isSentByMe {
                Spacer()
            }

            VStack(alignment: message.isSentByMe ? .trailing : .leading, spacing: 4) {
                Text(message.text)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        message.isSentByMe
                            ? Color.blue
                            : Color(.systemGray5)
                    )
                    .foregroundColor(
                        message.isSentByMe
                            ? .white
                            : .primary
                    )
                    .cornerRadius(18)
                    .meeshyContextMenu(items: [
                        MeeshyContextMenuItem(
                            icon: "arrow.turn.up.left",
                            title: "Reply"
                        ) {
                            print("Reply to message")
                        },
                        MeeshyContextMenuItem(
                            icon: "doc.on.doc",
                            title: "Copy"
                        ) {
                            UIPasteboard.general.string = message.text
                        },
                        MeeshyContextMenuItem(
                            icon: "arrow.uturn.forward",
                            title: "Forward"
                        ) {
                            print("Forward message")
                        },
                        MeeshyContextMenuItem(
                            icon: "star",
                            title: message.isStarred ? "Unstar" : "Star"
                        ) {
                            print("Toggle star")
                        },
                        MeeshyContextMenuItem(
                            icon: "trash",
                            title: "Delete Message",
                            isDestructive: true
                        ) {
                            print("Delete message")
                        }
                    ])

                Text(message.time)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            if !message.isSentByMe {
                Spacer()
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Example 3: Custom Configuration

struct CustomConfigExample: View {
    var body: some View {
        let customConfig = MeeshyContextMenuConfiguration(
            cornerRadius: 24,
            itemHeight: 64,
            horizontalPadding: 20,
            shadowRadius: 32,
            shadowOpacity: 0.25,
            maxWidth: 320,
            blurStyle: .systemUltraThinMaterial,
            springResponse: 0.6,
            springDampingFraction: 0.7
        )

        VStack {
            Text("Custom Styled Menu")
                .font(.headline)
                .padding()
                .background(Color.purple)
                .foregroundColor(.white)
                .cornerRadius(12)
                .meeshyContextMenu(
                    items: [
                        MeeshyContextMenuItem(
                            icon: "wand.and.stars",
                            title: "Magic Action",
                            subtitle: "Does something amazing"
                        ) {
                            print("Magic!")
                        },
                        MeeshyContextMenuItem(
                            icon: "sparkles",
                            title: "Another Action",
                            subtitle: "With custom styling"
                        ) {
                            print("Sparkles!")
                        }
                    ],
                    configuration: customConfig
                )
        }
    }
}

// MARK: - Example 4: Programmatic Presentation

struct ProgrammaticExample: View {
    @StateObject private var menuPresenter = MeeshyContextMenuPresenter()

    var body: some View {
        ZStack {
            VStack(spacing: 20) {
                Button("Show Menu at Center") {
                    showMenuAtCenter()
                }
                .buttonStyle(.borderedProminent)

                Button("Show Menu with Sections") {
                    showMenuWithSections()
                }
                .buttonStyle(.bordered)
            }

            menuPresenter.menuOverlay()
        }
    }

    private func showMenuAtCenter() {
        let screenBounds = UIScreen.main.bounds
        let sourceRect = CGRect(
            x: screenBounds.midX - 50,
            y: screenBounds.midY - 25,
            width: 100,
            height: 50
        )

        menuPresenter.present(
            items: [
                MeeshyContextMenuItem(icon: "plus.circle.fill", title: "New Item") {
                    print("New item")
                },
                MeeshyContextMenuItem(icon: "folder.fill", title: "Open Folder") {
                    print("Open folder")
                },
                MeeshyContextMenuItem(icon: "gearshape.fill", title: "Settings") {
                    print("Settings")
                }
            ],
            from: sourceRect
        )
    }

    private func showMenuWithSections() {
        let screenBounds = UIScreen.main.bounds
        let sourceRect = CGRect(
            x: screenBounds.midX - 50,
            y: screenBounds.midY - 25,
            width: 100,
            height: 50
        )

        menuPresenter.present(
            sections: [
                MeeshyContextMenuSection(title: "Create", items: [
                    MeeshyContextMenuItem(icon: "doc.badge.plus", title: "New Document") {
                        print("New document")
                    },
                    MeeshyContextMenuItem(icon: "folder.badge.plus", title: "New Folder") {
                        print("New folder")
                    }
                ]),
                MeeshyContextMenuSection(title: "Actions", items: [
                    MeeshyContextMenuItem(icon: "square.and.arrow.up", title: "Share") {
                        print("Share")
                    },
                    MeeshyContextMenuItem(icon: "printer.fill", title: "Print") {
                        print("Print")
                    }
                ])
            ],
            from: sourceRect
        )
    }
}

// MARK: - Example 5: Result Builder Syntax

struct ResultBuilderExample: View {
    @State private var isLiked = false

    var body: some View {
        Text("Result Builder Menu")
            .font(.headline)
            .padding()
            .background(Color.orange)
            .foregroundColor(.white)
            .cornerRadius(12)
            .meeshyContextMenu {
                MeeshyContextMenuItem(
                    icon: isLiked ? "heart.fill" : "heart",
                    title: isLiked ? "Unlike" : "Like"
                ) {
                    isLiked.toggle()
                }

                if isLiked {
                    MeeshyContextMenuItem(
                        icon: "heart.text.square",
                        title: "View Likes"
                    ) {
                        print("View likes")
                    }
                }

                MeeshyContextMenuItem(
                    icon: "bubble.right",
                    title: "Comment"
                ) {
                    print("Comment")
                }

                MeeshyContextMenuItem(
                    icon: "paperplane",
                    title: "Send"
                ) {
                    print("Send")
                }
            }
    }
}

// MARK: - Full Demo View

struct MeeshyContextMenuDemoView: View {
    @State private var conversations: [MockConversation] = [
        MockConversation(
            name: "Sarah Johnson",
            initials: "SJ",
            lastMessage: "Hey! Are we still on for coffee tomorrow?",
            time: "2m ago",
            isPinned: true,
            isRead: false
        ),
        MockConversation(
            name: "Design Team",
            initials: "DT",
            lastMessage: "Updated the mockups, check them out!",
            time: "15m ago",
            isPinned: false,
            isRead: true
        ),
        MockConversation(
            name: "Mom",
            initials: "M",
            lastMessage: "Don't forget your sister's birthday!",
            time: "1h ago",
            isPinned: true,
            isRead: false
        )
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(conversations) { conversation in
                        ConversationRowExample(conversation: conversation)

                        if conversation.id != conversations.last?.id {
                            Divider()
                                .padding(.leading, 78)
                        }
                    }
                }
                .background(Color(.systemBackground))

                Divider()
                    .padding(.vertical, 20)

                // Other examples
                VStack(spacing: 20) {
                    Text("Message Bubbles")
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal)

                    MessageBubbleExample(
                        message: MockMessage(
                            text: "Long press on messages!",
                            isSentByMe: false,
                            time: "10:30 AM",
                            isStarred: false
                        )
                    )

                    MessageBubbleExample(
                        message: MockMessage(
                            text: "Try it out!",
                            isSentByMe: true,
                            time: "10:31 AM",
                            isStarred: false
                        )
                    )

                    Divider()
                        .padding(.vertical, 20)

                    Text("Other Examples")
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal)

                    CustomConfigExample()
                    ResultBuilderExample()
                    ProgrammaticExample()
                }
                .padding(.bottom, 40)
            }
            .navigationTitle("Meeshy Context Menu")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

// MARK: - Mock Data Models

struct MockConversation: Identifiable {
    let id = UUID()
    let name: String
    let initials: String
    let lastMessage: String
    let time: String
    var isPinned: Bool
    var isRead: Bool
}

struct MockMessage: Identifiable {
    let id = UUID()
    let text: String
    let isSentByMe: Bool
    let time: String
    var isStarred: Bool
}

// MARK: - Preview

#Preview {
    MeeshyContextMenuDemoView()
}

#Preview("Conversation Row") {
    ConversationRowExample(
        conversation: MockConversation(
            name: "Sarah Johnson",
            initials: "SJ",
            lastMessage: "Hey! Long press on me to see the menu",
            time: "2m ago",
            isPinned: false,
            isRead: false
        )
    )
}

#Preview("Message Bubble") {
    VStack(spacing: 16) {
        MessageBubbleExample(
            message: MockMessage(
                text: "Long press on me!",
                isSentByMe: false,
                time: "10:30 AM",
                isStarred: false
            )
        )

        MessageBubbleExample(
            message: MockMessage(
                text: "Try the context menu",
                isSentByMe: true,
                time: "10:31 AM",
                isStarred: true
            )
        )
    }
    .padding()
}
