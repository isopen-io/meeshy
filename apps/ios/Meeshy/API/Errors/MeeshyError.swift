//
//  MeeshyError.swift
//  Meeshy
//
//  Comprehensive typed error system with user-facing messages
//

import Foundation

// MARK: - Meeshy Error

enum MeeshyError: LocalizedError {
    case network(NetworkError)
    case auth(AuthError)
    case validation(ValidationError)
    case message(MessageError)
    case conversation(ConversationError)
    case attachment(AttachmentError)
    case webSocket(WebSocketError)
    case cache(CacheError)
    case unknown

    // MARK: - Error Description

    var errorDescription: String? {
        switch self {
        case .network(let error):
            return error.errorDescription
        case .auth(let error):
            return error.errorDescription
        case .validation(let error):
            return error.errorDescription
        case .message(let error):
            return error.errorDescription
        case .conversation(let error):
            return error.errorDescription
        case .attachment(let error):
            return error.errorDescription
        case .webSocket(let error):
            return error.errorDescription
        case .cache(let error):
            return error.errorDescription
        case .unknown:
            return "An unknown error occurred. Please try again."
        }
    }

    // MARK: - Recovery Suggestion

    var recoverySuggestion: String? {
        switch self {
        case .network(let error):
            return error.recoverySuggestion
        case .auth(let error):
            return error.recoverySuggestion
        case .validation(let error):
            return error.recoverySuggestion
        case .message(let error):
            return error.recoverySuggestion
        case .conversation(let error):
            return error.recoverySuggestion
        case .attachment(let error):
            return error.recoverySuggestion
        case .webSocket(let error):
            return error.recoverySuggestion
        case .cache(let error):
            return error.recoverySuggestion
        case .unknown:
            return "If the problem persists, please contact support."
        }
    }

    // MARK: - Should Retry

    var shouldRetry: Bool {
        switch self {
        case .network(let error):
            return error.shouldRetry
        case .auth(.tokenExpired):
            return true
        case .webSocket(.disconnected):
            return true
        default:
            return false
        }
    }

    // MARK: - Is Critical

    var isCritical: Bool {
        switch self {
        case .auth(.invalidCredentials), .auth(.accountLocked):
            return true
        case .network(.serverError):
            return true
        default:
            return false
        }
    }
}

// MARK: - Network Error

enum NetworkError: LocalizedError {
    case noConnection
    case timeout
    case invalidRequest
    case invalidResponse
    case invalidURL
    case notFound
    case serverError(Int)
    case rateLimited
    case cancelled
    case decodingFailed
    case unknown

    var errorDescription: String? {
        switch self {
        case .noConnection:
            return "No internet connection available."
        case .timeout:
            return "The request timed out. Please try again."
        case .invalidRequest:
            return "Invalid request. Please check your input."
        case .invalidResponse:
            return "Received an invalid response from the server."
        case .invalidURL:
            return "The request URL is invalid."
        case .notFound:
            return "The requested resource was not found."
        case .serverError(let code):
            return "Server error (\(code)). Please try again later."
        case .rateLimited:
            return "Too many requests. Please slow down."
        case .cancelled:
            return "The request was cancelled."
        case .decodingFailed:
            return "Failed to process the server response."
        case .unknown:
            return "A network error occurred."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .noConnection:
            return "Please check your internet connection and try again."
        case .timeout:
            return "Check your connection and try again. If the problem persists, the server may be experiencing issues."
        case .invalidRequest:
            return "Please verify your information and try again."
        case .rateLimited:
            return "Please wait a moment before trying again."
        case .serverError:
            return "Our servers are experiencing issues. Please try again in a few moments."
        default:
            return "Please try again. If the problem persists, contact support."
        }
    }

    var shouldRetry: Bool {
        switch self {
        case .timeout, .serverError, .unknown:
            return true
        default:
            return false
        }
    }
}

// MARK: - Auth Error

enum AuthError: LocalizedError {
    case invalidCredentials
    case tokenExpired
    case tokenInvalid
    case unauthorized
    case accountLocked
    case twoFactorRequired
    case twoFactorInvalid
    case registrationFailed(String)
    case passwordResetFailed

    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid username or password."
        case .tokenExpired:
            return "Your session has expired."
        case .tokenInvalid:
            return "Invalid authentication token."
        case .unauthorized:
            return "You don't have permission to perform this action."
        case .accountLocked:
            return "Your account has been locked."
        case .twoFactorRequired:
            return "Two-factor authentication is required."
        case .twoFactorInvalid:
            return "Invalid two-factor authentication code."
        case .registrationFailed(let reason):
            return "Registration failed: \(reason)"
        case .passwordResetFailed:
            return "Password reset failed."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .invalidCredentials:
            return "Please check your credentials and try again."
        case .tokenExpired:
            return "Please log in again to continue."
        case .tokenInvalid:
            return "Please log in again to continue."
        case .unauthorized:
            return "Contact your administrator if you believe you should have access."
        case .accountLocked:
            return "Please contact support to unlock your account."
        case .twoFactorRequired:
            return "Enter your two-factor authentication code to continue."
        case .twoFactorInvalid:
            return "Please check your code and try again."
        case .registrationFailed:
            return "Please review the error and try again."
        case .passwordResetFailed:
            return "Please try resetting your password again."
        }
    }
}

// MARK: - Validation Error

