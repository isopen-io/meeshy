# Client Identification Headers — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrichir chaque requête iOS avec des headers `X-Meeshy-*` (version, device, OS, locale, géo) pour logging structuré Pino, persistance automatique dans `UserSession`/`User` (champs déjà existants), et diagnostics support.

**Architecture:** iOS `ClientInfoProvider` (actor Swift) collecte les infos device + CoreLocation conditionnelle → injectées dans chaque requête `APIClient` → `GeoIPService.ts` gateway enrichit `RequestContext.deviceInfo`/`geoData` depuis les headers → `createSession()` persiste automatiquement (pipeline existant inchangé) → hook `onRequest` Pino loggue le contexte client.

**Tech Stack:** Swift (`UIKit`, `CoreLocation`, `CLGeocoder`, `sysctlbyname`), Fastify `addHook`, `GeoIPService.ts` existant, Jest.

---

### Task 1 : `ClientInfoProvider.swift` — Collecte des infos device iOS

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift`

**Contexte :** Le SDK a `APIClient.swift` dans `Networking/`. Les actors Swift sont thread-safe sans locks manuels. `CLLocationManager` et `CLGeocoder` nécessitent `CoreLocation` (déjà importé via UIKit dans le target). `sysctlbyname("hw.machine")` donne le model ID précis (`iPhone16,1`). La permission CoreLocation est vérifiée passivement — on ne la demande jamais ici.

**Step 1 : Créer le fichier avec l'actor et les méthodes statiques**

```swift
import Foundation
import UIKit
import CoreLocation

public actor ClientInfoProvider {
    public static let shared = ClientInfoProvider()

    private var cachedCity: String?
    private var cachedRegion: String?
    private var geoCacheExpiry: Date = .distantPast

    private init() {}

    // MARK: - Public API

    public func buildHeaders() async -> [String: String] {
        var headers: [String: String] = [:]

        // App identity
        headers["X-Meeshy-Version"] = appVersion()
        headers["X-Meeshy-Build"]   = appBuild()
        headers["X-Meeshy-Platform"] = "ios"

        // Device & OS
        headers["X-Meeshy-Device"] = deviceModel()
        headers["X-Meeshy-OS"]     = await MainActor.run { UIDevice.current.systemVersion }

        // Locale & time
        headers["X-Meeshy-Locale"]   = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
        headers["X-Meeshy-Timezone"] = TimeZone.current.identifier
        if let country = Locale.current.region?.identifier {
            headers["X-Meeshy-Country"] = country
        }

        // User-Agent
        let version = appVersion()
        let build   = appBuild()
        let os      = await MainActor.run { UIDevice.current.systemVersion }
        let model   = deviceModel()
        headers["User-Agent"] = "Meeshy-iOS/\(version) (\(build)) iOS/\(os) \(model)"

        // Geo (only if permission already granted — never request)
        await enrichWithLocation(&headers)

        return headers
    }

    // MARK: - Private helpers

    private func appVersion() -> String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    private func appBuild() -> String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    }

    private func deviceModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { id, element in
            guard let value = element.value as? Int8, value != 0 else { return id }
            return id + String(UnicodeScalar(UInt8(value)))
        }
        return identifier.isEmpty ? "unknown" : identifier
    }

    private func enrichWithLocation(_ headers: inout [String: String]) async {
        // Check permission passively — never trigger a request dialog
        let status = CLLocationManager.authorizationStatus()
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return }

        // Return cached result if still fresh (1h TTL)
        if Date() < geoCacheExpiry, let city = cachedCity {
            headers["X-Meeshy-City"] = city
            if let region = cachedRegion { headers["X-Meeshy-Region"] = region }
            return
        }

        guard let location = CLLocationManager().location else { return }

        do {
            let placemarks = try await CLGeocoder().reverseGeocodeLocation(location)
            if let placemark = placemarks.first {
                cachedCity   = placemark.locality
                cachedRegion = placemark.administrativeArea
                geoCacheExpiry = Date().addingTimeInterval(3600) // 1h

                if let city = cachedCity { headers["X-Meeshy-City"] = city }
                if let region = cachedRegion { headers["X-Meeshy-Region"] = region }
            }
        } catch {
            // Silently ignore geocoding errors — geo headers are optional
        }
    }
}
```

**Step 2 : Vérifier que le fichier compile**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```
Expected: `Build succeeded in Xs`

