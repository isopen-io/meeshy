# Plan — Refonte visuelle Android → **parité pixel avec iOS**

> **Mission.** Rendre l'app Android (`apps/android`) visuellement **identique** à l'app iOS
> (`apps/ios` + `packages/MeeshySDK`) : même design premium sombre, mêmes codes couleur,
> mêmes composants signature, mêmes micro-interactions. Exécutable de bout en bout sur
> plusieurs jours par un agent autonome.
>
> **Rédigé le 2026-07-06** à partir d'une comparaison écran-par-écran des deux simulateurs
> (iPhone 16 Pro `me.meeshy.app` + émulateur `me.meeshy.app.debug`) et d'un audit du code
> des deux plateformes. Captures de référence : `apps/android/tasks/audit/parity-shots/`
> (à committer depuis le scratchpad de la session — voir §7).

---

## 0. TL;DR & principe directeur (À LIRE EN PREMIER)

**Le constat qui change tout : la _fondation couleur_ Android est DÉJÀ un portage 1:1 fidèle
de l'iOS.** Mêmes hex Indigo, mêmes tokens `light`/`dark`, `DynamicColorGenerator` (accent par
conversation) déjà porté et testé. Le problème n'est **pas** la palette — c'est que :

1. **Les composants Material 3 sont utilisés bruts**, sans `colors=` custom → `TopAppBar`,
   `NavigationBar`, `Card`, `Scaffold` prennent les surfaces Material par défaut (teinte lavande
   `#F8F7FF`, cartes plates, élévations grises). `grep -r "TopAppBarDefaults\|NavigationBarDefaults" = 0 résultat`.
2. **Le thème par défaut est `AUTO`** → sur un appareil/émulateur en clair, l'app rend en light
   Material plat. iOS présente un rendu **sombre premium** par défaut.
3. **Aucune typographie ni police custom** → type scale Material par défaut (Roboto), alors
   qu'iOS utilise **SF Pro Rounded** pour ses gros titres.
4. **Les composants _signature_ manquent** : story rings, menu radial FAB, sections repliables
   (Épingles / dossiers / Mes conversations), surfaces "glass" (verre translucide + bordure
   indigo), ambient orbs, FABs gradient, badges du Prisme sur les bulles.

**Conséquence stratégique : ~80 % du travail est de l'HABILLAGE + l'ajout de composants, pas
une reconstruction.** La logique (ViewModels, repositories, sockets, cache SWR, navigation)
est déjà là et fonctionnelle. On ne touche **que la couche présentation** (`:sdk-ui` + les
`*Screen.kt` des features).

**Definition of Done globale** : chaque écran Android, en dark comme en light, est
indiscernable de son équivalent iOS (validé par comparaison A/B de screenshots + gate
Roborazzi light/dark/large-font/RTL).

---

## 1. Constat détaillé (visuel + technique)

### 1.1 Écart visuel écran par écran (observé sur simulateurs)

| Écran | iOS (cible) | Android (actuel) |
|---|---|---|
| **Liste conversations** | Fond near-black `#09090B→#13111C→#1E1B4B` (gradient), titre `Meeshy Chats` violet **SF Rounded 46pt bold**, story ring « Moi » (anneau gradient + bouton `+`), FAB gradient corail flottant, badge « 31 » avec anneau, **sections repliables** (Épingles 📌 / Personal tests 📁 / Mes conversations 📥) à icône colorée, cartes arrondies riches, barre de recherche « glass » en bas | Fond **blanc**, barre lavande pâle, titre noir `Meeshy` (Roboto ~22pt), chips filtres Material (All/Unread/Direct…), lignes plates avatars génériques, FAB bleu Material, **tous les items titrés « Conversation »** (noms non résolus) |
| **Conversation** | Bulles violettes (sortant) / sombres (reçu), **badges Prisme** (icône translate + drapeau langue), réactions emoji en pill, accusés `✓✓`, header avec accent conversation, fond animé | Bulles gris-bleu sur **blanc**, **aucun badge de traduction visible**, header `Conversation` plat, input Material |
| **Feed** | Fond sombre, cartes de post riches (header auteur + drapeau + badge trad, `voir plus`, actions like/comment/repost/save/share colorées), story tray en haut | Écran **vide** `No posts yet` sur blanc (empty-state légitime mais non brandé) |
| **Réglages** | Fond sombre, **carte profil** (avatar + point de présence), sections à **puce d'icône colorée carrée arrondie** (Privacy=violet, Security=bleu, Blocked=rouge, Delete=corail), sélecteur de thème **Auto/Clair/Sombre**, sections Voice Profile / Transcription | Liste Material **blanche** plate, en-têtes de section en texte violet, lignes à chevron, un `Switch` |
| **Navigation** | **Pas de bottom bar.** Titre en haut + **menu radial FAB** (boutons circulaires colorés en arc : Mes liens, Notifications, Contacts, Découvrir, Communautés, Réglages) | **Bottom nav Material** 5 onglets (Messages / Feed / Calls / Activity / Profile) sur fond lavande |

