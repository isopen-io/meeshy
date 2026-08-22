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
- [ ] Gate réel : CI iOS Tests.

## Non-fait, et pourquoi

- **`MeeshyAppIntents.swift:272`** — demande un compilateur (`LocalizedStringResource`), motif déjà retenu par 235i et 236i.
- **Formes `one` / relecture arabe / effectif plafonné / tap VoiceOver du picker / `InteractiveProgressBar`** — reportés au pointeur 238i+, chacun avec sa raison (garde inatteignable, relecture native, simulateur).

## Empreinte

| | |
|---|---|
| Fichier production modifié | 1 (`ConversationListHelpers.swift`, −8 lignes) |
| Fichier production neuf | 1 (`CompactCountLabel.swift`) |
| Fichier test | 1 neuf (7 tests de propriétés) |
| Clés i18n neuves | **0** (tout vient de CLDR) |
| Fichiers pbxproj | 1 (8 entrées ajoutées) |
| Changement visuel | **oui, assumé** — « 1.0k » → « 1 k » (fr) / « 1K » (en) ; sous 1000, rien ne bouge |
| Logique / réseau / SDK | 0 |
