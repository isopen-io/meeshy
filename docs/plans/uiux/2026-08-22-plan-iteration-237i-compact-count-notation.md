# Plan — Iteration-237i : l'abrégé des grands nombres passe à la notation compacte native

**Analyse** : `docs/analyses/uiux/2026-08-22-iteration-237i-compact-count-notation.md`
**Base** : `main` HEAD `2bfaebf5` · **Branche** : `claude/intelligent-noether-kana7q` (re-lancée fraîche)

## Objectif

Rendre l'abrégé « 1,5 k » par Foundation, dans la locale du lecteur — séparateur
décimal ET abréviation — au lieu de le composer à la main en format POSIX.

## Étapes

- [x] Resync sur `origin/main` HEAD `2bfaebf5` (post-merge 236i).
- [x] **Vérifier que 233i a atterri en ENTIER** sur `main` — modifiers de production, `static var`, fichier de test, 4 entrées pbxproj. Le pointeur 236i indiquait #3250 « reste ouverte » ; elle a mergé depuis. Contrôle imposé par la leçon 236i (deux branches vertes séparément, fausses ensemble).
- [x] Numéro **237i** choisi strictement au-dessus du plus haut mergé (236i). Collision essaim : **0 PR iOS ouverte** (#3326 Android, #3325 gateway).
- [x] **Écarter le carry-over (a)** `MeeshyAppIntents.swift:272` pour la raison que le pointeur 236i donne lui-même : `IntentDialog` se compose depuis `LocalizedStringResource` → demande un compilateur.
- [x] Extraire `formatCount` en `CompactCountLabel`, jumeau de `MembersCountLabel` (234i) et `UnreadCountLabel` (236i) — même dossier, même idiome `enum` + statique + locale en paramètre.
- [x] Remplacer le corps par `IntegerFormatStyle<Int>(locale:).notation(.compactName).format(count)`.
- [x] **Correction après CI rouge** — la première rédaction, `count.formatted(.number.notation(.compact).locale(locale))`, ne compilait pas, pour DEUX raisons distinctes : (1) `.number` n'a pas de base à inférer à travers la surcharge générique `BinaryInteger.formatted(_:)` (« type 'BinaryInteger' has no member 'number' ») ; (2) **`.compact` n'existe pas** — `NumberFormatStyleConfiguration.Notation` n'offre que `.automatic`, `.scientific` et `.compactName`. Style nommé + `format(_:)` : aucune inférence en jeu.
- [x] Recâbler les 2 sites d'appel, supprimer le `private func` (non testable depuis le bundle — c'est ce qui a laissé le défaut survivre à 234i et 236i).
- [x] Ajouter `CompactCountLabelTests` — 7 tests de **propriétés**, jamais de chaîne CLDR exacte (elles appartiennent à Foundation et bougent avec iOS).
- [x] Ajouter les 8 entrées `pbxproj` (4 helper + 4 suite).
- [x] `grep` sur tout `apps/ios` : plus aucune référence vivante à `formatCount` (méthode imposée par la leçon 236i).
- [x] Documenter analyse + plan + pointeur, **en tabulant le changement visuel** plutôt qu'en le passant sous silence.
- [x] **Revue de merge (jcnm) — 3 constats, tous justes, 2 miens.** (1) ne compilait pas → déjà corrigé avant la revue ; (2) **correctif incomplet** : jumeau `formatCount` dans `packages/MeeshySDK/.../CommunityListView.swift:314` (`VibrantCommunityCard`) — mon grep « dépôt entier » n'avait porté que sur `apps/ios`, violation de la leçon 236i que l'analyse citait ; (3) pointeur faux (« seule occurrence résiduelle = doc-comment »), qui aurait enterré le jumeau.
- [x] **Déplacer** `CompactCountLabel` dans `MeeshyUI/Theme/` (`public`, `nonisolated`) plutôt que **porter l'appel** comme proposé : porter l'appel aurait dupliqué la règle dans deux modules, ce que 234i et 236i ont mis deux itérations à défaire. Case « rule engines stateless → SDK » du tableau de placement.
- [x] Recâbler `VibrantCommunityCard` (SDK) sur le helper ; **aucun site d'appel app modifié** (l'app importait déjà `MeeshyUI`).
- [x] Déplacer la suite en **phase 0** (`MeeshyUITests`) ; **`pbxproj` remis à l'identique de `main`** (les deux fichiers vivent désormais dans le package SPM).
- [x] Refaire le grep **pour de bon** (`grep -rn --include=*.swift .`) → **six sites de plus** de la même famille, documentés en piste 238i+ (non absorbés : seuils divergents `>= 10_000` vs `>= 1_000`, décision produit).
- [x] Corriger le pointeur ; consigner les deux leçons dans `tasks/lessons.md`.
- [ ] Gate réel : CI iOS Tests + phase 0 SDK.

## Non-fait, et pourquoi

- **`MeeshyAppIntents.swift:272`** — demande un compilateur (`LocalizedStringResource`), motif déjà retenu par 235i et 236i.
- **Formes `one` / relecture arabe / effectif plafonné / tap VoiceOver du picker / `InteractiveProgressBar`** — reportés au pointeur 238i+, chacun avec sa raison (garde inatteignable, relecture native, simulateur).

## Empreinte

| | |
|---|---|
| Fichiers production modifiés | 2 (`ConversationListHelpers.swift` app + `CommunityListView.swift` SDK, −16 lignes) |
| Fichier production neuf | 1 (`MeeshyUI/Theme/CompactCountLabel.swift`) |
| Fichier test | 1 neuf, **phase 0 `MeeshyUITests`** (7 tests de propriétés) |
| Clés i18n neuves | **0** (tout vient de CLDR) |
| Fichiers pbxproj | **0 — identique à `main`** (fichiers neufs dans le package SPM) |
| Changement visuel | **oui, assumé** — « 1.0k » → « 1 k » (fr) / « 1K » (en) ; sous 1000, rien ne bouge |
| Logique / réseau / SDK | 0 |
