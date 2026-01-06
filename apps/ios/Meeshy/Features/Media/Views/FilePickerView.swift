//
//  FilePickerView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI
import UniformTypeIdentifiers

struct FilePickerView: View {
    let onSelect: ([URL]) -> Void
    @State private var isShowingDocumentPicker = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "doc.text.fill")
                .font(.system(size: 80))
                .foregroundColor(.blue.opacity(0.3))

            Text("Select Files")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Browse and select documents, PDFs, and other files")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button {
                isShowingDocumentPicker = true
            } label: {
                Text("Browse Files")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(width: 200, height: 50)
                    .background(Color.blue)
                    .cornerRadius(12)
            }
            .padding(.top, 20)

            Spacer()
        }
        .sheet(isPresented: $isShowingDocumentPicker) {
            DocumentPicker(onSelect: onSelect)
        }
    }
}

// MARK: - Document Picker

struct DocumentPicker: UIViewControllerRepresentable {
    let onSelect: ([URL]) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(
            forOpeningContentTypes: [
                .pdf,
                .text,
                .plainText,
                .image,
                .movie,
                .audio,
                UTType(filenameExtension: "doc") ?? .data,
                UTType(filenameExtension: "docx") ?? .data,
                UTType(filenameExtension: "xls") ?? .data,
                UTType(filenameExtension: "xlsx") ?? .data,
                UTType(filenameExtension: "ppt") ?? .data,
                UTType(filenameExtension: "pptx") ?? .data,
            ],
            asCopy: true
        )

        picker.allowsMultipleSelection = true
        picker.delegate = context.coordinator

        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelect: onSelect)
    }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onSelect: ([URL]) -> Void

        init(onSelect: @escaping ([URL]) -> Void) {
            self.onSelect = onSelect
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onSelect(urls)
        }
    }
}
