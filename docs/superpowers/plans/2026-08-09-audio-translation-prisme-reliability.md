# Fiabilité de la traduction audio Prisme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire suivre l'audio traduit à la langue préférée de l'utilisateur automatiquement, sur iOS et web, exactement comme le texte — et corriger l'asymétrie des défauts qui bloque silencieusement la génération d'audio traduit pour tout le monde.

**Architecture:** iOS — un seul flag renommé (`hasExplicitAudioLanguage`) seedé à `true` dès l'`init` quand Prisme résout une traduction, au lieu de rester `false` jusqu'à un tap. Web — même distinction seed-automatique/choix-explicite via un `useRef` + un effet réactif qui re-dérive la langue à chaque arrivée de traduction tant que l'utilisateur n'a rien choisi. Gateway — deux défauts booléens alignés sur ceux du texte, sans migration (calculés à la lecture sur un champ JSON absent).

**Tech Stack:** Swift 6 / SwiftUI / Swift Testing (iOS, SDK), Next.js / React / Jest (web), Fastify / Zod / Jest (gateway).

## Global Constraints

- Spec source de vérité : `docs/superpowers/specs/2026-08-09-audio-translation-prisme-reliability-design.md`. Chaque tâche cite le fichier:ligne exact de la version du spec au moment de l'écriture — si le code a bougé depuis, relire la section correspondante avant d'implémenter.
- iOS est le frontend de référence : traiter la Tâche 1 avant/avec les tâches web, jamais après.
- `resolvePlaybackUrl` (iOS) ne change PAS de comportement — seul son paramètre est renommé. Ne pas modifier sa logique interne.
- Web : le setter public `setSelectedLanguage` retourné par le hook garde le même nom — ne pas casser `AudioControls.tsx:183,230` qui l'appellent déjà.
- Gateway : le flip des défauts doit toucher LES DEUX endroits (`packages/shared/types/preferences/audio.ts` ET `ConsentValidationService.ts`) — l'un sans l'autre n'a aucun effet observable (vérifié en investigation).
- Aucune migration de données nécessaire nulle part dans ce plan.

---

### Task 1: iOS — l'audio suit la langue Prisme dès l'ouverture

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift:716-728` (déclaration + doc du flag), `:849-851` (seed dans `init`), `:993-1013` (`switchToLanguage`), `:1356-1394` (`currentAudioUrl` + `resolvePlaybackUrl`)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioPlayerViewPlaybackLanguageTests.swift` (réécriture complète)

**Interfaces:**
- Produces: `AudioPlayerView.hasExplicitAudioLanguage: Bool` (renommage de `hasUserSelectedAudioLanguage`, même rôle élargi) ; `AudioPlayerView.resolvePlaybackUrl(selectedLanguage:hasExplicitLanguage:translatedAudios:originalUrl:)` (renommage du paramètre `isUserSelected` → `hasExplicitLanguage`, comportement inchangé).

- [ ] **Step 1: Write the failing tests — réécriture complète du fichier de test**

Remplacer tout le contenu de `packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioPlayerViewPlaybackLanguageTests.swift` par :

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// Regression guard for the Prisme audio-follow decision (2026-08-09) : la
/// piste audio suit désormais la langue Prisme résolue automatiquement, dès
/// l'ouverture — exactement comme le bandeau de transcription et comme le
/// texte des messages. Ceci renverse la politique antérieure ("B9 fix") qui
/// gardait les deux volontairement indépendants. Un choix EXPLICITE de
/// l'utilisateur (`switchToLanguage`, tap sur un pill ou binding
/// `externalLanguage`) reste toujours prioritaire et reste modifiable —
/// ce n'est plus la SEULE façon de faire jouer une traduction.
@Suite("AudioPlayerView.resolvePlaybackUrl")
struct AudioPlayerViewPlaybackLanguageTests {

