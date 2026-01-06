//
//  CallRowView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct CallRowView: View {
    let record: CallRecord
    @State private var showDetails = false

    var body: some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 44, height: 44)

                Text(initials)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
            }

            // Call info
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(record.call.userName)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.primary)

                    Image(systemName: record.call.type.iconName)
                        .font(.system(size: 12))
                        .foregroundColor(.gray)

                    if record.isFavorite {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.yellow)
                    }
                }

                HStack(spacing: 6) {
                    Image(systemName: record.call.direction.iconName)
                        .font(.system(size: 12))
                        .foregroundColor(directionColor)

                    Text(record.call.timestampFormatted)
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Info button
            Button {
                showDetails = true
            } label: {
                Image(systemName: "info.circle")
                    .font(.system(size: 20))
                    .foregroundColor(.blue)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 8)
        .frame(minHeight: 68)
        .contentShape(Rectangle())
        .onTapGesture {
            handleCallBack()
        }
        .sheet(isPresented: $showDetails) {
            CallDetailsView(record: record)
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

    // MARK: - Actions

    private func handleCallBack() {
        Task {
            await CallService.shared.initiateCall(
                conversationId: record.call.conversationId,
                type: record.call.type,
                recipientName: record.call.userName,
                recipientAvatar: record.call.userAvatar
            )
        }
    }
}

#Preview {
    List {
        CallRowView(
            record: CallRecord(
                id: "1",
                call: Call(
                    id: "call1",
                    callUUID: UUID(),
                    userId: "user1",
                    userName: "Alice Johnson",
                    userAvatar: nil,
                    type: .video,
                    direction: .outgoing,
                    state: .ended,
                    startTime: Date().addingTimeInterval(-3600),
                    endTime: Date().addingTimeInterval(-2850),
                    duration: 750
                ),
                isFavorite: false,
                quality: .excellent
            )
        )

        CallRowView(
            record: CallRecord(
                id: "2",
                call: Call(
                    id: "call2",
                    callUUID: UUID(),
                    userId: "user2",
                    userName: "Bob Smith",
                    userAvatar: nil,
                    type: .audio,
                    direction: .missed,
                    state: .ended,
                    startTime: Date().addingTimeInterval(-7200),
                    endTime: nil,
                    duration: nil
                ),
                isFavorite: false,
                quality: nil
            )
        )

        CallRowView(
            record: CallRecord(
                id: "3",
                call: Call(
                    id: "call3",
                    callUUID: UUID(),
                    userId: "user3",
                    userName: "Charlie Davis",
                    userAvatar: nil,
                    type: .audio,
                    direction: .incoming,
                    state: .ended,
                    startTime: Date().addingTimeInterval(-86400),
                    endTime: Date().addingTimeInterval(-86100),
                    duration: 300
                ),
                isFavorite: true,
                quality: .good
            )
        )
    }
}
