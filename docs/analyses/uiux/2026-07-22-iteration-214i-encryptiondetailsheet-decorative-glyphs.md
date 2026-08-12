# Iteration-214i — ConversationEncryptionDetailSheet: hide decorative SF Symbols

**Date:** 2026-07-22 · **Track:** iOS UI/UX (suffix `i`) · **Area:** Accessibility (VoiceOver)
**File:** `apps/ios/Meeshy/Features/Main/Components/ConversationEncryptionDetailSheet.swift`

## Contexte

`ConversationEncryptionDetailSheet` présente l'état de chiffrement d'une
conversation (actif / inactif + action « activer »). Il portait **0 modificateur
d'accessibilité** sur ses **4 SF Symbols**, tous **décoratifs** et accolés à un
`Text` (ou label de bouton) qui porte déjà le sens :

| Ligne | Glyphe | Texte accolé (porteur du sens) |
|---|---|---|
| 67  | `lock.shield.fill` (vert) | « Active encryption » + mode |
| 113 | `lock.fill` (secondary) | « Encryption enabled » + toggle |
| 137 | `lock.open` (warning) | « Unencrypted conversation » + sous-titre |
| 193 | `lock.fill` (bouton) | « Enable encryption » |

## Problème (a11y — HIG « masquer les éléments décoratifs »)

Aucun symbole n'était `.accessibilityHidden(true)`. VoiceOver **lit le nom du
SF Symbol** avant/à côté du libellé utile (« cadenas bouclier, Active
encryption », « cadenas, Enable encryption »). Le nom du glyphe est du bruit :
l'état (actif/inactif) et l'action sont déjà portés par le texte — la couleur du
glyphe (vert/orange) n'est pas non plus le seul canal de l'état. Doctrine
appliquée en 196i et 213i.

## Correctif

`.accessibilityHidden(true)` sur les 4 symboles décoratifs :

```swift
Image(systemName: "lock.shield.fill") … .accessibilityHidden(true)  // en-tête actif
Image(systemName: "lock.fill")        … .accessibilityHidden(true)  // rangée toggle
Image(systemName: "lock.open")        … .accessibilityHidden(true)  // en-tête inactif
Image(systemName: "lock.fill")        … .accessibilityHidden(true)  // bouton activer
```

VoiceOver annonce désormais le texte utile seul (« Active encryption, End-to-End
(Signal) », « Enable encryption ») sans réciter le nom des cadenas.

## Portée & sûreté

- **1 fichier**, +13 lignes (dont 9 de commentaire), 0 logique / 0 réseau /
  0 layout / 0 changement visuel / 0 clé i18n / 0 test neuf.
- `.accessibilityHidden(true)` est purement additif ; les glyphes restent
  affichés visuellement, seul VoiceOver les ignore.
- Les `LabeledContent` (Mode / Activated on / Translation) et `Toggle`
  **inchangés** — porteurs d'information, non décoratifs.
- **Aucune PR ouverte** au moment du commit (`list_pull_requests` → `[]`) →
  0 collision essaim. Défaut re-vérifié présent sur `main` HEAD juste avant
  commit (leçon 212i).

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- Aucun toolchain Swift dans l'environnement (Linux) → inspection + gate CI.

## Statut

✅ Résolu. Ne plus re-flagger les 4 glyphes décoratifs de
`ConversationEncryptionDetailSheet` — soldés 214i.

## Pistes 215i+

- Regrouper chaque en-tête (glyphe masqué + titre + sous-titre) en un seul
  élément VoiceOver via `.accessibilityElement(children: .combine)` si un futur
  audit le juge utile (bénéfice marginal une fois les glyphes masqués).
- Autres feuilles de détail avec glyphes de statut décoratifs redondants.