    private func makeTranslatedAudio(targetLanguage: String, url: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "ta_\(targetLanguage)", attachmentId: "att_1", targetLanguage: targetLanguage,
            url: url, transcription: "hola", durationMs: 1200, format: "m4a",
            cloned: false, quality: 0.9, ttsModel: "chatterbox"
        )
    }

    // `resolvePlaybackUrl` elle-même ne change pas de comportement : seul son
    // paramètre est renommé (`isUserSelected` -> `hasExplicitLanguage`). Ces
    // 4 tests gardent leurs assertions d'origine.

    @Test("hasExplicitLanguage=false never affects playback, even when a translated audio matches")
    func test_notExplicit_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            hasExplicitLanguage: false,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    @Test("hasExplicitLanguage=true with a matching translated audio plays the translation")
    func test_explicit_withMatch_returnsTranslatedUrl() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            hasExplicitLanguage: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/es.m4a")
    }

    @Test("hasExplicitLanguage=true with \"orig\" always returns the original, even with translations available")
    func test_explicitOrig_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "es", url: "https://x/es.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "orig",
            hasExplicitLanguage: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    @Test("hasExplicitLanguage=true with no matching translated audio falls back to the original")
    func test_explicit_withoutMatch_returnsOriginal() {
        let translated = [makeTranslatedAudio(targetLanguage: "pt", url: "https://x/pt.m4a")]
        let resolved = AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: "es",
            hasExplicitLanguage: true,
            translatedAudios: translated,
            originalUrl: "https://x/orig.m4a"
        )
        #expect(resolved == "https://x/orig.m4a")
    }

    // Ce test-ci a un VRAI changement de comportement : c'est l'`init` qui
    // change, pas `resolvePlaybackUrl`.

    @Test("init marks the language as explicit when Prisme resolves a real translation")
    @MainActor
    func test_init_marksLanguageAsExplicitWhenPrismeResolvesATranslation() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1", fileName: "a.m4a", mimeType: "audio/m4a",
            fileUrl: "https://x/a.m4a", duration: 1600
        )
        let view = AudioPlayerView(
            attachment: attachment,
            context: .messageBubble,
            initialTranscriptionLanguage: "es"
        )
        #expect(view.selectedAudioLanguage == "es")
        #expect(view.hasExplicitAudioLanguage == true)
    }

    @Test("init leaves the language non-explicit when there is no Prisme translation to seed")
    @MainActor
    func test_init_leavesLanguageNonExplicitWithoutATranslation() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1", fileName: "a.m4a", mimeType: "audio/m4a",
            fileUrl: "https://x/a.m4a", duration: 1600
        )
        let view = AudioPlayerView(
            attachment: attachment,
            context: .messageBubble,
            initialTranscriptionLanguage: nil
        )
        #expect(view.selectedAudioLanguage == "orig")
        #expect(view.hasExplicitAudioLanguage == false)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioPlayerViewPlaybackLanguageTests -quiet`

