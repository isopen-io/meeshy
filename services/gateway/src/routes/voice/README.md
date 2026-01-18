# Voice Routes Module

## Structure

Ce module gère toutes les routes de l'API vocale (traduction, transcription, analyse).

```
src/routes/voice/
├── index.ts          # Point d'entrée principal (27 lignes)
├── types.ts          # Types et schémas OpenAPI (288 lignes)
├── translation.ts    # Routes de traduction/transcription (797 lignes)
└── analysis.ts       # Routes d'analyse et monitoring (604 lignes)
```

**Taille totale**: 1,716 lignes (vs 1,712 lignes dans le fichier monolithique original)

## Modules

### `index.ts`
Point d'entrée qui orchestre les sous-modules.
- Export: `registerVoiceRoutes(fastify, audioTranslateService, translationService?)`

### `types.ts`
Définitions de types TypeScript et schémas OpenAPI pour la validation.

**Schémas**:
- `voiceTranslationResultSchema` - Résultat de traduction
- `translationJobSchema` - Job de traduction asynchrone
- `voiceAnalysisResultSchema` - Résultat d'analyse vocale
- `voiceComparisonResultSchema` - Résultat de comparaison de voix
- `translationHistoryEntrySchema` - Entrée d'historique
- `userStatsSchema` - Statistiques utilisateur
- `systemMetricsSchema` - Métriques système
- `healthStatusSchema` - Statut de santé
- `supportedLanguageSchema` - Langue supportée
- `errorResponseSchema` - Réponse d'erreur

**Types**:
- `TranslateBody`, `TranslateAsyncBody`, `TranscribeBody`
- `AnalyzeBody`, `CompareBody`, `FeedbackBody`
- `HistoryQuery`, `StatsQuery`

**Utilitaires**:
- `getUserId(request)` - Extrait l'ID utilisateur
- `isAdmin(request)` - Vérifie si l'utilisateur est admin

### `translation.ts`
Routes pour la traduction et la transcription audio.

**Endpoints**:
- `POST /api/v1/voice/translate` - Traduction synchrone (audioBase64 ou attachmentId)
- `POST /api/v1/voice/translate/async` - Traduction asynchrone avec webhooks
- `GET /api/v1/voice/job/:jobId` - Statut d'un job asynchrone
- `DELETE /api/v1/voice/job/:jobId` - Annulation d'un job
- `POST /api/v1/voice/transcribe` - Transcription (multipart/form-data ou JSON)

**Fonctionnalités**:
- Support des fichiers uploadés (multipart/form-data)
- Support de l'audio en base64
- Support des attachments existants
- Cache des traductions existantes
- Webhooks pour notifications asynchrones
- Compatibilité OpenAI (endpoint transcribe)

### `analysis.ts`
Routes pour l'analyse vocale, le feedback et le monitoring.

**Endpoints d'analyse**:
- `POST /api/v1/voice/analyze` - Analyse de caractéristiques vocales (pitch, timbre, MFCC)
- `POST /api/v1/voice/compare` - Comparaison de deux échantillons vocaux

**Endpoints de feedback**:
- `POST /api/v1/voice/feedback` - Soumission de feedback utilisateur
- `GET /api/v1/voice/history` - Historique des traductions
- `GET /api/v1/voice/stats` - Statistiques utilisateur

**Endpoints de monitoring**:
- `GET /api/v1/voice/admin/metrics` - Métriques système (admin uniquement)
- `GET /api/v1/voice/health` - Statut de santé des services (public)
- `GET /api/v1/voice/languages` - Langues supportées (public)

## Usage

```typescript
import { registerVoiceRoutes } from './routes/voice';
// ou
import { registerVoiceRoutes } from './routes/voice/index';

// Enregistrer les routes
registerVoiceRoutes(fastify, audioTranslateService, translationService);
```

## Principes de conception

1. **Séparation des responsabilités**: Chaque module a une responsabilité claire
2. **Types forts**: Tous les types sont définis et exportés depuis `types.ts`
3. **Exports sélectifs**: Seuls les exports nécessaires sont exposés
4. **Rétrocompatibilité**: Le fichier `../voice.ts` agit comme proxy
5. **Maintenabilité**: Chaque fichier < 800 lignes pour faciliter la navigation
6. **Performance**: Utilisation de Promise.all pour les opérations parallèles

## Migration depuis le fichier monolithique

Le fichier original `src/routes/voice.ts` (1,712 lignes) a été refactorisé en modules.
Un fichier proxy maintient la compatibilité:

```typescript
// src/routes/voice.ts
export { registerVoiceRoutes } from './voice/index';
```

Aucune modification n'est requise dans le code existant.
