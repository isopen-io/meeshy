# Utilitaires Analytics et Error Tracking

Ce dossier contient deux utilitaires réutilisables pour collecter des informations détaillées sur les utilisateurs et les erreurs.

## 📋 Fichiers

### 1. `error-context-collector.ts`
Collecteur de contexte pour les erreurs client. Rassemble **toutes** les informations disponibles sur l'appareil, la configuration et l'environnement au moment d'une erreur.

### 2. `user-analytics-collector.ts`
Utilitaire d'analytics réutilisant le collecteur d'erreurs pour tracker les événements utilisateur, profiler les utilisateurs, et générer des rapports de diagnostic.

---

## 🔧 Error Context Collector

### Informations Collectées

```typescript
{
  // Informations de base
  timestamp: "2025-01-24T10:30:15.123Z",
  url: "https://meeshy.me/chat/123",
  message: "Error message",
  stack: "Full stack trace",

  // User Agent détaillé
  userAgent: "Mozilla/5.0...",
  platform: "Linux armv8l",
  language: "fr-FR",
  languages: ["fr-FR", "fr", "en"],

  // Appareil (parsé depuis User Agent)
  device: {
    type: "mobile" | "tablet" | "desktop",
    os: "Android",
    osVersion: "10",
    browser: "Chrome",
    browserVersion: "120.0",
    vendor: "Google Inc.",
    isTouchDevice: true
  },

  // Écran
  screen: {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1040,
    colorDepth: 24,
    pixelRatio: 2,
    orientation: "portrait" | "landscape"
  },

  // Réseau (CRUCIAL pour diagnostiquer Afrique)
  network: {
    online: true,
    effectiveType: "4g" | "3g" | "2g" | "slow-2g",
    downlink: 10, // Mbps
    rtt: 50, // ms
    saveData: false
  },

  // Performance
  performance: {
    memory: {
      usedJSHeapSize: 50000000,
      totalJSHeapSize: 100000000,
      jsHeapSizeLimit: 2000000000
    },
    timing: {
      loadTime: 1500,
      domContentLoaded: 800
    }
  },

  // Stockage disponible
  preferences: {
    cookiesEnabled: true,
    doNotTrack: false,
    storageAvailable: {
      localStorage: true,
      sessionStorage: true,
      indexedDB: true
    }
  },

  // Localisation approximative
  location: {
    timezone: "Africa/Lagos",
    timezoneOffset: -60,
    locale: "fr-FR"
  }
}
```

### Usage

```typescript
import { collectErrorContext, sendErrorContext } from '@/utils/error-context-collector';

// Lors d'une erreur
try {
  // Code qui peut échouer
} catch (error) {
  const context = collectErrorContext(error as Error);
  await sendErrorContext(context);
}
```

---

## 📊 User Analytics Collector

### Fonctions Principales

#### 1. **Collecter le Contexte Utilisateur**
```typescript
import { collectUserContext } from '@/utils/user-analytics-collector';

const context = await collectUserContext();
// Retourne le même contexte que error-context-collector mais sans l'erreur
```

#### 2. **Tracker des Événements**
```typescript
import { trackEvent } from '@/utils/user-analytics-collector';

await trackEvent(
  'click',              // Type d'événement
  'button_submit',      // Nom de l'événement
  { buttonId: 'xyz' },  // Données supplémentaires
  sessionId,            // ID de session (optionnel)
  userId                // ID utilisateur (optionnel)
);
```

#### 3. **Tracker les Pages Vues**
```typescript
import { trackPageView } from '@/utils/user-analytics-collector';

await trackPageView('/chat/123', sessionId, userId);
```

#### 4. **Hook React pour Auto-Tracking**
```tsx
import { usePageTracking } from '@/utils/user-analytics-collector';

function MyPage() {
  const { userId } = useAuth();
  usePageTracking('/my-page', userId);

  return <div>My Page</div>;
}
```

#### 5. **Profiler un Utilisateur**
Collecte toutes les informations au premier chargement ou login:
```typescript
import { profileUser } from '@/utils/user-analytics-collector';

const profile = await profileUser(userId);
// Envoie automatiquement au backend (à configurer)
```

#### 6. **Générer un Rapport de Diagnostic**
Utile pour le support technique:
```typescript
import { generateUserDiagnosticReport } from '@/utils/user-analytics-collector';

const report = await generateUserDiagnosticReport(userId);
console.log(report);
```

**Exemple de rapport:**
```
=== RAPPORT DE DIAGNOSTIC UTILISATEUR ===
Généré le: 2025-01-24T10:30:15.123Z
User ID: user_123

📱 APPAREIL
Type: mobile
OS: Android 10
Navigateur: Chrome 120.0
Tactile: Oui

🌍 LOCALISATION
Timezone: Africa/Lagos
Locale: fr-FR
Probablement d'Afrique: OUI

📶 RÉSEAU
Statut: En ligne
Type: 3g
Débit: 2.5 Mbps
Latence: 250 ms
Mode économie: Activé
Connexion lente: OUI ⚠️

🖥️ ÉCRAN
Résolution: 1080x2400
Ratio pixel: 2x
Orientation: portrait

💾 STOCKAGE
localStorage: ✓
sessionStorage: ✓
indexedDB: ✓
Cookies: ✓

⚡ PERFORMANCE
Mémoire JS: 48.50 MB / 1953.13 MB
Temps de chargement: 1500 ms
```

#### 7. **Fonctions Utilitaires**

**Détecter Utilisateurs d'Afrique:**
```typescript
import { isProbablyFromAfrica } from '@/utils/user-analytics-collector';

const context = await collectUserContext();
if (isProbablyFromAfrica(context)) {
  console.log('Utilisateur probablement en Afrique');
}
```

