# Iteration-186i — OnboardingView : contrôle de pagination accessible

**Date** : 2026-07-20
**Écran** : `apps/ios/Meeshy/Features/Main/Views/OnboardingView.swift` (premier lancement — carrousel d'accueil 5 slides)
**Branche** : `claude/laughing-thompson-qdzrzc`
**Base** : `main` HEAD `9d41333`
**Type** : Accessibilité (VoiceOver) — écran jamais audité auparavant

## Contexte

`OnboardingView` est le carrousel de premier lancement (5 slides : messagerie,
traduction, voix, chiffrement, aperçu conversation). Il utilise un `TabView` en
style `.page(indexDisplayMode: .never)` — c.-à-d. **les points de pagination
natifs sont supprimés** et remplacés par une bande de capsules custom
(`pageIndicators`).

Écran globalement solide : i18n complète (5 langues via catalogue), Dynamic Type
(`MeeshyFont.relative`), Reduce Motion des orbes ambiantes déjà géré par le
modifier partagé `FloatingAnimation` (lit `accessibilityReduceMotion` +
`meeshyForceReduceMotion`), boutons Skip/Next/Start labellisés, icônes
décoratives déjà `.accessibilityHidden(true)`.

## Déficits identifiés

### (1) — PRINCIPAL — Contrôle de pagination invisible à VoiceOver
La bande `pageIndicators` (l.404-419 avant fix) est un `HStack` de `Capsule`
purement décoratives. Comme les points natifs sont désactivés
(`indexDisplayMode: .never`), **aucun élément n'expose la position de page à
VoiceOver** : un utilisateur VoiceOver ne sait ni sur quelle slide il se trouve,
ni combien il en reste, et n'a aucun affordance équivalent au `UIPageControl`
natif (qui est *adjustable* — flick haut/bas pour changer de page).

Violation : HIG Accessibility — un contrôle de pagination doit annoncer sa
position ; les composants custom remplaçant un contrôle natif doivent en
répliquer la sémantique VoiceOver.

### (2) — Aperçu démo bruyant à VoiceOver (slide 4)
`mockConversationPreview` (l.371+) rend 3 `ThemedMessageBubble` de démonstration
avec du texte d'exemple **non traduit** (espagnol « ¡Hola! », japonais, français)
et `.allowsHitTesting(false)`. Sur la slide 4, `pageContent` applique
`.accessibilityElement(children: .combine)` → tout ce texte étranger décoratif
est **fusionné dans l'élément de page**, produisant une lecture VoiceOver confuse
et non informative au lieu du simple titre de slide.

## Correctifs (186i)

1. **`pageIndicators` → élément adjustable unique** mirroir de `UIPageControl` :
   - `.accessibilityElement(children: .ignore)` (les capsules ne sont plus lues
     individuellement)
   - `.accessibilityLabel` = « Page N sur M » (clé `onboarding.pages.a11y`,
     format `%1$lld … %2$lld`, ajoutée au catalogue en **5 langues** —
     de/en/es/fr/pt-BR, cohérent avec les 15 autres clés `onboarding.*`)
   - `.accessibilityAdjustableAction` : `.increment`/`.decrement` naviguent
     vers la page suivante/précédente (bornes respectées via `where`), réutilisant
     le même `withAnimation(MeeshyAnimation.springDefault)` + `HapticFeedback.light()`
     que le swipe / bouton Next. Extrait dans `goToPage(_:)`.

2. **`mockConversationPreview` → `.accessibilityHidden(true)`** : la slide 4
   n'annonce plus que son titre (décor démo hors arbre a11y). `allowsHitTesting(false)`
   confirmait déjà la nature purement décorative.

## Périmètre

- **1 fichier Swift** (`OnboardingView.swift`) + **1 clé i18n** (catalogue,
  5 langues) — 0 nouvelle dépendance, 0 logique métier, 0 réseau, 0 test neuf.
- Aucun test ne référence `OnboardingView` (grep = 0). Aucune PR iOS ouverte ne
  touche cet écran (vérifié via `list_pull_requests` — essaim 140i→185i).
- Aucun changement visuel : les capsules gardent taille/couleur/animation
  identiques ; seule la couche VoiceOver change.

## Vérification

- iOS non buildable en local (Linux) → gate = CI **iOS Tests** (xcodegen +
  `build-for-testing` + run sim 18.2).
- Catalogue revalidé JSON (`json.load` OK, 1238 clés, `onboarding.pages.a11y`
  présente en 5 langues).
- Revue statique Swift : `switch` adjustable exhaustif (`default: break`),
  `String(format:)` `%lld` + `Int` (pattern 64-bit correct), symboles
  (`MeeshyAnimation.springDefault`, `HapticFeedback.light`) déjà utilisés dans
  le fichier.

## Statut

✅ Correctifs appliqués — **SOLDÉ 186i** : ne plus re-flagger `pageIndicators`
(désormais adjustable/labellisé) ni `mockConversationPreview` (masqué à dessein).

## Améliorations restantes (différées, non bloquantes)

- **Reduce Motion du scale-in d'icône** (`animateIcon` 0.3→1.0 spring, l.118/124/223) :
  la bande d'orbes respecte déjà Reduce Motion, mais le pop d'icône et le
  scale-in de l'aperçu (l.201-202) ne sont pas gatés. Candidat 187i+ (gating
  `accessibilityReduceMotion` sur `animateIcon`), écarté ici pour garder
  l'itération mono-concern.
- Les 10 gradients de fond `Color(hex:)` par slide (l.40-85) sont des
  atmosphères décoratives par slide, pas des accents de marque — migration non
  souhaitable (perte de la variété visuelle voulue).
