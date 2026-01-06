import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers
import SwiftUI

/// Share Extension View Controller
/// Allows sharing content from other apps directly to Meeshy
/// Supports: Text, URLs, Images, Videos, Files, Location
class ShareViewController: UIViewController {

    private var hostingController: UIHostingController<ShareContentView>?
    private var sharedItems: [SharedItem] = []

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .systemBackground

        // Extract shared items
        extractSharedItems { [weak self] items in
            guard let self = self else { return }
            self.sharedItems = items
            self.setupSwiftUIView()
        }
    }

    private func setupSwiftUIView() {
        let shareView = ShareContentView(
            sharedItems: sharedItems,
            onSend: { [weak self] contactId in
                self?.sendToContact(contactId)
            },
            onCancel: { [weak self] in
                self?.cancelShare()
            }
        )

        let hostingController = UIHostingController(rootView: shareView)
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        hostingController.didMove(toParent: self)
        self.hostingController = hostingController
    }

    // MARK: - Extract Shared Content
    private func extractSharedItems(completion: @escaping ([SharedItem]) -> Void) {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            completion([])
            return
        }

        var items: [SharedItem] = []
        let dispatchGroup = DispatchGroup()

        for extensionItem in extensionItems {
            guard let attachments = extensionItem.attachments else { continue }

            for attachment in attachments {
                dispatchGroup.enter()

                // Check for different types
                if attachment.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                    extractText(from: attachment) { text in
                        if let text = text {
                            items.append(SharedItem(type: .text, content: text))
                        }
                        dispatchGroup.leave()
                    }
                } else if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    extractURL(from: attachment) { url in
                        if let url = url {
                            items.append(SharedItem(type: .url, content: url.absoluteString))
                        }
                        dispatchGroup.leave()
                    }
                } else if attachment.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    extractImage(from: attachment) { image in
                        if let image = image {
                            items.append(SharedItem(type: .image, content: image))
                        }
                        dispatchGroup.leave()
                    }
                } else if attachment.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                    extractVideo(from: attachment) { url in
                        if let url = url {
                            items.append(SharedItem(type: .video, content: url))
                        }
                        dispatchGroup.leave()
                    }
                } else {
                    dispatchGroup.leave()
                }
            }
        }

        dispatchGroup.notify(queue: .main) {
            completion(items)
        }
    }

    private func extractText(from attachment: NSItemProvider, completion: @escaping (String?) -> Void) {
        attachment.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { data, error in
            if let text = data as? String {
                completion(text)
            } else if let data = data as? Data, let text = String(data: data, encoding: .utf8) {
                completion(text)
            } else {
                completion(nil)
            }
        }
    }

    private func extractURL(from attachment: NSItemProvider, completion: @escaping (URL?) -> Void) {
        attachment.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, error in
            if let url = data as? URL {
                completion(url)
            } else if let data = data as? Data, let urlString = String(data: data, encoding: .utf8), let url = URL(string: urlString) {
                completion(url)
            } else {
                completion(nil)
            }
        }
    }

    private func extractImage(from attachment: NSItemProvider, completion: @escaping (UIImage?) -> Void) {
        attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { data, error in
            if let url = data as? URL, let imageData = try? Data(contentsOf: url), let image = UIImage(data: imageData) {
                completion(image)
            } else if let data = data as? Data, let image = UIImage(data: data) {
                completion(image)
            } else if let image = data as? UIImage {
                completion(image)
            } else {
                completion(nil)
            }
        }
    }

    private func extractVideo(from attachment: NSItemProvider, completion: @escaping (URL?) -> Void) {
        attachment.loadItem(forTypeIdentifier: UTType.movie.identifier, options: nil) { data, error in
            if let url = data as? URL {
                // Copy to shared container
                completion(url)
            } else {
                completion(nil)
            }
        }
    }

    // MARK: - Actions
    private func sendToContact(_ contactId: String) {
        // Save to shared container for main app to process
        saveSharedContent(contactId: contactId)

        // Open main app
        var responder: UIResponder? = self
        while responder != nil {
            if let application = responder as? UIApplication {
                let url = URL(string: "meeshy://share?contactId=\(contactId)")!
                application.open(url, options: [:], completionHandler: nil)
                break
            }
            responder = responder?.next
        }

        // Complete extension
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    private func saveSharedContent(contactId: String) {
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.meeshy.app") else {
            return
        }

        let sharedData = SharedContentData(
            contactId: contactId,
            items: sharedItems.map { item in
                SharedItemData(
                    type: item.type.rawValue,
                    content: itemContentAsString(item)
                )
            },
            timestamp: Date()
        )

        if let encoded = try? JSONEncoder().encode(sharedData) {
            sharedDefaults.set(encoded, forKey: "pending_shared_content")
        }
    }

    private func itemContentAsString(_ item: SharedItem) -> String {
        if let text = item.content as? String {
            return text
        } else if let image = item.content as? UIImage {
            // Save image to shared container and return path
            return saveImageToSharedContainer(image) ?? ""
        } else if let url = item.content as? URL {
            return url.absoluteString
        }
        return ""
    }

    private func saveImageToSharedContainer(_ image: UIImage) -> String? {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.meeshy.app"),
              let imageData = image.jpegData(compressionQuality: 0.8) else {
            return nil
        }

        let filename = UUID().uuidString + ".jpg"
        let fileURL = containerURL.appendingPathComponent(filename)

        do {
            try imageData.write(to: fileURL)
            return fileURL.absoluteString
        } catch {
            return nil
        }
    }

    private func cancelShare() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}

// MARK: - Data Models
struct SharedItem: Identifiable {
    let id = UUID()
    let type: SharedItemType
    let content: Any