**Step 3 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift
git commit -m "feat(sdk): ClientInfoProvider actor — collecte headers device/locale/geo"
```

---

### Task 2 : Injecter les headers dans `APIClient.swift`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:119-129`

**Contexte :** `request()` est la méthode centrale — tous les appels HTTP passent par là. `ClientInfoProvider.shared.buildHeaders()` est `async`, ce qui est compatible car `request()` est déjà `async throws`. Les headers fixes (`Authorization`) doivent rester après l'injection des headers client pour ne pas être écrasés.

**Step 1 : Modifier `request()` pour injecter les headers client**

Localiser le bloc autour de la ligne 119 :
```swift
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method

        if let token = authToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
```

Remplacer par :
```swift
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method

        // Client identification headers (version, device, locale, geo)
        let clientHeaders = await ClientInfoProvider.shared.buildHeaders()
        for (key, value) in clientHeaders {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }

        // Authorization overwrites any potential User-Agent conflict
        if let token = authToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
```

**Step 2 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```
Expected: `Build succeeded in Xs`

**Step 3 : Vérification rapide dans les logs simulator**

Lancer l'app et vérifier dans les logs gateway (ou Charles Proxy) qu'une requête contient bien les headers :
```
X-Meeshy-Version: 1.0.0
X-Meeshy-Platform: ios
User-Agent: Meeshy-iOS/1.0.0 (42) iOS/17.5.1 iPhone16,1
```

**Step 4 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift
git commit -m "feat(sdk): injecter X-Meeshy-* headers dans chaque requête APIClient"
```

---

### Task 3 : Enrichir `GeoIPService.ts` avec les headers `X-Meeshy-*`

**Files:**
- Modify: `services/gateway/src/services/GeoIPService.ts`
- Test: `services/gateway/src/__tests__/unit/services/GeoIPService.test.ts` (nouveau)

**Contexte :** `getRequestContext()` est appelé dans `login.ts` et autres routes auth. Il retourne `RequestContext { ip, userAgent, geoData, deviceInfo }`. `createSession()` dans `SessionService.ts` lit directement `deviceInfo` et `geoData` pour peupler `UserSession`. Si on enrichit ces objets ici, la persistance se fait automatiquement sans toucher `AuthService` ni `SessionService`. Les headers `X-Meeshy-*` ont **priorité** sur la déduction UA/IP car ils viennent directement du device.

**Step 1 : Écrire le test (failing)**

Créer `services/gateway/src/__tests__/unit/services/GeoIPService.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRequestContext, mergeClientHeaders } from '../../../services/GeoIPService';

// Mock fetch pour éviter appels réseau
vi.stubGlobal('fetch', vi.fn());

function makeMockRequest(headers: Record<string, string> = {}, ip = '1.2.3.4') {
  return {
    ip,
    headers: {
      'user-agent': 'TestAgent/1.0',
      ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    },
  } as any;
}

describe('GeoIPService — mergeClientHeaders', () => {
  it('enrichit deviceInfo avec les headers X-Meeshy-*', () => {
    const deviceInfo = {
      type: 'mobile', vendor: null, model: null,
      os: null, osVersion: null, browser: null, browserVersion: null,
      isMobile: true, isTablet: false, rawUserAgent: 'Meeshy-iOS/1.0.0',
    };
    const headers = {
      'x-meeshy-device': 'iPhone16,1',
      'x-meeshy-os': '17.5.1',
      'x-meeshy-platform': 'ios',
    };
    const result = mergeClientHeaders(deviceInfo, null, headers);
    expect(result.deviceInfo?.model).toBe('iPhone16,1');
    expect(result.deviceInfo?.osVersion).toBe('17.5.1');
    expect(result.deviceInfo?.vendor).toBe('Apple');
  });

  it('enrichit geoData avec les headers X-Meeshy-Country/City/Timezone', () => {
    const headers = {
      'x-meeshy-country': 'FR',
      'x-meeshy-city': 'Paris',
      'x-meeshy-timezone': 'Europe/Paris',
      'x-meeshy-region': 'Île-de-France',
    };
    const result = mergeClientHeaders(null, null, headers);
    expect(result.geoData?.country).toBe('FR');
    expect(result.geoData?.city).toBe('Paris');
    expect(result.geoData?.timezone).toBe('Europe/Paris');
  });

  it('conserve les valeurs IP quand aucun header geo présent', () => {
    const geoData = {
      ip: '1.2.3.4', country: 'US', countryName: 'United States',
      city: 'New York', region: 'NY', timezone: 'America/New_York',
      location: 'New York, US', latitude: 40.7, longitude: -74.0,
    };
    const result = mergeClientHeaders(null, geoData, {});
    expect(result.geoData?.country).toBe('US');
    expect(result.geoData?.city).toBe('New York');
  });
});
```

**Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && npx vitest run src/__tests__/unit/services/GeoIPService.test.ts 2>&1 | tail -15
```
Expected: FAIL — `mergeClientHeaders is not exported`

**Step 3 : Implémenter `mergeClientHeaders` dans `GeoIPService.ts`**

Ajouter à la fin de `services/gateway/src/services/GeoIPService.ts` :

```typescript
/**
 * Enrichit deviceInfo et geoData depuis les headers X-Meeshy-* envoyés par le client iOS.
 * Les valeurs client ont priorité sur la déduction UA/IP (plus précises).
 */
export function mergeClientHeaders(
  deviceInfo: DeviceInfo | null,
  geoData: GeoIpData | null,
  headers: Record<string, string | string[] | undefined>
): { deviceInfo: DeviceInfo | null; geoData: GeoIpData | null } {
  const get = (key: string): string | null => {
    const val = headers[key.toLowerCase()];
    return typeof val === 'string' ? val : Array.isArray(val) ? val[0] : null;
  };

  const platform  = get('x-meeshy-platform');
  const device    = get('x-meeshy-device');
  const osVersion = get('x-meeshy-os');
  const country   = get('x-meeshy-country');
  const city      = get('x-meeshy-city');
  const timezone  = get('x-meeshy-timezone');
  const region    = get('x-meeshy-region');

  // Enrichir deviceInfo si headers présents
  let enrichedDevice = deviceInfo;
  if (platform || device || osVersion) {
    const isIos = platform === 'ios';
    enrichedDevice = {
      ...(deviceInfo ?? {
        type: 'mobile', vendor: null, model: null,
        os: null, osVersion: null, browser: null, browserVersion: null,
        isMobile: true, isTablet: false, rawUserAgent: '',
      }),
      ...(device    ? { model: device }        : {}),
      ...(osVersion ? { osVersion }             : {}),
      ...(isIos     ? { os: 'iOS', vendor: 'Apple', type: 'mobile', isMobile: true } : {}),
    };
  }

  // Enrichir geoData si headers présents
  let enrichedGeo = geoData;
  if (country || city || timezone) {
    enrichedGeo = {
      ...(geoData ?? {
        ip: '', country: null, countryName: null,
        city: null, region: null, timezone: null, location: null,
        latitude: null, longitude: null,
      }),
      ...(country  ? { country }  : {}),
      ...(city     ? { city }     : {}),
      ...(timezone ? { timezone } : {}),
      ...(region   ? { region }   : {}),
      location: city && country ? `${city}, ${country}` : (geoData?.location ?? null),
    };
  }

  return { deviceInfo: enrichedDevice, geoData: enrichedGeo };
}
```

**Step 4 : Appeler `mergeClientHeaders` dans `getRequestContext()`**

Trouver la fonction `getRequestContext` et modifier le return :

```typescript
// AVANT
export async function getRequestContext(request: FastifyRequest): Promise<RequestContext> {
  const ip = extractIpFromRequest(request);
  const userAgent = extractUserAgent(request);
  const geoData = await lookupGeoIp(ip);
  const deviceInfo = parseUserAgent(userAgent);

  return { ip, userAgent, geoData, deviceInfo };
}

