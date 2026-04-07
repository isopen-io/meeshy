# Guide de Dépannage - Problèmes Courants

Solutions aux problèmes les plus fréquents rencontrés lors du développement de Meeshy iOS.

---

## Build Errors

### 1. "No Such Module 'SocketIO'" ou autres dépendances

**Symptômes:**
```
error: No such module 'SocketIO'
error: No such module 'Firebase'
```

**Causes:**
- Swift Package Dependencies pas installés
- Cache corrompu
- Version d'Xcode incompatible

**Solutions:**

```bash
# Solution 1: Reset Package Caches dans Xcode
File → Packages → Reset Package Caches
File → Packages → Resolve Package Versions

# Solution 2: Clean Build et DerivedData
Cmd+Shift+K (Clean Build)
rm -rf ~/Library/Developer/Xcode/DerivedData/Meeshy-*

# Solution 3: Fermer et rouvrir Xcode
# Puis rebuild (Cmd+B)

# Solution 4: Vérifier Xcode version
# Minimum requis: Xcode 15.2+
xcodebuild -version
```

---

### 2. "Command PhaseScriptExecution failed"

**Symptômes:**
```
error: Command PhaseScriptExecution failed with a nonzero exit code
```

**Causes:**
- SwiftLint pas installé
- Script build échoue
- Permissions manquantes

**Solutions:**

```bash
# Installer SwiftLint
brew install swiftlint

# Vérifier l'installation
swiftlint version

# Si ça ne fonctionne pas, désactiver temporairement:
# Dans Xcode: Build Phases → Run Script
# Commenter la ligne: swiftlint

# Donner permissions au script
chmod +x scripts/build.sh
chmod +x scripts/test.sh
```

---

### 3. "GoogleService-Info.plist not found"

**Symptômes:**
```
error: Could not find GoogleService-Info.plist
```

**Causes:**
- Fichier Firebase manquant
- Fichier mal placé

**Solutions:**

```bash
# Solution 1: Télécharger depuis Firebase Console
# Placer dans: Meeshy/GoogleService-Info.plist

# Solution 2: Utiliser le fichier mock pour développement
cp Configuration/Mock/GoogleService-Info.plist Meeshy/

# Solution 3: Vérifier que le fichier est dans le target
# Dans Xcode: File Inspector → Target Membership → Meeshy ✓
```

---

### 4. "Signing for 'Meeshy' requires a development team"

**Symptômes:**
```
error: Signing for "Meeshy" requires a development team
```

**Solutions:**

```bash
# Dans Xcode:
1. Ouvrir Meeshy.xcodeproj
2. Sélectionner le target "Meeshy"
3. Onglet "Signing & Capabilities"
4. Cocher "Automatically manage signing"
5. Sélectionner votre Team
```

---

### 5. Build réussit mais l'app crash au lancement

**Symptômes:**
- Build successful
- App crash immédiatement après lancement

**Causes courantes:**
1. Core Data model manquant
2. Firebase mal configuré
3. Force unwrapping d'un Optional nil

**Solutions:**

```bash
# 1. Vérifier les logs Console (Cmd+Shift+Y)
# Identifier la cause du crash

# 2. Vérifier Core Data model existe
# Doit exister: Meeshy/Core/Persistence/Meeshy.xcdatamodeld

# 3. Vérifier GoogleService-Info.plist
# Doit être présent et valide

# 4. Run avec breakpoint sur exceptions
# Debug → Breakpoints → Create Exception Breakpoint
```

---

## Runtime Issues

### 1. Messages ne s'affichent pas

**Symptômes:**
- Interface vide
- Messages ne chargent pas
- Spinner infini

**Diagnostic:**

```swift
// Vérifier le ViewModel
print("Messages count: \(viewModel.messages.count)")
print("Is loading: \(viewModel.isLoading)")
print("Error: \(viewModel.error)")

// Vérifier l'API
print("API Base URL: \(EnvironmentConfig.shared.apiBaseURL)")
```

**Solutions:**

1. **Vérifier connexion réseau:**
```swift
if NetworkMonitor.shared.isConnected {
    print("Connected")
} else {
    print("Offline - check WiFi/Cellular")
}
```

2. **Vérifier token d'authentification:**
```swift
if let token = KeychainService.shared.getAccessToken() {
    print("Token exists: \(token.prefix(20))...")
} else {
    print("No token - user needs to login")
}
```

3. **Vérifier backend:**
```bash
# Test API endpoint
curl -X GET https://staging.gate.meeshy.me/api/conversations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 2. WebSocket ne se connecte pas

**Symptômes:**
- Pas de messages en temps réel
- Typing indicators ne fonctionnent pas
- Console: "Socket disconnected"

**Diagnostic:**

```swift
// Dans WebSocketService
print("Socket status: \(socket.status)")
print("Socket URL: \(socketURL)")

