//
//  LongTextToFileHelper.swift
//  Meeshy
//
//  Helper for converting long text messages (> 3000 characters) into .txt file attachments.
//  This improves message handling and prevents performance issues with very long texts.
//  iOS 16+
//

import Foundation
import SwiftUI

// MARK: - Long Text Conversion Result

/// Result of converting long text to a file attachment
struct LongTextConversionResult {
    /// The created InputAttachment for the text file
    let attachment: InputAttachment
    /// A short summary message to display instead of the full text
    let summaryMessage: String
    /// The original text that was converted
    let originalText: String
}

// MARK: - Long Text To File Helper

/// Helper class for converting long text messages into file attachments
enum LongTextToFileHelper {

    // MARK: - Constants

    /// Character threshold above which text is converted to a file
    static let characterThreshold: Int = 3000

    /// Maximum characters to show in the summary preview
    private static let summaryPreviewLength: Int = 100

    // MARK: - Public Methods

    /// Checks if the given text exceeds the character threshold
    /// - Parameter text: The text to check
    /// - Returns: True if text should be converted to a file
    static func shouldConvertToFile(_ text: String) -> Bool {
        return text.count > characterThreshold
    }

    /// Returns the character count and whether it exceeds the threshold
    /// - Parameter text: The text to analyze
    /// - Returns: Tuple with count and threshold exceeded status
    static func characterInfo(for text: String) -> (count: Int, exceedsThreshold: Bool) {
        let count = text.count
        return (count, count > characterThreshold)
    }

    /// Converts long text into a .txt file attachment
    /// - Parameters:
    ///   - text: The text content to convert
    ///   - customFileName: Optional custom filename (without extension)
    /// - Returns: A LongTextConversionResult containing the attachment and summary
    /// - Throws: Error if file creation fails
    static func convertToFileAttachment(
        text: String,
        customFileName: String? = nil
    ) throws -> LongTextConversionResult {
        // Generate filename with timestamp
        let timestamp = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        let timestampString = formatter.string(from: timestamp)

        let fileName: String
        if let custom = customFileName, !custom.isEmpty {
            // Sanitize custom filename
            let sanitized = sanitizeFileName(custom)
            fileName = "\(sanitized)_\(timestampString).txt"
        } else {
            fileName = "message_\(timestampString).txt"
        }

        // Create temp file URL
        let tempDirectory = FileManager.default.temporaryDirectory
        let fileURL = tempDirectory.appendingPathComponent(fileName)

        // Write text content to file with UTF-8 encoding
        do {
            try text.write(to: fileURL, atomically: true, encoding: .utf8)
        } catch {
            throw LongTextConversionError.fileWriteFailed(underlyingError: error)
        }

        // Verify file was created
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            throw LongTextConversionError.fileCreationFailed
        }

        // Get file size for metadata
        let fileSize = try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? Int64

        // Create the InputAttachment
        let attachment = InputAttachment(
            id: UUID().uuidString,
            type: .document,
            thumbnail: nil,
            fileName: fileName,
            duration: nil,
            localURL: fileURL
        )

        // Generate summary message
        let summaryMessage = generateSummaryMessage(
            originalText: text,
            fileName: fileName,
            fileSize: fileSize
        )

        return LongTextConversionResult(
            attachment: attachment,
            summaryMessage: summaryMessage,
            originalText: text
        )
    }

    /// Generates a preview of the text for UI display
    /// - Parameters:
    ///   - text: The original text
    ///   - maxLength: Maximum characters to show
    /// - Returns: Truncated text with ellipsis if needed
    static func generatePreview(_ text: String, maxLength: Int = 50) -> String {
        if text.count <= maxLength {
            return text
        }
        let endIndex = text.index(text.startIndex, offsetBy: maxLength)
        return String(text[..<endIndex]) + "..."
    }

    // MARK: - Private Methods

    /// Generates a summary message for the converted text
    private static func generateSummaryMessage(
        originalText: String,
        fileName: String,
        fileSize: Int64?
    ) -> String {
        let characterCount = originalText.count
        let wordCount = originalText.split(separator: " ").count
        let lineCount = originalText.components(separatedBy: .newlines).count

        // Format file size if available
        var sizeString = ""
        if let size = fileSize {
            sizeString = " (\(formatFileSize(size)))"
        }

        // Create preview from first line or first 100 characters
        let preview = generatePreview(originalText, maxLength: summaryPreviewLength)

        return "Document texte\(sizeString)\n\(characterCount) caracteres, \(wordCount) mots\n\n\"\(preview)\""
    }

    /// Formats file size in human-readable format
    private static func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    /// Sanitizes a filename by removing invalid characters
    private static func sanitizeFileName(_ name: String) -> String {
        // Remove characters that are invalid in filenames
        let invalidCharacters = CharacterSet(charactersIn: "/\\?%*|\"<>:")
        let sanitized = name.components(separatedBy: invalidCharacters).joined()

        // Limit length
        let maxLength = 50
        if sanitized.count > maxLength {
            return String(sanitized.prefix(maxLength))
        }

        return sanitized.isEmpty ? "document" : sanitized
    }
}

// MARK: - Errors

/// Errors that can occur during long text conversion
enum LongTextConversionError: LocalizedError {
    case fileWriteFailed(underlyingError: Error)
    case fileCreationFailed

    var errorDescription: String? {
        switch self {
        case .fileWriteFailed(let error):
            return "Impossible d'ecrire le fichier: \(error.localizedDescription)"
        case .fileCreationFailed:
            return "Impossible de creer le fichier texte"
        }
    }
}

// MARK: - Character Counter State

/// State object for tracking character count in text input
struct CharacterCountState {
    let count: Int
    let threshold: Int
    let exceedsThreshold: Bool

    /// Progress from 0 to 1 (and beyond if over threshold)
    var progress: Double {
        return Double(count) / Double(threshold)
    }

    /// Percentage of threshold used
    var percentageUsed: Int {
        return Int((Double(count) / Double(threshold)) * 100)
    }

    /// Color to display based on character count
    var indicatorColor: SwiftUI.Color {
        let ratio = Double(count) / Double(threshold)
        if ratio >= 1.0 {
            return .red
        } else if ratio >= 0.9 {
            return .orange
        } else if ratio >= 0.75 {
            return .yellow
        }
        return .clear // Don't show indicator when well under threshold
    }

    /// Whether to show the character counter
    var shouldShowCounter: Bool {
        return Double(count) / Double(threshold) >= 0.75
    }

    /// Formatted character count string
    var formattedCount: String {
        return "\(count)/\(threshold)"
    }

    /// Remaining characters before threshold
    var remainingCharacters: Int {
        return max(0, threshold - count)
    }

    /// Characters over the threshold (0 if under)
    var charactersOverThreshold: Int {
        return max(0, count - threshold)
    }

    init(text: String, threshold: Int = LongTextToFileHelper.characterThreshold) {
        self.count = text.count
        self.threshold = threshold
        self.exceedsThreshold = text.count > threshold
    }
}
