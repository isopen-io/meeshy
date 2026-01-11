//
//  CategoryEndpoints.swift
//  Meeshy
//
//  Category API endpoints for user conversation categories
//  Base path: /api/user-preferences/categories
//

import Foundation

enum CategoryEndpoints: APIEndpoint, Sendable {

    /// GET /api/user-preferences/categories - List all categories
    case fetchCategories

    /// GET /api/user-preferences/categories/:categoryId - Get a single category
    case fetchCategory(id: String)

    /// POST /api/user-preferences/categories - Create a category
    case createCategory(UserConversationCategoryCreateRequest)

    /// PATCH /api/user-preferences/categories/:categoryId - Update a category
    case updateCategory(id: String, UserConversationCategoryUpdateRequest)

    /// DELETE /api/user-preferences/categories/:categoryId - Delete a category
    case deleteCategory(id: String)

    /// POST /api/user-preferences/categories/reorder - Reorder categories
    case reorderCategories(UserConversationCategoryReorderRequest)

    var path: String {
        switch self {
        case .fetchCategories:
            return "\(EnvironmentConfig.apiPath)/user-preferences/categories"
        case .fetchCategory(let id):
            return "\(EnvironmentConfig.apiPath)/user-preferences/categories/\(id)"
        case .createCategory:
            return "\(EnvironmentConfig.apiPath)/user-preferences/categories"
        case .updateCategory(let id, _):
            return "\(EnvironmentConfig.apiPath)/user-preferences/categories/\(id)"
        case .deleteCategory(let id):
            return "\(EnvironmentConfig.apiPath)/user-preferences/categories/\(id)"
        case .reorderCategories:
            return "\(EnvironmentConfig.apiPath)/user-preferences/categories/reorder"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .fetchCategories, .fetchCategory:
            return .get
        case .createCategory, .reorderCategories:
            return .post
        case .updateCategory:
            return .patch
        case .deleteCategory:
            return .delete
        }
    }

    var queryParameters: [String: Any]? {
        return nil
    }

    var body: Encodable? {
        switch self {
        case .createCategory(let request):
            return request
        case .updateCategory(_, let request):
            return request
        case .reorderCategories(let request):
            return request
        default:
            return nil
        }
    }
}

// MARK: - Response Types

struct CategoryListResponse: Codable {
    let categories: [UserConversationCategory]
    let total: Int
}
