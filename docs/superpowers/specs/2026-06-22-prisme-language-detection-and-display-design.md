# Prisme — Détection de langue robuste + affichage des bulles iOS

Date : 2026-06-22
Statut : Design validé (approche C), prêt pour plan d'implémentation.

## Problème

Les bulles iOS n'affichent pas la traduction dans la langue primaire de l'utilisateur
et le drapeau de langue manque. Investigation : **le coupable n'est pas l'affichage iOS
mais la détection de la langue source** (`originalLanguage`).

Preuves en base (prod, collection `Message`) :
- ~78 messages récents (sur 2000) taggés `originalLanguage='en'`, dont beaucoup de
  français évident (« Tu as écouté ? », « Merci ma Fafa 🙂 », « D'accord Maa »).
- Conséquence sur la bulle :
  - soit le message reçoit une « traduction » `fr` d'un texte déjà français → drapeau
    incohérent ;
  - soit aucune traduction → affiché en original sans drapeau.

Origine de la mauvaise langue :
- `originalLanguage` est fourni par le client à l'émission (gateway `MessageTranslationService.ts:295`
  lit `messageData.originalLanguage`).
- iOS code en dur `defaultComposeLanguage() -> "fr"` (`ConversationViewModel.swift:1976`) :
  ne détecte rien → un message anglais tapé sur iOS partirait en `fr`, et la vraie source
  des tags `en`-mais-français vient d'autres clients (web) et/ou du détecteur naïf serveur.
- Translator `detect_language` (`translator_engine.py:191-213`) : heuristique par mots-clés
  qui **retourne `'en'` par défaut** pour tout texte sans mot-clé connu ; invoqué quand
  `source_language == 'auto'` (`translation_service.py:221,306`).

La logique d'affichage iOS (`ConversationViewModel.preferredTranslation` 3711-3747) est
correcte **si** `originalLanguage` + `preferredLanguages` sont justes.

## Remédiation base (déjà appliquée — 2026-06-22)

Script one-shot exécuté dans le conteneur translator (contenu jamais sorti de la prod) :
re-détection française haute précision (accents français + élisions `c'`/`qu'`/`j'` + mots
distinctifs non-anglais), correction `en → fr` de **23 messages** réellement français,
suppression de la traduction `fr` devenue invalide. Vrai anglais laissé `en`.
Backup intégral des valeurs d'origine dans la collection `_LangBackfillBackup` (rollback).
**Hors périmètre du code ci-dessous** (action ponctuelle terminée).

## Approche retenue : C (hybride)

Détection on-device à l'émission (source de vérité) **+** garde-fou serveur (rattrape
`'auto'` et supprime le défaut-`'en'`) **+** durcissement de l'affichage iOS.

### C1 — iOS : détection de langue à l'émission

