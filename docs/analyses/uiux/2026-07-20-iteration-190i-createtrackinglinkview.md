# Iteration-190i — CreateTrackingLinkView (a11y VoiceOver + HIG)

**Date**: 2026-07-20
**Scope**: iOS-only
**Target**: `apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift`
**Type**: Accessibility (VoiceOver) + HIG feedback
**Statut**: ✅ Résolu — PR à venir (gate CI « iOS Tests »)

## Contexte

`CreateTrackingLinkView` est la sheet `NavigationStack` de création d'un lien de
tracking : URL de destination (requise), nom interne, section UTM repliable
(campaign/source/medium), token personnalisé, puis un bouton « Créer le lien »
async. Le fichier (166 lignes) ne contenait **aucun** modificateur d'accessibilité,
alors que c'est un formulaire hautement interactif. Localisation (`String(localized:)`)
et fonts sémantiques déjà en place → **Dynamic Type et i18n hors périmètre** ; la
passe est **VoiceOver + HIG uniquement**.

## Diagnostic VoiceOver (avant)

| # | Zone | Problème |
|---|------|----------|
| 1 | `formField` (l.126-137) | `Text` label et `TextField` = 2 éléments séparés. Le `TextField` n'expose qu'un placeholder visuel, aucun `.accessibilityLabel` : au focus, VoiceOver annonce « champ de texte » sans nom. Le champ URL requis (« URL de destination \* ») lit « étoile » sans notion d'obligation. |
| 2 | Bouton repli UTM (l.63-75) | Chevron `chevron.up/down` décoratif vocalisé ; aucun état développé/réduit ni indice que le bouton révèle une section. |
| 3 | Bouton créer (l.107-124) | Bascule `ProgressView` ↔ `Text` selon `isCreating` : en chargement, VoiceOver ne lit rien d'utile (le `ProgressView` n'a pas de label) et le passage en chargement n'est pas annoncé. État désactivé (URL invalide) purement visuel (`.opacity(0.5)`). |
| 4 | `errorMessage` (l.33-36) | Le `Text` d'erreur est rendu à l'écran mais jamais annoncé à VoiceOver — l'utilisateur aveugle ne sait pas que la création a échoué. |

## Décisions

- **`formField`** : `Text` label → `.accessibilityHidden(true)` (purement visuel) ;
  le `TextField` porte `.accessibilityLabel(accessibilityLabel ?? label)` +
  `.accessibilityHint(hint ?? "")`. Deux nouveaux paramètres **optionnels à défaut
  `nil`** → les 5 appels existants restent valides sans changement. Le champ URL
  passe un label a11y propre (« URL de destination », sans `*`) + hint
  « Champ obligatoire ».
- **Bouton UTM** : chevron `.accessibilityHidden(true)` ; le bouton reçoit
  `.accessibilityValue(showUtmFields ? …expanded : …collapsed)` en **réutilisant**
  les clés existantes `accessibility.section_expanded` / `section_collapsed`, plus
  un `.accessibilityHint` décrivant l'affichage/masquage des paramètres UTM.
- **Bouton créer** : `.accessibilityLabel` explicite (survit au remplacement du
  `Text` par le `ProgressView`), `.accessibilityValue` « Création en cours » quand
  `isCreating`, `.accessibilityHint` d'aide quand `!isValid` (URL invalide).
- **Erreur** : `UIAccessibility.post(notification: .announcement, argument: message)`
  dans le `catch` (sur le `MainActor`), déterministe et sans `onChange`. Pattern
  déjà utilisé dans 9 fichiers (`ShareLinkDetailView`, `CallView`, `StoryViewerView`…)
  et disponible iOS 16 — contrairement à `AccessibilityNotification.Announcement`
  qui est iOS 17+ (première tentative rejetée par la CI, corrigée).

## i18n

5 clés neuves × 5 locales (de/en/es/fr/pt-BR — source `fr`), insérées textuellement
en tête de l'objet `strings` **sans reformater ni supprimer** aucune entrée existante
(175 insertions, 0 suppression) :

- `tracking.link.create.field.url.a11y` — « URL de destination »
- `a11y.tracking.field.required` — « Champ obligatoire »
- `a11y.tracking.utm.hint` — « Affiche ou masque les paramètres UTM »
- `a11y.tracking.create.in-progress` — « Création en cours »
- `a11y.tracking.create.disabled.hint` — « Saisissez une URL de destination valide pour créer le lien »

Réutilise `accessibility.section_expanded` / `accessibility.section_collapsed`.

## Fichiers

- `apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift` (+26 / −3)
- `apps/ios/Meeshy/Localizable.xcstrings` (+175, 5 clés)

## Vérification

- Aucune logique métier / couleur / police modifiée.
- Signature `formField` rétro-compatible (2 params optionnels `nil`) → 4 appels
  restants (name, campaign, source, medium) compilent inchangés.
- `UIAccessibility.post(.announcement)` disponible iOS 16 (plancher app), pattern
  déjà présent 9× dans le codebase.
- xcstrings : JSON valide, ordre d'insertion préservé, 0 entrée existante touchée.
- 0 test ne référence la vue (privée, présentée par `TrackingLinksView`).
- Build/tests : gate CI « iOS Tests » (pas de toolchain Swift en local).

## ⚠️ SOLDÉ — ne plus reprendre

`CreateTrackingLinkView` VoiceOver structure **soldée** : champs labellisés +
hint requis, bouton UTM à état développé/réduit, bouton créer à label/valeur/hint,
erreur annoncée. Dynamic Type et i18n déjà OK avant cette passe.
