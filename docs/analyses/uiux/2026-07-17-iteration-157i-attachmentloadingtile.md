# Analyse UI/UX — Itération 157i (iOS) : `AttachmentLoadingTile`

**Date** : 2026-07-17 · **Piste** : iOS (suffixe `i`) · **Thème** : VoiceOver — regroupement de statut
**Fichier** : `apps/ios/Meeshy/Features/Main/Components/AttachmentLoadingTile.swift`
**Gate** : CI `iOS Tests`

## Contexte

Le fleet a13y a saturé la migration Dynamic Type (`.system(size:)` → `MeeshyFont.relative`)
jusqu'à 156i (PR ouvertes #1966→#2001). Les fichiers restants à fort compte de `.system` audités
(`AttachmentLoadingTile`, `FeedView+Attachments`) n'ont plus que des glyphes **volontairement
figés** (doctrine 82i/86i : cadres de tap ou tuiles de dimension fixe) déjà commentés et masqués
VoiceOver. Le pool de migration typographique est **tari**. Passage à l'audit **state-of-the-art**
(HIG/VoiceOver) comme prévu par le pointeur de tracking.

## Constat — Lacune VoiceOver réelle

`AttachmentLoadingTile` est le composant **réutilisable** affiché dans le tray du composer pendant
la préparation d'une pièce jointe (décodage image, compression vidéo, extraction miniature, calcul
ThumbHash). Il est partagé messages / posts / stories (`ConversationView`, `FeedView+Attachments`,
`ConversationView+Composer`, `AttachmentPreparationService`).

Avant 157i, la tuile n'avait **aucun regroupement d'accessibilité**. VoiceOver exposait, par tuile,
plusieurs fragments incohérents :
- le `ProgressView` (annoncé « en cours » par le système, sans contexte),
- le `Text(stageLabel)` d'étape (« Compression », « Aperçu »…) en élément séparé,
- le `Text(label)` de type (« Photo » / « Vidéo ») en 3ᵉ élément.

Résultat : un utilisateur VoiceOver balayait 2–3 éléments par tuile **sans jamais savoir de quelle
pièce jointe il s'agit ni dans quel état elle est**. L'état d'**échec** était encore pire : l'icône
`exclamationmark.triangle.fill` est (correctement) `accessibilityHidden`, donc l'échec ne transitait
que par le petit `Text("Erreur")` isolé — facile à manquer entre deux tuiles.

## Fix appliqué (1 fichier, 0 logique, 0 clé i18n neuve)

1. **Regroupement** : la tuile (`tileBody`) devient **un seul élément VoiceOver** via
   `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(kindLabel)` +
   `.accessibilityValue(stageAccessibilityValue)`. VoiceOver annonce désormais
   **« Photo, Compression… »** puis **« Photo, Erreur »** — type + état en une phrase cohérente.
2. **Bouton d'annulation préservé** : il est **frère** du `tileBody` dans le `ZStack` (pas un
   enfant), donc `children: .ignore` ne l'absorbe pas — il reste un élément distinct avec son
   `.accessibilityLabel` « Annuler le chargement ». ✅ (vérifié par lecture de structure)
3. **Anti-doublon** : le `Text(label)` visible sous la tuile passe `.accessibilityHidden(true)` —
   la tuile porte déjà le type + l'état, donc le libellé n'est plus lu deux fois.
4. **Refactor propre** : extraction de `kindLabel` (nom localisé du type, réutilisé par le libellé
   visible et le label VoiceOver) + ajout de `stageAccessibilityValue` (valeur d'étape ; message
   d'erreur réel si présent, sinon « Erreur » ; **vide** quand `.ready` → la tuile prête se lit juste
   « Photo »).

## Règles respectées

- **0 clé i18n neuve** : réutilise `attachment.kind.*`, `attachment.stage.*`, `attachment.loading.error`
  (toutes déjà présentes, référencées via `defaultValue` code-only).
- **0 changement de logique** : pipeline de préparation, callbacks, layout inchangés.
- **Glyphes figés intacts** : les `.system(size:)` de doctrine 82i/86i (cadres/tuiles fixes) ne sont
  pas touchés.
- **Palette / Dynamic Type** : inchangés (le libellé visible reste `MeeshyFont.relative`).
- **1 fichier**, 0 test neuf (parité 143i–156i : sweeps VoiceOver sans nouveau test unitaire ;
  gate = CI `iOS Tests`).

## Vérification

- Aucun test iOS ne référence `AttachmentLoadingTile` (grep `MeeshyTests` = 0 → pas de casse).
- Callers (`prep`, `onCancel`) inchangés → API du composant identique.
- Toolchain Swift indisponible sur l'environnement Linux → gate = CI `iOS Tests`.

## Reste à faire (158i+)

- Audit VoiceOver similaire sur les autres tuiles de statut si de nouvelles surfaces émergent.
- Gros lot risqué toujours différé : `StoryViewerView+Content` (38 `.system`, ⚠️ i18n #1174 +
  piège `@State private` cross-file).
