# Itération 158i — Analyse UI/UX iOS : `SecurityVerificationView`

**Date** : 2026-07-18
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/SecurityVerificationView.swift`
**Base** : `main` HEAD (`f489355`)
**Branche** : `claude/laughing-thompson-akjplz`
**Gate** : CI `iOS Tests`

## Contexte

`SecurityVerificationView` est l'écran de vérification du chiffrement de bout-en-bout d'une conversation :
glyphe héro `lock.shield.fill`, titre « End-to-End Encryption », QR code du safety number, et le safety
number formaté en groupes de 5 chiffres. En section « pending » (clés Signal pas encore échangées) :
glyphe `hourglass.circle` + libellé « Verification Unavailable ».

Surface **écran de sécurité** — un des rares écrans où la lecture VoiceOver a une vraie fonction produit :
un utilisateur non-voyant doit pouvoir **comparer un safety number à voix haute** avec son interlocuteur.

Les polices étaient **déjà migrées** vers `MeeshyFont.relative(...)` (aucun `.font(.system(size:))`
résiduel — la mention de ce fichier dans la « traîne `.system` » des trackings 139i/branch-tracking était
**périmée**). La lacune réelle et **non couverte** était l'**accessibilité VoiceOver**.

## Constat (avant 158i)

1. **Glyphe héro `lock.shield.fill` (64pt)** — décoratif, lu par VoiceOver comme « lock shield fill » alors
   que le titre adjacent « End-to-End Encryption » porte déjà le sens (doublon sonore). Non masqué.
2. **Glyphe d'état `hourglass.circle` (40pt)** de la section pending — même problème, non masqué.
3. **QR code** (`Image(uiImage:)`) — **aucun `.accessibilityLabel`** : VoiceOver l'annonce comme une image
   anonyme, sans dire que c'est le QR du safety number à scanner sur l'autre appareil.
4. **Safety number** — les deux `Text` (libellé « Safety Number » + les chiffres) sont deux arrêts VoiceOver
   distincts, et les chiffres groupés (`12345 67890…`) sont lus comme de **grands nombres**
   (« douze mille trois cent quarante-cinq »), inutilisable pour une comparaison chiffre-à-chiffre.
5. Titres (`.isHeader`) absents → pas de navigation au rotor « En-têtes ».

## Corrections appliquées (1 fichier, 0 logique métier)

- **`lock.shield.fill` + `hourglass.circle` → `.accessibilityHidden(true)`** : glyphes ≥40pt décoratifs
  dont le libellé adjacent porte le sens (doctrine 74i/86i, cf. `TrackingLinksView`).
- **QR code → `.accessibilityLabel`** (`security.verify.qr.a11y`, défaut « QR code of the safety number,
  to scan on the other device ») : VoiceOver annonce désormais la fonction de l'image.
- **Bloc safety number → `.accessibilityElement(children: .combine)` + `.accessibilityLabel`** fusionnant
  le libellé et le numéro **épelé chiffre-par-chiffre** via le helper pur `spelledSafetyNumber(_:)`
  (« 1 2 3 4 5 … ») → un seul arrêt VoiceOver, lecture individuelle des chiffres pour la comparaison à voix
  haute.
- **Titres « End-to-End Encryption » et « Verification Unavailable » → `.accessibilityAddTraits(.isHeader)`** :
  navigation au rotor En-têtes.

Une seule clé i18n neuve (`security.verify.qr.a11y`) avec `defaultValue` inline — pattern établi du fichier
(aucune clé `security.verify.*` n'est dans le `.xcstrings`, l'extraction Xcode les alimente au build).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique métier (QR generation, `formatSafetyNumber` inchangés), 0 mutation d'état.
- Ajouts **purement additifs** : modificateurs a11y standards + 1 fonction pure `spelledSafetyNumber`.
  Aucun risque de compilation, aucun changement de rendu visuel ni de comportement.
- Aucun test ne référence `SecurityVerificationView` → aucune régression de test.

## Statut

**TERMINÉE** — passe VoiceOver de `SecurityVerificationView` : glyphes décoratifs masqués, QR labellisé,
safety number épelé + fusionné, titres en `.isHeader`. Polices déjà en `relative` (traîne `.system`
périmée pour ce fichier). Ne plus re-flagger cette surface pour Dynamic Type ni a11y.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `SecurityVerificationView` — a11y VoiceOver complète : 2 glyphes décoratifs (`lock.shield.fill`,
  `hourglass.circle`) masqués ; QR code labellisé (`security.verify.qr.a11y`) ; safety number fusionné en
  un élément + épelé chiffre-par-chiffre (`spelledSafetyNumber`) pour comparaison à voix haute ; 2 titres
  en `.isHeader`. Polices déjà `MeeshyFont.relative` (aucun `.system` résiduel). **SOLDÉ 158i.**
