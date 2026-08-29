# Changement de Paradigme : Architecture des Préférences

## 📊 Vue d'Ensemble du Changement

```
AVANT (Fragmenté)                          APRÈS (Unifié)
═══════════════════                        ══════════════

2500+ lignes de code                       920 lignes de code
8 fichiers dupliqués                       3 fichiers réutilisables
2 modèles Prisma différents                1 modèle Prisma flexible
Aucune validation GDPR                     Validation GDPR automatique
Migration DB pour chaque champ             Aucune migration (JSON)
```

---

## 🏗️ Architecture Avant (Système Fragmenté)

### Modèles de Données - Avant

```
┌─────────────────────────────────────────────────────────────────┐
│                     BASE DE DONNÉES (MongoDB)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────┐               │
│  │ NotificationPreference (Modèle Dédié)        │               │
│  ├──────────────────────────────────────────────┤               │
│  │ id: ObjectId                                  │               │
│  │ userId: ObjectId (unique)                     │               │
│  │ pushEnabled: Boolean                          │               │
│  │ emailEnabled: Boolean                         │               │
│  │ soundEnabled: Boolean                         │               │
│  │ newMessageEnabled: Boolean                    │               │
│  │ missedCallEnabled: Boolean                    │               │
│  │ ... (10 autres champs Boolean)                │               │
│  │ dndEnabled: Boolean                           │               │
│  │ dndStartTime: String?                         │               │
│  │ dndEndTime: String?                           │               │
│  │ createdAt: DateTime                           │               │
│  │ updatedAt: DateTime                           │               │
│  └──────────────────────────────────────────────┘               │
│                           ⚠️                                      │
│          Problème: Ajouter un champ = Migration DB               │
│                                                                   │
│  ┌──────────────────────────────────────────────┐               │
│  │ UserPreference (Key-Value Store)             │               │
│  ├──────────────────────────────────────────────┤               │
│  │ id: ObjectId                                  │               │
│  │ userId: ObjectId                              │               │
│  │ key: String ("theme", "font-family", etc.)    │               │
│  │ value: String (TOUT en string, non typé!)     │               │
│  │ valueType: String ("string", "boolean")       │               │
│  │ description: String?                          │               │
│  │ createdAt: DateTime                           │               │
│  │ updatedAt: DateTime                           │               │
│  └──────────────────────────────────────────────┘               │
│                           ⚠️                                      │
│     Problème: Pas de validation structurée, tout en string       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Routes et Code - Avant

```
┌─────────────────────────────────────────────────────────────────────┐
│                         COUCHE ROUTES (API)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────────────┐                              │
│  │ /routes/notification-preferences.ts│                              │
│  │         (~400 lignes)              │                              │
│  ├───────────────────────────────────┤                              │
│  │ GET    /notification-preferences   │ ← Duplication #1            │
│  │ PUT    /notification-preferences   │   - Validation manuelle      │
│  │ PATCH  /notification-preferences   │   - Error handling répété    │
│  │ DELETE /notification-preferences   │   - Pas de GDPR              │
│  └───────────────────────────────────┘                              │
│                                                                       │
│  ┌───────────────────────────────────┐                              │
│  │ /routes/privacy-preferences.ts     │                              │
│  │         (~350 lignes)              │                              │
│  ├───────────────────────────────────┤                              │
│  │ GET    /privacy-preferences        │ ← Duplication #2            │
│  │ PUT    /privacy-preferences        │   - Même code que #1         │
│  │ PATCH  /privacy-preferences        │   - Juste différent model    │
│  │ DELETE /privacy-preferences        │   - Pas de GDPR              │
│  └───────────────────────────────────┘                              │
│                                                                       │
│  ┌───────────────────────────────────┐                              │
│  │ /routes/user-preferences.ts        │                              │
│  │         (~500 lignes)              │                              │
│  ├───────────────────────────────────┤                              │
│  │ GET    /user-preferences/:key      │ ← Duplication #3            │
│  │ PUT    /user-preferences           │   - Key-value générique      │
│  │ DELETE /user-preferences/:key      │   - Validation faible        │
│  └───────────────────────────────────┘                              │
│                                                                       │
│  ┌────────────────────────────────────────┐                         │
│  │ /me/preferences/notifications/index.ts │                         │
│  │              (~300 lignes)              │                         │
│  ├────────────────────────────────────────┤                         │
│  │ GET    /me/preferences/notifications    │ ← Duplication #4       │
│  │ PUT    /me/preferences/notifications    │   - Même logic que #1   │
│  │ PATCH  /me/preferences/notifications    │   - Nouveau namespace   │
│  │ DELETE /me/preferences/notifications    │   - Incohérent          │
│  └────────────────────────────────────────┘                         │
│                                                                       │
│  + 4 autres fichiers similaires (privacy, languages, theme,         │
│    encryption) = ~1000 lignes de duplication supplémentaire !       │
│                                                                       │
│                    TOTAL: ~2500 lignes dupliquées                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Flux de Requête - Avant

