//
//  AttachmentPickerSheet.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

enum AttachmentPickerType {
    case camera
    case photoVideo
    case document
    case location
    case contact
    case poll
}

struct AttachmentPickerSheet: View {
    @Environment(\.dismiss) private var dismiss: DismissAction
    let onSelect: (AttachmentPickerType) -> Void

    private let options: [(AttachmentPickerType, String, String, Color)] = [
        (.camera, "Camera", "camera.fill", .blue),
        (.photoVideo, "Photo & Video", "photo.fill", .purple),
        (.document, "Document", "doc.text.fill", .orange),
        (.location, "Location", "location.fill", .green),
        (.contact, "Contact", "person.crop.circle.fill", .pink),
        (.poll, "Poll", "chart.bar.fill", .cyan)
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Handle
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 40, height: 5)
                .padding(.top, 12)
                .padding(.bottom, 20)

            // Title
            Text("Send Attachment")
                .font(.title3)
                .fontWeight(.semibold)
                .padding(.bottom, 24)

            // Options Grid
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 20) {
                ForEach(options, id: \.1) { option in
                    attachmentOption(
                        type: option.0,
                        title: option.1,
                        icon: option.2,
                        color: option.3
                    )
                }
            }
            .padding(.horizontal)

            // Cancel Button
            Button {
                dismiss()
            } label: {
                Text("Cancel")
                    .font(.headline)
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
            }
            .padding(.top, 30)
            .padding(.bottom, 20)
        }
        .presentationDetents([.height(400)])
        .presentationDragIndicator(.hidden)
    }

    // MARK: - Attachment Option

    private func attachmentOption(
        type: AttachmentPickerType,
        title: String,
        icon: String,
        color: Color
    ) -> some View {
        Button {
            onSelect(type)
            dismiss()
        } label: {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.15))
                        .frame(width: 64, height: 64)

                    Image(systemName: icon)
                        .font(.system(size: 28))
                        .foregroundColor(color)
                }

                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.primary)
            }
            .frame(maxWidth: .infinity)
        }
    }
}