### 1.2 État technique Android (ce qui existe déjà)

- **Stack** : 100 % Jetpack Compose + Material 3, Kotlin 2.0.21, Compose BOM 2024.10.01,
  Navigation-Compose 2.8.3, Hilt 2.52, Retrofit+OkHttp+Socket.IO, Room+DataStore, Coil 2.7.
  compileSdk 35, minSdk 26, JVM 17.
- **Modules** : `:app`, `:sdk-core`, `:sdk-ui`, `:core:{common,model,network,database,datastore,crypto,navigation}`,
  `:feature:{auth,conversations,chat,feed,profile,notifications,settings,contacts,stories,calls}`.
- **Thème (`sdk-ui/.../theme/`)** : `MeeshyPalette.kt`, `MeeshyThemeTokens.kt` (light + dark),
  `MeeshyTheme.kt`, `MeeshyDimens.kt`, `MeeshyMotion.kt`, `ColorHex.kt`. **Dark existe déjà et
  fonctionne** (`AppThemeMode {LIGHT,DARK,AUTO}`, défaut AUTO, sélecteur dans Settings).
- **Accent conversation** : `DynamicColorGenerator.kt` (`:sdk-core`, portage fidèle de
  `ColorGeneration.swift`) + `ConversationAccent.kt` (`accentHex()`). Déjà branché sur l'avatar
  (liste) et l'`outgoingColor` de la bulle (chat).
- **Composants `:sdk-ui`** : `MeeshyAvatar` (initiales, **sans** ring/presence/mood), `MeeshyPrimaryButton`
  (gradient — seul composant « premium »), `BrandLogo`, `MeeshySkeleton`, `component/bubble/MessageBubble.kt`
  (riche : reply, grid, réactions, statuts, translate badge), `EmojiPicker`, image viewer.
- **Écrans** : **tous fonctionnels** (ViewModels Hilt + UiState). Fichiers :
  `feature/conversations/.../ConversationListScreen.kt` (569 l), `feature/chat/.../ChatScreen.kt` (631 l),
  `feature/feed/.../FeedScreen.kt` (387 l), `feature/notifications/.../NotificationsScreen.kt` (163 l),
  `feature/settings/.../SettingsScreen.kt` (683 l), `feature/profile/.../ProfileScreen.kt` (617 l),
  `feature/calls/.../CallHistoryScreen.kt` + `CallScreen.kt`, `feature/contacts/.../ContactsScreen.kt`,
  `feature/stories/.../{StoryTray,StoryViewerScreen,StoryComposerScreen}.kt`, `feature/auth/.../LoginScreen.kt`.
- **Navigation** : `app/.../navigation/MeeshyApp.kt` — un `NavHost` + `Scaffold(bottomBar = NavigationBar)`.
  ⚠️ Le 5e onglet « Profile » ouvre en réalité `SettingsScreen` (le vrai `ProfileScreen` est sur `profile/{userId}`).
- **Incohérence de theming** à corriger : certains écrans lisent `MeeshyTheme.tokens.*`
  (ConversationList, Chat, Feed, Login), d'autres tapent `MaterialTheme.colorScheme.*`
  (Settings, Notifications). À uniformiser sur `MeeshyTheme.tokens`.