Expected: FAIL — le code ne compile même pas encore (`hasExplicitAudioLanguage`, `hasExplicitLanguage` n'existent pas dans `AudioPlayerView.swift`).

- [ ] **Step 3: Write the minimal implementation**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`, remplacer le bloc de déclaration et sa doc (lignes 716-728) :

```swift
    /// Seeded from `initialTranscriptionLanguage` in `init` (Prisme default),
    /// then owned by user interaction (language pill taps, `externalLanguage`)
    /// exactly like before. Internal (not `private`) so `@testable import`
    /// can observe the seeding decision from MeeshyUITests without exposing
    /// it publicly — same pattern as `usesExternalPlayer` above.
    @State internal var selectedAudioLanguage: String
    /// Prisme audio-follow (2026-08-09) — `selectedAudioLanguage` doubles as
    /// the Prisme-seeded transcription-STRIP default AND the playback
    /// language: this flag says whether `selectedAudioLanguage` should steer
    /// which audio track plays. Seeded in `init` to `true` when Prisme
    /// already resolved a real translation (`initialTranscriptionLanguage !=
    /// nil`/`!= "orig"`) — reversing the prior "B9 fix" policy that kept
    /// transcription-strip language and playback language independent by
    /// design. Also flips to `true` inside `switchToLanguage` on an explicit
    /// language-pill tap or `externalLanguage` binding change (idempotent —
    /// already `true` in that case). Consulted by `resolvePlaybackUrl` so
    /// `currentAudioUrl` only ever falls back to the original when NEITHER
    /// Prisme nor the user resolved a translated language. Internal for the
    /// same testability reason as `selectedAudioLanguage`.
    @State internal var hasExplicitAudioLanguage: Bool
```

Remplacer le seed dans l'`init` (lignes 849-851) :

```swift
        self._selectedAudioLanguage = State(
            initialValue: AudioPlayerView.resolveInitialTranscriptionLanguage(initialTranscriptionLanguage)
        )
        self._hasExplicitAudioLanguage = State(
            initialValue: AudioPlayerView.resolveInitialTranscriptionLanguage(initialTranscriptionLanguage) != "orig"
        )
```

Dans `switchToLanguage` (lignes 993-1013), renommer la référence au flag :

```swift
    private func switchToLanguage(_ code: String) {
        // Bug §1.1 fix: stop playback immediately instead of calling
        // player.play(urlString:) directly on the new language URL.
        // The previous behavior bypassed the availability gate, silently
        // streaming the translated audio when it wasn't cached. The parent
        // (AudioMediaView via the externalLanguage binding) re-resolves
        // availability for the new URL and triggers auto-DL (if policy
        // permits) or shows the download button. The user re-taps play,
        // which goes through handlePlayTap() — gated by availability.
        player.stop()

        // Explicit user intent (pill tap / externalLanguage binding) always
        // marks the language explicit — idempotent if Prisme had already
        // seeded it true in `init`.
        hasExplicitAudioLanguage = true
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            selectedAudioLanguage = code
        }
    }