enum ValidationError: LocalizedError {
    case invalidInput
    case missingField(String)
    case invalidEmail
    case invalidPhoneNumber
    case passwordTooWeak
    case passwordMismatch
    case usernameTaken
    case emailTaken
    case custom(String)

    var errorDescription: String? {
        switch self {
        case .invalidInput:
            return "Invalid input provided."
        case .missingField(let field):
            return "\(field) is required."
        case .invalidEmail:
            return "Invalid email address."
        case .invalidPhoneNumber:
            return "Invalid phone number."
        case .passwordTooWeak:
            return "Password is too weak."
        case .passwordMismatch:
            return "Passwords do not match."
        case .usernameTaken:
            return "Username is already taken."
        case .emailTaken:
            return "Email is already registered."
        case .custom(let message):
            return message
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .missingField:
            return "Please fill in all required fields."
        case .invalidEmail:
            return "Please enter a valid email address."
        case .invalidPhoneNumber:
            return "Please enter a valid phone number."
        case .passwordTooWeak:
            return "Use at least 8 characters with letters, numbers, and symbols."
        case .passwordMismatch:
            return "Please ensure both passwords match."
        case .usernameTaken, .emailTaken:
            return "Please choose a different one."
        default:
            return "Please review your input and try again."
        }
    }
}

// MARK: - Message Error

enum MessageError: LocalizedError {
    case sendFailed
    case editFailed
    case deleteFailed
    case messageNotFound
    case translationFailed
    case reactionFailed
    case contentTooLong
    case attachmentRequired

    var errorDescription: String? {
        switch self {
        case .sendFailed:
            return "Failed to send message."
        case .editFailed:
            return "Failed to edit message."
        case .deleteFailed:
            return "Failed to delete message."
        case .messageNotFound:
            return "Message not found."
        case .translationFailed:
            return "Failed to translate message."
        case .reactionFailed:
            return "Failed to add reaction."
        case .contentTooLong:
            return "Message content is too long."
        case .attachmentRequired:
            return "At least one attachment is required."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .sendFailed:
            return "Your message will be sent when connection is restored."
        case .contentTooLong:
            return "Please shorten your message and try again."
        default:
            return "Please try again."
        }
    }
}

// MARK: - Conversation Error

enum ConversationError: LocalizedError {
    case creationFailed
    case updateFailed
    case deleteFailed
    case notFound
    case alreadyExists
    case invalidParticipants
    case permissionDenied

    var errorDescription: String? {
        switch self {
        case .creationFailed:
            return "Failed to create conversation."
        case .updateFailed:
            return "Failed to update conversation."
        case .deleteFailed:
            return "Failed to delete conversation."
        case .notFound:
            return "Conversation not found."
        case .alreadyExists:
            return "A conversation with these participants already exists."
        case .invalidParticipants:
            return "Invalid participants selected."
        case .permissionDenied:
            return "You don't have permission to modify this conversation."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .invalidParticipants:
            return "Please select valid participants and try again."
        case .permissionDenied:
            return "Contact the conversation owner for permission."
        default:
            return "Please try again."
        }
    }
}

// MARK: - Attachment Error

enum AttachmentError: LocalizedError {
    case uploadFailed
    case downloadFailed
    case deleteFailed
    case fileTooLarge(maxSize: Int)
    case unsupportedFileType
    case corruptedFile
    case notFound

    var errorDescription: String? {
        switch self {
        case .uploadFailed:
            return "Failed to upload file."
        case .downloadFailed:
            return "Failed to download file."
        case .deleteFailed:
            return "Failed to delete file."
        case .fileTooLarge(let maxSize):
            let mbSize = Double(maxSize) / 1_000_000
            return "File is too large. Maximum size is \(String(format: "%.1f", mbSize))MB."
        case .unsupportedFileType:
            return "Unsupported file type."
        case .corruptedFile:
            return "File appears to be corrupted."
        case .notFound:
            return "File not found."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .fileTooLarge:
            return "Please choose a smaller file or compress it."
        case .unsupportedFileType:
            return "Please choose a supported file type (JPEG, PNG, PDF, etc.)."
        case .corruptedFile:
            return "Please try uploading a different file."
        default:
            return "Please try again."
        }
    }
}

// MARK: - WebSocket Error

enum WebSocketError: LocalizedError {
    case connectionFailed
    case disconnected
    case authenticationFailed
    case eventHandlingFailed
    case invalidEvent

    var errorDescription: String? {
        switch self {
        case .connectionFailed:
            return "Failed to establish real-time connection."
        case .disconnected:
            return "Real-time connection lost."
        case .authenticationFailed:
            return "Failed to authenticate WebSocket connection."
        case .eventHandlingFailed:
            return "Failed to process real-time event."
        case .invalidEvent:
            return "Received invalid event data."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .connectionFailed, .disconnected:
            return "Attempting to reconnect..."
        case .authenticationFailed:
            return "Please log in again."
        default:
            return "Your connection will be restored automatically."
        }
    }
}

// MARK: - Cache Error

enum CacheError: LocalizedError {
    case saveFailed
    case loadFailed
    case deleteFailed
    case corruptedData
    case notFound

    var errorDescription: String? {
        switch self {
        case .saveFailed:
            return "Failed to save data to cache."
        case .loadFailed:
            return "Failed to load cached data."
        case .deleteFailed:
            return "Failed to clear cache."
        case .corruptedData:
            return "Cached data is corrupted."
        case .notFound:
            return "No cached data found."
        }
    }

    var recoverySuggestion: String? {
        "The app will fetch fresh data from the server."
    }
}
