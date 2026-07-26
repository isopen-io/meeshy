# iOS UI/UX — Iteration 221i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift`
**Axes** : Dark/Light Mode · Design system (convergence sur le jeton de surface du dépôt)
**Base** : `main` HEAD `16f8197`

## Sélection de la cible

Le pointeur 220i plaçait le **balayage Dark Mode généralisé** en piste n° 2 (la n° 1,
`StoryViewerView+Content.shareStory()`, reste bloquée : la surface story a encore produit
le commit de tête de `main`). Le balayage a été mené, et il est **concluant en un point
unique** — ce qui est le meilleur résultat possible : la classe de défaut n'est pas
diffuse, elle a un seul survivant.

**Méthode.** Deux passes complémentaires :

1. *Jetons de marque clairs posés sans lecture du mode* — `MeeshyColors.indigo{50,100,200}`
   dans un fichier ignorant `colorScheme` / `isDark` / `theme.*` → **0 résultat**. La
   classe ouverte par 219i est **épuisée** (les deux fichiers qui ressortent,
   `MessageDaySeparator` et `LinkPreviewCard`, reçoivent `isDark` en paramètre — doctrine
   des vues feuilles — et ternarisent correctement).
2. *Surfaces neutres translucides posées sans condition* — `Color.white.opacity(…)` en
   `.fill(` / `.background(`. **24 sites**, tous légitimes sauf deux :

