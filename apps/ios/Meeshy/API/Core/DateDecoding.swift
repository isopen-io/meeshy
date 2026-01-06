//
//  DateDecoding.swift
//  Meeshy
//
//  Custom date decoding strategy for ISO8601 dates with and without fractional seconds
//  The API returns dates in format: "2025-11-26T10:30:45.123Z" (with milliseconds)
//  but Swift's standard .iso8601 decoder doesn't handle fractional seconds
//

import Foundation

// MARK: - Date Decoding Strategy

extension JSONDecoder.DateDecodingStrategy {
    /// Custom ISO8601 date decoding strategy that handles fractional seconds
    /// Tries formats in order:
    /// 1. ISO8601 with fractional seconds (e.g., "2025-11-26T10:30:45.123Z")
    /// 2. Standard ISO8601 (e.g., "2025-11-26T10:30:45Z")
    static var iso8601WithFractionalSeconds: JSONDecoder.DateDecodingStrategy {
        .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Use thread-safe date parser
            if let date = ISO8601DateParser.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date string: \(dateString)"
            )
        }
    }
}

// MARK: - Date Encoding Strategy

extension JSONEncoder.DateEncodingStrategy {
    /// Custom ISO8601 date encoding strategy with fractional seconds
    static var iso8601WithFractionalSeconds: JSONEncoder.DateEncodingStrategy {
        .custom { date, encoder in
            var container = encoder.singleValueContainer()
            let dateString = ISO8601DateParser.string(from: date)
            try container.encode(dateString)
        }
    }
}

// MARK: - ISO8601 Date Parsing

/// Thread-safe ISO8601 date parsing utility
enum ISO8601DateParser {
    /// Parse a date string that may or may not have fractional seconds
    static func date(from string: String) -> Date? {
        // Try with fractional seconds first (most common from API)
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: string) {
            return date
        }

        // Try standard ISO8601
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        if let date = standard.date(from: string) {
            return date
        }

        // Try without timezone
        let noTimezone = DateFormatter()
        noTimezone.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        noTimezone.locale = Locale(identifier: "en_US_POSIX")
        noTimezone.timeZone = TimeZone(secondsFromGMT: 0)
        if let date = noTimezone.date(from: string) {
            return date
        }

        return nil
    }

    /// Format a date to ISO8601 string with fractional seconds
    static func string(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