- **Assets** : `res/values*/` = **uniquement** `strings.xml` (i18n fr/es/pt/en). **Pas** de `colors.xml`,
  **pas** de `drawable/` custom, **pas** de police `.ttf/.otf`.

### 1.3 Référentiel design existant côté Android

`apps/android/ARCHITECTURE.md` §13 « CHARTE GRAPHIQUE (LOCKED) » (lignes 402-454) décrit le design
system cible et se déclare **screenshot-tested (Roborazzi)**. Ce plan **exécute** cette charte, qui
est aujourd'hui définie mais non appliquée aux surfaces/navigation.

---

## 2. Décision produit — ✅ TRANCHÉE : Option A (parité stricte)

> **Décidé par le BIGBOSS le 2026-07-06 : Option A « dans un premier temps ».**
> → Retirer la bottom nav Material, porter le **menu radial FAB** + navigation par titre en haut,
> exactement comme iOS. Exécuter la tâche **P1-7** (menu radial). La tâche P0-4 **retire** la
> `NavigationBar` (ne pas l'habiller). L'Option B ci-dessous est conservée pour mémoire uniquement.

**La navigation.** iOS n'a **pas de bottom bar** : titre en haut + **menu radial FAB**. Android
utilise une **bottom nav Material 5 onglets**. « Reproduire EXACTEMENT iOS » implique de remplacer
la bottom nav par le paradigme iOS (top-title + menu radial + FAB gradient).

- **Option A — Parité pixel stricte (recommandée, conforme à la demande « EXACTEMENT »)** :
  retirer la `NavigationBar`, porter le **menu radial FAB** (6 items, cf. §4.2) et la navigation
  par titre en haut. Les 5 destinations deviennent : Messages (racine), Feed (bouton header),
  et Notifications/Contacts/Découvrir/Communautés/Réglages/Mes liens via le menu radial — **exactement
  comme iOS** (`apps/ios/.../RootView.swift`).
- **Option B — Identité visuelle iOS sur nav Android idiomatique** : garder la bottom nav mais
  la re-styler (fond sombre glass, indicateur indigo, icônes/labels custom) + ajouter le FAB gradient.
  Moins fidèle, plus « Android-natif ».

**Recommandation : Option A** (la demande est « reproduire EXACTEMENT l'interface d'iOS »).
Ce plan est écrit pour l'Option A — **retenue**. Réf iOS du menu radial : `apps/ios/.../RootView.swift`
(6 items, couleurs/ordre/anim dans §4.2).

---

## 3. Design System — Source de vérité (valeurs exactes)

> Toutes ces valeurs existent **déjà** dans `:sdk-ui` et `:sdk-core` (portage iOS). Cette section
> sert de **contrat de non-régression** : aucune valeur ne doit être re-huée. Source iOS :
> `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift`,
> `packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift`, `.../ThemeManager.swift`.

### 3.1 Échelle Indigo (identique des 2 côtés — `MeeshyPalette` / `MeeshyColors`)
```
indigo50  #EEF2FF   indigo100 #E0E7FF   indigo200 #C7D2FE   indigo300 #A5B4FC
indigo400 #818CF8   indigo500 #6366F1 ← primary / début gradient
indigo600 #4F46E5   indigo700 #4338CA ← primary deep / fin gradient
indigo800 #3730A3   indigo900 #312E81   indigo950 #1E1B4B
```
Accents additionnels iOS : `purple500 #A855F7`, `purple600 #8B5CF6`, `purple700 #B24BF3`.
Neutres : `neutral400 #9CA3AF`, `neutral500 #6B7280`, `neutral600 #4B5563`.

### 3.2 Sémantiques (statiques, jamais accentuées)
```
success #34D399   warning #FBBF24   error #F87171   info #60A5FA   readReceipt #818CF8 (indigo400)
pinnedBlue #3B82F6   errorDark #991B1B (fond badge non-lus en dark)   errorSoft #FCA5A5
errorStrong #EF4444   successDeep #10B981
```
Badge non-lus : `unreadBadgeBackground(isDark)` → dark `#991B1B`, light `#F87171`.

### 3.3 Tokens de thème (`MeeshyThemeTokens` — vérifier l'égalité stricte avec iOS `ThemeManager`)
| Token | Dark | Light |
|---|---|---|
| `backgroundPrimary` | `#09090B` | `#FFFFFF` |
| `backgroundSecondary` | `#13111C` | `#F8F7FF` |
| `backgroundTertiary` | `#1E1B4B` | `#EEF2FF` |
| `textPrimary` | `#EEF2FF` | `#1E1B4B` |
| `textSecondary` | `#A5B4FC` | `#4338CA` @60% |
| `textMuted` | `#818CF8` @50% | `#6366F1` @40% |
| `inputBackground` | `#16142A` | `#F5F3FF` |
| `inputBorder` | `#312E81` @60% | `#C7D2FE` |

### 3.4 Gradients signature (`MeeshyColors`)
- `brandGradient` : `#6366F1 → #4338CA` (topLeading → bottomTrailing) — **LA signature** (CTAs, logo, FAB).
- `brandGradientLight` : `#818CF8 → #6366F1`.
- `brandGradientSubtle` : `indigo300@30% → indigo500@30%`.
- `avatarRingGradient` : `indigo500 → indigo400 → indigo500` — **anneau des story rings**.
- `accentGradient` : `indigo600 → indigo500 → indigo400`.
- `mainBackgroundGradient(dark)` : `#09090B → #13111C → #1E1B4B` (dark) / `#FFFFFF → #F8F7FF → #EEF2FF` (light) — **fond de tous les écrans racine**.
- `glassBorderGradient(dark)` : `indigo400@30% → indigo700@10%` (dark) — **bordure des surfaces glass**.

### 3.5 Typographie
iOS : **SF Pro Rounded** pour les gros titres (`MeeshyFont.relative(size, weight, design: .rounded)`).
Tailles iOS (`DesignTokens.swift` → `MeeshyFont`) : caption 10, footnote 11, subhead 13, body 15,
headline 17, title 22, largeTitle 34. **Gros titre d'écran (« Meeshy Chats ») = 46pt bold rounded.**

→ **Android** : SF Pro n'est pas disponible. Substitut à intégrer (police custom `res/font/`) :
**Inter** (ou « Nunito »/« Quicksand » si l'on veut le côté _rounded_ des titres — recommandé pour
matcher SF Rounded). Décision typo à acter en P0-3. Construire une `Typography` Compose custom mappant
ces rôles/tailles (en `sp`, scalable). Poids : titres `Bold`/`SemiBold`, corps `Regular`/`Medium`.

### 3.6 Spacing / Radius / Shadows / Motion (identiques des 2 côtés)
- **Spacing** (grille 4dp) : xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, xxxl 32.
- **Radius** : sm 10, md 14, lg 16, xl 20, xxl 24, full ∞ (pills). ⚠️ iOS `sm=10`/`md=14` ;
  vérifier `MeeshyRadius` Android (rapport d'audit : sm8/md12/lg14/xl20 — **léger désaccord à
  réconcilier sur les valeurs iOS 10/14/16/20/24**).
- **Shadows** : subtle (α .1, r 4, y 2), medium (α .2, r 8, y 4), strong (α .3, r 12, y 6).
- **Motion** : `springFast` response .25 damping .7 · `springDefault` .4/.75 · `springBouncy` .5/.6.
  **Stagger liste = 0.04s × index** (fait partie de la marque). Haptics : light/medium/success/error.
- **Glass** : `.ultraThinMaterial` teinté indigo + bordure `glassBorderGradient`. Sur Android :
  `Modifier.background(token.surface.copy(alpha≈0.6))` + `blur()` (RenderEffect API 31+, fallback
  surface opaque sous API 31) + `border(1.dp, glassBorderGradient)`.

---

## 4. Composants signature à créer / habiller (inventaire `:sdk-ui`)

> Chaque composant est **screenshot-testé** (Roborazzi, light+dark) avant d'être considéré fait.
> Tous vont dans `:sdk-ui` (atomes paramétrés opaques) sauf mention « APP » (orchestration produit,
> cf. `packages/MeeshySDK/CLAUDE.md` — SDK Purity : un composant qui _décide « quand faire X »_
> ou lit des singletons produit reste app-side).

### 4.1 Surfaces & chrome (Phase 0)
| Composant | Rôle | Notes d'implémentation |
|---|---|---|
| `MeeshyBackground` | Fond gradient racine + ambient orbs | `Box` avec `mainBackgroundGradient(dark)` + 2-3 `Circle` floutés (`blur`) en indigo500/700/400, très basse opacité, positionnés en absolu. iOS : `RootView.swift` orbs (`blur(radius: size*0.25)`). |
| `MeeshyTopBar` | Remplace `TopAppBar` brut | `CenterAligned/TopAppBar(colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent, titleContentColor = token.textPrimary))`. Gros titre 34–46sp bold rounded, violet. |
| `MeeshyGlassSurface` | Carte/surface « verre » | fond `surface@60%` + `blur` + `border(glassBorderGradient)` + radius `lg`. Base de toutes les cartes. |
| `MeeshyCard` | Carte de contenu (conv row, post, settings section) | s'appuie sur `MeeshyGlassSurface`, radius `xl`, padding `lg`. Remplace tous les `Card` Material. |

### 4.2 Navigation (Phase 1, dépend de la décision §2)
| Composant | Rôle | Notes |
|---|---|---|
| `RadialMenuFab` (Option A) | Menu radial FAB iOS | 6 items en arc, chacun = cercle coloré + icône + label. **Couleurs/ordre exacts iOS** (`RootView.swift`): `Mes liens #F8B500` (link.badge.plus), `Notifications #FF6B6B` (bell.fill, badge unread), `Contacts #6366F1` (person.2.fill), `Découvrir #8B5CF6` (sparkle.magnifyingglass, badge pending), `Communautés #2ECC71` (person.3.fill), `Réglages #64748B` (gearshape.fill). Animation d'ouverture : scale 0.3→1, opacity 0→1, rotation −30°→0°, `spring(response 0.4, damping 0.65)`, **stagger 0.04×index**. |
| `MeeshyBottomBar` (Option B) | bottom nav re-stylée | fond glass sombre, indicateur `indigo500`, icônes/labels `token.textPrimary/Muted`. |
| `FloatingGradientFab` | FAB principal gradient corail/indigo | cercle `brandGradient` (ou accent), ombre `strong`, `+`. |

### 4.3 Avatars & présence (Phase 1)
| Composant | Rôle | Notes |
|---|---|---|
| `MeeshyAvatar` **v2** | Avatar + ring + presence + mood | Étendre l'existant : param `ring: RingStyle` (none / storyGradient `avatarRingGradient` / unreadCount), `presence: Presence?` (dot vert/gris en bas-droite), `mood: String?` (badge emoji). Charte §13.7. |
| `StoryRing` | Anneau de story « Moi » + tray | anneau gradient + bouton `+` overlay ; tray horizontal `LazyRow`. Réutiliser `feature/stories/.../StoryRingPresentation.kt` s'il existe. |

### 4.4 Listes & sections (Phase 1)
| Composant | Rôle | Notes |
|---|---|---|
| `CollapsibleSection` | Sections repliables liste conv | Header : icône colorée carrée arrondie + titre + compteur pill + chevron animé. Contenu : items enfants. iOS : Épingles (📌 rouge), dossiers (📁 teal), Mes conversations (📥). Animer expand/collapse (`animateContentSize` + rotation chevron). |
| `ConversationRow` **v2** | Ligne de conversation glass | `MeeshyCard` + `MeeshyAvatar v2` + nom (résolu !) + preview + timestamp + accent conversation + icônes sync/mute/pin. |
| `FilterChipRow` | (si conservé) | re-styler les chips en glass/indigo si on garde le filtre. |

### 4.5 Bulles & Prisme (Phase 2 — surtout habillage, la base existe)
`component/bubble/MessageBubble.kt` est déjà riche. Aligner visuellement sur iOS :
- Sortant = `outgoingColor` (accent conv) ; reçu = `bgTertiary`/glass.
- **Bande de drapeaux Prisme** sous le texte (original + systeme + regional/custom + deviceLocale,
  max 4, dédupliqués) — icône translate + drapeaux cliquables ; tap = panneau secondaire inline
  (fond pastel couleur langue + séparateur coloré). Réf iOS : `apps/ios/CLAUDE.md` « Prisme
  Linguistique — Implementation iOS ».
- Réactions en pill, accusés `✓✓` (`readReceipt #818CF8`), timestamps.

### 4.6 Divers (Phase 3)
`MeeshyToast` (feedback + notification, 2 étages — cf. iOS), `pull-to-refresh` brandé, `MeeshyPrimaryButton`
(déjà OK), `TagInput`, `progressive image` (Coil + shimmer), `scroll-collapsing header`.

---

## 5. Gap analysis écran par écran (fichiers Android à modifier)

> Pour chaque écran : réf iOS (screenshot + fichier), fichier Android à modifier, deltas.
> Ne créer **aucun** nouvel écran (tous existent) — uniquement re-styler + brancher les
> composants signature. Migrer tout `MaterialTheme.colorScheme.*` → `MeeshyTheme.tokens.*`.

| # | Écran | Fichier Android | Deltas → iOS |
|---|---|---|---|
| S1 | **Liste conversations** | `feature/conversations/.../ConversationListScreen.kt` | `MeeshyBackground` ; `MeeshyTopBar` titre 46sp rounded ; `StoryRing`+tray « Moi » ; `FloatingGradientFab` ; `CollapsibleSection` (épingles/dossiers/mes conv) ; `ConversationRow v2` glass + **résolution des noms** (bug data : items titrés « Conversation ») ; barre recherche glass. Réf iOS : `ConversationListView.kt` (+ `+Rows`, `+Overlays`, `Helpers`). |
| S2 | **Conversation / Chat** | `feature/chat/.../ChatScreen.kt`, `component/bubble/*` | Fond sombre/animé ; header accent conv ; bulles alignées iOS ; **bande drapeaux Prisme** + panneau secondaire ; réactions/accusés ; input glass. Réf iOS : `ConversationView*.swift`, `Bubble/`. |
| S3 | **Feed** | `feature/feed/.../FeedScreen.kt` | `MeeshyBackground` ; story tray ; **carte de post** (header auteur+drapeau+badge trad, `voir plus`, actions colorées like/comment/repost/save/share) ; empty-state brandé. Réf iOS : `RootView.swift` (Meeshy Feed) + cellules post. |
| S4 | **Réglages** | `feature/settings/.../SettingsScreen.kt` | `MeeshyBackground` ; **carte profil** (avatar+presence) ; sections à **puce d'icône colorée** ; `ThemePickerRow` re-stylé (Auto/Clair/Sombre) ; sections Voice/Transcription ; **migrer tout `MaterialTheme.colorScheme` → tokens**. Réf iOS : `SettingsView`. |
| S5 | **Activity / Notifications** | `feature/notifications/.../NotificationsScreen.kt` | `MeeshyBackground` ; `MeeshyTopBar` ; lignes glass ; empty-state brandé ; migrer vers tokens. |
| S6 | **Profil** | `feature/profile/.../ProfileScreen.kt` | Header gradient/accent, stats, bandeau ; glass. |
| S7 | **Calls (historique + in-call)** | `feature/calls/.../CallHistoryScreen.kt`, `CallScreen.kt` | Historique glass + empty-state brandé ; in-call = fond sombre, contrôles gradient. |
| S8 | **Contacts** | `feature/contacts/.../ContactsScreen.kt` | Onglets glass, lignes avatar v2. |
| S9 | **Login/Auth** | `feature/auth/.../LoginScreen.kt` | Déjà le plus brandé (`BrandLogo`+`MeeshyPrimaryButton`) — aligner fond (`MeeshyBackground`) + typo. |
| S10 | **Stories (tray/viewer/composer)** | `feature/stories/.../*` | Déjà développé ; vérifier ring/anneaux + cohérence tokens. |
| S11 | **Navigation racine** | `app/.../navigation/MeeshyApp.kt` | Selon §2 : Option A retirer `NavigationBar` + brancher `RadialMenuFab` + top-title ; `Scaffold(containerColor = token.backgroundPrimary)` déjà OK. Corriger le libellé/route « Profile »→Settings. |

---

## 6. Roadmap phasée (multi-jours)

> Ordre impératif : **fondations → primitives → écrans → polish → QA**. Chaque tâche se termine
> par un **build vert** (`./apps/android/meeshy.sh build`) + un **screenshot A/B** (§7). Committer
> par lots cohérents verts (feedback mémoire : worktree propre, pas de churn).

### Phase 0 — Fondations du thème (≈ 1–2 jours)
- **P0-1** — Verrouiller les tokens : diff strict `MeeshyThemeTokens.kt` / `MeeshyPalette.kt` vs
  §3 ci-dessus. Corriger tout écart (notamment `MeeshyRadius` sm/md → **10/14/16/20/24** iOS).
  _Acceptation_ : test unitaire de non-régression sur les hex + radius.
- **P0-2** — **Dark par défaut premium** : décider du défaut. iOS rend sombre → soit passer le
  défaut `AppThemeMode` de AUTO à **DARK**, soit garder AUTO mais s'assurer que le light est tout
  aussi brandé. _Recommandé_ : garder AUTO (respecte le système) MAIS re-styler **les deux** thèmes
  (le light Android actuel est « Material plat », pas le light premium iOS `#FFFFFF→#F8F7FF→#EEF2FF`).
  _Acceptation_ : les 2 thèmes rendent le `MeeshyBackground` gradient, plus jamais de surface Material grise.
- **P0-3** — **Typographie** : intégrer la police custom (`res/font/`, ex. Inter/Nunito rounded),
  créer une `Typography` Compose mappant les rôles iOS (§3.5), la brancher dans `MeeshyTheme`.
  _Acceptation_ : titres d'écran en gros rounded bold violet, corps lisible, scalable (`sp`).
- **P0-4** — **Habiller le chrome** : créer `MeeshyBackground`, `MeeshyTopBar`, `MeeshyGlassSurface`,
  `MeeshyCard` dans `:sdk-ui`. Retirer/re-styler la `NavigationBar` (selon §2). Remplacer les
  `Scaffold`/`TopAppBar`/`Card` bruts des écrans par ces composants (passe globale, écran par écran
  aux phases suivantes mais primitives prêtes ici).
  _Acceptation_ : un écran pilote (Notifications, le plus simple) passe intégralement en glass/dark.

### Phase 1 — Composants signature (≈ 2–3 jours)
- **P1-5** — `MeeshyAvatar v2` (ring/presence/mood) + `StoryRing` + tray. _Acceptation_ : Roborazzi ring gradient + presence dot.
- **P1-6** — `CollapsibleSection` + `ConversationRow v2` glass. _Acceptation_ : sections Épingles/dossiers/Mes conv se replient avec anim.
- **P1-7** — **Menu radial FAB** (`RadialMenuFab`, Option A) — couleurs/ordre/anim exacts §4.2 —
  + `FloatingGradientFab`. _Acceptation_ : ouverture staggerée identique iOS, 6 items, badges unread/pending.
- **P1-8** — `MeeshyToast` (2 étages : feedback local + notification réseau, cf. règles iOS).

### Phase 2 — Écran par écran (≈ 4–6 jours, 1 écran ≈ ½–1 j)
Ordre : S5 (Notifications, pilote) → S1 (Liste conv, le plus visible) → S2 (Chat + Prisme) →
S4 (Réglages) → S3 (Feed) → S6 (Profil) → S8 (Contacts) → S7 (Calls) → S9 (Login) → S10 (Stories).
Pour **chaque** écran : brancher les primitives P0/P1, migrer `MaterialTheme.colorScheme.*` →
`MeeshyTheme.tokens.*`, screenshot A/B vs iOS, ajuster au pixel, Roborazzi light+dark.

### Phase 3 — Micro-interactions & polish (≈ 1–2 jours)
Springs/stagger sur toutes les listes (0.04×index), haptics (light/medium/success/error),
pull-to-refresh brandé, transitions de nav, ambient orbs animés, shimmer sur skeletons,
badges Prisme (tap → panneau secondaire), accusés `✓✓`.

### Phase 4 — QA de parité (≈ 1–2 jours)
- **Gate Roborazzi** (charte §13) : chaque primitive + chaque écran en **light, dark, large font,
  RTL, tablette**. Baselines committées.
- **Comparaison A/B finale** : reprendre les screenshots iOS de référence, diff visuel écran par écran.
- **`./apps/android/meeshy.sh run`** : parcours manuel des 10 écrans, dark + light.
- Lint/detekt/ktlint verts.

---

## 7. Méthodologie de vérification (obligatoire à chaque tâche)

1. **Build non-bloquant** : `./apps/android/meeshy.sh build` (vérifier `BUILD SUCCESSFUL` dans le
   log — ne jamais se fier au seul code retour).
2. **Screenshot A/B** :
   - iOS (cible) : `xcrun simctl io 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 screenshot ios.png`
     (app déjà connectée en `atabeth`).
   - Android : `~/android-sdk/platform-tools/adb exec-out screencap -p > android.png`.
   - Poser côte à côte (Pillow) et comparer au pixel. Réf : captures de session dans
     `apps/android/tasks/audit/parity-shots/` (**committer** depuis le scratchpad :
     `ios_01_home.png`, `ios_02b_conversation.png`, `ios_03_feed.png`, `ios_05_settings.png`,
     `android_02_list.png`, `android_06_profile.png`, + les `compare/cmp_*.png`).
3. **Roborazzi** : `./gradlew :sdk-ui:recordRoborazziDebug` (baseline) puis `verifyRoborazziDebug`
   (gate). Toute déviation d'un écran validé = échec.
4. **Navigation émulateur** : `adb shell input tap X Y` (re-dumper les bounds via `uiautomator dump`
   avant chaque tap — le clavier `adjustResize` remonte le layout).

## 8. Pièges connus (toolchain Android locale — voir mémoire `reference_android_local_toolchain`)
- **`meeshy.sh` messages en ASCII uniquement** (bash 3.2 macOS + `set -u` parse mal un multibyte collé à une expansion).
- **DNS émulateur** : `meeshy.sh` pin `-dns-server 8.8.8.8,1.1.1.1`. Un snapshot quick-boot restauré
  d'avant ce flag garde un état réseau périmé → au besoin cold boot `-no-snapshot-load`.
- **`meeshy.sh run` BLOQUE** (comme le run iOS) : boot AVD + installDebug + launch + logcat scopé au pid.
- SDK `~/android-sdk`, JDK brew `openjdk@21`, AVD `meeshy_pixel8` (API 35 arm64), émulateur `me.meeshy.app.debug/me.meeshy.app.MainActivity`.

## 9. Definition of Done (par écran ET global)
- [ ] Rendu **indiscernable** de l'iOS en **dark** ET en **light** (comparaison A/B).
- [ ] Zéro surface Material grise/lavande par défaut ; tout passe par `MeeshyTheme.tokens` + glass.
- [ ] Zéro `MaterialTheme.colorScheme.*` résiduel dans les écrans (tout migré vers `tokens`).
- [ ] Composants signature branchés (story ring, sections repliables, menu radial/FAB, badges Prisme).
- [ ] Typographie custom (rounded titres) en place et scalable.
- [ ] Aucune couleur re-huée vs §3 (contrat de non-régression respecté).
- [ ] Baselines **Roborazzi** vertes (light/dark/large-font/RTL/tablette).
- [ ] `meeshy.sh build` vert ; lint/detekt/ktlint verts ; commits en lots cohérents verts.

---

### Annexe — Fichiers de référence à consulter
- **iOS design system** : `packages/MeeshySDK/Sources/MeeshyUI/Theme/{MeeshyColors,ThemeManager,DesignTokens,Accessibility}.swift`,
  `packages/MeeshySDK/CLAUDE.md` (§ Visual Identity), `apps/ios/CLAUDE.md` (§ Design System, § Prisme).
- **iOS écrans** : `apps/ios/Meeshy/Features/Main/Views/{RootView,ConversationListView*,ConversationView*}.swift`, `.../Views/Bubble/`.
- **Android existant** : `apps/android/ARCHITECTURE.md` §13 (charte LOCKED), `apps/android/decisions.md`,
  `apps/android/tasks/{inventory-screens,feature-parity}.md`, `sdk-ui/.../theme/*`, `sdk-core/.../theme/DynamicColorGenerator.kt`.