// Écouter les événements de connexion
socket.on(clientEvent: .connect) { data, ack in
    print("✅ Socket connected")
}

socket.on(clientEvent: .disconnect) { data, ack in
    print("❌ Socket disconnected: \(data)")
}

socket.on(clientEvent: .error) { data, ack in
    print("🔥 Socket error: \(data)")
}
```

**Solutions:**

1. **Vérifier l'URL WebSocket:**
```swift
// Debug: ws://localhost:3000
// Staging: wss://staging.gate.meeshy.me
// Production: wss://gate.meeshy.me
```

2. **Vérifier l'authentification:**
```swift
// Le token doit être envoyé après connexion
socket.on(clientEvent: .connect) { [weak self] data, ack in
    self?.authenticate()
}
```

3. **Vérifier les certificats SSL (Production):**
```swift
// Certificate pinning peut bloquer en dev
// Désactiver temporairement pour debug
```

---

### 3. Images ne chargent pas

**Symptômes:**
- Avatars vides
- Photos de messages ne s'affichent pas
- Placeholder toujours visible

**Solutions:**

1. **Vérifier les URLs:**
```swift
print("Image URL: \(imageURL)")
// Doit commencer par https://
```

2. **Vérifier les permissions réseau:**
```xml
<!-- Info.plist -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/> <!-- Uniquement pour DEBUG -->
</dict>
```

3. **Vérifier Kingfisher cache:**
```swift
// Clear cache pour tester
ImageCache.default.clearMemoryCache()
ImageCache.default.clearDiskCache()
```

4. **Test d'URL directe:**
```swift
// Tester si l'URL est accessible
URLSession.shared.dataTask(with: imageURL) { data, response, error in
    if let error = error {
        print("Error loading image: \(error)")
    } else if let data = data {
        print("Image loaded: \(data.count) bytes")
    }
}.resume()
```

---

### 4. Crash au scroll dans la liste de messages

**Symptômes:**
- App crash lors du scroll rapide
- Console: "Index out of range"

**Causes:**
- Modification du array pendant l'affichage
- Race condition avec async updates

**Solutions:**

```swift
// ❌ BAD: Direct array modification
func addMessage(_ message: Message) {
    messages.append(message)
}

// ✅ GOOD: Thread-safe update
@MainActor
func addMessage(_ message: Message) {
    var newMessages = messages
    newMessages.append(message)
    messages = newMessages
}

// ✅ BETTER: Immutable update
@MainActor
func addMessage(_ message: Message) {
    messages = messages + [message]
}
```

---

### 5. Authentification biométrique ne fonctionne pas

**Symptômes:**
- Face ID / Touch ID prompt ne s'affiche pas
- Erreur "Not available"

**Solutions:**

1. **Vérifier Info.plist:**
```xml
<key>NSFaceIDUsageDescription</key>
<string>Meeshy uses Face ID to secure your account</string>
```

2. **Vérifier sur device réel:**
```bash
# La biométrie ne fonctionne PAS sur simulateur
# Tester sur un iPhone/iPad physique
```

3. **Vérifier support biométrique:**
```swift
import LocalAuthentication

let context = LAContext()
var error: NSError?

if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
    // Biométrie disponible
    print("Biometry type: \(context.biometryType)")
} else {
    print("Biometry not available: \(error?.localizedDescription ?? "Unknown")")
}
```

---

## Network Issues

### 1. "The network connection was lost"

**Solutions:**

```swift
// 1. Implémenter retry logic
func fetchWithRetry<T>(maxAttempts: Int = 3) async throws -> T {
    var attempt = 0
    while attempt < maxAttempts {
        do {
            return try await fetchData()
        } catch {
            attempt += 1
            if attempt >= maxAttempts { throw error }
            try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
        }
    }
    fatalError()
}

// 2. Vérifier timeout
var request = URLRequest(url: url)
request.timeoutInterval = 30 // 30 seconds

// 3. Utiliser le cache en offline
let config = URLSessionConfiguration.default
config.requestCachePolicy = .returnCacheDataElseLoad
```

---

### 2. "SSL Certificate error"

**Symptômes:**
```
Error: SSL certificate problem: unable to get local issuer certificate
```

**Solutions:**

```swift
// 1. Désactiver certificate pinning en DEBUG
#if DEBUG
let certificatePinningEnabled = false
#else
let certificatePinningEnabled = true
#endif

// 2. Vérifier la date/heure du device
// Settings → General → Date & Time → Set Automatically

// 3. Trust le certificat en dev
// Settings → General → About → Certificate Trust Settings
```

---

### 3. "Request timeout"

**Solutions:**

```swift
// 1. Augmenter le timeout
request.timeoutInterval = 60

// 2. Vérifier la connexion
if !NetworkMonitor.shared.isConnected {
    throw APIError.offline
}

