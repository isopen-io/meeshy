# Client Identification Headers — Design

**Goal:** Enrichir chaque requête iOS avec des headers d'identification client (app, device, OS, locale, géolocalisation) afin de centraliser analytics, logging structuré et persistance en DB sans friction UX.

**Architecture:** Approche 1 — `User-Agent` enrichi + headers `X-Meeshy-*` nommés individuellement. Le SDK collecte les infos côté device, le gateway middleware les parse, les loggue via Pino et les persiste dans `UserSession`/`User` (champs existants, zéro migration).

**Tech Stack:** Swift (`UIKit`, `CoreLocation`, `CLGeocoder`, `sysctlbyname`), Fastify preHandler hook, Prisma/MongoDB (champs existants).

---

## Section 1 — iOS SDK

### Nouveau fichier : `ClientInfoProvider.swift`

`actor ClientInfoProvider` — collecte thread-safe, lazy init, cache géo 1h.

**Infos collectées sans permission (APIs système) :**

| Header | Source Swift | Exemple |
|--------|-------------|---------|
| `User-Agent` | `Bundle` + `UIDevice` | `Meeshy-iOS/1.0.0 (42) iOS/17.5.1 iPhone16,1` |
| `X-Meeshy-Version` | `Bundle.main.infoDictionary["CFBundleShortVersionString"]` | `1.0.0` |
| `X-Meeshy-Build` | `Bundle.main.infoDictionary["CFBundleVersion"]` | `42` |
| `X-Meeshy-Platform` | Constante | `ios` |
| `X-Meeshy-Device` | `sysctlbyname("hw.machine")` | `iPhone16,1` |
| `X-Meeshy-OS` | `UIDevice.current.systemVersion` | `17.5.1` |
| `X-Meeshy-Locale` | `Locale.current.identifier` (BCP 47) | `fr-FR` |
| `X-Meeshy-Timezone` | `TimeZone.current.identifier` | `Europe/Paris` |
| `X-Meeshy-Country` | `Locale.current.region?.identifier` | `FR` |

**Géolocalisation conditionnelle (CoreLocation, si permission accordée) :**

- Vérifie `CLLocationManager.authorizationStatus` == `.authorizedWhenInUse` ou `.authorizedAlways`
- Si accordé : `CLGeocoder().reverseGeocodeLocation(CLLocationManager().location)` → `CLPlacemark`
- Extrait ville (`locality`) et région (`administrativeArea`)
- Cache résultat 1h (évite appels répétés)
- Fallback : rien envoyé si permission refusée (headers absents = valeur inconnue côté gateway)

| Header (si permission) | Source | Exemple |
|------------------------|--------|---------|
| `X-Meeshy-City` | `CLPlacemark.locality` | `Paris` |
| `X-Meeshy-Region` | `CLPlacemark.administrativeArea` | `Île-de-France` |

**Interface publique :**
```swift
actor ClientInfoProvider {
    static let shared = ClientInfoProvider()
    func buildHeaders() async -> [String: String]
}
```

### Modification : `APIClient.swift` `request()`

Au début de `request()`, avant de construire `URLRequest` :
```swift
let clientHeaders = await ClientInfoProvider.shared.buildHeaders()
clientHeaders.forEach { urlRequest.setValue($1, forHTTPHeaderField: $0) }
```

---

## Section 2 — Gateway Middleware

### Nouveau fichier : `services/gateway/src/middleware/client-info.ts`

Fastify `preHandler` hook **global** (ajouté dans `server.ts`) :

```typescript
interface ClientInfo {
  appVersion?: string;
  appBuild?: string;
  platform?: string;
  device?: string;
  osVersion?: string;
  locale?: string;
  timezone?: string;
  country?: string;
  city?: string;
  region?: string;
  userAgent?: string;
  ipAddress?: string;  // extrait de request.ip (Fastify natif)
}
```

- Parse tous les `x-meeshy-*` headers + `user-agent` + `request.ip`
- Attache `request.clientInfo` via augmentation `FastifyRequest`
- Enrichit le child logger : `request.log = request.log.child({ client: clientInfo })`
- Chaque log suivant (auth, messages, etc.) inclut automatiquement le contexte client

---

## Section 3 — Persistance (zéro migration)

Les champs existent déjà dans le schéma Prisma. Il suffit de les alimenter.

### `UserSession` (lors du login/register) :

| Champ Prisma | Source `clientInfo` |
|-------------|---------------------|
| `osName` | `"iOS"` (platform = ios) |
| `osVersion` | `clientInfo.osVersion` |
| `deviceModel` | `clientInfo.device` |
| `deviceVendor` | `"Apple"` (platform = ios) |
| `isMobile` | `true` (platform = ios) |
| `userAgent` | `clientInfo.userAgent` |
| `country` | `clientInfo.country` |
| `city` | `clientInfo.city` |
| `timezone` | `clientInfo.timezone` |
| `ipAddress` | `clientInfo.ipAddress` |
| `location` | `"${city}, ${country}"` (si les deux présents) |

### `User` (lors du login) :

| Champ Prisma | Valeur |
|-------------|--------|
| `lastLoginDevice` | `clientInfo.userAgent` |
| `lastLoginLocation` | `"${city}, ${country}"` (si disponibles) |
| `lastLoginIp` | `clientInfo.ipAddress` |

**Fichiers gateway à modifier :**
- `services/gateway/src/routes/auth/login.ts` — alimenter champs `UserSession` + `User`
- `services/gateway/src/routes/auth/register.ts` — alimenter `registrationDevice`, `registrationLocation`, `registrationCountry` sur `User`
- `services/gateway/src/server.ts` — enregistrer le hook global `client-info`

---

## Contraintes & Décisions

- **IP non envoyée par le client** : le gateway la lit via `request.ip` (Fastify natif, compatible Traefik `X-Forwarded-For`)
- **Headers absents = valeur ignorée** : aucun header n'est obligatoire, le middleware dégrade gracieusement
- **Cache géo 1h** : évite les appels `CLGeocoder` répétés (quota Apple + performance)
- **`actor` Swift** : thread-safety garantie sans locks manuels
- **PII** : ville + pays considérés comme PII léger — logger Pino utilise la redaction existante pour les champs sensibles
