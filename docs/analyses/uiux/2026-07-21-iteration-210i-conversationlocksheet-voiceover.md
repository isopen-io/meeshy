# Itération 210i — Analyse UI/UX iOS : `ConversationLockSheet` (feedback VoiceOver de saisie du PIN)

**Date** : 2026-07-21
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift`
**Base** : `main` HEAD (`22465a5`, PR #2214)
**Branche** : `claude/laughing-thompson-gbl1zk`
**Gate** : CI `iOS Tests`

## Contexte

`ConversationLockSheet` est la sheet native de saisie du PIN de verrouillage (master PIN 6ch / code
conversation 4ch) : glyphe hero cadenas + titre/sous-titre + **rangée de points** (`dotsRow`) + pavé
numérique custom. L'itération **137i** (`2026-07-04`) a déjà soldé les **3 `.font(.system(size:))`**
(annotation de gel : hero 84i masqué, `delete.left.fill` + chiffre bornés 82i par la touche 76×76). Les
titres/sous-titres/erreurs sont déjà `String(localized:)`, la palette (`MeeshyColors.error/indigo600`,
`theme.*`) déjà conforme.

**Gap NON traité par 137i** : tout l'état de saisie n'est véhiculé que **visuellement** (points remplis,
shake rouge). VoiceOver ne perçoit **aucun** feedback :

1. **`dotsRow` = points décoratifs muets** — aucun `.accessibilityElement`. Un utilisateur aveugle ne sait
   pas combien de chiffres il a saisis ni combien sont attendus. Violation directe de la règle Prisme a11y
   « ne jamais reposer sur le seul visuel / la seule couleur ».
2. **Aucune annonce de progression** — une touche du pavé ne lit que son chiffre (`Text("\(digit)")`) ;
   sans focus sur les points, l'utilisateur n'entend jamais « 2 sur 6 » comme le fait le champ passcode
   natif iOS.
3. **Échec de vérification muet** — `shakeAndReset` conserve un feedback uniquement visuel (shake + texte
   rouge) + haptique `.error()`. Le **motif** de la réinitialisation (« Master PIN incorrect », « Les codes
   ne correspondent pas »…) n'est jamais annoncé.

Aucune PR ouverte détectée ne touche `ConversationLockSheet` (dernier commit sur le fichier : 179i #2119).
Aucun test ne référence le composant. Numéro **210i** choisi strictement > 207i (plus haut mergé sur `main`)
pour clairer l'essaim en vol (208i/209i).

## Corrections appliquées (1 fichier, 0 logique de vérification touchée)

- **`dotsRow` → élément VoiceOver unique** : `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel` (`conversation.lock.a11y.pinProgress` = « Progression du code ») +
  `.accessibilityValue` calculé `pinProgressA11yValue` (`conversation.lock.a11y.pinProgressValue` =
  `%1$d sur %2$d`, plural-safe, calqué sur l'annonce d'un page control natif « page x sur n »). La
  progression devient **interrogeable** par swipe.
- **Annonce live de progression** : `announcePinProgress()` gaté sur `UIAccessibility.isVoiceOverRunning`,
  posté via `UIAccessibility.post(notification: .announcement, …)` (convention établie —
  `TrackingLinkDetailView`, `CallView`, `ShareLinkDetailView`). Appelé dans `appendDigit`
  (quand la saisie **ne** complète **pas** le PIN, pour éviter le bavardage juste avant une transition
  d'étape / un dismiss) et dans `deleteLastDigit`. Reproduit le comportement du champ passcode natif.
- **Annonce de l'échec** : dans `shakeAndReset`, post du `message` d'erreur (déjà localisé) pour VoiceOver,
  gaté sur `isVoiceOverRunning`. L'utilisateur aveugle sait désormais **pourquoi** la saisie s'est
  réinitialisée.

2 clés i18n neuves (`conversation.lock.a11y.pinProgress`, `.pinProgressValue`) — extraction Xcode au build,
**0 hand-edit `Localizable.xcstrings`**. Aucun `import` neuf (`UIAccessibility` fourni par `SwiftUI` sur iOS,
comme les 4 sites existants). `SwiftUI` gère l'import.

## Périmètre / non-régression

- **1 seul fichier**, 0 réseau, 0 SDK, 0 changement de layout / spacing / radii / couleur / hue, 0 modif de
  la logique de saisie/vérification (`handleComplete`, `verifyMasterPin`, `verifyLock`, `setLock`…). Les
  annonces sont un pur canal a11y additif, no-op quand VoiceOver est éteint.
- 0 police touchée (les 3 gels 137i restent intacts). 0 test neuf (aucun test ne référence le composant ;
  la valeur a11y est un pur getter dérivé de l'état existant).

## Statut

**TERMINÉE (code)** — `ConversationLockSheet` : feedback VoiceOver complet de la saisie du PIN
(points → élément « x sur n » interrogeable + annonces live de progression + annonce d'échec localisée).
Validation finale = CI `iOS Tests` (build macOS/Xcode — non reproductible dans le conteneur Linux headless ;
cohérent avec le gate des itérations précédentes).

## Reste (pistes 211i+)

- Autres numpads/champs custom véhiculant leur état par le seul visuel (auditer `KeypadTab`, sheets PIN
  éventuelles) — vérifier collision essaim avant.
- `dotsRow` : pas de live region native SwiftUI < iOS 17 ; l'annonce impérative reste la voie correcte au
  plancher iOS 16 de l'app.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ConversationLockSheet` — feedback VoiceOver de saisie du PIN : `dotsRow` élément « x sur n » + annonces
  live progression + annonce d'échec. **SOLDÉ 210i.** (Complète 137i qui n'avait traité que le gel des 3
  polices.)
