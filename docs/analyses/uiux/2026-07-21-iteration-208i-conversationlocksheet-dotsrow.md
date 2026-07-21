# Itération 208i — Analyse UI/UX iOS : `ConversationLockSheet` rangée de points (progression VoiceOver)

**Date** : 2026-07-21
**Piste** : iOS (suffixe `i`)
**Surface** : `apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift` (1 fichier)
**Branche** : `claude/laughing-thompson-150505`
**Base** : `main` HEAD `22465a5`
**Gate** : CI `iOS Tests`

## Contexte

`ConversationLockSheet` est la sheet de saisie du PIN de verrouillage de conversation
(master PIN 6 ch. / code conversation 4 ch.) : glyphe hero de cadenas + titre/sous-titre
+ **rangée de points de progression** (`dotsRow`) + pavé numérique custom (`numpad`).

L'itération **137i** (SOLDÉE) a traité cette surface **uniquement pour les polices** :
gel commenté des 3 `.font(.system(size:))` (hero cadenas ≥40 pt masqué, chiffre + `delete.left.fill`
bornés par la touche fixe 76×76) — **une passe d'annotation de gel, aucune correction VoiceOver
structurelle**. Le pavé lui-même est déjà accessible (chaque touche est un `Button` dont le `Text`
porte le chiffre ; le bouton d'effacement porte `conversation.lock.a11y.delete`).

## Constat (avant 208i)

**La rangée de points (`dotsRow`) ne convoie l'état de saisie que visuellement.** Elle rend
`pinLength` `Circle`s dont les `currentPin.count` premiers sont remplis (gradient) et le reste
grisé — c'est le **seul** retour de progression pour l'utilisateur voyant. Or :

| # | Lacune | Catégorie |
|---|--------|-----------|
| 1 | Les `Circle` décoratifs sont exposés individuellement à VoiceOver (jusqu'à 6 arrêts muets « image ») sans aucune sémantique. | Accessibilité (bruit) |
| 2 | **Aucune** représentation de la progression « N chiffres saisis sur M » — un utilisateur VoiceOver ne peut pas percevoir combien de chiffres il a déjà entrés ni la longueur attendue, alors que le clavier code **natif iOS** l'annonce (« champ code, 3 sur 6 »). | Accessibilité (WCAG 1.1.1 / 4.1.2 — état par le visuel seul) |

C'est un défaut réel sur un flux sensible : saisir/vérifier un PIN à l'aveugle sans savoir
où l'on en est dans la séquence.

## Correction appliquée (1 fichier, 0 logique)

Regrouper `dotsRow` en **un seul élément d'accessibilité** portant la progression, en miroir
du comportement du clavier code natif iOS :

```swift
.accessibilityElement(children: .ignore)
.accessibilityLabel(String(localized: "conversation.lock.a11y.progress", defaultValue: "Chiffres saisis", bundle: .main))
.accessibilityValue(
    String(
        format: String(localized: "conversation.lock.a11y.progress-value", defaultValue: "%1$d sur %2$d", bundle: .main),
        currentPin.count,
        pinLength
    )
)
```

- `children: .ignore` supprime les jusqu'à 6 `Circle` muets → 1 seul arrêt VoiceOver (lacune 1).
- `label` + `value` annoncent « Chiffres saisis : 3 sur 6 » (lacune 2). `currentPin.count` et
  `pinLength` sont exactement les valeurs qui pilotent le remplissage visuel des points → parité
  stricte visuel/vocal, y compris à l'étape de confirmation (`step == 2` → `confirmPin`).
- **2 clés i18n neuves inline** (`defaultValue`, extraites au build comme le sibling
  `conversation.lock.a11y.delete` du même fichier — **0 édition `.xcstrings`**), namespace
  `conversation.lock.a11y.*` cohérent. La `value` utilise des spécificateurs positionnels
  `%1$d`/`%2$d` (sûrs pour la localisation RTL / réordonnancement).

Aucune information de sécurité nouvelle exposée : la **longueur** du PIN est déjà fixe et connue,
et l'annonce du **nombre de chiffres saisis** reproduit exactement le comportement du champ code
natif d'Apple (la valeur du PIN, elle, n'est jamais lue).

## Périmètre / non-régression

- **1 seul fichier**, +12 lignes (4 de commentaire doctrine), 0 logique, 0 mutation d'état,
  0 test neuf, **0 clé i18n `.xcstrings`** (2 clés inline `defaultValue`).
- La logique de saisie/vérification (`appendDigit`, `handleComplete`, `shakeAndReset`), le pavé,
  la palette et les animations ne sont **pas** touchés. Le rendu visuel des points est **inchangé**
  (les modifiers a11y n'altèrent pas le layout).
- APIs `.accessibilityElement/Label/Value` disponibles dès iOS 14/16 → plancher app iOS 16, aucun
  garde `@available`. Aucun test ne référence `ConversationLockSheet` → aucune régression de test.

## Statut

**TERMINÉE (en attente CI)** — `ConversationLockSheet.dotsRow` : progression PIN désormais
exposée à VoiceOver (« N sur M », rangée regroupée en 1 élément). **Ne plus re-flagger** la
rangée de points pour l'accessibilité de progression.

### Piste 209i+
- Annonce VoiceOver active de l'`errorMessage` (shake + haptic déjà perçus, texte non vocalisé →
  `UIAccessibility.post(.announcement:)` sur `onChange(of: errorMessage)`).
- Autres pavés/claviers custom de la même classe (vérifier collision essaim via `list_pull_requests`).
