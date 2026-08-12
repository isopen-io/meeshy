# Prisme — Détection de langue robuste + affichage bulles iOS (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `originalLanguage` soit détecté correctement à l'émission (iOS) et que le translator cesse de défausser en `'en'`, pour que les bulles iOS affichent la traduction dans la langue primaire + le drapeau.

**Architecture :** Détection on-device à l'émission (source de vérité, iOS `NLLanguageRecognizer`) + garde-fou serveur (`langdetect` seuillé, sans défaut-`'en'`) + tests de non-régression de l'affichage iOS. Spec : `docs/superpowers/specs/2026-06-22-prisme-language-detection-and-display-design.md`.

**Tech Stack :** Swift 6 / SwiftUI, `NaturalLanguage` (NLLanguageRecognizer), Swift Testing (SDK) + XCTest (app) ; Python 3.11 / `langdetect` (déjà installé), pytest.

## Global Constraints

- iOS cible **iOS 16+**, Swift 6 ; `NLLanguageRecognizer` dispo iOS 12+ → OK.
- Tout type/utilitaire lié au SDK va dans `packages/MeeshySDK/` (jamais dupliqué dans `apps/ios/`).
- Normalisation de code langue : **toujours** via `MeeshyUser.normalizeLanguageCode(_:)` (miroir de `packages/shared/utils/language-normalize.ts`). Ne pas réimplémenter.
- Tests SDK : scheme **`MeeshySDK-Package`** (le scheme MeeshyUI n'a pas d'action test).
- Commits : **pas** de trailer `Co-Authored-By`.
- Périmètre : C1 + C2 + C3. Le web (C4) est un plan séparé (fast-follow).
- Build iOS : `./apps/ios/meeshy.sh build`. Translator : `.venv/bin/python -m pytest`.

---

### Task 1: SDK — utilitaire pur de détection de langue (C1a)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Utilities/LanguageDetection.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/LanguageDetectionTests.swift`

**Interfaces:**
- Produces: `public enum LanguageDetection { public static func detectLanguageCode(for text: String, fallback: String?) -> String? }` — renvoie un code ISO 639-1 (ex. `"fr"`) ou `fallback` normalisé si texte trop court / confiance faible / pas de langue dominante. Jamais de défaut arbitraire.

- [ ] **Step 1: Write the failing test**

```swift
import Testing
@testable import MeeshySDK

struct LanguageDetectionTests {
    @Test func detects_french_text() {
        #expect(LanguageDetection.detectLanguageCode(
            for: "Bonjour, comment vas-tu aujourd'hui ? J'espère que tout va bien.",
            fallback: "en") == "fr")
    }

    @Test func detects_english_text() {
        #expect(LanguageDetection.detectLanguageCode(
            for: "How are you doing today? I hope everything is going well.",
            fallback: "fr") == "en")
    }

    @Test func short_text_returns_fallback() {
        #expect(LanguageDetection.detectLanguageCode(for: "Ok", fallback: "fr") == "fr")
    }

    @Test func emoji_only_returns_fallback() {
        #expect(LanguageDetection.detectLanguageCode(for: "😅🤣🤣", fallback: "fr") == "fr")
    }

    @Test func nil_fallback_when_undetectable() {
        #expect(LanguageDetection.detectLanguageCode(for: "🙂", fallback: nil) == nil)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/LanguageDetectionTests 2>&1 | tail -20`
Expected: FAIL — `cannot find 'LanguageDetection' in scope`.

- [ ] **Step 3: Write minimal implementation**

```swift
import Foundation
import NaturalLanguage

/// Détection de langue on-device (stateless) pour fixer `originalLanguage` à
/// l'émission. Atome SDK : entrée opaque (texte) → code ISO 639-1.
public enum LanguageDetection {
    /// Nombre minimum de lettres pour tenter une détection.
    static let minAlphaCount = 4
    /// Confiance minimale de la langue dominante.
    static let minConfidence = 0.65

    public static func detectLanguageCode(for text: String, fallback: String?) -> String? {
        let alpha = text.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count
        guard alpha >= minAlphaCount else { return MeeshyUser.normalizeLanguageCode(fallback) }

        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)
        guard let dominant = recognizer.dominantLanguage else {
            return MeeshyUser.normalizeLanguageCode(fallback)
        }
        let confidence = recognizer.languageHypotheses(withMaximum: 1)[dominant] ?? 0
        guard confidence >= minConfidence else {
            return MeeshyUser.normalizeLanguageCode(fallback)
        }
        return MeeshyUser.normalizeLanguageCode(dominant.rawValue)
            ?? MeeshyUser.normalizeLanguageCode(fallback)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/LanguageDetectionTests 2>&1 | tail -20`
