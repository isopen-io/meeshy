//
//  EmojiPickerSheet.swift
//  Meeshy
//
//  Full emoji picker with search (FR/EN), categories, frequent emojis
//  Ported from old_ios with v2 theme adaptations
//

import SwiftUI

// MARK: - Emoji Grid Category

enum EmojiGridCategory: String, CaseIterable, Identifiable {
    case recent = "Recents"
    case smileys = "Smileys"
    case people = "Personnes"
    case animals = "Animaux"
    case food = "Nourriture"
    case activities = "Activites"
    case travel = "Voyages"
    case objects = "Objets"
    case symbols = "Symboles"
    case flags = "Drapeaux"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .recent: return "clock"
        case .smileys: return "face.smiling"
        case .people: return "person.2"
        case .animals: return "hare"
        case .food: return "fork.knife"
        case .activities: return "sportscourt"
        case .travel: return "car"
        case .objects: return "lightbulb"
        case .symbols: return "heart"
        case .flags: return "flag"
        }
    }

    var emojis: [String] {
        switch self {
        case .recent:
            return []
        case .smileys:
            return ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","☺️","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"]
        case .people:
            return ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","👀","👁️","👅","👄","👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","💃","🕺","👯","🧖","🧗","🤸","🏌️","🏇","🏄","🏊","🤽","🚣","🧘"]
        case .animals:
            return ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🕷️","🕸️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🐈","🐈‍⬛","🐓","🦃","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥"]
        case .food:
            return ["🍇","🍈","🍉","🍊","🍋","🍌","🍍","🥭","🍎","🍏","🍐","🍑","🍒","🍓","🫐","🥝","🍅","🥥","🥑","🍆","🥔","🥕","🌽","🌶️","🥒","🥬","🥦","🧄","🧅","🍄","🥜","🌰","🍞","🥐","🥖","🥨","🥯","🥞","🧇","🧀","🍖","🍗","🥩","🥓","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🥙","🧆","🥚","🍳","🥘","🍲","🥣","🥗","🍿","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤","🍥","🍡","🥟","🥠","🥡","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🍵","🍶","🍾","🍷","🍸","🍹","🍺","🍻","🥂","🥃","🥤","🧋","🧃"]
        case .activities:
            return ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🏑","🥍","🏏","🥅","⛳","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🏋️","🤼","🤸","⛹️","🤺","🤾","🏌️","🏇","🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎫","🎟️","🎪","🤹","🎭","🩰","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🎲","♟️","🎯","🎳","🎮","🎰","🧩"]
        case .travel:
            return ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛴","🚲","🛵","🏍️","🛺","🚨","🚔","🚍","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇","🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️","⛴️","🚢","⚓","⛽","🚧","🚦","🚥","🚏","🗺️","🗿","🗽","🗼","🏰","🏯","🏟️","🎡","🎢","🎠","⛲","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🗻","🏕️","⛺","🏠","🏡","🏗️","🏭","🏢","🏬","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏩","💒","🏛️","⛪","🕌","🕍","🛕","⛩️","🌅","🌄","🌠","🎇","🎆","🌇","🌆","🏙️","🌃","🌌","🌉","🌁"]
        case .objects:
            return ["⌚","📱","📲","💻","⌨️","🖥️","🖨️","🖱️","🕹️","💽","💾","💿","📀","📼","📷","📸","📹","🎥","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🔌","💡","🔦","🕯️","🧯","💸","💵","💴","💶","💷","💰","💳","💎","⚖️","🧰","🔧","🔨","🛠️","⛏️","🔩","⚙️","🧱","🔫","💣","🧨","🔪","🗡️","⚔️","🛡️","🔮","📿","🧿","💈","⚗️","🔭","🔬","🩹","🩺","💊","💉","🧬","🦠","🧫","🧪","🌡️","🧹","🧺","🧻","🚽","🚰","🚿","🛁","🧼","🧽","🧴","🛎️","🔑","🗝️","🚪","🛋️","🛏️","🧸","🖼️","🛍️","🛒","🎁","🎈","🎏","🎀","🎊","🎉","🎎","🏮","🎐","🧧","✉️","📩","📨","📧","💌","📥","📤","📦","🏷️","📪","📫","📬","📭","📮","📯","📜","📃","📄","📑","🧾","📊","📈","📉","📇","🗃️","🗳️","🗄️","📋","📁","📂","🗂️","🗞️","📰","📓","📔","📒","📕","📗","📘","📙","📚","📖","🔖","🧷","🔗","📎","🖇️","📐","📏","🧮","📌","📍","✂️","🖊️","🖋️","✒️","🖌️","🖍️","📝","✏️","🔍","🔎","🔏","🔐","🔒","🔓"]
        case .symbols:
            return ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","☢️","☣️","📴","📳","✴️","🆚","💮","㊙️","㊗️","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🚭","❗","❕","❓","❔","‼️","⁉️","🔅","🔆","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","💹","❇️","✳️","❎","🌐","💠","Ⓜ️","🌀","💤","🏧","🚾","♿","🅿️","🈳","🛂","🛃","🛄","🛅","🚹","🚺","🚼","⚧️","🚻","🚮","🎦","📶","🔣","ℹ️","🔤","🔡","🔠","🆖","🆗","🆙","🆒","🆕","🆓","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔢","#️⃣","*️⃣","▶️","⏸️","⏹️","⏺️","⏭️","⏮️","⏩","⏪","⏫","⏬","◀️","🔼","🔽","➡️","⬅️","⬆️","⬇️","↗️","↘️","↙️","↖️","↕️","↔️","↪️","↩️","⤴️","⤵️","🔀","🔁","🔂","🔄","🔃","🎵","🎶","➕","➖","➗","✖️","♾️","💲","💱","™️","©️","®️","➰","➿","✔️","☑️","🔘","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","🔸","🔹","🔶","🔷","🔳","🔲","▪️","▫️","◾","◽","◼️","◻️","🟥","🟧","🟨","🟩","🟦","🟪","⬛","⬜","🟫","🔈","🔇","🔉","🔊","🔔","🔕","📣","📢","💬","💭","🗯️","♠️","♣️","♥️","♦️","🃏","🎴","🀄"]
        case .flags:
            return ["🏳️","🏴","🏴‍☠️","🏁","🚩","🎌","🏳️‍🌈","🏳️‍⚧️","🇺🇳","🇫🇷","🇺🇸","🇬🇧","🇩🇪","🇪🇸","🇮🇹","🇵🇹","🇧🇪","🇨🇭","🇦🇹","🇳🇱","🇯🇵","🇰🇷","🇨🇳","🇮🇳","🇧🇷","🇲🇽","🇨🇦","🇦🇺","🇷🇺","🇹🇷","🇸🇦","🇦🇪","🇪🇬","🇿🇦","🇳🇬","🇰🇪","🇲🇦","🇹🇳","🇩🇿","🇸🇳","🇨🇮","🇨🇲","🇬🇭","🇵🇱","🇨🇿","🇷🇴","🇭🇺","🇬🇷","🇸🇪","🇳🇴","🇩🇰","🇫🇮","🇮🇪","🇮🇸","🇺🇦","🇮🇱","🇱🇧","🇮🇶","🇮🇷","🇵🇰","🇧🇩","🇮🇩","🇹🇭","🇻🇳","🇵🇭","🇲🇾","🇸🇬","🇹🇼","🇭🇰","🇦🇷","🇨🇱","🇨🇴","🇵🇪","🇻🇪","🇪🇨","🇨🇺","🇩🇴","🇵🇷","🇯🇲","🇹🇹","🇭🇹"]
        }
    }
}