**Détecter Connexion Lente:**
```typescript
import { hasSlowConnection } from '@/utils/user-analytics-collector';

const context = await collectUserContext();
if (hasSlowConnection(context)) {
  console.log('Connexion lente détectée (2g/3g)');
  // Adapter l'interface pour connexion lente
}
```

---

## 🗄️ Structure des Logs

Les erreurs sont sauvegardées dans `frontend/logs/client-errors.log` avec le contexte complet.

### Format: Une ligne JSON par erreur

```json
{"timestamp":"2025-01-24T10:30:15.123Z","url":"https://meeshy.me/chat/123","message":"Cannot read property 'x' of undefined","stack":"Error: ...\n at ...","userAgent":"Mozilla/5.0 (Linux; Android 10; ...) ...","platform":"Linux armv8l","language":"fr-FR","languages":["fr-FR","fr","en"],"device":{"type":"mobile","os":"Android","osVersion":"10","browser":"Chrome","browserVersion":"120.0","vendor":"Google Inc.","isTouchDevice":true},"screen":{"width":1080,"height":2400,"availWidth":1080,"availHeight":2360,"colorDepth":24,"pixelRatio":2,"orientation":"portrait"},"network":{"online":true,"effectiveType":"3g","downlink":2.5,"rtt":250,"saveData":true},"performance":{"memory":{"usedJSHeapSize":50862080,"totalJSHeapSize":105906176,"jsHeapSizeLimit":2147483648},"timing":{"loadTime":1500,"domContentLoaded":800}},"preferences":{"cookiesEnabled":true,"doNotTrack":false,"storageAvailable":{"localStorage":true,"sessionStorage":true,"indexedDB":true}},"location":{"timezone":"Africa/Lagos","timezoneOffset":-60,"locale":"fr-FR"}}
```

### Analyser les Logs

**Lire tous les logs:**
```bash
cat frontend/logs/client-errors.log
```

**Filtrer par OS:**
```bash
grep "Android" frontend/logs/client-errors.log | jq .
```

**Compter les erreurs par timezone (identifier les régions):**
```bash
cat frontend/logs/client-errors.log | jq -r '.location.timezone' | sort | uniq -c | sort -nr
```

**Trouver les utilisateurs avec connexion lente:**
```bash
cat frontend/logs/client-errors.log | jq 'select(.network.effectiveType == "2g" or .network.effectiveType == "3g")'
```

**Filtrer les erreurs d'Afrique:**
```bash
cat frontend/logs/client-errors.log | jq 'select(.location.timezone | startswith("Africa/"))'
```

**Statistiques par OS:**
```bash
cat frontend/logs/client-errors.log | jq -r '.device.os' | sort | uniq -c
```

**Statistiques par type de réseau:**
```bash
cat frontend/logs/client-errors.log | jq -r '.network.effectiveType' | sort | uniq -c
```

---

## 🚀 Intégration Future

### Backend API Analytics (À Implémenter)

```typescript
// frontend/app/api/analytics/route.ts
export async function POST(request: NextRequest) {
  const event = await request.json();

  // Sauvegarder dans la base de données
  await prisma.analyticsEvent.create({
    data: {
      eventType: event.eventType,
      eventName: event.eventName,
      eventData: event.eventData,
      userId: event.userId,
      sessionId: event.sessionId,
      context: event.context,
    },
  });

  return NextResponse.json({ success: true });
}
```

### Dashboard Analytics

Créer un dashboard admin pour visualiser:
- Répartition géographique des utilisateurs (timezone)
- Types d'appareils et OS
- Qualité des connexions réseau
- Erreurs par région
- Performance moyenne par pays

### Alertes Automatiques

Configurer des alertes pour:
- Taux d'erreur élevé dans une région spécifique (ex: Afrique)
- Connexions lentes détectées (> 80% d'utilisateurs en 2g/3g)
- Problèmes de stockage (localStorage/indexedDB non disponible)

---

## 🎯 Cas d'Usage

### 1. Support Technique
```typescript
// Quand un utilisateur contacte le support
const report = await generateUserDiagnosticReport(userId);
// Envoyer ce rapport au support
```

### 2. Optimisation pour Afrique
```typescript
const context = await collectUserContext();
if (isProbablyFromAfrica(context) && hasSlowConnection(context)) {
  // Activer le mode allégé
  // - Désactiver les animations
  // - Réduire la qualité des images
  // - Limiter les requêtes API
}
```

### 3. A/B Testing
```typescript
await trackEvent('conversion', 'signup_completed', {
  variant: 'blue_button',
  duration: 45000,
});
```

### 4. Monitoring Performance
```typescript
const context = await collectUserContext();
if (context.performance.memory) {
  const memUsage = context.performance.memory.usedJSHeapSize / 1024 / 1024;
  if (memUsage > 100) {
    // Alerter l'équipe d'une fuite mémoire potentielle
  }
}
```

---

## 📝 Notes Importantes

1. **Privacy**: Les données collectées ne contiennent pas d'informations personnelles identifiables
2. **GDPR**: Assurez-vous d'avoir le consentement de l'utilisateur avant de tracker
3. **Performance**: Le collecteur est optimisé et n'impacte pas les performances
4. **Fallback**: Si le collecteur échoue, l'application continue normalement
5. **Timezone**: Le timezone est utilisé pour approximer la localisation (pas de géolocalisation précise)

---

## 🔮 Améliorations Futures

- [ ] Ajouter support pour les Service Workers
- [ ] Intégrer avec Sentry/LogRocket
- [ ] Créer un dashboard de visualisation
- [ ] Ajouter des métriques de Core Web Vitals
- [ ] Implémenter la compression des logs
- [ ] Rotation automatique des fichiers de log
- [ ] Agrégation des statistiques par heure/jour/semaine