```

Dans `currentAudioUrl`/`resolvePlaybackUrl` (lignes 1356-1394), renommer le paramètre (comportement du corps de la fonction inchangé) :

```swift
    private var currentAudioUrl: String {
        AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: selectedAudioLanguage,
            hasExplicitLanguage: hasExplicitAudioLanguage,
            translatedAudios: translatedAudios,
            originalUrl: attachment.fileUrl
        )
    }

    /// Pure resolution of the actual URL `handlePlayTap` hands the playback
    /// engine. Prisme audio-follow (2026-08-09) — `selectedLanguage` is
    /// steered to playback whenever `hasExplicitLanguage` is `true`, whether
    /// that came from the automatic Prisme seed in `init` or from an
    /// explicit `switchToLanguage` call. When `false` (no Prisme translation
    /// resolved and no user action yet), this always resolves to
    /// `originalUrl`. Extracted as a `nonisolated static` helper — same
    /// pattern as `resolveInitialTranscriptionLanguage` / `shouldDelegateToParent`
    /// elsewhere in this file — so it is unit-testable without a SwiftUI
    /// render lifecycle.
    nonisolated internal static func resolvePlaybackUrl(
        selectedLanguage: String,
        hasExplicitLanguage: Bool,
        translatedAudios: [MessageTranslatedAudio],
        originalUrl: String
    ) -> String {
```

**Ne pas changer le corps de la fonction après cette signature** (le `guard`/la recherche dans `translatedAudios` restent identiques — remplacer uniquement `isUserSelected` par `hasExplicitLanguage` partout où le corps y référence l'ancien nom de paramètre).

- [ ] **Step 4: Run tests to verify they pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioPlayerViewPlaybackLanguageTests -quiet`
Expected: PASS — les 6 tests verts.

- [ ] **Step 5: Full SDK build + test suite (non-régression)**

Run: `./apps/ios/meeshy.sh build`
Expected: build vert (aucun autre call site de `hasUserSelectedAudioLanguage`/`isUserSelected` dans `AudioPlayerView.swift` ou ailleurs dans le SDK — si le compilateur en signale un, le renommer à l'identique du reste de cette tâche).

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioPlayerViewPlaybackLanguageTests.swift
git commit -m "feat(ios): audio suit la langue Prisme automatiquement, comme le texte"
```

---

### Task 2: Web — la langue sélectionnée se met à jour quand la traduction arrive

**Files:**
- Modify: `apps/web/hooks/use-audio-translation.ts:116-126` (extraction de `resolveAutoLanguage`, nouvel effet, `handleSetSelectedLanguage`), `:398-415` (objet retourné)
- Test: `apps/web/__tests__/hooks/use-audio-translation.test.ts`

**Interfaces:**
- Consumes: rien de nouveau côté paramètres publics du hook.
- Produces: `resolveAutoLanguage(userLanguages, translatedAudios, originalLanguage): string` (fonction pure interne au fichier, non exportée — testée indirectement via le hook, cf. Step 1).

- [ ] **Step 1: Write the failing test**

Dans `apps/web/__tests__/hooks/use-audio-translation.test.ts`, ajouter un nouveau `describe` juste après le bloc `describe('initialLanguage selection', ...)` (après la ligne 216, avant `describe('currentAudioUrl', ...)`) :

```ts
  describe('reactive auto-selection when a translation arrives after mount', () => {
    it('updates selectedLanguage automatically when a preferred-language translation arrives via socket', () => {
      let progressiveListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsProgressive.mockImplementation((listener) => {
        progressiveListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranscription: makeTranscription({ language: 'de' }),
            userLanguages: ['fr', 'en'],
            // Pas de initialTranslations : aucune traduction au montage.
          })
        )
      );

      expect(result.current.selectedLanguage).toBe('original');

      act(() => {
        progressiveListener?.(makeTranslationEventData({ language: 'fr' }));
      });

      expect(result.current.selectedLanguage).toBe('fr');
    });

    it('does not override an explicit user selection when a later translation arrives', () => {
      let progressiveListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsProgressive.mockImplementation((listener) => {
        progressiveListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranscription: makeTranscription({ language: 'de' }),
            userLanguages: ['fr', 'en'],
          })
        )
      );

      act(() => {
        result.current.setSelectedLanguage('original');
      });

      act(() => {
        progressiveListener?.(makeTranslationEventData({ language: 'fr' }));
      });

      expect(result.current.selectedLanguage).toBe('original');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx jest __tests__/hooks/use-audio-translation.test.ts -t "reactive auto-selection"`
Expected: FAIL sur le premier test (`selectedLanguage` reste `'original'` après l'arrivée de la traduction — aucun mécanisme ne le re-dérive aujourd'hui). Le second test PASSE déjà par accident (rien ne change jamais `selectedLanguage` automatiquement pour l'instant) — il deviendra un vrai test de non-régression une fois le Step 3 fait.

- [ ] **Step 3: Write the minimal implementation**

Dans `apps/web/hooks/use-audio-translation.ts`, remplacer le bloc `initialLanguage`/`selectedLanguage` (lignes 115-126) par :

```ts
  // Auto-sélection de la langue selon les préférences utilisateur — logique
  // partagée entre le seed initial et la ré-évaluation réactive ci-dessous.
  const resolveAutoLanguage = useCallback(
    (audios: readonly SocketIOTranslatedAudio[]): string => {
      if (!userLanguages?.length || audios.length === 0) return 'original';
      const originalLang = initialTranscription?.language;
      if (originalLang && userLanguages.includes(originalLang)) return 'original';
      for (const lang of userLanguages) {
        if (audios.find(t => t.targetLanguage === lang && t.url)) return lang;
      }
      return 'original';
    },
    [userLanguages, initialTranscription?.language]
  );

  const [selectedLanguage, setSelectedLanguage] = useState<string>(() =>
    resolveAutoLanguage(initialTranslatedAudios)
  );

  // Suit un choix EXPLICITE de l'utilisateur (tap sur un pill) — tant qu'il
  // n'a pas eu lieu, la langue continue de suivre Prisme automatiquement
  // quand une nouvelle traduction arrive après le montage (cas le plus
  // courant : audio fraîchement envoyé/reçu, traduction encore en cours).
  const hasManualSelectionRef = useRef(false);

  const handleSetSelectedLanguage = useCallback((language: string) => {
    hasManualSelectionRef.current = true;
    setSelectedLanguage(language);
  }, []);

  useEffect(() => {
    if (hasManualSelectionRef.current) return;
    setSelectedLanguage(resolveAutoLanguage(translatedAudios));
  }, [translatedAudios, resolveAutoLanguage]);
```

Note : `transcription` (le state, pas `initialTranscription`) n'est PAS utilisé dans `resolveAutoLanguage` — la langue originale de référence reste `initialTranscription?.language`, cohérent avec le comportement actuel qui ne l'a jamais fait dépendre de la transcription re-reçue via socket.

Puis, dans l'objet retourné par le hook (autour de la ligne 408), remplacer :

```ts
    selectedLanguage,
    setSelectedLanguage,
```

par :

```ts
    selectedLanguage,
    setSelectedLanguage: handleSetSelectedLanguage,
```

Enfin, ajouter `useRef` à l'import React en tête de fichier (ligne 1) :

```ts
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx jest __tests__/hooks/use-audio-translation.test.ts`
Expected: PASS sur l'ensemble du fichier — les deux nouveaux tests ET tous les tests existants (`initialLanguage selection`, `setSelectedLanguage`, `currentAudioUrl`, etc.), aucune régression.

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/use-audio-translation.ts \
        apps/web/__tests__/hooks/use-audio-translation.test.ts
git commit -m "fix(web/audio): re-derive la langue auto quand une traduction arrive après le montage"
```

---

### Task 3: Web — `SimpleAudioPlayer` utilise la résolution Prisme partagée

**Files:**
- Modify: `apps/web/components/audio/SimpleAudioPlayer.tsx:66-76`
- Test: `apps/web/__tests__/components/audio/SimpleAudioPlayer.test.tsx`

**Interfaces:**
- Consumes: `getUserLanguagePreferences(user): string[]` (déjà existant, `apps/web/utils/user-language-preferences.ts:129-131`).

- [ ] **Step 1: Write the failing test**

Dans `apps/web/__tests__/components/audio/SimpleAudioPlayer.test.tsx`, ajouter après les mocks existants (après la ligne 35) :

```ts
const mockUseAuth = jest.fn(() => ({ user: null as any }));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetUserLanguagePreferences = jest.fn(() => [] as string[]);
jest.mock('@/utils/user-language-preferences', () => ({
  getUserLanguagePreferences: (...args: any[]) => mockGetUserLanguagePreferences(...args),
}));
```

Puis, dans le `beforeEach` existant (ligne 68-70), réinitialiser le mock après le `clearAllMocks` :

```ts
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
    mockGetUserLanguagePreferences.mockReturnValue([]);
  });
```

Enfin, ajouter un nouveau `describe`, à la suite du bloc `describe('Initial Rendering', ...)` :

```ts
  describe('User language resolution', () => {
    it('derives userLanguages from getUserLanguagePreferences, not a local recomputation', async () => {
      const fakeUser = { id: 'u1', systemLanguage: 'fr', regionalLanguage: 'en' };
      mockUseAuth.mockReturnValue({ user: fakeUser });
      mockGetUserLanguagePreferences.mockReturnValue(['fr', 'en', 'de']);
      const attachment = createMockAttachment();

      await act(async () => {
        render(<SimpleAudioPlayer attachment={attachment} />);
      });

      expect(mockGetUserLanguagePreferences).toHaveBeenCalledWith(fakeUser);
    });

    it('does not call getUserLanguagePreferences when there is no authenticated user', async () => {
      mockUseAuth.mockReturnValue({ user: null });
      const attachment = createMockAttachment();

      await act(async () => {
        render(<SimpleAudioPlayer attachment={attachment} />);
      });

      expect(mockGetUserLanguagePreferences).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx jest __tests__/components/audio/SimpleAudioPlayer.test.tsx -t "User language resolution"`
Expected: FAIL sur le premier test (`getUserLanguagePreferences` n'est pas encore appelée — le composant calcule toujours `userLanguages` à la main). Le second test PASSE déjà (rien n'appelle la fonction dans aucun cas pour l'instant).

- [ ] **Step 3: Write the minimal implementation**

Dans `apps/web/components/audio/SimpleAudioPlayer.tsx`, ajouter l'import (après la ligne 15, à la suite de `useAuth`) :

```ts
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';
```

Remplacer le bloc `userLanguages` (lignes 66-76) par :

```ts
  // Langues préférées de l'utilisateur pour auto-sélection audio — délègue à
  // la résolution Prisme partagée (systemLanguage > regional > custom >
  // deviceLocale), au lieu de réimplémenter l'ordre de priorité localement.
  const userLanguages = useMemo(() => {
    if (!user) return undefined;
    const langs = getUserLanguagePreferences(user);
    return langs.length > 0 ? langs : undefined;
  }, [user]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx jest __tests__/components/audio/SimpleAudioPlayer.test.tsx`
Expected: PASS sur l'ensemble du fichier.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/audio/SimpleAudioPlayer.tsx \
        apps/web/__tests__/components/audio/SimpleAudioPlayer.test.tsx
git commit -m "fix(web/audio): SimpleAudioPlayer utilise getUserLanguagePreferences au lieu d'un calcul local"
```

---

### Task 4: Gateway — aligner les défauts de génération audio sur le texte

**Files:**
- Modify: `packages/shared/types/preferences/audio.ts:15,19,40,42`
- Modify: `services/gateway/src/services/ConsentValidationService.ts:121,123`
- Test: `services/gateway/src/__tests__/unit/services/ConsentValidationService.test.ts`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `AUDIO_PREFERENCE_DEFAULTS.audioTranslationEnabled === true`, `AUDIO_PREFERENCE_DEFAULTS.ttsEnabled === true` — consommé par tout code qui importe cette constante (`me-preferences.test.ts` notamment, déjà vérifié compatible car il ne fait que la spread comme fixture, sans assertion sur ces deux champs précis).

**Vérifié pendant l'investigation** : `packages/shared/types/preferences/__tests__/preferences.test.ts` et `services/gateway/src/__tests__/unit/routes/me-preferences.test.ts` importent `AUDIO_PREFERENCE_DEFAULTS` mais n'assertent jamais `audioTranslationEnabled`/`ttsEnabled` à une valeur littérale précise — aucun changement requis dans ces deux fichiers. Le second fichier homonyme `services/gateway/src/__tests__/ConsentValidationService.test.ts` (732 lignes) n'a aucune assertion qui dépende du défaut bare-boolean (tous ses tests pertinents utilisent soit les timestamps `…EnabledAt` legacy — qui court-circuitent le défaut — soit un scénario zéro-consentement — où le défaut ne change rien) : aucun changement requis là non plus.

- [ ] **Step 1: Update the one existing test that asserts the old default, in the SAME file**

Dans `services/gateway/src/__tests__/unit/services/ConsentValidationService.test.ts`, remplacer le test des lignes 54-64 :

```ts
  // AVANT (à retirer) :
  it('derives canTranscribeAudio from schema default (transcriptionEnabled=true) when audio prefs are empty', async () => {
    const service = new ConsentValidationService(makePrisma({ user: fullVoiceConsent }));

    const status = await service.getConsentStatus('u1');

    expect(status.canTranscribeAudio).toBe(true);
    expect(status.canTranslateText).toBe(true);
    // audioTranslationEnabled / ttsEnabled default to false
    expect(status.canTranslateAudio).toBe(false);
    expect(status.canGenerateTranslatedAudio).toBe(false);
  });
```

par :

```ts
  it('derives full audio pipeline from schema defaults when audio prefs are empty (2026-08-09: aligned with text)', async () => {
    const service = new ConsentValidationService(makePrisma({ user: fullVoiceConsent }));

    const status = await service.getConsentStatus('u1');

    expect(status.canTranscribeAudio).toBe(true);
    expect(status.canTranslateText).toBe(true);
    // audioTranslationEnabled / ttsEnabled default to true, aligned with text
    // (2026-08-09) — seul un consentement voix manquant les bloque encore,
    // pas ce défaut.
    expect(status.canTranslateAudio).toBe(true);
    expect(status.canGenerateTranslatedAudio).toBe(true);
  });

  it('respects an explicit audioTranslationEnabled=false even though the schema default flipped to true', async () => {
    const service = new ConsentValidationService(
      makePrisma({ user: fullVoiceConsent, audio: { audioTranslationEnabled: false } })
    );

    const status = await service.getConsentStatus('u1');

    expect(status.canTranslateAudio).toBe(false);
    expect(status.canGenerateTranslatedAudio).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/gateway && bun run test -- ConsentValidationService.test.ts`
Expected: FAIL sur les deux tests ci-dessus — le premier attend `true`/`true` alors que le code actuel retourne `false`/`false` ; le second passe déjà par accident (le défaut actuel est déjà `false`) mais doit être vérifié APRÈS le Step 3 pour confirmer qu'il teste bien le bon mécanisme (opt-out explicite), pas juste le défaut inchangé.

- [ ] **Step 3: Write the minimal implementation**

Dans `packages/shared/types/preferences/audio.ts`, ligne 15 et 19 :

```ts
  // Traduction audio
  audioTranslationEnabled: z.boolean().default(true),
  translatedAudioFormat: z.enum(['mp3', 'wav', 'ogg']).default('mp3'),

  // Text-to-Speech
  ttsEnabled: z.boolean().default(true),
```

Et lignes 40, 42 (`AUDIO_PREFERENCE_DEFAULTS`) :

```ts
  audioTranslationEnabled: true,
  translatedAudioFormat: 'mp3',
  ttsEnabled: true,
```

Dans `services/gateway/src/services/ConsentValidationService.ts`, lignes 120-123 :

```ts
    const audioTranslationEnabled =
      !!audioPrefs.audioTranslationEnabledAt || boolPref(audioPrefs.audioTranslationEnabled, true);
    const translatedAudioGenerationEnabled =
      !!audioPrefs.translatedAudioGenerationEnabledAt || boolPref(audioPrefs.ttsEnabled, true);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/gateway && bun run test -- ConsentValidationService.test.ts`
Expected: PASS sur les deux tests, et sur l'ensemble du fichier (aucune régression sur les tests de consentement zéro/legacy).

- [ ] **Step 5: Local test parity (bun) — suite gateway complète**

```bash
cd packages/shared && npx prisma generate --generator client
cd packages/shared && bun run build
cd services/gateway && bun run test:coverage
```

Expected: même score vert qu'avant (249/249 suites) — un flip de défaut booléen sans backfill ne doit rien casser d'autre.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/types/preferences/audio.ts \
        services/gateway/src/services/ConsentValidationService.ts \
        services/gateway/src/__tests__/unit/services/ConsentValidationService.test.ts
git commit -m "fix(shared,gateway): active audioTranslationEnabled/ttsEnabled par défaut, aligné sur le texte"
```

---

### Task 5: Documentation

**Files:**
- Modify: `packages/MeeshySDK/decisions.md`
- Modify: `services/gateway/decisions.md`

**Interfaces:** aucune — documentation seule.

- [ ] **Step 1: Add an ADR entry to packages/MeeshySDK/decisions.md**

Documenter le renversement de la décision "B9 fix" : `hasExplicitAudioLanguage` seedé `true` par Prisme dès l'`init`, alternative écartée (suppression pure du flag), lien vers `docs/superpowers/specs/2026-08-09-audio-translation-prisme-reliability-design.md`.

- [ ] **Step 2: Add an ADR entry to services/gateway/decisions.md**

Documenter le flip des défauts `audioTranslationEnabled`/`ttsEnabled`, la raison (asymétrie avec le texte), l'absence de migration nécessaire (calcul à la lecture), et le fait que le consentement voix de base (`hasVoiceDataConsent`) reste inchangé.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/decisions.md services/gateway/decisions.md
git commit -m "docs(ios,gateway): documente le renversement Prisme audio et le flip des défauts"
```