```
Client Request                    Serveur
═════════════                     ═══════

PUT /notification-preferences
     │
     │  ┌─────────────────────────────────────────────┐
     └─→│ notification-preferences.ts                 │
        │                                             │
        │  1. ❌ Validation manuelle (verbose)        │
        │     if (!body.pushEnabled)                  │
        │       throw error                           │
        │                                             │
        │  2. ❌ Aucune validation GDPR                │
        │                                             │
        │  3. ✅ Upsert NotificationPreference        │
        │     await prisma.notificationPreference     │
        │       .upsert({ ... })                      │
        │                                             │
        │  4. ✅ Return data                          │
        └─────────────────────────────────────────────┘

PUT /privacy-preferences
     │
     │  ┌─────────────────────────────────────────────┐
     └─→│ privacy-preferences.ts                      │
        │                                             │
        │  1. ❌ MÊME CODE copié-collé !               │
        │  2. ❌ Aucune validation GDPR                │
        │  3. ✅ Upsert via key-value store           │
        │  4. ✅ Return data                          │
        └─────────────────────────────────────────────┘

        ⚠️  Code dupliqué 8 fois pour chaque catégorie !
```

---

## 🚀 Architecture Après (Système Unifié)

### Modèle de Données - Après

```
┌─────────────────────────────────────────────────────────────────────┐
│                      BASE DE DONNÉES (MongoDB)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ UserPreferences (Modèle Unifié Flexible)                      │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ id: ObjectId                                                  │   │
│  │ userId: ObjectId (unique)                                     │   │
│  │                                                               │   │
│  │ ┌──────────────── JSON FIELDS (Flexible) ─────────────────┐  │   │
│  │ │                                                          │  │   │
│  │ │  privacy: Json? ────────┐                               │  │   │
│  │ │    {                     │  ✅ 12 champs typés via Zod   │  │   │
│  │ │      showOnlineStatus,   │  ✅ Validation automatique    │  │   │
│  │ │      allowAnalytics,     │  ✅ Defaults automatiques     │  │   │
│  │ │      ...                 │  ✅ Ajouter champ = 0 migration│ │   │
│  │ │    }                     │                               │  │   │
│  │ │                          │                               │  │   │
│  │ │  audio: Json? ───────────┤  ✅ 15 champs (transcription, │  │   │
│  │ │    {                     │     TTS, traduction, etc.)    │  │   │
│  │ │      transcriptionEnabled,                               │  │   │
│  │ │      ttsSpeed: 1.0,      │  ✅ Validation GDPR incluse   │  │   │
│  │ │      ...                 │     (consent required)        │  │   │
│  │ │    }                     │                               │  │   │
│  │ │                          │                               │  │   │
│  │ │  message: Json? ─────────┤  ✅ 14 champs (formatting,    │  │   │
│  │ │  notification: Json? ────┤     auto-save, etc.)          │  │   │
│  │ │  video: Json? ───────────┤  ✅ 24 champs (DND, types)    │  │   │
│  │ │  document: Json? ────────┤  ✅ 18 champs (quality, etc.) │  │   │
│  │ │  application: Json? ─────┘  ✅ 14 champs (preview, etc.) │  │   │
│  │ │                             ✅ 18 champs (theme, etc.)   │  │   │
│  │ └──────────────────────────────────────────────────────────┘  │   │
│  │                                                               │   │
│  │ createdAt: DateTime                                           │   │
│  │ updatedAt: DateTime                                           │   │
│  │                                                               │   │
│  │ user: User @relation("UserPreferences")                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│                    ✨ AVANTAGES ✨                                    │
│   • Un seul modèle pour toutes les préférences                       │
│   • JSON flexible = pas de migration pour nouveaux champs            │
│   • Validation forte via Zod (types, enums, limites)                 │
│   • Defaults automatiques si champ null                              │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Couche de Validation - Après

```
┌─────────────────────────────────────────────────────────────────────┐
│              COUCHE VALIDATION (Zod + GDPR)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ @meeshy/shared/types/preferences/                          │     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │                                                            │     │
│  │  privacy.ts                                                │     │
│  │  ┌──────────────────────────────────────────────┐         │     │
│  │  │ PrivacyPreferenceSchema = z.object({         │         │     │
│  │  │   showOnlineStatus: z.boolean().default(true)│         │     │
│  │  │   allowAnalytics: z.boolean().default(true)  │         │     │
│  │  │   ... (12 champs avec validation)            │         │     │
│  │  │ })                                            │         │     │
│  │  │                                               │         │     │
│  │  │ PRIVACY_PREFERENCE_DEFAULTS = { ... }        │         │     │
│  │  └──────────────────────────────────────────────┘         │     │
│  │                                                            │     │
│  │  audio.ts, message.ts, notification.ts, etc.              │     │
│  │  (même pattern pour les 7 catégories)                     │     │
│  │                                                            │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ ConsentValidationService.ts                                │     │
│  ├────────────────────────────────────────────────────────────┤     │
│  │                                                            │     │
│  │  validateAudioPreferences(userId, preferences)             │     │
│  │  ┌──────────────────────────────────────────────┐         │     │
│  │  │ if (transcriptionEnabled === true)           │         │     │
│  │  │   && !hasVoiceDataConsent                    │         │     │
│  │  │   → VIOLATION: needs voiceDataConsentAt      │         │     │
│  │  │                                               │         │     │
│  │  │ if (ttsEnabled === true)                     │         │     │
│  │  │   && !canGenerateTranslatedAudio             │         │     │
│  │  │   → VIOLATION: needs multiple consents       │         │     │
│  │  └──────────────────────────────────────────────┘         │     │
│  │                                                            │     │
│  │  validatePrivacyPreferences(userId, preferences)           │     │
│  │  validateMessagePreferences(userId, preferences)           │     │
│  │  validateApplicationPreferences(userId, preferences)       │     │
│  │  ... (validation pour chaque catégorie)                   │     │
│  │                                                            │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Factory Pattern - Après

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FACTORY ROUTER (DRY Pattern)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  preference-router-factory.ts (~330 lignes)                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  createPreferenceRouter<T>(                                  │   │
│  │    category: 'privacy' | 'audio' | 'message' | ...,         │   │
│  │    schema: ZodSchema<T>,                                     │   │
│  │    defaults: T                                               │   │
│  │  ) {                                                         │   │
│  │    return async function(fastify) {                          │   │
│  │                                                              │   │
│  │      // ────────── GET ────────────                         │   │
│  │      fastify.get('/', async (request, reply) => {           │   │
│  │        const prefs = await prisma.userPreferences            │   │
│  │          .findUnique({ where: { userId } });                │   │
│  │        return prefs?.[category] || defaults; ────┐          │   │
│  │      });                                          │          │   │
│  │                                                   │          │   │
│  │      // ────────── PUT ────────────               │          │   │
│  │      fastify.put('/', async (request, reply) => { │          │   │
│  │        const validated = schema.parse(body); ─────┼─ Zod    │   │
│  │                                                   │          │   │
│  │        const violations = await consentService ───┼─ GDPR   │   │
│  │          .validatePreferences(userId, category,   │          │   │
│  │                               validated);         │          │   │
│  │                                                   │          │   │
│  │        if (violations.length > 0)                 │          │   │
│  │          return 403 CONSENT_REQUIRED ─────────────┘          │   │
│  │                                                              │   │
│  │        await prisma.userPreferences.upsert({                 │   │
│  │          where: { userId },                                  │   │
│  │          create: { userId, [category]: validated },          │   │
│  │          update: { [category]: validated }                   │   │
│  │        });                                                   │   │
│  │      });                                                     │   │
│  │                                                              │   │
│  │      // ────────── PATCH ───────────                        │   │
│  │      fastify.patch('/', async (request, reply) => {          │   │
│  │        const validated = schema.partial().parse(body);       │   │
│  │        const existing = await findUnique(...);               │   │
│  │        const merged = { ...existing, ...validated };         │   │
│  │        // Validate merged data (GDPR)                        │   │
│  │        await upsert({ [category]: merged });                 │   │
│  │      });                                                     │   │
│  │                                                              │   │
│  │      // ────────── DELETE ──────────                        │   │
│  │      fastify.delete('/', async (request, reply) => {         │   │
│  │        await prisma.update({                                 │   │
│  │          data: { [category]: null }  // Reset to defaults   │   │
│  │        });                                                   │   │
│  │      });                                                     │   │
│  │                                                              │   │
│  │    }                                                         │   │
│  │  }                                                           │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│                    ✨ RÉSULTAT ✨                                     │
│   • 1 fonction génère 4 routes CRUD pour N'IMPORTE QUELLE catégorie  │
│   • Validation Zod automatique                                       │
│   • Validation GDPR automatique                                      │
│   • Error handling uniforme                                          │
│   • Defaults management cohérent                                     │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Routes Enregistrées - Après

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ROUTES ENREGISTRÉES (index.ts)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  /routes/me/preferences/index.ts (~240 lignes)                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  // Route globale                                            │   │
│  │  GET    /me/preferences         → Toutes les préférences     │   │
│  │  (DELETE /me/preferences retirée — #4186, sans appelant ;    │   │
│  │   la remise à zéro passe par la CATÉGORIE, et le lot L3      │   │
│  │   rouvrira l'adresse sous `?categories=`)                    │   │
│  │                                                              │   │
│  │  // Enregistrement des catégories via factory (1 ligne each)│   │
│  │                                                              │   │
│  │  fastify.register(                                           │   │
│  │    createPreferenceRouter(                                   │   │
│  │      'privacy',                                              │   │
│  │      PrivacyPreferenceSchema,                                │   │
│  │      PRIVACY_PREFERENCE_DEFAULTS                             │   │
│  │    ),                                                        │   │
│  │    { prefix: '/privacy' }                                    │   │
│  │  ); ──────────────────────────────────────┐                 │   │
│  │                                            │                 │   │
│  │  fastify.register(...audio...);   ────────┼── 7 catégories  │   │
│  │  fastify.register(...message...); ────────┤   × 4 routes    │   │
│  │  fastify.register(...notification...); ───┤   = 28 routes   │   │
│  │  fastify.register(...video...);   ────────┤   générées !    │   │
│  │  fastify.register(...document...);────────┤                 │   │
│  │  fastify.register(...application...); ────┘                 │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│                    ✨ PUISSANCE DU FACTORY ✨                         │
│   • 7 lignes de code = 28 routes complètes                           │
│   • Ajouter une catégorie = 1 ligne                                  │
│   • Cohérence garantie sur toutes les routes                         │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Flux de Requête - Après

```
Client Request                    Serveur
═════════════                     ═══════

PUT /me/preferences/audio
     │
     │  ┌─────────────────────────────────────────────────────────┐
     └─→│ Factory Router (createPreferenceRouter)                 │
        │                                                         │
        │  1. ✅ Validation Zod automatique                       │
        │     AudioPreferenceSchema.parse(body)                   │
        │     → Type checking                                     │
        │     → Enum validation                                   │
        │     → Numeric limits (ttsSpeed: 0.5-2.0)                │
        │                                                         │
        │  2. ✅ Validation GDPR automatique                      │
        │     ConsentValidationService                            │
        │       .validatePreferences('audio', validated)          │
        │                                                         │
        │     if (transcriptionEnabled && !hasConsent)            │
        │       return 403 {                                      │
        │         error: "CONSENT_REQUIRED",                      │
        │         violations: [{                                  │
        │           field: "transcriptionEnabled",                │
        │           requiredConsents: ["voiceDataConsentAt"]      │
        │         }]                                              │
        │       }                                                 │
        │                                                         │
        │  3. ✅ Upsert dans UserPreferences                      │
        │     await prisma.userPreferences.upsert({               │
        │       where: { userId },                                │
        │       create: { userId, audio: validated },             │
        │       update: { audio: validated }                      │
        │     })                                                  │
        │                                                         │
        │  4. ✅ Return data                                      │
        │     { success: true, data: validated }                  │
        │                                                         │
        └─────────────────────────────────────────────────────────┘

PUT /me/preferences/privacy
     │
     │  ┌─────────────────────────────────────────────────────────┐
     └─→│ MÊME Factory Router !                                   │
        │ (paramétré avec 'privacy', PrivacySchema, etc.)         │
        │                                                         │
        │  1. ✅ Validation Zod (PrivacyPreferenceSchema)         │
        │  2. ✅ Validation GDPR (allowAnalytics → consent)       │
        │  3. ✅ Upsert { privacy: validated }                    │
        │  4. ✅ Return data                                      │
        └─────────────────────────────────────────────────────────┘

        ✨ UN SEUL code pour TOUTES les catégories !
```

---

## 📈 Comparaison Métrique

### Lignes de Code

```
┌─────────────────────────────────────────────────────────┐
│                  AVANT vs APRÈS                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  AVANT (Système Fragmenté):                             │
│  ████████████████████████████████████████  2500 lignes  │
│                                                          │
│  APRÈS (Système Unifié):                                │
│  ███████████████  920 lignes                            │
│                                                          │
│                    Réduction: 63%                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Complexité Cyclomatique

```
┌─────────────────────────────────────────────────────────┐
│              COMPLEXITÉ DE MAINTENANCE                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Ajouter une Nouvelle Catégorie:                        │
│                                                          │
│  AVANT:  ████████████████████ (2-3 heures)              │
│          • Créer fichier routes (300-400L)              │
│          • Implémenter 4 routes CRUD                     │
│          • Validation manuelle                           │
│          • Error handling                                │
│          • Tests                                         │
│                                                          │
│  APRÈS:  █ (15 minutes)                                  │
│          • Créer schema Zod (10-20L)                     │
│          • 1 ligne d'enregistrement                      │
│          • Tout le reste automatique!                    │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│                                                          │
│  Ajouter un Champ à une Catégorie:                      │
│                                                          │
│  AVANT:  ██████████ (1 heure + migration DB)            │
│          • Migration Prisma                              │
│          • Update validation                             │
│          • Tests                                         │
│                                                          │
│  APRÈS:  █ (2 minutes, zéro migration)                   │
│          • Ajouter ligne au schema Zod                   │
│          • C'est tout!                                   │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│                                                          │
│  Fixer un Bug dans la Logique CRUD:                     │
│                                                          │
│  AVANT:  ████████ (Fixer dans 8 fichiers)               │
│          • notification-preferences.ts                   │
│          • privacy-preferences.ts                        │
│          • user-preferences.ts                           │
│          • + 5 autres fichiers /me/preferences/*         │
│                                                          │
│  APRÈS:  ██ (Fixer dans 1 fichier)                      │
│          • preference-router-factory.ts                  │
│          • Propagation automatique!                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Couverture Fonctionnelle

```
┌──────────────────────────────────────────────────────────────┐
│                  FONCTIONNALITÉS                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┬───────────┬───────────┐                 │
│  │ Fonctionnalité │   AVANT   │   APRÈS   │                 │
│  ├────────────────┼───────────┼───────────┤                 │
│  │ Routes CRUD    │     ✅    │     ✅    │                 │
│  │ Validation     │     ⚠️     │     ✅    │                 │
│  │ Type Safety    │     ⚠️     │     ✅    │                 │
│  │ Defaults       │     ✅    │     ✅    │                 │
│  │ Validation GDPR│     ❌    │     ✅    │                 │
│  │ Évolutivité    │     ❌    │     ✅    │                 │
│  │ Cohérence      │     ⚠️     │     ✅    │                 │
│  │ Maintenabilité │     ⚠️     │     ✅    │                 │
│  │ DRY Principle  │     ❌    │     ✅    │                 │
│  └────────────────┴───────────┴───────────┘                 │
│                                                               │
│  ✅ = Excellent    ⚠️ = Partiel/Inconsistant    ❌ = Absent  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎯 Principes de Design Appliqués

### 1. DRY (Don't Repeat Yourself)

```
AVANT: Code dupliqué 8 fois
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Notification    │   │ Privacy         │   │ Theme           │
│ Routes (400L)   │   │ Routes (350L)   │   │ Routes (250L)   │
│                 │   │                 │   │                 │
│ GET, PUT,       │   │ GET, PUT,       │   │ GET, PUT,       │
│ PATCH, DELETE   │   │ PATCH, DELETE   │   │ PATCH, DELETE   │
│ (même logique!) │   │ (même logique!) │   │ (même logique!) │
└─────────────────┘   └─────────────────┘   └─────────────────┘
     ... × 8 fichiers = Duplication massive

APRÈS: Un seul factory réutilisé
┌─────────────────────────────────────────┐
│ Factory Router (330L)                   │
│                                         │
│ createPreferenceRouter<T>(              │
│   category, schema, defaults            │
│ ) → 4 routes CRUD                       │
└─────────────────────────────────────────┘
                   │
      ┌────────────┼────────────┬──────────┐
      │            │            │          │
   privacy      audio      message    notification
   (1 ligne)  (1 ligne)  (1 ligne)    (1 ligne)
```

### 2. Open/Closed Principle

```
"Ouvert à l'extension, fermé à la modification"

AVANT:
- Nouvelle catégorie → Modifier le code existant
- Nouveau champ → Migration DB + modifier routes
- Nouvelle validation → Toucher tous les fichiers

APRÈS:
- Nouvelle catégorie → 1 ligne d'enregistrement (EXTENSION)
- Nouveau champ → Ajouter au schema Zod (EXTENSION)
- Nouvelle validation GDPR → Ajouter à ConsentService (EXTENSION)
- Le factory reste INCHANGÉ (FERMÉ)
```

### 3. Single Responsibility Principle

```
AVANT: Fichiers monolithiques
┌───────────────────────────────────┐
│ notification-preferences.ts       │
├───────────────────────────────────┤
│ • Routes CRUD                     │
│ • Validation                      │
│ • Error handling                  │
│ • Business logic                  │
│ • Defaults management             │
└───────────────────────────────────┘
    Trop de responsabilités !

APRÈS: Séparation des concerns
┌──────────────────────────────────┐
│ Factory Router                   │
│ Responsabilité: Orchestration    │
└──────────────────────────────────┘
             │
    ┌────────┴────────┬────────────────┐
    │                 │                │
┌───────────┐  ┌──────────────┐  ┌──────────────┐
│ Zod       │  │ Consent      │  │ Prisma       │
│ Schemas   │  │ Validation   │  │ (Data Layer) │
│           │  │ Service      │  │              │
│ Resp:     │  │              │  │ Resp:        │
│ Type      │  │ Resp:        │  │ Persistence  │
│ Validation│  │ GDPR Rules   │  │              │
└───────────┘  └──────────────┘  └──────────────┘
```

### 4. Dependency Inversion

```
AVANT: Routes couplées aux modèles
┌─────────────────┐
│ Routes          │
│                 │
│ depend on ↓     │
└─────────────────┘
         │
┌─────────────────┐
│ NotificationPref│ ← Modèle spécifique
│ (Prisma Model)  │   Change = routes cassées
└─────────────────┘

APRÈS: Abstraction via interfaces
┌─────────────────┐
│ Factory Router  │
│                 │
│ depend on ↓     │
└─────────────────┘
         │
┌─────────────────┐
│ Generic<T>      │ ← Interface générique
│ ZodSchema<T>    │   Flexible, découplé
└─────────────────┘
         ↑
         │ implements
┌─────────────────┐
│ Specific Schemas│
│ (audio, privacy)│
└─────────────────┘
```

---

## 💡 Conclusion : Paradigme Shift

### De Fragmenté à Unifié

```
                AVANT                                APRÈS
     ════════════════════════           ════════════════════════

     Approche Impérative:                Approche Déclarative:
     "Comment faire 8 fois"              "Déclarer une fois"

     ┌───────────────┐                   ┌──────────────────┐
     │ Write         │                   │ Declare          │
     │ notification  │                   │ Schema           │
     │ routes        │                   │                  │
     └───────────────┘                   │ AudioPrefSchema  │
     ┌───────────────┐                   │ = z.object({     │
     │ Write         │                   │   field: type    │
     │ privacy       │                   │ })               │
     │ routes        │                   └──────────────────┘
     └───────────────┘                            │
     ┌───────────────┐                            ▼
     │ Write         │                   ┌──────────────────┐
     │ theme         │                   │ Factory          │
     │ routes        │                   │ generates        │
     └───────────────┘                   │ 4 routes         │
     ┌───────────────┐                   │ automatically    │
     │ ... × 8 fois  │                   └──────────────────┘
     └───────────────┘

     2500 lignes                          920 lignes
     Duplication                          Réutilisation
     Fragile                              Robuste
     Difficile à maintenir                Facile à maintenir
```

### Bénéfices Mesurables

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| Lignes de code | 2500 | 920 | **-63%** |
| Fichiers à maintenir | 8 | 3 | **-62%** |
| Temps nouvelle catégorie | 2-3h | 15min | **-90%** |
| Temps nouveau champ | 1h + migration | 2min, 0 migration | **-97%** |
| Couverture GDPR | 0% | 100% | **+100%** |
| Cohérence API | Partielle | Totale | **+100%** |
| Type Safety | Partielle | Totale | **+100%** |

**ROI:** Pour chaque heure investie dans le factory, économie de 10+ heures sur la maintenance future.