// MARK: - Emoji Data Manager (FR/EN keyword search)

final class EmojiDataManager: @unchecked Sendable {
    static let shared = EmojiDataManager()
    private init() {}

    func searchEmojis(_ query: String) -> [String] {
        guard !query.isEmpty else { return [] }
        let q = query.lowercased()
        var results: [String] = []
        for category in EmojiGridCategory.allCases where category != .recent {
            results.append(contentsOf: category.emojis.filter { emoji in
                emoji.contains(q) || emojiMatchesKeyword(emoji, keyword: q)
            })
        }
        return Array(Set(results)).prefix(60).map { $0 }
    }

    private func emojiMatchesKeyword(_ emoji: String, keyword: String) -> Bool {
        let keywords: [String: [String]] = [
            "heart": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","💕","💞","💓","💗","💖","💘","💝","💟","😍","🥰"],
            "coeur": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","💕","💞","💓","💗","💖","💘","💝","💟","😍","🥰"],
            "smile": ["😀","😃","😄","😁","😆","😅","😊","🙂","😉","☺️"],
            "sourire": ["😀","😃","😄","😁","😆","😅","😊","🙂","😉","☺️"],
            "sad": ["😢","😭","😞","😔","🙁","☹️","😥"],
            "triste": ["😢","😭","😞","😔","🙁","☹️","😥"],
            "laugh": ["😂","🤣","😆","😁"],
            "rire": ["😂","🤣","😆","😁"],
            "love": ["❤️","😍","🥰","😘","💕","💖","💗","💞","💝","💘"],
            "amour": ["❤️","😍","🥰","😘","💕","💖","💗","💞","💝","💘"],
            "fire": ["🔥","💥","🌋"],
            "feu": ["🔥","💥","🌋"],
            "ok": ["👌","👍","✅","✔️","🆗"],
            "yes": ["👍","✅","✔️","☑️"],
            "oui": ["👍","✅","✔️","☑️"],
            "no": ["👎","❌","🚫","⛔"],
            "non": ["👎","❌","🚫","⛔"],
            "clap": ["👏","🙌"],
            "applaudir": ["👏","🙌"],
            "think": ["🤔","🧐","💭"],
            "penser": ["🤔","🧐","💭"],
            "cry": ["😢","😭","🥲"],
            "pleurer": ["😢","😭","🥲"],
            "angry": ["😠","😡","🤬","💢"],
            "colere": ["😠","😡","🤬","💢"],
            "party": ["🎉","🎊","🥳","🎈","🎁"],
            "fete": ["🎉","🎊","🥳","🎈","🎁"],
            "cool": ["😎","🆒","❄️"],
            "star": ["⭐","🌟","✨","💫","🌠"],
            "etoile": ["⭐","🌟","✨","💫","🌠"],
            "sun": ["☀️","🌞","🌅","🌄"],
            "soleil": ["☀️","🌞","🌅","🌄"],
            "moon": ["🌙","🌛","🌜","🌝","🌚"],
            "lune": ["🌙","🌛","🌜","🌝","🌚"],
            "dog": ["🐶","🐕","🐩"],
            "chien": ["🐶","🐕","🐩"],
            "cat": ["🐱","🐈","🐈‍⬛"],
            "chat": ["🐱","🐈","🐈‍⬛"],
            "food": ["🍕","🍔","🍟","🌭","🍿","🍩","🍪"],
            "manger": ["🍕","🍔","🍟","🌭","🍿","🍩","🍪"],
            "drink": ["🍺","🍻","🥂","🍷","🍸","☕","🧋"],
            "boire": ["🍺","🍻","🥂","🍷","🍸","☕","🧋"],
            "music": ["🎵","🎶","🎤","🎧","🎸","🎹","🎷"],
            "musique": ["🎵","🎶","🎤","🎧","🎸","🎹","🎷"],
            "sport": ["⚽","🏀","🏈","⚾","🎾","🏐"],
            "car": ["🚗","🚕","🚙","🏎️","🚓"],
            "voiture": ["🚗","🚕","🚙","🏎️","🚓"],
            "plane": ["✈️","🛫","🛬","🛩️"],
            "avion": ["✈️","🛫","🛬","🛩️"],
            "money": ["💰","💵","💴","💶","💷","💸","💳"],
            "argent": ["💰","💵","💴","💶","💷","💸","💳"],
            "france": ["🇫🇷"],
            "usa": ["🇺🇸"],
            "uk": ["🇬🇧"]
        ]
        return keywords[keyword]?.contains(emoji) ?? false
    }
}