// 3. Utiliser un endpoint de test
try await APIService.shared.get("/api/health")
```

---

## Cache & Persistence Issues

### 1. CoreData "No model found"

**Symptômes:**
```
error: No NSEntityDescriptions in any model claim the NSManagedObject subclass
```

**Solutions:**

```bash
# 1. Vérifier que Meeshy.xcdatamodeld existe
ls -la Meeshy/Core/Persistence/

# 2. Vérifier qu'il est dans le target
# Xcode → File Inspector → Target Membership

# 3. Clean et rebuild
rm -rf ~/Library/Developer/Xcode/DerivedData/Meeshy-*
# Puis Cmd+Shift+K et Cmd+B
```

---

### 2. Cache corrompu

**Symptômes:**
- Données incorrectes affichées
- Crash aléatoires
- Incohérences

**Solutions:**

```swift
// 1. Clear cache manuel
CacheService.shared.clearAll()

// 2. Clear cache au lancement (DEBUG)
#if DEBUG
if CommandLine.arguments.contains("--clear-cache") {
    CacheService.shared.clearAll()
}
#endif

// 3. Réinitialiser le simulateur
// Device → Erase All Content and Settings
```

---

## Memory Issues

### 1. Memory Leaks

**Diagnostic:**

```bash
# Utiliser Instruments
Product → Profile → Leaks
```

**Solutions courantes:**

```swift
// ❌ BAD: Retain cycle
class ChatViewModel {
    var onUpdate: (() -> Void)?

    init() {
        socket.on("message") {
            self.onUpdate?() // Strong reference
        }
    }
}

// ✅ GOOD: Weak self
class ChatViewModel {
    var onUpdate: (() -> Void)?

    init() {
        socket.on("message") { [weak self] in
            self?.onUpdate?()
        }
    }
}
```

---

### 2. Memory Warning

**Solutions:**

```swift
// Réagir aux memory warnings
NotificationCenter.default.addObserver(
    forName: UIApplication.didReceiveMemoryWarningNotification,
    object: nil,
    queue: .main
) { _ in
    // Clear caches
    ImageCache.default.clearMemoryCache()
    CacheService.shared.clearMemoryCache()
}
```

---

## Commandes Utiles

### Clean Everything

```bash
# Clean build
cd ios
xcodebuild clean -scheme Meeshy

# Remove DerivedData
rm -rf ~/Library/Developer/Xcode/DerivedData/Meeshy-*

# Remove ModuleCache
rm -rf ~/Library/Developer/Xcode/DerivedData/ModuleCache

# Clear Swift Package cache
rm -rf ~/Library/Caches/org.swift.swiftpm
```

### Reset Simulateur

```bash
# Liste simulateurs
xcrun simctl list devices

# Reset tous les simulateurs
xcrun simctl erase all

# Reset un simulateur spécifique
xcrun simctl erase "iPhone 15 Pro"
```

### Debug Logging

```bash
# Activer logs réseau
defaults write com.apple.dt.Xcode IDEDebuggerNetworkLoggingEnabled YES

# Voir tous les logs système
log stream --predicate 'processImagePath contains "Meeshy"' --level debug
```

---

## Outils de Debug

### 1. Network Link Conditioner

Simuler différentes conditions réseau:

```bash
# Installer (inclus dans Xcode)
# Settings → Developer → Network Link Conditioner

# Profils disponibles:
- WiFi
- 4G / LTE
- 3G
- Edge
- Very Bad Network
```

### 2. Console Logs

```swift
// Logging structuré
import OSLog

let logger = Logger(subsystem: "me.meeshy.app", category: "network")

logger.info("Fetching messages...")
logger.error("Failed to fetch: \(error.localizedDescription)")
logger.debug("Response: \(response)")
```

### 3. Instruments

```bash
# Profile avec Instruments
Product → Profile (Cmd+I)

# Outils utiles:
- Time Profiler (performance)
- Allocations (memory)
- Leaks (memory leaks)
- Network (network activity)
```

---

## Checklist de Dépannage

Avant de demander de l'aide, vérifier:

- [ ] Xcode version 15.2+
- [ ] Swift 5.9+
- [ ] Clean Build (Cmd+Shift+K)
- [ ] DerivedData supprimé
- [ ] Packages résolus (File → Packages → Resolve)
- [ ] GoogleService-Info.plist présent
- [ ] Backend accessible (ping API)
- [ ] Token valide (check Keychain)
- [ ] Network connecté
- [ ] Console logs vérifiés
- [ ] Simulateur reset (si nécessaire)

---

## Besoin d'Aide Supplémentaire?

1. **FAQ:** [FAQ.md](./FAQ.md)
2. **GitHub Issues:** [Ouvrir une issue](/)
3. **Documentation API:** [REST_API.md](../04-API/REST_API.md)
4. **Discord:** [Rejoindre le serveur](/)

---

**Dernière Mise à Jour:** 25 Novembre 2025
