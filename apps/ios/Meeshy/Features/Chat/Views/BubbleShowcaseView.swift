//
//  BubbleShowcaseView.swift
//  Meeshy
//
//  Showcase using REAL types (Message, MessageAttachment, Reaction, etc.)
//  and the REAL ModernMessageBubble view to display all message combinations
//
//  Demonstrates:
//  - All MessageContentType: text, image, file, audio, video, location, system
//  - All MessageSource: user, system, ads, app, agent, authority
//  - Message grouping algorithm (consecutive messages from same sender)
//  - Attachments with alt, caption, title, duration
//  - Audio transcription
//  - Reply quotes
//  - Forwarded, view-once, blurred messages
//  - Reactions
//  - Edited messages
//

import SwiftUI

// MARK: - Bubble Showcase View

struct BubbleShowcaseView: View {
    @State private var selectedSection: Int = 0

    private let sections = [
        "Tous",
        "Types",
        "Sources",
        "Groupes",
        "Speciaux"
    ]

    // Current user ID for showcase
    private let currentUserId = "showcase-current-user"
    private let otherUserId = "showcase-other-user"

    var body: some View {
        VStack(spacing: 0) {
            // Section picker
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(0..<sections.count, id: \.self) { index in
                        sectionButton(index: index)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 12)
            }
            .background(Color(.systemBackground))

            Divider()

            // Messages list
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(Array(filteredItems.enumerated()), id: \.offset) { index, item in
                        showcaseItemView(item)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 16)
            }
            .background(Color(.systemGroupedBackground))
        }
        .navigationTitle("Apercu des messages")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func sectionButton(index: Int) -> some View {
        Button {
            withAnimation { selectedSection = index }
        } label: {
            Text(sections[index])
                .font(.system(size: 14, weight: selectedSection == index ? .semibold : .regular))
                .foregroundColor(selectedSection == index ? .white : .primary)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(selectedSection == index ? Color.blue : Color(.systemGray5))
                )
        }
    }

    // MARK: - Filtered Items

    private var filteredItems: [ShowcaseItem] {
        switch selectedSection {
        case 1: return messageTypeItems
        case 2: return messageSourceItems
        case 3: return messageGroupingItems
        case 4: return specialMessageItems
        default: return allItems
        }
    }

    private var allItems: [ShowcaseItem] {
        var items: [ShowcaseItem] = []
        items.append(.header("Types de contenu"))
        items.append(contentsOf: messageTypeItems.filter { if case .message = $0 { return true }; return false })
        items.append(.header("Sources de messages"))
        items.append(contentsOf: messageSourceItems.filter { if case .message = $0 { return true }; return false })
        items.append(.header("Groupement"))
        items.append(contentsOf: messageGroupingItems.filter { if case .message = $0 { return true }; return false })
        items.append(.header("Messages speciaux"))
        items.append(contentsOf: specialMessageItems.filter { if case .message = $0 { return true }; return false })
        items.append(.header("Fonctionnalités avancées"))
        items.append(contentsOf: advancedFeaturesItems.filter { if case .message = $0 { return true }; return false })
        return items
    }

    // MARK: - Message Type Items

    private var messageTypeItems: [ShowcaseItem] {
        [
            .header("MessageContentType.text"),
            .message(makeMessage(
                id: "text-1",
                content: "Salut! Comment ca va aujourd'hui? J'espere que tu passes une bonne journee.",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie"
            ), isOwn: false, label: "text - recu"),

            .message(makeMessage(
                id: "text-2",
                content: "Super bien merci! Et toi?",
                type: .text,
                source: .user,
                isOwn: true,
                deliveryStatus: .allRead  // Blue double ✓✓
            ), isOwn: true, label: "text - envoye (lu ✓✓)"),

            .header("MessageContentType.image"),
            .message(makeMessage(
                id: "img-1",
                content: "",
                type: .image,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                attachments: [makeImageAttachment(
                    id: "att-img-1",
                    alt: "Coucher de soleil sur l'ocean",
                    caption: "Vue magnifique depuis ma fenetre!"
                )]
            ), isOwn: false, label: "image - avec alt et caption"),

            .message(makeMessage(
                id: "img-2",
                content: "",
                type: .image,
                source: .user,
                isOwn: true,
                attachments: [
                    makeImageAttachment(id: "att-img-2a"),
                    makeImageAttachment(id: "att-img-2b"),
                    makeImageAttachment(id: "att-img-2c")
                ],
                deliveryStatus: .delivered  // Gray double ✓✓
            ), isOwn: true, label: "image - carousel (livré ✓✓)"),

            .header("MessageContentType.video"),
            .message(makeMessage(
                id: "vid-1",
                content: "",
                type: .video,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                attachments: [makeVideoAttachment(
                    id: "att-vid-1",
                    duration: 134000,
                    caption: "Regarde cette video!"
                )]
            ), isOwn: false, label: "video - avec duree (2:14)"),

            .header("MessageContentType.audio"),
            .message(makeMessage(
                id: "aud-1",
                content: "",
                type: .audio,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                attachments: [makeAudioAttachment(id: "att-aud-1", duration: 42000)]
            ), isOwn: false, label: "audio - simple (0:42)"),

            .message(makeMessage(
                id: "aud-2",
                content: "",
                type: .audio,
                source: .user,
                isOwn: true,
                attachments: [makeAudioAttachment(id: "att-aud-2", duration: 75000)],
                transcription: AudioTranscription(
                    text: "Salut! Je voulais te dire que j'ai trouve l'endroit parfait pour notre reunion. C'est un petit cafe sympa.",
                    language: "fr",
                    confidence: 0.94,
                    model: "whisper-large-v3",
                    durationSeconds: 75,
                    processingTimeMs: 2500,
                    wordTimestamps: nil,
                    createdAt: Date()
                ),
                deliveryStatus: .sent  // Gray single ✓
            ), isOwn: true, label: "audio - transcription (envoyé ✓)"),

            .header("MessageContentType.file"),
            .message(makeMessage(
                id: "file-1",
                content: "",
                type: .file,
                source: .user,
                isOwn: true,
                attachments: [makeFileAttachment(
                    id: "att-file-1",
                    fileName: "Rapport_Annuel_2024.pdf",
                    mimeType: "application/pdf",
                    fileSize: 2456000,
                    caption: "Voici le rapport demande"
                )],
                deliveryStatus: .partiallyRead  // Blue single ✓
            ), isOwn: true, label: "file - PDF (partiellement lu ✓)"),

            .message(makeMessage(
                id: "file-2",
                content: "",
                type: .file,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                attachments: [makeFileAttachment(
                    id: "att-file-2",
                    fileName: "Budget_2025.xlsx",
                    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    fileSize: 856000
                )]
            ), isOwn: false, label: "file - Excel"),

            .header("MessageContentType.location"),
            .message(makeMessage(
                id: "loc-1",
                content: "Douala, Cameroun",
                type: .location,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                attachments: [makeLocationAttachment(
                    id: "att-loc-1",
                    name: "Douala, Cameroun",
                    latitude: 4.0511,
                    longitude: 9.7679
                )]
            ), isOwn: false, label: "location - avec carte"),

            .message(makeMessage(
                id: "loc-2",
                content: "Tour Eiffel, Paris",
                type: .location,
                source: .user,
                isOwn: true,
                attachments: [makeLocationAttachment(
                    id: "att-loc-2",
                    name: "Tour Eiffel, Paris, France",
                    latitude: 48.8584,
                    longitude: 2.2945
                )]
            ), isOwn: true, label: "location - envoye"),

            .header("MessageContentType.system"),
            .dateSeparator(Date().addingTimeInterval(-86400 * 2)), // 2 days ago

            .message(makeMessage(
                id: "sys-1",
                content: "Marie a rejoint la conversation",
                type: .system,
                source: .system,
                isOwn: false,
                createdAt: Date().addingTimeInterval(-86400 * 2 + 3600)
            ), isOwn: false, label: "system - joined"),

            .message(makeMessage(
                id: "sys-2",
                content: "Jean a quitte la conversation",
                type: .system,
                source: .system,
                isOwn: false,
                createdAt: Date().addingTimeInterval(-86400 * 2 + 7200)
            ), isOwn: false, label: "system - left"),

            .dateSeparator(Date().addingTimeInterval(-86400)), // yesterday

            .message(makeMessage(
                id: "sys-3",
                content: "Appel manque de Marie",
                type: .system,
                source: .system,
                isOwn: false,
                createdAt: Date().addingTimeInterval(-86400 + 3600)
            ), isOwn: false, label: "system - missed call"),

            .message(makeMessage(
                id: "sys-4",
                content: "Pierre a renomme la conversation \"Projet Alpha\"",
                type: .system,
                source: .system,
                isOwn: false,
                createdAt: Date().addingTimeInterval(-86400 + 7200)
            ), isOwn: false, label: "system - renamed"),

            .dateSeparator(Date()), // today

            .message(makeMessage(
                id: "sys-5",
                content: "La conversation a ete creee",
                type: .system,
                source: .system,
                isOwn: false,
                createdAt: Date()
            ), isOwn: false, label: "system - created")
        ]
    }

    // MARK: - Message Source Items

    private var messageSourceItems: [ShowcaseItem] {
        [
            .header("MessageSource.user"),
            .message(makeMessage(
                id: "src-user-1",
                content: "Message d'un utilisateur normal",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie"
            ), isOwn: false, label: "source: user"),

            .header("MessageSource.system"),
            .message(makeMessage(
                id: "src-sys-1",
                content: "La conversation a ete creee",
                type: .system,
                source: .system,
                isOwn: false
            ), isOwn: false, label: "source: system"),

            .header("MessageSource.ads"),
            .message(makeMessage(
                id: "src-ads-1",
                content: "Decouvrez notre nouvelle offre exclusive! -50% sur tous les abonnements premium.",
                type: .text,
                source: .ads,
                isOwn: false,
                senderName: "Meeshy Premium"
            ), isOwn: false, label: "source: ads"),

            .header("MessageSource.app"),
            .message(makeMessage(
                id: "src-app-1",
                content: "Bienvenue sur Meeshy! Votre compte a ete configure avec succes.",
                type: .text,
                source: .app,
                isOwn: false,
                senderName: "Meeshy"
            ), isOwn: false, label: "source: app"),

            .header("MessageSource.agent"),
            .message(makeMessage(
                id: "src-agent-1",
                content: "Je suis l'assistant Meeshy. Comment puis-je vous aider aujourd'hui?",
                type: .text,
                source: .agent,
                isOwn: false,
                senderName: "Assistant Meeshy"
            ), isOwn: false, label: "source: agent"),

            .header("MessageSource.authority"),
            .message(makeMessage(
                id: "src-auth-1",
                content: "Message officiel: Mise a jour des conditions d'utilisation.",
                type: .text,
                source: .authority,
                isOwn: false,
                senderName: "Meeshy Official"
            ), isOwn: false, label: "source: authority")
        ]
    }

    // MARK: - Message Grouping Items

    private var messageGroupingItems: [ShowcaseItem] {
        let baseTime = Date()
        return [
            .info("Messages consecutifs du meme expediteur (< 2min) sont groupes"),

            .header("Groupe de 3 messages (meme expediteur)"),
            .message(makeMessage(
                id: "grp-1",
                content: "Premier message du groupe",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                createdAt: baseTime
            ), isOwn: false, isFirst: true, isLast: false, label: "isFirstInGroup=true"),

            .message(makeMessage(
                id: "grp-2",
                content: "Deuxieme message (au milieu)",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                createdAt: baseTime.addingTimeInterval(30)
            ), isOwn: false, isFirst: false, isLast: false, label: "milieu du groupe"),

            .message(makeMessage(
                id: "grp-3",
                content: "Troisieme et dernier message du groupe",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                createdAt: baseTime.addingTimeInterval(60)
            ), isOwn: false, isFirst: false, isLast: true, label: "isLastInGroup=true"),

            .header("Mes messages groupes"),
            .message(makeMessage(
                id: "grp-own-1",
                content: "Ma reponse rapide",
                type: .text,
                source: .user,
                isOwn: true,
                createdAt: baseTime.addingTimeInterval(90)
            ), isOwn: true, isFirst: true, isLast: false, label: "premier"),

            .message(makeMessage(
                id: "grp-own-2",
                content: "Un autre message",
                type: .text,
                source: .user,
                isOwn: true,
                createdAt: baseTime.addingTimeInterval(100)
            ), isOwn: true, isFirst: false, isLast: true, label: "dernier")
        ]
    }

    // MARK: - Special Message Items

    private var specialMessageItems: [ShowcaseItem] {
        [
            .header("Message avec reactions"),
            .message(makeMessage(
                id: "spe-react-1",
                content: "Ce message a des reactions!",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                reactions: [
                    Reaction(id: "r1", emoji: "❤️", createdAt: Date()),
                    Reaction(id: "r2", emoji: "❤️", createdAt: Date()),
                    Reaction(id: "r3", emoji: "🔥", createdAt: Date()),
                    Reaction(id: "r4", emoji: "👍", createdAt: Date())
                ]
            ), isOwn: false, label: "avec reactions"),

            .header("Message modifie"),
            .message(makeMessage(
                id: "spe-edit-1",
                content: "Ce message a ete modifie apres envoi",
                type: .text,
                source: .user,
                isOwn: true,
                isEdited: true
            ), isOwn: true, label: "isEdited=true"),

            .header("Message transfere"),
            .message(makeMessage(
                id: "spe-fwd-1",
                content: "Ce message a ete transfere depuis une autre conversation",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                forwardedFromId: "original-msg-123"
            ), isOwn: false, label: "forwarded"),

            // Note: Encryption is conversation-level, not shown per-message

            .header("Message supprime"),
            .message(makeMessage(
                id: "spe-del-1",
                content: "Ce message a ete supprime",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                isDeleted: true
            ), isOwn: false, label: "isDeleted=true"),

            .message(makeMessage(
                id: "spe-del-2",
                content: "Mon message que j'ai supprime",
                type: .text,
                source: .user,
                isOwn: true,
                isDeleted: true
            ), isOwn: true, label: "supprime - propre message"),

            .header("Message ephemere (view-once)"),
            .message(makeMessage(
                id: "spe-vo-1",
                content: "Ce message est ephemere",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                isViewOnce: true
            ), isOwn: false, label: "view-once - texte"),

            .message(makeMessage(
                id: "spe-vo-2",
                content: "",
                type: .image,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                attachments: [makeImageAttachment(id: "att-vo-2")],
                isViewOnce: true
            ), isOwn: false, label: "view-once - photo"),

            .message(makeMessage(
                id: "spe-vo-3",
                content: "Message deja vu",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                isViewOnce: true,
                viewOnceCount: 1
            ), isOwn: false, label: "view-once - deja consulte"),

            .header("Message floute (blur)"),
            .message(makeMessage(
                id: "spe-blur-1",
                content: "Ce texte est floute, appuyez pour reveler",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                isBlurred: true
            ), isOwn: false, label: "blur - texte"),

            .message(makeMessage(
                id: "spe-blur-2",
                content: "",
                type: .image,
                source: .user,
                isOwn: false,
                senderName: "Marie",
                attachments: [makeImageAttachment(id: "att-blur-2")],
                isBlurred: true
            ), isOwn: false, label: "blur - photo"),

            .header("Message avec reponse (quote)"),
            .message(makeMessage(
                id: "spe-reply-1",
                content: "Voici ma reponse a ton message",
                type: .text,
                source: .user,
                isOwn: true,
                replyTo: ReplyToMessage(
                    id: "original-1",
                    content: "Message original auquel je reponds",
                    senderId: otherUserId,
                    anonymousSenderId: nil,
                    messageType: .text,
                    createdAt: Date().addingTimeInterval(-300),
                    sender: MessageSender(id: otherUserId, username: "marie", displayName: "Marie", avatar: nil),
                    attachments: nil
                )
            ), isOwn: true, label: "avec replyTo"),

            .header("Erreur d'envoi"),
            .message(makeMessage(
                id: "spe-err-1",
                content: "Ce message n'a pas pu etre envoye",
                type: .text,
                source: .user,
                isOwn: true,
                sendError: "Erreur de connexion"
            ), isOwn: true, label: "sendError"),

            .header("Message long"),
            .message(makeMessage(
                id: "spe-long-1",
                content: """
                Ceci est un message tres long pour tester comment l'interface gere les longs textes. \
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt \
                ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation \
                ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in \
                reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
                """,
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie"
            ), isOwn: false, label: "texte long")
        ]
    }

    // MARK: - Advanced Features Items

    private var advancedFeaturesItems: [ShowcaseItem] {
        [
            .info("Nouvelles fonctionnalités de messagerie avancée"),

            .header("@Mentions avec highlight"),
            .message(makeMessage(
                id: "adv-mention-1",
                content: "Salut @marie! Tu as vu le message de @pierre? Il faut qu'on se coordonne pour le projet.",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Jean",
                mentions: [
                    Mention(
                        id: "mention-1",
                        messageId: "adv-mention-1",
                        mentionedUserId: "user-marie",
                        mentionedAt: Date(),
                        mentionedUser: Mention.MentionedUser(
                            id: "user-marie",
                            username: "marie",
                            displayName: "Marie",
                            avatar: nil
                        )
                    ),
                    Mention(
                        id: "mention-2",
                        messageId: "adv-mention-1",
                        mentionedUserId: "user-pierre",
                        mentionedAt: Date(),
                        mentionedUser: Mention.MentionedUser(
                            id: "user-pierre",
                            username: "pierre",
                            displayName: "Pierre",
                            avatar: nil
                        )
                    )
                ]
            ), isOwn: false, label: "@mentions - bleu + bold"),

            .message(makeMessage(
                id: "adv-mention-2",
                content: "Oui @jean, j'ai bien reçu! On en discute demain?",
                type: .text,
                source: .user,
                isOwn: true,
                deliveryStatus: .allRead,
                mentions: [
                    Mention(
                        id: "mention-3",
                        messageId: "adv-mention-2",
                        mentionedUserId: "user-jean",
                        mentionedAt: Date(),
                        mentionedUser: Mention.MentionedUser(
                            id: "user-jean",
                            username: "jean",
                            displayName: "Jean",
                            avatar: nil
                        )
                    )
                ]
            ), isOwn: true, label: "@mention envoyé"),

            .header("Link Preview (aperçu URL)"),
            .message(makeMessage(
                id: "adv-link-1",
                content: "Regarde ce site interessant: https://apple.com",
                type: .text,
                source: .user,
                isOwn: false,
                senderName: "Marie"
            ), isOwn: false, label: "avec link preview"),

            .message(makeMessage(
                id: "adv-link-2",
                content: "Voici le lien pour le projet: https://github.com/meeshy",
                type: .text,
                source: .user,
                isOwn: true,
                deliveryStatus: .delivered
            ), isOwn: true, label: "link envoyé"),

            .header("État envoi (Sending)"),
            .message(makeSendingMessage(
                id: "adv-sending-1",
                content: "Ce message est en cours d'envoi..."
            ), isOwn: true, isSending: true, label: "envoi en cours (spinner)"),

            .header("Indicateurs de lecture (✓✓)"),
            .message(makeMessage(
                id: "adv-status-1",
                content: "Envoyé seulement",
                type: .text,
                source: .user,
                isOwn: true,
                deliveryStatus: .sent
            ), isOwn: true, label: "✓ gris (envoyé)"),

            .message(makeMessage(
                id: "adv-status-2",
                content: "Livré au destinataire",
                type: .text,
                source: .user,
                isOwn: true,
                deliveryStatus: .delivered
            ), isOwn: true, label: "✓✓ gris (livré)"),

            .message(makeMessage(
                id: "adv-status-3",
                content: "Lu par tous",
                type: .text,
                source: .user,
                isOwn: true,
                deliveryStatus: .allRead
            ), isOwn: true, label: "✓✓ bleu (lu)"),

            .header("Échec d'envoi (avec retry)"),
            .message(makeErrorMessage(
                id: "adv-error-1",
                content: "Ce message n'a pas pu être envoyé à cause d'un problème réseau.",
                errorMessage: "Connexion réseau perdue"
            ), isOwn: true, label: "erreur + bouton renvoyer")
        ]
    }

    /// Helper to create a message marked as "sending"
    private func makeSendingMessage(id: String, content: String) -> Message {
        makeMessage(
            id: id,
            content: content,
            type: .text,
            source: .user,
            isOwn: true
        )
    }

    /// Helper to create a message with send error
    private func makeErrorMessage(id: String, content: String, errorMessage: String) -> Message {
        makeMessage(
            id: id,
            content: content,
            type: .text,
            source: .user,
            isOwn: true,
            sendError: errorMessage
        )
    }

    // MARK: - Item View

    @ViewBuilder
    private func showcaseItemView(_ item: ShowcaseItem) -> some View {
        switch item {
        case .header(let text):
            headerView(text)
        case .info(let text):
            infoView(text)
        case .dateSeparator(let date):
            DateSeparatorView(date: date)
        case .message(let message, let isOwn, let isFirst, let isLast, let isSending, let label):
            VStack(alignment: .leading, spacing: 2) {
                // Label badge
                HStack {
                    if isOwn { Spacer() }
                    Text(label)
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.purple.opacity(0.8)))
                    if !isOwn { Spacer() }
                }

                // Real ModernMessageBubble
                ModernMessageBubble(
                    message: message,
                    isCurrentUser: isOwn,
                    isFirstInGroup: isFirst,
                    isLastInGroup: isLast,
                    onReply: {},
                    onReaction: { _ in },
                    onTranslate: { _ in },
                    onEdit: { _ in },
                    onDelete: {},
                    onReport: {},
                    onForward: {},
                    getUserInfo: { userId in
                        if userId == currentUserId {
                            return ("Moi", nil)
                        } else {
                            return ("Marie", nil)
                        }
                    },
                    getMessageById: { _ in nil },
                    isSending: isSending,
                    onRetry: message.sendError != nil ? {
                        // Demo: show alert or feedback
                        print("Retry sending message: \(message.id)")
                    } : nil
                )
            }
            .padding(.vertical, isFirst ? 8 : 2)
        }
    }

    private func headerView(_ text: String) -> some View {
        HStack {
            Text(text)
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(.blue)
                .textCase(.uppercase)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.top, 20)
        .padding(.bottom, 4)
    }

    private func infoView(_ text: String) -> some View {
        HStack {
            Image(systemName: "info.circle")
                .font(.system(size: 12))
            Text(text)
                .font(.system(size: 11))
        }
        .foregroundColor(.secondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.systemGray6))
        )
        .padding(.horizontal, 4)
    }

    // MARK: - Message Factory

    private func makeMessage(
        id: String,
        content: String,
        type: MessageContentType,
        source: MessageSource,
        isOwn: Bool,
        senderName: String? = nil,
        createdAt: Date = Date(),
        attachments: [MessageAttachment]? = nil,
        transcription: AudioTranscription? = nil,
        reactions: [Reaction]? = nil,
        isEdited: Bool = false,
        isDeleted: Bool = false,
        forwardedFromId: String? = nil,
        encryptedContent: String? = nil,
        isViewOnce: Bool = false,
        viewOnceCount: Int? = nil,
        isBlurred: Bool = false,
        replyTo: ReplyToMessage? = nil,
        sendError: String? = nil,
        deliveryStatus: DeliveryStatusType? = nil,  // For checkmarks display
        mentions: [Mention]? = nil  // For @mentions highlight
    ) -> Message {
        let senderId = isOwn ? currentUserId : otherUserId

        // Build status array for own messages to show checkmarks
        var statusArray: [MessageDeliveryStatus]? = nil
        if isOwn, let statusType = deliveryStatus {
            statusArray = makeDeliveryStatus(
                messageId: id,
                statusType: statusType
            )
        }

        var msg = Message(
            id: id,
            conversationId: "showcase-conv",
            senderId: senderId,
            content: content,
            messageType: type,
            messageSource: source,
            isEdited: isEdited,
            editedAt: isEdited ? Date() : nil,
            isDeleted: isDeleted,
            deletedAt: isDeleted ? Date() : nil,
            replyToId: replyTo?.id,
            forwardedFromId: forwardedFromId,
            isViewOnce: isViewOnce,
            maxViewOnceCount: isViewOnce ? 1 : nil,
            viewOnceCount: viewOnceCount,
            isBlurred: isBlurred,
            createdAt: createdAt,
            sender: MessageSender(
                id: senderId,
                username: isOwn ? "moi" : "marie",
                displayName: isOwn ? "Moi" : (senderName ?? "Utilisateur"),
                avatar: nil
            ),
            attachments: attachments,
            reactions: reactions,
            replyToMessage: replyTo,
            status: statusArray
        )

        msg.audioTranscription = transcription
        msg.encryptedContent = encryptedContent
        msg.sendError = sendError
        msg.mentions = mentions

        return msg
    }

    // MARK: - Delivery Status Types for Showcase

    /// Types of delivery status for showcase messages
    enum DeliveryStatusType {
        case sent           // Gray single check ✓
        case delivered      // Gray double check ✓✓
        case partiallyRead  // Blue single check ✓
        case allRead        // Blue double check ✓✓
    }

    /// Create delivery status array for showcase messages
    private func makeDeliveryStatus(
        messageId: String,
        statusType: DeliveryStatusType
    ) -> [MessageDeliveryStatus] {
        let now = Date()

        switch statusType {
        case .sent:
            // No delivery status = sent only
            return []

        case .delivered:
            // Received but not read
            return [
                MessageDeliveryStatus(
                    id: UUID().uuidString,
                    conversationId: "showcase-conv",
                    messageId: messageId,
                    userId: otherUserId,
                    receivedAt: now,
                    readAt: nil,
                    updatedAt: now
                )
            ]

        case .partiallyRead:
            // Some read, some not (simulating group)
            return [
                MessageDeliveryStatus(
                    id: UUID().uuidString,
                    conversationId: "showcase-conv",
                    messageId: messageId,
                    userId: otherUserId,
                    receivedAt: now,
                    readAt: now,  // Read
                    updatedAt: now
                ),
                MessageDeliveryStatus(
                    id: UUID().uuidString,
                    conversationId: "showcase-conv",
                    messageId: messageId,
                    userId: "user-3",
                    receivedAt: now,
                    readAt: nil,  // Not read
                    updatedAt: now
                )
            ]

        case .allRead:
            // All recipients have read
            return [
                MessageDeliveryStatus(
                    id: UUID().uuidString,
                    conversationId: "showcase-conv",
                    messageId: messageId,
                    userId: otherUserId,
                    receivedAt: now,
                    readAt: now,
                    updatedAt: now
                )
            ]
        }
    }

    // MARK: - Attachment Factories

    private func makeImageAttachment(
        id: String,
        alt: String? = nil,
        caption: String? = nil
    ) -> MessageAttachment {
        MessageAttachment(
            id: id,
            fileName: "image_\(id).jpg",
            originalName: "photo.jpg",
            mimeType: "image/jpeg",
            fileSize: 245600,
            fileUrl: "https://picsum.photos/400/300",
            alt: alt,
            caption: caption,
            width: 400,
            height: 300,
            thumbnailUrl: "https://picsum.photos/100/75"
        )
    }

    private func makeVideoAttachment(
        id: String,
        duration: Int,
        caption: String? = nil
    ) -> MessageAttachment {
        MessageAttachment(
            id: id,
            fileName: "video_\(id).mp4",
            originalName: "video.mp4",
            mimeType: "video/mp4",
            fileSize: 15_000_000,
            fileUrl: "https://example.com/video.mp4",
            caption: caption,
            width: 1280,
            height: 720,
            thumbnailUrl: "https://picsum.photos/320/180",
            duration: duration
        )
    }

    private func makeAudioAttachment(
        id: String,
        duration: Int
    ) -> MessageAttachment {
        MessageAttachment(
            id: id,
            fileName: "audio_\(id).m4a",
            originalName: "voice.m4a",
            mimeType: "audio/mp4",
            fileSize: 125000,
            fileUrl: "https://example.com/audio.m4a",
            duration: duration,
            sampleRate: 44100,
            codec: "aac",
            channels: 1
        )
    }

    private func makeFileAttachment(
        id: String,
        fileName: String,
        mimeType: String,
        fileSize: Int,
        caption: String? = nil
    ) -> MessageAttachment {
        MessageAttachment(
            id: id,
            fileName: fileName,
            originalName: fileName,
            mimeType: mimeType,
            fileSize: fileSize,
            fileUrl: "https://example.com/\(fileName)",
            caption: caption,
            pageCount: mimeType.contains("pdf") ? 12 : nil
        )
    }

    private func makeLocationAttachment(
        id: String,
        name: String,
        latitude: Double,
        longitude: Double
    ) -> MessageAttachment {
        MessageAttachment(
            id: id,
            fileName: "",
            originalName: "",
            mimeType: "application/geo+json",
            fileSize: 0,
            fileUrl: "",
            metadata: [
                "locationName": AnyCodable(name),
                "latitude": AnyCodable(latitude),
                "longitude": AnyCodable(longitude)
            ]
        )
    }
}

// MARK: - Showcase Item

private enum ShowcaseItem {
    case header(String)
    case info(String)
    case dateSeparator(Date)
    case message(Message, isOwn: Bool, isFirst: Bool = true, isLast: Bool = true, isSending: Bool = false, label: String)
}

// MARK: - Preview

#Preview {
    NavigationStack {
        BubbleShowcaseView()
    }
}