// MARK: - Emoji Picker Sheet

struct EmojiPickerSheet: View {
    let quickReactions: [String]
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var selectedCategory: EmojiGridCategory = .smileys
    @AppStorage("frequentEmojis") private var frequentEmojisData: Data = Data()

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 8)

    private var frequentEmojis: [String] {
        (try? JSONDecoder().decode([String].self, from: frequentEmojisData)) ?? quickReactions
    }

    private var emojisToDisplay: [String] {
        if !searchText.isEmpty {
            return EmojiDataManager.shared.searchEmojis(searchText)
        }
        if selectedCategory == .recent {
            return frequentEmojis
        }
        return selectedCategory.emojis
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)

                    TextField(String(localized: "emoji.search", defaultValue: "Rechercher un emoji"), text: $searchText)
                        .font(.system(size: 14))
                        .autocorrectionDisabled()

                    if !searchText.isEmpty {
                        Button {
                            searchText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color(UIColor.systemGray6))
                .cornerRadius(10)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)

                // Category tabs (hidden during search)
                if searchText.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            ForEach(EmojiGridCategory.allCases.filter { $0 != .recent || !frequentEmojis.isEmpty }) { category in
                                Button {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        selectedCategory = category
                                    }
                                } label: {
                                    Image(systemName: category.icon)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(selectedCategory == category ? .white : .primary)
                                        .frame(width: 36, height: 28)
                                        .background(
                                            RoundedRectangle(cornerRadius: 8)
                                                .fill(selectedCategory == category ? Color.accentColor : Color(.systemGray6))
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 12)
                    }
                    .padding(.vertical, 4)
                }

                Divider()

                // Content
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        // Quick reactions (only when on recent tab and not searching)
                        if searchText.isEmpty && selectedCategory == .recent {
                            VStack(alignment: .leading, spacing: 8) {
                                sectionHeader(icon: "face.smiling", title: String(localized: "emoji.quickReactions", defaultValue: "Reactions rapides"))

                                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
                                    ForEach(quickReactions.prefix(9), id: \.self) { emoji in
                                        emojiButton(emoji, size: 44)
                                    }
                                }
                                .padding(.horizontal, 32)
                            }

                            Divider().padding(.vertical, 4)

                            VStack(alignment: .leading, spacing: 8) {
                                sectionHeader(icon: "clock", title: String(localized: "emoji.recent", defaultValue: "Utilises recemment"))

                                LazyVGrid(columns: columns, spacing: 8) {
                                    ForEach(frequentEmojis.prefix(24), id: \.self) { emoji in
                                        emojiButton(emoji)
                                    }
                                }
                                .padding(.horizontal, 12)
                            }
                        } else {
                            // Category emojis or search results
                            LazyVGrid(columns: columns, spacing: 4) {
                                ForEach(emojisToDisplay, id: \.self) { emoji in
                                    emojiButton(emoji)
                                }
                            }
                            .padding(.horizontal, 12)
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
            .navigationTitle(String(localized: "emoji.title", defaultValue: "Reactions"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "emoji.close", defaultValue: "Fermer")) { dismiss() }
                }
            }
        }
    }

    // MARK: - Subviews

    private func sectionHeader(icon: String, title: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .foregroundColor(.secondary)
                .font(.system(size: 12))
            Text(title)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 16)
    }

    private func emojiButton(_ emoji: String, size: CGFloat = 36) -> some View {
        Button {
            selectEmoji(emoji)
        } label: {
            Text(emoji)
                .font(size > 40 ? .largeTitle : .title2)
                .frame(width: size, height: size)
        }
        .buttonStyle(EmojiScaleButtonStyle())
    }

    // MARK: - Logic

    private func selectEmoji(_ emoji: String) {
        var frequent = frequentEmojis
        frequent.removeAll { $0 == emoji }
        frequent.insert(emoji, at: 0)
        if frequent.count > 24 {
            frequent = Array(frequent.prefix(24))
        }
        frequentEmojisData = (try? JSONEncoder().encode(frequent)) ?? Data()
        onSelect(emoji)
    }
}

// MARK: - Emoji Scale Button Style

struct EmojiScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.3 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
