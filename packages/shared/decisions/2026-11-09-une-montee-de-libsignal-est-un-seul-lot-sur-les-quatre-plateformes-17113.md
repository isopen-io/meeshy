## 2026-11-09 : Une montée de libsignal est UN lot, sur les quatre plateformes, avec ses vecteurs régénérés (#17113)

**Statut** : Accepté (décision porteur du 2026-11-09, commentaire 6737719415 de #17113).

**Contexte** : un message scellé par libsignal sur une plateforme ne s'ouvre ailleurs que si les deux bouts parlent un format que l'autre lit. Le dépôt déclarait libsignal à quatre endroits, et ils avaient divergé : la passerelle en 0.106.1 puis 0.106.2 et shared en 0.106.2 (deux PR Dependabot, dont #17227, un correctif que la règle « ignorer mineures et majeures » laissait passer), iOS et Android en 0.105.4. Rien ne le voyait.

**Décisions** :
- **Une version, partout** : 0.106.2 depuis ce lot. Elle est déclarée par `services/gateway/package.json`, `packages/shared/package.json`, `packages/LibSignalClient/LIBSIGNAL_VERSION` (avec l'URL de la release `libsignal-ffi-v<version>` et sa somme de contrôle dans `Package.swift`), `apps/android/gradle/libs.versions.toml`, plus deux échos Android (`LibsignalNotices.VERSION`, `scripts/jvm-check/build.gradle.kts`) et le champ `libsignal` de `fixtures/libsignal/cross-platform.vectors.json`. La garde `__tests__/ci/libsignal-version-alignment.test.ts` exige qu'elles soient toutes identiques et exactes.
- **Une montée = un seul lot qui touche les quatre plateformes**, dans cet ordre :
  1. déplacer `fixtures/libsignal/cross-platform.vectors.json` dans `fixtures/libsignal/legacy/<ancienne version>.vectors.json` (jamais le supprimer) ;
  2. monter les déclarations ci-dessus ; côté iOS, recopier sans modification `swift/Sources/LibSignalClient`, `swift/Tests/LibSignalClientTests`, `LICENSE` et `acknowledgments/acknowledgments-ios.plist` du nouveau tag, laisser `libsignal-ffi.yml` publier la release, puis reporter sa somme de contrôle ; côté Android, recopier `acknowledgments-android.md` dans `feature/settings/src/main/res/raw/libsignal_acknowledgments.md` ; mettre `NOTICE` à jour ;
  3. régénérer les vecteurs (`cd packages/shared && node scripts/generate-libsignal-vectors.mjs`) ;
  4. prouver les trois bancs : jest (passerelle, `libsignal-cross-vectors.test.ts`), `sdk-tests.yml` (`LibsignalCrossPlatformVectorTests`), `android.yml` (`:core:e2ee`, `LibsignalCrossPlatformVectorsTest`).
- **Une session persistée avant une montée survit à la montée** (#9231) : chaque banc rejoue aussi chaque jeu de `legacy/`, sessions sérialisées comprises, avec la version courante. Le jeu scellé en 0.105.4, la version des sessions déjà persistées sur les appareils, est exigé par la garde. Une version qui ne lit plus un jeu de `legacy/` ne se monte pas.
- **Aucune montée automatique** : `.github/dependabot.yml` exclut `@signalapp/libsignal-client` sans restriction de type (correctifs compris) dans les trois entrées npm qui le voient (racine, passerelle, shared). Une entrée Gradle, si elle est créée, devra exclure `org.signal:*` de même ; la garde le vérifie.

**Hors du périmètre** : les vecteurs ne sont scellés que par Node. Des vecteurs scellés par les bindings Swift et Java sont suivis par #17126.