    enum SharedItemType: String, Codable {
        case text
        case url
        case image
        case video
        case file
        case location
    }
}

struct SharedContentData: Codable {
    let contactId: String
    let items: [SharedItemData]
    let timestamp: Date
}

struct SharedItemData: Codable {
    let type: String
    let content: String
}

// MARK: - SwiftUI View
struct ShareContentView: View {
    let sharedItems: [SharedItem]
    let onSend: (String) -> Void
    let onCancel: () -> Void

    @State private var selectedContactId: String?
    @State private var searchText = ""
    @State private var recentContacts: [ContactPreview] = []

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Shared content preview
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(sharedItems) { item in
                            SharedItemPreview(item: item)
                        }
                    }
                    .padding()
                }
                .background(Color.secondary.opacity(0.1))

                Divider()

                // Contact selection
                VStack(alignment: .leading, spacing: 12) {
                    Text("Send to")
                        .font(.headline)
                        .padding(.horizontal)
                        .padding(.top)

                    // Search
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                        TextField("Search contacts", text: $searchText)
                    }
                    .padding()
                    .background(Color.secondary.opacity(0.1))
                    .cornerRadius(10)
                    .padding(.horizontal)

                    // Recent/Favorite contacts
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(filteredContacts) { contact in
                                ContactRow(contact: contact, isSelected: selectedContactId == contact.id)
                                    .onTapGesture {
                                        selectedContactId = contact.id
                                    }
                            }
                        }
                    }
                }

                Spacer()

                // Action buttons
                HStack(spacing: 16) {
                    Button("Cancel") {
                        onCancel()
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.secondary.opacity(0.2))
                    .foregroundColor(.primary)
                    .cornerRadius(12)

                    Button("Send") {
                        if let contactId = selectedContactId {
                            onSend(contactId)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(selectedContactId != nil ? Color.blue : Color.secondary.opacity(0.2))
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .disabled(selectedContactId == nil)
                }
                .padding()
            }
            .navigationTitle("Share to Meeshy")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear {
            loadRecentContacts()
        }
    }

    var filteredContacts: [ContactPreview] {
        if searchText.isEmpty {
            return recentContacts
        }
        return recentContacts.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    private func loadRecentContacts() {
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.meeshy.app"),
              let data = sharedDefaults.data(forKey: "recent_contacts"),
              let contacts = try? JSONDecoder().decode([ContactPreview].self, from: data) else {
            // Fallback sample data
            recentContacts = ContactPreview.sampleContacts
            return
        }
        recentContacts = contacts
    }
}

struct SharedItemPreview: View {
    let item: SharedItem

    var body: some View {
        VStack(spacing: 8) {
            switch item.type {
            case .text:
                VStack {
                    Image(systemName: "doc.text.fill")
                        .font(.largeTitle)
                        .foregroundColor(.blue)
                    if let text = item.content as? String {
                        Text(text)
                            .font(.caption)
                            .lineLimit(2)
                            .frame(width: 100)
                    }
                }

            case .url:
                VStack {
                    Image(systemName: "link")
                        .font(.largeTitle)
                        .foregroundColor(.blue)
                    if let url = item.content as? String {
                        Text(url)
                            .font(.caption)
                            .lineLimit(2)
                            .frame(width: 100)
                    }
                }

            case .image:
                if let image = item.content as? UIImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 100, height: 100)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

            case .video:
                VStack {
                    Image(systemName: "video.fill")
                        .font(.largeTitle)
                        .foregroundColor(.blue)
                    Text("Video")
                        .font(.caption)
                }

            case .file:
                VStack {
                    Image(systemName: "doc.fill")
                        .font(.largeTitle)
                        .foregroundColor(.gray)
                    Text("File")
                        .font(.caption)
                }

            case .location:
                VStack {
                    Image(systemName: "mappin.circle.fill")
                        .font(.largeTitle)
                        .foregroundColor(.red)
                    Text("Location")
                        .font(.caption)
                }
            }
        }
        .frame(width: 120, height: 120)
        .background(Color.secondary.opacity(0.1))
        .cornerRadius(12)
    }
}

struct ContactRow: View {
    let contact: ContactPreview
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [.blue, .purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 50, height: 50)

                if let avatar = contact.avatar {
                    AsyncImage(url: URL(string: avatar)) { image in
                        image.resizable()
                    } placeholder: {
                        Image(systemName: "person.fill")
                            .foregroundColor(.white)
                    }
                    .frame(width: 50, height: 50)
                    .clipShape(Circle())
                } else {
                    Text(contact.initials)
                        .font(.headline)
                        .foregroundColor(.white)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(contact.name)
                    .font(.headline)
                if let status = contact.status {
                    Text(status)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.blue)
                    .font(.title3)
            }
        }
        .padding()
        .background(isSelected ? Color.blue.opacity(0.1) : Color.clear)
    }
}

struct ContactPreview: Identifiable, Codable {
    let id: String
    let name: String
    let avatar: String?
    let status: String?

    var initials: String {
        let components = name.components(separatedBy: " ")
        let firstInitial = components.first?.prefix(1) ?? ""
        let lastInitial = components.count > 1 ? components.last?.prefix(1) ?? "" : ""
        return "\(firstInitial)\(lastInitial)".uppercased()
    }

    static let sampleContacts = [
        ContactPreview(id: "1", name: "John Doe", avatar: nil, status: "Online"),
        ContactPreview(id: "2", name: "Jane Smith", avatar: nil, status: "Away"),
        ContactPreview(id: "3", name: "Bob Johnson", avatar: nil, status: "Online")
    ]
}