# Itération 153i — Analyse UI/UX iOS : `TypingIndicatorBubble` (indicateur « X écrit… »)

**Date** : 2026-07-17
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` → `TypingIndicatorBubble`
**Base** : `main` HEAD (`14030ae`)
**Branche** : `claude/laughing-thompson-yl81k3`
**Gate** : CI `iOS Tests`

## Contexte

`TypingIndicatorBubble` est la dernière cellule du flux de messages : la bulle « X écrit… » affichée
côté expéditeur pendant qu'un participant tape (les 3 points s'animent en autonomie via `@State`). Le
libellé est **réel et localisé** (`typing.named` / `typing.double` / `typing.several`), assemblé dans la
propriété calculée `label`. Surface **fraîche** pour la doctrine Dynamic Type : **1** `.font(.system(size:))`,
0 commentaire doctrine, 0 `relative`.

**Contention** : au démarrage, la piste iOS a de nombreuses PR ouvertes (140i→152i). Aucune ne touche
`MessageListViewController` (elles ciblent `ThemedBackButton`, `MyStoriesView`, `FriendRequestListView`,
`StoryExpiredContent`, `MessageViewsDetailView`, `ConversationDashboard`, `VoiceProfileManageView`,
`StatsTimelineChart`, `StoryViewerContainer`, `ChangePasswordView`, `DeleteAccountView`, `EditProfileView`,
`IncomingCallView`) → **0 contention** sur cette surface.

## Constat (avant 153i)

**1 `.font(.system(size: 12, weight: .medium))`** sur le `Text(label)` de la bulle « X écrit… ». Le libellé
est de l'information textuelle authentique (nom(s) de la personne qui tape) mais restait **figé à 12pt** : un
utilisateur avec un réglage Dynamic Type agrandi voyait cet indicateur ne pas grossir avec le reste de la
conversation.

Diligence anti-régression sur cette bulle :
- **Dimensionnée par padding** (`.padding(.horizontal, 12).padding(.vertical, 8)` autour d'un `Capsule`),
  **sans `.frame(height:)` figée** → le scaler ne rogne ni ne clampe : la bulle grandit proprement.
- **Standalone** : le libellé n'est PAS adjacent à du corps de message à taille fixe (le corps de bulle passe
  par `MessageTextRenderer` en `.system(size: 15)` figé — hors périmètre, plus large et plus risqué). Migrer
  l'indicateur seul ne crée donc **aucune divergence visuelle** avec un texte voisin — c'est une cellule à part.
- **A11y déjà en place** : `.accessibilityElement(children: .combine)` + `.accessibilityLabel(label)` — le
  libellé est déjà exposé à VoiceOver, donc même si `.lineLimit(1)` tronquait à une taille extrême (comme
  iMessage), aucune information n'est perdue.
- **Les 3 points** sont des `Circle().frame(width: 5, height: 5)` **décoratifs** (pas des `.font`) → restent
  fixes, hors doctrine.

## Correction appliquée (1 fichier, 0 logique)

- **1/1 `.font(.system(size: 12, weight: .medium))` → `MeeshyFont.relative(12, weight: .medium)`** (taille et
  poids préservés) : le libellé « X écrit… » **scale désormais sous Dynamic Type**. Migration mécanique
  (`import MeeshyUI` déjà présent).
- Commentaire de doctrine ajouté au-dessus du `Text` (rationale : texte réel localisé, bulle padding-sizée,
  points décoratifs).

Aucune modification de la logique d'animation, de la propriété `label`, du branchement de la cellule, ni de
l'accessibilité. 1 fichier, 0 clé i18n neuve, 0 test neuf.

## Vérification

- **Compilation** : swap de police 1:1 vers un helper `public` (`MeeshyFont.relative`, `MeeshyUI`) déjà importé
  dans le fichier → aucun nouveau symbole, aucune nouvelle dépendance.
- **Comportement** : à Dynamic Type par défaut, `relative(12)` mappe sur `.caption` (~12pt) → rendu identique
  au `.system(size: 12)` actuel ; aux tailles agrandies, la bulle grandit via son padding.
- **Non-régression** : aucune `.frame` figée sur la bulle ; a11y inchangée (déjà complète).
- Gate = CI `iOS Tests` (`xcodegen generate` + `build-for-testing` + `test-without-building`).

## Reste après 153i

- `TypingIndicatorBubble` **SOLDÉ** pour Dynamic Type (unique `.system` migré ; points décoratifs figés par
  nature).
- Traîne restante à 1–2 `.system` sur **texte réel** dans des fichiers frais non contendus :
  `AudioCarouselView` (compteur `1 / N` monospaced), `ConversationAnimatedBackground` (⚠️ décoratif — à
  vérifier), `StatusBarView`. **À éviter** : `BubbleExpandableText` (« Voir plus ») et `BubbleStandardLayout`
  (emoji `emojiFontSize`) — le corps de bulle voisin est figé (`MessageTextRenderer` `.system(15)`), donc
  migrer l'un sans l'autre crée une divergence → cas **gel**, pas migration, tant que le renderer n'est pas
  traité globalement (chantier plus large, `UIFontMetrics`/attributed scaling).
- `StoryViewerView+Content` (31 `.system`) reste ⚠️ (i18n + `@State private` cross-file) — non trivial.
- Sinon : **passe state-of-the-art** (VoiceOver structure / a11y) au tarissement de la traîne fonts.