Expected: PASS (5 tests). Si `detects_*` échoue par seuil, ajuster `minConfidence` (NLLanguageRecognizer est très confiant sur phrases complètes).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Utilities/LanguageDetection.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/LanguageDetectionTests.swift
git commit -m "feat(sdk): détection de langue on-device (NLLanguageRecognizer) pour originalLanguage"
```

---

### Task 2: iOS — câbler la détection à l'émission (C1b)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (helper `defaultComposeLanguage()` ligne ~1976 ; sites d'envoi ~2394, ~2436, ~2706)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ComposeLanguageTests.swift`

**Interfaces:**
- Consumes: `LanguageDetection.detectLanguageCode(for:fallback:)` (Task 1).
- Produces: `static func composeLanguage(for content: String, preferred: [String]) -> String` sur `ConversationViewModel` — détecte la langue du contenu, repli sur `preferred.first` puis `"fr"`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import Meeshy

final class ComposeLanguageTests: XCTestCase {
    func test_composeLanguage_detectsEnglishContent() {
        let lang = ConversationViewModel.composeLanguage(
            for: "How are you doing today my friend?", preferred: ["fr", "en"])
        XCTAssertEqual(lang, "en")
    }

    func test_composeLanguage_detectsFrenchContent() {
        let lang = ConversationViewModel.composeLanguage(
            for: "Bonjour, est-ce que tu peux m'aider s'il te plaît ?", preferred: ["en", "fr"])
        XCTAssertEqual(lang, "fr")
    }

    func test_composeLanguage_shortText_fallsBackToPrimary() {
        let lang = ConversationViewModel.composeLanguage(for: "Ok", preferred: ["fr", "en"])
        XCTAssertEqual(lang, "fr")
    }

