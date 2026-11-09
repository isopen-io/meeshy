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

### Ce que la 0.106 change dans la vie d'une session : Tahini (audit du 2026-11-09)

Entre v0.105.4 et v0.106.2, l'amont introduit **Tahini**, une politique de gestion des sessions par appareil que les notes de version ne mentionnent pas (`rust/protocol/src/tahini.rs`, nouveau). Le format du fil et des enregistrements reste lisible dans les deux sens (vecteurs croisés, `legacy/0.105.4.vectors.json`), mais le comportement change :

- **Nouveaux champs d'enregistrement** : `SessionStructure.origin` (qui a ouvert la session : locale, distante, ou `Legacy` pour une session d'avant Tahini) et `RecordStructure.tahini` (sens de la dernière action, compteur de changements de sens). Une session 0.105.4 relue en 0.106.2 porte `Legacy` et se comporte comme une session distante une fois acquittée.
- **Ouverture simultanée arbitrée** : quand les deux pairs ouvrent chacun une session avant d'avoir reçu celle de l'autre, la session dont l'identifiant est le plus grand prend la place active et l'autre part en archive. Mesuré par `services/gateway/src/services/e2ee/__tests__/libsignal-tahini.test.ts` : les deux premiers messages s'ouvrent, puis l'échange reprend sans perte, en 0.105.4 comme en 0.106.2.
- **Détecteur d'interblocage** : après plus de 5 changements de sens entre un envoi et une réception sur une session archivée (`MAX_DIR_CHANGES`, `on_receive_inactive`), la session active est archivée pour forcer une nouvelle ouverture.
- **Trois sessions archivées au lieu de quarante** (`consts.rs` : `ARCHIVED_STATES_MAX_LENGTH = 40` devient `MAX_ARCHIVED_SESSIONS = 3`). Mesuré par le même banc : un SignalMessage en vol s'ouvre encore après 3 redémarrages de session côté destinataire, et plus après 4 ; en 0.105.4, il s'ouvrait encore après 40 et plus après 41.
- **`session_cipher_legacy` est retiré** : il n'était appelé par aucun code de Meeshy.

**Conséquences pour Meeshy** :
- **Pré-clés à usage unique** : après une rupture (interblocage cassé, ou ouverture simultanée perdue), un appareil n'a plus de session active vers son pair. Les scelleurs (`E2EEMessageSealer.withSessions`, `packages/MeeshySDK/Sources/MeeshyE2EE/E2EEMessageSealer.swift`, et `E2eeMessageSealer.withSessions`, `apps/android/core/e2ee/.../E2eeMessageSealer.kt`) relancent alors `startSession` depuis un bundle neuf, ce qui consomme une pré-clé à usage unique de l'annuaire. Le réapprovisionnement existant couvre ce coût ; une rafale de ruptures se verrait au compteur de pré-clés restantes.
- **Messages en vol** : un message chiffré sur une session plus ancienne que les trois dernières archivées devient illisible. Les scelleurs effacent déjà toute la session (`deleteSession`) avant d'en rouvrir une, donc la limite joue surtout chez le destinataire, quand plusieurs ouvertures distantes se succèdent pendant qu'un message est en route (appareil hors ligne longtemps, réinstallations répétées du pair).
- **Témoins** : la passerelle fixe les deux comportements (`libsignal-tahini.test.ts`). Le même témoin sur les bancs clients (SDK iOS, `:core:e2ee`) est suivi par une issue fille de #17007.