// APRÈS
export async function getRequestContext(request: FastifyRequest): Promise<RequestContext> {
  const ip = extractIpFromRequest(request);
  const userAgent = extractUserAgent(request);
  const geoData = await lookupGeoIp(ip);
  const deviceInfo = parseUserAgent(userAgent);

  // Priorité aux données envoyées par le client (X-Meeshy-*) sur la déduction UA/IP
  const { deviceInfo: enrichedDevice, geoData: enrichedGeo } =
    mergeClientHeaders(deviceInfo, geoData, request.headers);

  return { ip, userAgent, geoData: enrichedGeo, deviceInfo: enrichedDevice };
}
```

**Step 5 : Lancer les tests**

```bash
cd services/gateway && npx vitest run src/__tests__/unit/services/GeoIPService.test.ts 2>&1 | tail -15
```
Expected: PASS — 3 tests passing

**Step 6 : Commit**

```bash
git add services/gateway/src/services/GeoIPService.ts \
        services/gateway/src/__tests__/unit/services/GeoIPService.test.ts
git commit -m "feat(gateway): enrichir RequestContext depuis headers X-Meeshy-* (device + geo)"
```

---

### Task 4 : Hook global Pino — logger enrichi avec contexte client

**Files:**
- Modify: `services/gateway/src/server.ts`

**Contexte :** Fastify supporte `addHook('onRequest', handler)` pour intercepter toutes les requêtes. Le logger Pino de chaque request est accessible via `request.log`. Créer un child logger avec `request.log.child({ client: ... })` est la façon standard d'enrichir les logs sans toucher chaque route. L'hook doit être enregistré **après** le rate limiter (ligne ~601) et **avant** les routes.

**Step 1 : Ajouter le hook dans `server.ts`**

Trouver le bloc après `registerGlobalRateLimiter` :
```typescript
    await registerGlobalRateLimiter(this.server);
    logger.info('✅ Global rate limiter configured (300 req/min per IP)');
```

Ajouter juste après :
```typescript
    // Client identification logging — enrichit le logger Pino avec version/device/geo client
    this.server.addHook('onRequest', (request, _reply, done) => {
      const get = (key: string): string | undefined => {
        const val = request.headers[key];
        return typeof val === 'string' ? val : undefined;
      };
      const clientContext = {
        appVersion : get('x-meeshy-version'),
        appBuild   : get('x-meeshy-build'),
        platform   : get('x-meeshy-platform'),
        device     : get('x-meeshy-device'),
        osVersion  : get('x-meeshy-os'),
        locale     : get('x-meeshy-locale'),
        timezone   : get('x-meeshy-timezone'),
        country    : get('x-meeshy-country'),
        city       : get('x-meeshy-city'),
        region     : get('x-meeshy-region'),
      };
      // Supprimer les clés undefined pour garder les logs propres
      const client = Object.fromEntries(
        Object.entries(clientContext).filter(([, v]) => v !== undefined)
      );
      if (Object.keys(client).length > 0) {
        (request as any).log = request.log.child({ client });
      }
      done();
    });
    logger.info('✅ Client identification hook registered');
```

**Step 2 : Build gateway**

```bash
cd services/gateway && npx tsc --noEmit 2>&1 | tail -10
```
Expected: No errors

**Step 3 : Vérification manuelle**

Lancer le gateway en local et faire une requête avec les headers. Chercher dans les logs :
```json
{ "client": { "appVersion": "1.0.0", "platform": "ios", "country": "FR", ... } }
```

**Step 4 : Commit**

```bash
git add services/gateway/src/server.ts
git commit -m "feat(gateway): hook onRequest — logs Pino enrichis avec contexte client X-Meeshy-*"
```

---

### Task 5 : Push final

```bash
git push
```

---

## Vérification end-to-end

1. Lancer l'app iOS avec `./apps/ios/meeshy.sh run`
2. Se connecter avec `atabeth` / `pD5p1ir9uxLUf2X2FpNE`
3. Dans les logs gateway, chercher `client` dans le log du login :
   ```json
   { "client": { "appVersion": "1.0.0", "build": "42", "platform": "ios", "device": "iPhone16,1", "country": "FR" } }
   ```
4. En DB MongoDB, vérifier que `UserSession` a `osName: "iOS"`, `deviceModel: "iPhone16,1"`, `country: "FR"` (si les géo headers sont présents)

## Fichiers modifiés / créés

| Fichier | Action |
|---------|--------|
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift` | Créé |
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift` | Modifié |
| `services/gateway/src/services/GeoIPService.ts` | Modifié |
| `services/gateway/src/__tests__/unit/services/GeoIPService.test.ts` | Créé |
| `services/gateway/src/server.ts` | Modifié |
