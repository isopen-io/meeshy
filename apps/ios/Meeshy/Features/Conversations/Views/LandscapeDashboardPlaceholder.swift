//
//  LandscapeDashboardPlaceholder.swift
//  Meeshy
//
//  Placeholder view for landscape split view when no conversation is selected
//

import SwiftUI

struct LandscapeDashboardPlaceholder: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 60))
                .foregroundColor(.gray.opacity(0.3))
            
            Text("Sélectionnez une conversation")
                .font(.title2)
                .fontWeight(.medium)
                .foregroundColor(.secondary)
            
            Text("ou commencez-en une nouvelle")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}