| Site | Verdict |
|---|---|
| `FloatingCallPillView`, `AudioFullscreenView`, `StoryTrayView`, `StoryViewerView+Canvas` | Substrat **forcé sombre** (média plein écran, pilule d'appel) → correct |
| `BubbleQuotedReply:107`, `AudioCarouselView:250`, `BubbleStandardLayout(+Media)` | Posés **sur la bulle accentuée ou sur le média**, jamais sur le fond de page → correct |
| `TwoFactorSetupView:100` (`.background(Color.white)` sous le QR code) | **Correct et intentionnel** : un QR code noir-sur-transparent exige une zone de silence blanche pour rester scannable, dans les deux modes. Ne pas « corriger ». |
| **`LinksHubView:103` et `:226`** | **Défaut** — détaillé ci-dessous |

## Défaut — Cinq cartes sans surface en mode clair

```swift
struct LinksHubView: View {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }   // l.12 — jamais lu
    …
    .fill(Color.white.opacity(0.05))                     // l.103 bannière
    .fill(Color.white.opacity(0.05))                     // l.226 carte de catégorie (×4)
```

Le fichier **calcule `isDark` et ne s'en sert nulle part** : la propriété était morte, et
les deux seuls endroits qui en auraient eu besoin sont précisément les deux fills. Le
symptôme est donc un oubli, pas un choix.

Le fond de l'écran est `theme.backgroundGradient`, soit en mode clair
`#FFFFFF → #FAFAFF → #F8F7FF`. Poser du **blanc translucide sur du blanc** ne peint rien.

### Mesures (WCAG 2.1, après composition alpha « source over »)

Contraste de la surface de carte **contre son propre fond** — c'est-à-dire : la carte
est-elle visible ?

| Point du dégradé clair | Avant (blanc 5 %) | Après (noir 3 %) |
|---|---|---|
| `#FFFFFF` (haut d'écran) | **1,00000:1** ❌ | **1,068:1** ✅ |
| `#F8F7FF` (bas d'écran) | **1,00313:1** ❌ | **1,068:1** ✅ |

`1,00000:1` n'est pas « un contraste faible » : c'est **l'identité**. En haut de l'écran,
là où le dégradé est du blanc pur, le fill était un **no-op exact** — et après
quantification 8 bits, le delta est de **0 sur les trois canaux aux trois arrêts du
dégradé**. Les cartes n'avaient aucune surface.

### Ce qui restait pour délimiter les cartes : presque rien

Chaque carte conserve un liseré `accent.opacity(0.2)` (0,3 pour la bannière). Mesuré sur
`#FFFFFF` :

| Liseré | Contraste vs fond |
|---|---|
| Partage `#818CF8` @ 20 % | 1,21:1 |
| Communauté `#60A5FA` @ 30 % | 1,30:1 |
| Tracking `#4F46E5` @ 20 % | 1,36:1 |
| Affilié `#34D399` @ 20 % | 1,15:1 |

WCAG 2.1 **1.4.11** demande **3:1** pour la frontière visuelle d'un composant d'interface
— et ces cartes *sont* des composants : ce sont des `Button` qui poussent une route. En
mode clair, l'utilisateur voyait donc quatre blocs de texte flottant sur la page, sans
surface **et** sans frontière discernable, sur un écran dont c'est **tout le contenu**.

**Honnêteté sur la portée du correctif** : rétablir la surface porte la carte à 1,068:1
contre son fond. Cela **ne suffit pas à satisfaire 1.4.11 à soi seul** — le couple
surface + liseré est le traitement de carte *standard du dépôt*, et l'aligner est
l'objectif ici. Le relèvement du liseré à 3:1 est une décision de design à part entière,
inscrite en piste 222i plutôt que décidée en passant.

### L'écran est atteignable et livré

`RootView:342` et `iPadRootView+Panels:98` — hub réel, iPhone **et** iPad, deep link
`https://meeshy.me/links`.

## Correctif

Le dépôt a **un** jeton pour ce rôle, et il est massivement établi :
`isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)` — **15 sites**, dont
`TrackingLinkDetailView` (×3), `ShareLinkDetailView` et `CommunityLinkDetailView`,
c'est-à-dire **les écrans mêmes vers lesquels ces cartes naviguent**. `LinksHubView` était
le **seul fichier de l'app** à n'en poser que la moitié sombre. Le correctif ne choisit
donc aucune valeur : il converge.

La décision est extraite en résolveur colocalisé — idiome `StoryExportSheetPalette` (219i) :

```swift
enum LinksHubPalette {
    static func cardFill(isDark: Bool) -> Color {
        isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)
    }
}
```

Deux raisons, pas une : la valeur devient **mesurable par un test** (une expression noyée
dans un `body` ne l'est pas), et `isDark` **redevient vivante**.

**Le mode sombre ne bouge pas d'un bit** : la branche sombre est l'expression d'origine,
mot pour mot — un test le verrouille canal par canal, à un pas de quantification 8 bits près.

## Hors périmètre

- **Consolidation repo-wide du jeton** — les 15 sites répètent la même expression, et une
  vraie sortie serait un `MeeshyColors.neutralSurface(isDark:)` partagé. Mais ces sites
  vivent dans `MessageDetailSheet`, `MessageViewsDetailView`, `FeedPostCard`… des surfaces
  chaudes et disputées : un balayage de 15 fichiers pour un gain purement structurel est
  un mauvais rapport risque/valeur **tant que la piste n'est pas coordonnée**. Inscrit en
  piste 222i.
- **`TwoFactorSetupView:100`** — plaque blanche du QR code, **correcte** (zone de silence).
  Explicitement examinée pour qu'une itération future ne la « corrige » pas.

## Test

`apps/ios/MeeshyTests/Unit/Views/LinksHubPaletteTests.swift` (neuf) — **8 tests**.
Outillage repris de `StoryExportShareSheetPaletteTests` (219i) : `UIColor(color).getRed(…)`
pour extraire les composantes, composition « source over » reproduisant le compositeur,
puis formule WCAG 2.1 officielle (linéarisation sRGB + luminance relative).

L'essentiel n'est **pas** de l'introspection de source : les tests **mesurent le contraste
réel**, la grandeur que le défaut viole.

1. **Référence du défaut** (×2, haut et bas du dégradé) : l'ancien fill rend `< 1,01:1`
   → la divergence avant/après est prouvée *dans* le test, sans dépendre de git.
2. **Correctif** (×2) : la surface claire dépasse 1,05:1 aux deux extrêmes du dégradé.
3. **Parité sombre** : `cardFill(isDark: true)` est **canal par canal** l'expression
   d'origine (tolérance 1/255) — l'itération répare le clair, elle ne re-règle pas le sombre.
4. **Lift sombre préservé** (×2 arrêts).
5. **Divergence** : les deux modes ne peuvent pas rendre la même chose — c'était
   exactement le défaut, et aucun test de contraste seul ne le rattraperait.
6. **Garde de source** : plus aucun `.fill(Color.white.opacity(` dans le fichier, donc
   aucune surface du hub n'échappe au résolveur.

## Vérification

Pas de toolchain Xcode (Linux) → chaque assertion recalculée indépendamment, hors du test :

- **8 assertions numériques** (linéarisation sRGB, composition alpha et formule WCAG
  réimplémentées séparément) → **8/8 conformes**, valeurs reportées dans les tableaux
  ci-dessus.
- **4 assertions de parité sombre** vraies *par construction* : la branche sombre est
  l'expression d'origine, mot pour mot.
- **RED contre `main` `16f8197`** : `LinksHubPalette` n'y existe pas (la suite n'y compile
  pas), et la garde de source y échoue — `.fill(Color.white.opacity(` est bien présent sur
  `main`, absent sur la branche. Le test n° 1 encode l'ancienne valeur explicitement, donc
  la mesure du défaut survit au correctif.
- Équilibre accolades / parenthèses / crochets des 2 fichiers au tokenizer (chaînes
  retirées **avant** les commentaires) : **0 / 0 / 0**.
- Fichier de test **neuf** → capté par le globbing récursif de `xcodegen generate`,
  **0 édition de `project.pbxproj`**. `LinksHubPaletteTests` ne matche aucun token de
  `FINAL_PHASE_CLASS_PATTERN` → **phase 1** (suite isolée), ce qui est correct pour un
  test de mathématique colorimétrique pure.
- Surface froide : `LinksHubView.swift` n'a qu'**un** commit fonctionnel récent (`17eafdd`,
  RTL) — pas de contention d'essaim observable.
- **0 clé i18n** (aucune chaîne touchée), 0 logique, 0 réseau, 0 layout, 0 changement en
  mode sombre.

Gate réel = CI `iOS Tests`.

## Bilan

**1 fichier de production : +18 / −2 lignes.** Cinq surfaces de carte rétablies en mode
clair sur un hub livré iPhone + iPad (contraste `1,000:1` → `1,068:1`, c'est-à-dire de
*rien* à *quelque chose*), 1 propriété morte (`isDark`) remise en service, 1 fichier
ramené sur le jeton de surface que ses trois écrans de destination utilisent déjà.
**0 changement en mode sombre (prouvé canal par canal), 0 clé i18n, 0 logique, 0 réseau,
0 layout.**

## Piste 222i+

1. **Frontière des cartes du hub (WCAG 1.4.11)** — les liserés mesurent 1,15–1,36:1 là où
   la norme demande 3:1 pour un composant d'interface. Relever l'opacité (ou passer à une
   teinte plus soutenue) est une **décision de design** : à prendre explicitement, avec
   les mesures ci-dessus comme base, pas en passant.
2. **Consolidation du jeton de surface neutre** — 15 sites répètent
   `isDark ? white@0.05 : black@0.03`. Candidat naturel : `MeeshyColors.neutralSurface(isDark:)`
   dans `MeeshyUI`. À coordonner (les sites vivent sur des surfaces chaudes) ; le résolveur
   `LinksHubPalette` de cette itération est le premier client tout prêt.
3. **`StoryViewerView+Content.shareStory()`** — code mort (0 appelant, établi 217i,
   re-vérifié 220i **et** 221i). La surface story reste la plus chaude du dépôt.
4. **Grille d'emojis du composeur d'humeur en Dynamic Type d'accessibilité** (héritée 220i)
   — demande un arbitrage visuel face à la doctrine « cadre rigide » gelée en 211i.
5. **`MeeshyShareExtension`** — ne pas localiser isolément : le target **n'est embarqué dans
   aucun build livré** (signature en attente, `project.yml:151`). À traiter avec le
   recâblage de signature.