    func test_composeLanguage_emptyPreferred_defaultsFr() {
        let lang = ConversationViewModel.composeLanguage(for: "Ok", preferred: [])
        XCTAssertEqual(lang, "fr")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --only MeeshyTests/ComposeLanguageTests` (ou via Xcode ⌘U sur ce fichier)
Expected: FAIL — `type 'ConversationViewModel' has no member 'composeLanguage'`.

- [ ] **Step 3: Write minimal implementation**

Remplacer `private func defaultComposeLanguage() -> String { "fr" }` (ligne ~1976) par :

```swift
/// Langue de composition : détectée depuis le contenu (on-device), repli sur la
/// langue primaire de l'utilisateur puis "fr". Pure → testable sans authManager.
static func composeLanguage(for content: String, preferred: [String]) -> String {
    LanguageDetection.detectLanguageCode(for: content, fallback: preferred.first)
        ?? preferred.first ?? "fr"
}
```

Puis, aux 3 sites d'envoi (lignes ~2394, ~2436, ~2706) qui font `originalLanguage ?? defaultComposeLanguage()`, remplacer par :

```swift
originalLanguage ?? Self.composeLanguage(for: content, preferred: preferredLanguages)
```

(`content` est le paramètre de `sendMessage(content:...)` — déjà en scope ; `preferredLanguages` est la propriété privée ligne ~3702.)

- [ ] **Step 4: Run test + build**

Run: `./apps/ios/meeshy.sh test --only MeeshyTests/ComposeLanguageTests` puis `./apps/ios/meeshy.sh build`
Expected: PASS (4 tests) + BUILD SUCCEEDED. Vérifier qu'aucune référence résiduelle à `defaultComposeLanguage()` ne subsiste (`grep -n defaultComposeLanguage apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` → vide).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift \
        apps/ios/MeeshyTests/Unit/ViewModels/ComposeLanguageTests.swift
git commit -m "feat(ios): détecter la langue du message à l'émission (remplace defaultComposeLanguage hardcodé fr)"
```

---

### Task 3: Translator — vrai détecteur serveur (C2)

**Files:**
- Modify: `services/translator/src/services/translation_ml/translator_engine.py` (méthode `detect_language` lignes ~191-213 ; ajout imports + constantes en tête de module)
- Test: `services/translator/tests/test_detect_language.py`

**Interfaces:**
- Produces: `TranslatorEngine.detect_language(self, text: str, fallback: Optional[str] = None) -> str` — `langdetect` seuillé ; renvoie `fallback` ou `DEFAULT_DETECT_LANGUAGE` (jamais `'en'` codé en dur) quand texte court/incertain ; collapse `zh-cn`/`zh-tw` → `zh`.

- [ ] **Step 1: Write the failing test**

```python
import os
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from services.translation_ml.translator_engine import TranslatorEngine


def _engine():
    return TranslatorEngine(model_loader=MagicMock(), executor=ThreadPoolExecutor(max_workers=1))


def test_detect_french_confident():
    assert _engine().detect_language("Bonjour, comment allez-vous aujourd'hui mon ami ?") == "fr"


def test_detect_english_confident():
    assert _engine().detect_language("How are you doing today my dear friend?") == "en"


def test_short_text_uses_fallback_not_en():
    assert _engine().detect_language("Ok", fallback="fr") == "fr"


def test_uncertain_does_not_default_to_en():
    # texte trop court / sans features -> repli fallback, surtout PAS 'en'
    assert _engine().detect_language("🙂", fallback="fr") == "fr"


def test_no_fallback_uses_configured_default_not_en():
    # DEFAULT_DETECT_LANGUAGE = 'fr' par défaut (configurable), jamais 'en' arbitraire
    assert _engine().detect_language("xy") == "fr"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/translator && .venv/bin/python -m pytest tests/test_detect_language.py --no-cov -q 2>&1 | tail -15`
Expected: FAIL — l'ancien `detect_language` retourne `'en'` par défaut sur `"Ok"`, `"🙂"`, `"xy"`.

- [ ] **Step 3: Write minimal implementation**

En tête de module (près de `_URL_PATTERN`, après les imports existants), ajouter :

```python
import os
from typing import Optional

try:
    from langdetect import detect_langs, DetectorFactory, LangDetectException
    DetectorFactory.seed = 0  # déterministe
    _LANGDETECT_OK = True
except ImportError:
    _LANGDETECT_OK = False

DEFAULT_DETECT_LANGUAGE = os.getenv("TRANSLATOR_DEFAULT_DETECT_LANG", "fr")
DETECT_MIN_CONFIDENCE = float(os.getenv("TRANSLATOR_DETECT_MIN_CONFIDENCE", "0.80"))
```

Remplacer la méthode `detect_language` (lignes ~191-213) par :

```python
def detect_language(self, text: str, fallback: Optional[str] = None) -> str:
    """Détecte la langue source. langdetect seuillé ; jamais de défaut 'en'
    arbitraire — repli sur `fallback` puis `DEFAULT_DETECT_LANGUAGE`."""
    default = fallback or DEFAULT_DETECT_LANGUAGE
    cleaned = _URL_PATTERN.sub(" ", text or "").strip()
    if not _LANGDETECT_OK or sum(c.isalpha() for c in cleaned) < 4:
        return default
    try:
        ranked = detect_langs(cleaned)
    except LangDetectException:
        return default
    top = ranked[0]
    if top.prob < DETECT_MIN_CONFIDENCE:
        return default
    return top.lang.split("-")[0]  # zh-cn/zh-tw -> zh
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/translator && .venv/bin/python -m pytest tests/test_detect_language.py --no-cov -q 2>&1 | tail -15`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the existing ML suite for regressions**

Run: `cd services/translator && .venv/bin/python -m pytest tests/test_21_translation_ml_service.py tests/test_url_preservation.py --no-cov -q 2>&1 | tail -8`
Expected: PASS (pas de régression).

- [ ] **Step 6: Commit**

```bash
git add services/translator/src/services/translation_ml/translator_engine.py \
        services/translator/tests/test_detect_language.py
git commit -m "fix(translator): détection de langue via langdetect seuillé (supprime le défaut 'en')"
```

---

### Task 4: iOS — non-régression de la résolution Prisme (C3)

**Files:**
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/ConversationLanguagePreferencesResolveTests.swift`

**Interfaces:**
- Consumes: `ConversationLanguagePreferences(userId:systemLanguage:regionalLanguage:customDestinationLanguage:).resolved -> [String]` (API existante).

**But :** verrouiller que pour un utilisateur `systemLanguage=fr, regionalLanguage=en`, `resolved` produit `["fr","en"]` — donc une traduction `fr` d'un message anglais matche bien la 1re langue (la bulle bascule en français + affiche le drapeau). C'est la garantie côté entrée de l'affichage (la logique `preferredTranslation` 3711-3747, déjà correcte, en dépend).

- [ ] **Step 1: Write the failing test (puis vérifier qu'il PASSE déjà — c'est un lock de régression)**

```swift
import XCTest
@testable import Meeshy

final class ConversationLanguagePreferencesResolveTests: XCTestCase {
    func test_resolved_frPrimaryEnRegional_ordersFrFirst() {
        let prefs = ConversationLanguagePreferences(
            userId: "u1", systemLanguage: "fr", regionalLanguage: "en",
            customDestinationLanguage: nil)
        XCTAssertEqual(prefs.resolved, ["fr", "en"])
    }

    func test_resolved_dedupesCaseInsensitive() {
        let prefs = ConversationLanguagePreferences(
            userId: "u1", systemLanguage: "FR", regionalLanguage: "fr",
            customDestinationLanguage: nil)
        XCTAssertEqual(prefs.resolved, ["FR"])
    }

    func test_resolved_includesSystemLanguageWhenSet() {
        let prefs = ConversationLanguagePreferences(
            userId: "u1", systemLanguage: "fr", regionalLanguage: nil,
            customDestinationLanguage: nil)
        XCTAssertTrue(prefs.resolved.contains("fr"))
    }
}
```

- [ ] **Step 2: Run the test**

Run: `./apps/ios/meeshy.sh test --only MeeshyTests/ConversationLanguagePreferencesResolveTests`
Expected: PASS (3 tests) — comportement déjà correct, on le verrouille. Si un test échoue, c'est un vrai bug de résolution à corriger dans `ConversationLanguagePreferences.resolved`.

- [ ] **Step 3: Commit**

```bash
git add apps/ios/MeeshyTests/Unit/ViewModels/ConversationLanguagePreferencesResolveTests.swift
git commit -m "test(ios): verrouille la résolution Prisme (systemLanguage d'abord) pour l'affichage des bulles"
```

- [ ] **Step 4: Vérification device (manuelle, hors CI)**

Sur simu/device connecté avec un compte `systemLanguage=fr` : recevoir un message **anglais** (ex. depuis un autre compte) → la bulle doit afficher la traduction **française** + le **drapeau**. Envoyer un message **anglais** depuis iOS → vérifier en base que `originalLanguage='en'` (et non plus `'fr'`). C'est la preuve bout-en-bout de C1+C2+C3.

---

## Self-Review

- **Couverture spec :** C1 → Tasks 1+2 ; C2 → Task 3 ; C3 → Task 4. C4 (web) explicitement hors plan (fast-follow séparé). Remédiation base déjà faite (hors plan). ✓
- **Placeholders :** aucun — code complet à chaque step, commandes + sorties attendues fournies. ✓
- **Cohérence des types :** `LanguageDetection.detectLanguageCode(for:fallback:)` (Task 1) consommé par `ConversationViewModel.composeLanguage(for:preferred:)` (Task 2) ; `detect_language(text, fallback)` (Task 3) signature unique ; `ConversationLanguagePreferences(...).resolved` (Task 4) = API existante. ✓

## Déploiement

- Translator : push `main` → CI build image → `docker compose pull translator && up -d` sur prod (les changements `meta`/per-chunk précédents sont déjà déployés ; cette image ajoute le détecteur).
- iOS : build via TestFlight/CI iOS habituel.
- Web (C4) : plan séparé.
