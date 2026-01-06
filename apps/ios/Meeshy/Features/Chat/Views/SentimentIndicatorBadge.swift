//
//  SentimentIndicatorBadge.swift
//  Meeshy
//
//  Subtle sentiment indicator for message bubbles
//

import SwiftUI

/// Compact sentiment badge showing emoji indicator
struct SentimentIndicatorBadge: View {
    let sentiment: SentimentResult
    let isCurrentUser: Bool
    
    var body: some View {
        HStack(spacing: 3) {
            // Sentiment emoji
            Text(sentiment.category.emoji)
                .font(.system(size: 11))
            
            // Optional: show score for high confidence results
            if abs(sentiment.score) > 0.5 {
                Circle()
                    .fill(sentimentColor.opacity(0.8))
                    .frame(width: 4, height: 4)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(
            Capsule()
                .fill(sentimentColor.opacity(0.15))
        )
        .overlay(
            Capsule()
                .strokeBorder(sentimentColor.opacity(0.3), lineWidth: 0.5)
        )
    }
    
    private var sentimentColor: Color {
        switch sentiment.category {
        case .veryPositive:
            return .green
        case .positive:
            return .teal
        case .neutral:
            return .gray
        case .negative:
            return .orange
        case .veryNegative:
            return .red
        case .unknown:
            return .gray
        }
    }
}

/// Minimal sentiment indicator - just emoji
struct SentimentEmojiIndicator: View {
    let sentiment: SentimentResult
    
    var body: some View {
        Text(sentiment.category.emoji)
            .font(.system(size: 12))
            .opacity(0.7)
    }
}

// MARK: - Preview
#Preview("Sentiment Badges") {
    VStack(spacing: 12) {
        // Very Positive
        SentimentIndicatorBadge(
            sentiment: SentimentResult(score: 0.9, category: .veryPositive),
            isCurrentUser: false
        )
        
        // Positive
        SentimentIndicatorBadge(
            sentiment: SentimentResult(score: 0.3, category: .positive),
            isCurrentUser: false
        )
        
        // Neutral
        SentimentIndicatorBadge(
            sentiment: SentimentResult(score: 0.0, category: .neutral),
            isCurrentUser: false
        )
        
        // Negative
        SentimentIndicatorBadge(
            sentiment: SentimentResult(score: -0.3, category: .negative),
            isCurrentUser: true
        )
        
        // Very Negative
        SentimentIndicatorBadge(
            sentiment: SentimentResult(score: -0.8, category: .veryNegative),
            isCurrentUser: true
        )
    }
    .padding()
}
