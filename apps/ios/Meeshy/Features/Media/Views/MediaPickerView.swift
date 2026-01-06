//
//  MediaPickerView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI
import Photos

struct MediaPickerView: View {
    @StateObject private var viewModel = MediaPickerViewModel()
    @Environment(\.dismiss) private var dismiss
    let onSelect: ([Attachment]) -> Void

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Top Tabs
                tabBar

                // Content
                TabView(selection: $viewModel.selectedTab) {
                    photoGridView
                        .tag(MediaPickerTab.photos)

                    CameraView { image, filter, audioEffect in
                        // Ignore filter/audioEffect for simple media picker flow
                        handleCapturedImage(image)
                    }
                    .tag(MediaPickerTab.camera)

                    FilePickerView { urls in
                        handleSelectedFiles(urls)
                    }
                    .tag(MediaPickerTab.files)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                // Selected Items Preview
                if !viewModel.selectedItems.isEmpty {
                    selectedItemsCarousel
                }

                // Bottom Button
                bottomButton
            }
            .navigationTitle("Select Media")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .alert("Photo Library Access Required", isPresented: $viewModel.showPermissionAlert) {
                Button("Open Settings") {
                    PermissionManager.shared.openSettings()
                }
                Button("Cancel", role: .cancel) {
                    dismiss()
                }
            } message: {
                Text("Please allow access to your photo library in Settings to select photos.")
            }
        }
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            tabButton(title: "Photos", icon: "photo.on.rectangle", tab: .photos)
            tabButton(title: "Camera", icon: "camera", tab: .camera)
            tabButton(title: "Files", icon: "doc.text", tab: .files)
        }
        .background(Color(.systemBackground))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color(.separator)),
            alignment: .bottom
        )
    }

    private func tabButton(title: String, icon: String, tab: MediaPickerTab) -> some View {
        Button {
            withAnimation {
                viewModel.selectedTab = tab
            }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 22))

                Text(title)
                    .font(.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .foregroundColor(viewModel.selectedTab == tab ? .blue : .secondary)
            .background(
                Rectangle()
                    .frame(height: 3)
                    .foregroundColor(viewModel.selectedTab == tab ? .blue : .clear),
                alignment: .bottom
            )
        }
    }

    // MARK: - Photo Grid

    private var photoGridView: some View {
        ScrollView {
            if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 2),
                    GridItem(.flexible(), spacing: 2),
                    GridItem(.flexible(), spacing: 2)
                ], spacing: 2) {
                    ForEach(viewModel.photoItems) { item in
                        photoGridCell(item)
                    }
                }
            }
        }
    }

    private func photoGridCell(_ item: PhotoItem) -> some View {
        GeometryReader { geometry in
            ZStack(alignment: .topTrailing) {
                if let thumbnail = item.thumbnail {
                    Image(uiImage: thumbnail)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geometry.size.width, height: geometry.size.width)
                        .clipped()
                } else {
                    Color.gray.opacity(0.2)
                        .frame(width: geometry.size.width, height: geometry.size.width)
                }

                // Selection Checkmark
                if item.isSelected {
                    Circle()
                        .fill(Color.blue)
                        .frame(width: 28, height: 28)
                        .overlay(
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                        )
                        .padding(8)
                } else {
                    Circle()
                        .strokeBorder(Color.white, lineWidth: 2)
                        .background(Circle().fill(Color.black.opacity(0.3)))
                        .frame(width: 28, height: 28)
                        .padding(8)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .onTapGesture {
            viewModel.toggleSelection(item)
        }
    }

    // MARK: - Selected Items Carousel

    private var selectedItemsCarousel: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Selected (\(viewModel.selectedItems.count)/10)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                Button("Clear") {
                    viewModel.clearSelection()
                }
                .font(.subheadline)
                .foregroundColor(.blue)
            }
            .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(viewModel.selectedItems) { item in
                        if let thumbnail = item.thumbnail {
                            Image(uiImage: thumbnail)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 60, height: 60)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .strokeBorder(Color.blue, lineWidth: 2)
                                )
                                .overlay(
                                    Button {
                                        viewModel.toggleSelection(item)
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.system(size: 20))
                                            .foregroundColor(.white)
                                            .background(
                                                Circle()
                                                    .fill(Color.red)
                                                    .frame(width: 20, height: 20)
                                            )
                                    }
                                    .offset(x: 8, y: -8),
                                    alignment: .topTrailing
                                )
                        }
                    }
                }
                .padding(.horizontal)
            }
            .frame(height: 80)
        }
        .background(Color(.systemBackground))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color(.separator)),
            alignment: .top
        )
    }

    // MARK: - Bottom Button

    private var bottomButton: some View {
        Button {
            Task {
                let attachments = await viewModel.convertToAttachments()
                onSelect(attachments)
                dismiss()
            }
        } label: {
            Text("Send \(viewModel.selectedItems.count) item\(viewModel.selectedItems.count == 1 ? "" : "s")")
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(viewModel.selectedItems.isEmpty ? Color.gray : Color.blue)
                .cornerRadius(12)
        }
        .disabled(viewModel.selectedItems.isEmpty)
        .padding()
    }

    // MARK: - Handlers

    private func handleCapturedImage(_ image: UIImage) {
        // Create temporary attachment
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("jpg")

        if let data = image.jpegData(compressionQuality: 0.8) {
            try? data.write(to: tempURL)

            let attachment = Attachment(
                id: UUID().uuidString,
                type: .image,
                url: "",
                fileName: tempURL.lastPathComponent,
                fileSize: Int64(data.count),
                mimeType: "image/jpeg",
                thumbnailUrl: nil,
                metadata: nil,
                localURL: tempURL,
                createdAt: Date()
            )

            onSelect([attachment])
            dismiss()
        }
    }

    private func handleSelectedFiles(_ urls: [URL]) {
        let attachments = urls.map { url in
            let fileSize = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0

            return Attachment(
                id: UUID().uuidString,
                type: .file,
                url: "",
                fileName: url.lastPathComponent,
                fileSize: fileSize,
                mimeType: url.mimeType,
                thumbnailUrl: nil,
                metadata: nil,
                localURL: url,
                createdAt: Date()
            )
        }

        onSelect(attachments)
        dismiss()
    }
}

// MARK: - URL Extension

extension URL {
    var mimeType: String {
        let pathExtension = self.pathExtension.lowercased()

        switch pathExtension {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "pdf": return "application/pdf"
        case "doc": return "application/msword"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "xls": return "application/vnd.ms-excel"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "mp4": return "video/mp4"
        case "mov": return "video/quicktime"
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/mp4"
        default: return "application/octet-stream"
        }
    }
}
