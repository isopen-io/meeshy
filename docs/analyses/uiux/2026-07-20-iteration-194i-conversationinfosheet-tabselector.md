# Iteration-194i — `ConversationInfoSheet` tab selector VoiceOver selected-state

**Date** : 2026-07-20
**Piste** : iOS (suffixe `i`)
**Surface** : `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift` — `tabSelector` (segmented Membres / Médias / Stats / Options sous le header de la feuille d'info conversation)
**Type** : Accessibilité (VoiceOver — WCAG 1.4.1 « Use of Color »)

## Constat

Le `tabSelector` (lignes 377–421) rend 4 onglets via un `Button` par `InfoTab`. L'onglet **sélectionné** est signalé **uniquement par des indices visuels** :

- poids de police (`.bold` vs `.medium`) — ligne 392
- couleur du texte (`theme.textPrimary` vs `theme.textMuted`) — ligne 407
- une barre de soulignement `Rectangle().fill(isSelected ? accent : .clear)` — lignes 409–412
- fill de la pastille compteur (`accent` vs muted) — ligne 403

Aucun `.accessibilityAddTraits(.isSelected)` sur le `Button` (le fichier compte 0 appel de trait de sélection pour 6 usages de `isSelected`). Conséquence : un utilisateur VoiceOver entend « Médias, bouton » sans savoir **quel onglet est actif** — l'information d'état est portée par la seule couleur. Violation **WCAG 1.4.1** et de la doctrine HIG « ne jamais transmettre un état par la couleur seule ».

Même défaut, même correctif que les itérations précédentes : 144i (`MessageViewsDetailView` state icons), 149i, 155i, 163i, 176i (`ContactsHubView` tab bar).

## Correctif

Ajout d'un seul modificateur sur le `Button` de l'onglet :

```swift
.accessibilityAddTraits(isSelected ? [.isSelected] : [])
```

- `isSelected` est déjà calculé dans la closure `ForEach` (ligne 380) → en portée, 0 logique neuve.
- L'état « sélectionné » est **localisé automatiquement par iOS** → **0 clé i18n neuve**.
- Le `Button` agrège déjà son label + la pastille compteur en un seul élément VoiceOver (« Médias, 3 ») ; la pastille reste un fragment **informatif** (nombre de médias), non modifiée.
- La barre de soulignement `Rectangle` est une forme sans texte → jamais annoncée par VoiceOver, aucun `.accessibilityHidden` requis.
- Pas de `.combine` (fausserait le trait `.isButton` natif du `Button`) — cohérent doctrine 177i.

## Périmètre

- **1 fichier** : `ConversationInfoSheet.swift`
- **0 logique** / **0 visuel** / **0 réseau** / **0 clé i18n neuve** / **0 test neuf**
- `.font(.system(size: 10))` de la pastille compteur **gelé à dessein** (commenté in-file, doctrine 53i) — **non touché**.
- Gate : CI `iOS Tests`.

## Collision essaim

`list_pull_requests` (open, 31 PR) : **aucune** PR ne touche `ConversationInfoSheet` → 0 contention. Numéro **194i** choisi strictement > plus haut en vol (192i #2167/#2158) ; 193i déjà mergé (`main` HEAD `dd0bc4b`, `BlockedTab` #2170).

## Vérification

- Modificateur additif, booléen en portée → **0 risque de compile**.
- `ConversationInfoSheet` n'a pas de suite de tests dédiée mutant cet état ; le ViewModel n'est pas touché → 0 régression.
- Vérification comportementale finale = CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2).

## Statut

✅ **Résolu** — VoiceOver annonce désormais l'onglet actif via le trait `.isSelected`. **NE PLUS re-flagger** le `tabSelector` de `ConversationInfoSheet` pour la sélection couleur-seule.