- Nouvel utilitaire **pur, stateless** dans le SDK (`packages/MeeshySDK/Sources/MeeshySDK/`,
  ex. `LanguageDetection.swift`) basé sur `NaturalLanguage.NLLanguageRecognizer` :
  `detectLanguageCode(for text: String, fallback: String?) -> String?`.
  - Mappe la langue dominante vers ISO 639-1 (réutilise `MeeshyUser.normalizeLanguageCode`).
  - Repli sur `fallback` (la `systemLanguage` de l'utilisateur) si : texte trop court
    (< 4 caractères alpha), confiance faible (`languageHypotheses` top < ~0.65), ou aucune
    langue dominante. Jamais de défaut codé en dur arbitraire.
- `ConversationViewModel` : remplacer `defaultComposeLanguage()` par un appel à ce détecteur,
  avec `fallback = preferredLanguages.first` (langue primaire). Sites d'envoi : 2394, 2436, 2706.
- Atomicité SDK : c'est un atome (entrée opaque → code) → SDK conforme à la règle de pureté.

### C2 — Translator : vrai détecteur serveur (garde-fou `'auto'`)

- Remplacer `TranslatorEngine.detect_language` (mots-clés, défaut `'en'`) par une détection
  `langdetect` **avec seuil de confiance** (`detect_langs`, garder le top si prob ≥ seuil).
  - langdetect est peu fiable sur texte ultra-court → si confiance insuffisante ou texte
    trop court, **ne pas deviner `'en'`** : replier sur un hint fourni (langue annoncée /
    dernier message) ou un défaut configurable explicite (settings), pas `'en'` en dur.
  - Invoqué uniquement quand `source_language == 'auto'` (comportement inchangé pour une
    source explicite — les clients corrigés en C1/C4 envoient la bonne langue).
- Aucune dépendance nouvelle : `langdetect` est déjà installé dans l'image translator.

### C3 — iOS : durcissement de l'affichage

- `ConversationLanguagePreferences.resolved` : **garantir** que `systemLanguage` (langue
  primaire) figure toujours dans la liste résolue, même si certaines prefs sont nil
  (filet anti-liste-vide). Source : `ConversationLanguagePreferences.swift` (37-149).
- Vérifier que `extractTextTranslations` (3542-3567) hydrate bien les traductions dont
  `targetLanguage` ∈ `preferredLanguages` (déjà le cas ; dépend de C3 point précédent).
- Drapeau : confirmer via test que `BubbleStandardLayout` (982-1003) affiche le drapeau
  dès qu'une traduction préférée est rendue (`hasAnyTranslation`), et le drapeau d'origine.

### C4 — Web : détection à l'émission (fast-follow)

- Miroir de C1 côté `apps/web` : détecter la langue du message composé avant envoi
  (détecteur JS léger ou `Intl`/`franc-min`), pour ne plus émettre de `originalLanguage`
  erroné. Réutiliser `packages/shared/utils/language-normalize.ts`.
- Livré après C1+C2+C3 (c'est la source web probable des mauvais tags entrants).

## Flux de données (après fix)

```
Compose (iOS/web) → détection on-device → originalLanguage correct
   → gateway (stocke originalLanguage tel quel) → translator (source explicite, pas 'auto')
   → traductions vers langues cibles ≠ source → Message.translations
iOS reçoit → extractTextTranslations (filtré par preferredLanguages incluant systemLanguage)
   → preferredTranslation résout la langue primaire → bulle affiche traduction + drapeau
Si source == 'auto' (legacy/edge) → translator langdetect seuillé (plus de défaut 'en')
```

## Cas limites & gestion d'erreur

- Texte court / emoji-only / token : détection incertaine → repli sur `systemLanguage`
  (iOS) ou hint/défaut explicite (serveur). Jamais `'en'` arbitraire.
- Cognats FR/EN (« crucial », « petite ») : ne pas s'appuyer sur des listes de mots
  ambigus dans le détecteur de prod (C1/C2 utilisent NLLanguageRecognizer/langdetect, pas
  la liste FR du backfill one-shot).
- Message déjà en langue primaire : `preferredTranslation` retourne `nil` (Prisme règle #1,
  inchangé) → affichage original sans drapeau (correct).

## Hors périmètre

- Note de consentement vocal sur bulles audio (sujet 2) — différé, design ultérieur.
- Régénération des traductions `en` manquantes pour les 23 messages corrigés (les viewers
  régionaux `en` les verront en français jusqu'à retraduction à la demande). Non bloquant.

## Tests (TDD)

- **C1** : tests SDK (Swift Testing) du détecteur pur — fr/en/es clairs, texte court →
  fallback, emoji/token → fallback. `MeeshySDK-Package` scheme.
- **C2** : pytest translator — `detect_language` : fr/en confiants → bonne langue ; court/
  incertain → pas de défaut `'en'`, repli attendu.
- **C3** : XCTest iOS — `ConversationLanguagePreferences.resolved` inclut toujours
  systemLanguage ; un message en→fr avec trad fr → `preferredTranslation` renvoie la trad,
  drapeau attendu (test du builder `resolveEffectiveContent`/`buildAvailableFlags`).
- **C4** : tests web (vitest/jest) du détecteur d'émission.

## Gate qualité

- iOS : `./apps/ios/meeshy.sh build` OK + tests ciblés sur simu 18.2.
- Translator : pytest vert.
- Déploiement via push `main` → CI (images), puis `docker compose pull && up -d` prod.
