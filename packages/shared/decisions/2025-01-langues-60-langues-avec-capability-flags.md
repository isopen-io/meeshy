## 2025-01: Langues - 60+ langues avec capability flags
**Statut**: Accept
**Contexte**: Frontend et backend doivent connatre les capacits de chaque langue
**Decision**: `SupportedLanguageInfo` avec flags (supportsTTS, supportsSTT, supportsVoiceCloning), engine specs, codes MMS, rgions
**Alternatives rejet**: Listes de langues hardcodes (pas flexible), config backend-only (duplication frontend), fichiers spars par langue (maintenance)
**Cons**: Synchronisation manuelle avec le service translator Python
