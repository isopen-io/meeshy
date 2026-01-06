//
//  CallDetailsView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct CallDetailsView: View {
    let record: CallRecord
    @Environment(\.dismiss) private var dismiss: DismissAction
    @State private var showDeleteAlert = false

    var body: some View {
        NavigationStack {
            List {
                // Participant info
                participantSection

                // Call details
                callDetailsSection

                // Call quality
                if let quality = record.quality {
                    callQualitySection(quality)
                }

                // Actions
                actionsSection
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Call Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .alert("Delete Call Record", isPresented: $showDeleteAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Delete", role: .destructive) {
                    handleDelete()
                }
            } message: {
                Text("Are you sure you want to delete this call record?")
            }
        }
    }

    // MARK: - Participant Section

    private var participantSection: some View {
        Section {
            HStack(spacing: 16) {
                // Avatar
                Circle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 60, height: 60)
                    .overlay {
                        Text(initials)
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundColor(.white)
                    }

                VStack(alignment: .leading, spacing: 4) {
                    Text(record.call.userName)
                        .font(.title3)
                        .fontWeight(.semibold)

                    Text(record.call.userId)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Call Details Section

    private var callDetailsSection: some View {
        Section("Call Information") {
            DetailRow(
                icon: "phone.fill",
                label: "Type",
                value: record.call.type.displayName
            )

            DetailRow(
                icon: record.call.direction.iconName,
                label: "Direction",
                value: record.call.direction.rawValue.capitalized,
                iconColor: directionColor
            )

            DetailRow(
                icon: "clock.fill",
                label: "Time",
                value: record.call.timestampFormatted
            )

            if let duration = record.call.duration {
                DetailRow(
                    icon: "timer",
                    label: "Duration",
                    value: record.call.durationFormatted
                )
            } else {
                DetailRow(
                    icon: "timer",
                    label: "Duration",
                    value: "Not answered"
                )
            }

            DetailRow(
                icon: "number",
                label: "Call ID",
                value: record.call.id
            )
        }
    }

    // MARK: - Call Quality Section

    private func callQualitySection(_ quality: CallRecord.CallQuality) -> some View {
        Section("Call Quality") {
            HStack {
                Image(systemName: quality.iconName)
                    .foregroundColor(qualityColor(quality))

                Text(quality.displayName)
                    .foregroundColor(qualityColor(quality))

                Spacer()

                // Quality indicator bars
                HStack(spacing: 4) {
                    ForEach(0..<4) { index in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(index < qualityLevel(quality) ? qualityColor(quality) : Color.gray.opacity(0.3))
                            .frame(width: 6, height: CGFloat(12 + index * 4))
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        Section {
            // Call back button
            Button {
                handleCallBack()
            } label: {
                HStack {
                    Image(systemName: record.call.type.iconName)
                        .foregroundColor(.green)

                    Text("Call Back")
                        .foregroundColor(.primary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }

            // Message button
            Button {
                handleMessage()
            } label: {
                HStack {
                    Image(systemName: "message.fill")
                        .foregroundColor(.blue)

                    Text("Send Message")
                        .foregroundColor(.primary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }

            // Delete button
            Button(role: .destructive) {
                showDeleteAlert = true
            } label: {
                HStack {
                    Image(systemName: "trash.fill")

                    Text("Delete Call Record")

                    Spacer()
                }
            }
        }
    }

    // MARK: - Computed Properties

    private var initials: String {
        let components = record.call.userName.split(separator: " ")
        let firstInitial = components.first?.first.map(String.init) ?? ""
        let lastInitial = components.dropFirst().first?.first.map(String.init) ?? ""
        return firstInitial + lastInitial
    }

    private var directionColor: Color {
        switch record.call.direction {
        case .incoming: return .green
        case .outgoing: return .blue
        case .missed: return .red
        }
    }

    private func qualityColor(_ quality: CallRecord.CallQuality) -> Color {
        switch quality {
        case .excellent, .good: return .green
        case .fair: return .orange
        case .poor: return .red
        }
    }

    private func qualityLevel(_ quality: CallRecord.CallQuality) -> Int {
        switch quality {
        case .excellent: return 4
        case .good: return 3
        case .fair: return 2
        case .poor: return 1
        }
    }

    // MARK: - Actions

    private func handleCallBack() {
        dismiss()
        Task {
            await CallService.shared.initiateCall(
                conversationId: record.call.conversationId,
                type: record.call.type,
                recipientName: record.call.userName,
                recipientAvatar: record.call.userAvatar
            )
        }
    }

    private func handleMessage() {
        dismiss()
        // TODO: Navigate to chat with user
        NotificationCenter.default.post(
            name: .openConversation,
            object: nil,
            userInfo: ["userId": record.call.userId]
        )
    }

    private func handleDelete() {
        dismiss()
        Task {
            // TODO: Delete call record
            print("Deleting call record: \(record.id)")
        }
    }
}

// MARK: - Detail Row

struct DetailRow: View {
    let icon: String
    let label: String
    let value: String
    var iconColor: Color = .blue

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(iconColor)
                .frame(width: 24)

            Text(label)
                .foregroundColor(.secondary)

            Spacer()

            Text(value)
                .foregroundColor(.primary)
        }
    }
}

// Preview removed - CallDetailsView uses @Environment(\.dismiss) which cannot be initialized in previews
