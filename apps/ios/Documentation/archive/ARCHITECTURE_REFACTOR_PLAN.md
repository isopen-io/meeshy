# iOS Architecture Refactoring Plan

## 🎯 Goal: Clean, Scalable iOS Architecture

### Current Problems
1. ❌ Models scattered in multiple locations (Core/Models + API/Auth)
2. ❌ Old model files in API/Auth still on disk causing duplicates
3. ❌ API layer mixing concerns (has models + networking)
4. ❌ Duplicate type definitions (ConversationType, Language, etc.)
5. ❌ Poor separation of concerns

### Target Architecture

```
Meeshy/
├── Models/                          ← ✅ SINGLE source of truth for ALL models
│   ├── Core/
│   │   ├── User.swift
│   │   ├── Message.swift
│   │   ├── Conversation.swift
│   │   └── ...all 36 models
│   ├── Enums/
│   │   ├── MessageType.swift
│   │   ├── ConversationType.swift
│   │   └── ...all enums
│   └── DTOs/                        ← Request/Response types
│       ├── AuthDTOs.swift
│       ├── MessageDTOs.swift
│       └── ...
│
├── Networking/                      ← ✅ Pure networking layer
│   ├── Core/
│   │   ├── APIClient.swift          ← HTTP client
│   │   ├── NetworkMonitor.swift
│   │   └── RequestLogger.swift
│   ├── Endpoints/
│   │   ├── AuthEndpoints.swift
│   │   ├── MessageEndpoints.swift
│   │   └── ...
│   ├── WebSocket/
│   │   └── WebSocketManager.swift
│   └── Errors/
│       └── NetworkError.swift
│
├── Services/                        ← ✅ Business logic layer
│   ├── Authentication/
│   │   ├── AuthenticationService.swift
│   │   └── KeychainService.swift
│   ├── Messaging/
│   │   └── MessageService.swift
│   ├── Cache/
│   │   ├── CacheService.swift
│   │   └── OfflineQueueService.swift
│   └── ...
│
├── Repositories/                    ← ✅ Data access layer
│   ├── UserRepository.swift
│   ├── MessageRepository.swift
│   └── ConversationRepository.swift
│
├── ViewModels/                      ← ✅ MVVM ViewModels
│   ├── AuthViewModel.swift
│   ├── ChatViewModel.swift
│   └── ...
│
├── Views/                           ← ✅ SwiftUI Views
│   ├── Authentication/
│   ├── Chat/
│   ├── Conversations/
│   └── ...
│
├── Core/                            ← ✅ Utilities & Extensions
│   ├── Extensions/
│   ├── Utils/
│   ├── Logging/
│   └── Analytics/
│
└── Configuration/
    ├── Environment.swift
    └── AppConfiguration.swift
```

## 📋 Refactoring Steps

### Phase 1: Clean Old Files (Remove duplicates from disk)
- Delete all old model files in `Meeshy/API/Auth/`
- Keep only AuthenticationManager.swift and KeychainManager.swift

### Phase 2: Consolidate Models
- All models stay in `Meeshy/Models/Core/`
- Move DTOs to `Meeshy/Models/DTOs/`
- Extract all enums to `Meeshy/Models/Enums/`

### Phase 3: Restructure API → Networking
- Rename `Meeshy/API/` to `Meeshy/Networking/`
- Remove all model definitions from networking layer
- Keep only APIClient, Endpoints, WebSocket

### Phase 4: Create Services Layer
- Move `AuthenticationManager` to `Services/Authentication/`
- Move business logic from API to Services
- Create proper service interfaces

### Phase 5: Fix All Type Ambiguities
- Ensure each type defined in ONE place only
- Fix import statements
- Remove duplicates

### Phase 6: Update Xcode Project
- Update file references
- Update folder structure
- Clean build

## 🚀 Benefits

✅ **Single Responsibility**: Each layer has one job
✅ **Testability**: Services can be mocked easily
✅ **Maintainability**: Clear where code belongs
✅ **Scalability**: Easy to add new features
✅ **Standard iOS Pattern**: Follows industry best practices
✅ **No Ambiguities**: Each type defined once

## 📝 Implementation Order

1. Delete old duplicate files from disk
2. Create proper folder structure
3. Move files to correct locations
4. Update imports
5. Fix Xcode project references
6. Build and test
