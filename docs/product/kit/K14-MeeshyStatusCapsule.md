# K14 — MeeshyStatusCapsule (la capsule qui dit un refus, une limite ou une panne)

Relevé sur `origin/dev` `736820c620` le 2026-11-11. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`, entrée K14 (chantier #17312, milestone 258 ; issue du lot #17647). Lois 12, 13 et 16 de `docs/product/composer-vue-finale.md`. Planche : `caps(html, o)` (ligne 225), `.caps` (54), `.caps.glass.deep` (29), `.sub` (61), `.ctl.white` (48-49) ; trois vues seulement : R10 (294), P2 (353), P3 (354). Dépend de K00 et de K01, fusionnés sur les trois plateformes ; les entrées de catalogue K14 existent, vides.

## 1. Rôle
Une capsule de verre dit en une phrase ce qui vient d'être refusé, limité ou raté, là où le geste a eu lieu, avec au plus une action.

Elle ne fait pas :
- le texte, sa traduction, le choix de l'icône ni la décision de parler : l'app (`ComposerLimitFeedback.message`, `ComposerLimitNoticeBoard`, `FeedbackToastManager`, `CallToastBus`, `sendToastOf`) ;
- sa place : l'hôte l'ancre au-dessus de sa barre ; K14 ne connaît ni la pilule (K10) ni la scène ;
- le verre, le ton et la matière : K01 ; l'anneau d'envoi et l'état « Au retour en ligne » de Publier : K09 et K13 ; la raison d'un format grisé dans le ▾ : K11 ;
- une file ni une pile : une capsule par hôte, la dernière remplace ;
- une alerte, une confirmation (P4, R12), une notification riche avec avatar, la pastille de synchronisation des listes.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyStatusCapsule.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-status-capsule.tsx` |
|---|---|---|---|
| Face (pure) | `MeeshyStatusCapsule(_ message:…)` | `MeeshyStatusCapsule(message, modifier, …)` | `<MeeshyStatusCapsule message … />` |
| Hôte | `.meeshyStatusCapsule(_ item: Binding<MeeshyStatusCapsuleItem?>, edge:haptic:)` | `MeeshyStatusCapsuleHost(item, onDismiss, modifier, edge, haptic)` | `<MeeshyStatusCapsuleHost item onDismiss edge haptic />` |
| Ce qui se présente | `MeeshyStatusCapsuleItem` | `data class` identique | `type` identique |
| Nature | `MeeshyStatusCapsuleKind { info, success, warning, failure }` | `enum class` | `'info' \| 'success' \| 'warning' \| 'failure'` |
| Action | `MeeshyStatusCapsuleAction(label:systemImage:perform:)` | `(label, icon, onClick)` | `{ label, glyph?, onPress }` |
| Durée | `MeeshyStatusCapsuleDuration { automatic, persistent, milliseconds(Int) }` | `sealed interface` | `'automatic' \| 'persistent' \| number` |
| Loi pure | `MeeshyStatusCapsuleTiming` | `object` identique | `meeshyStatusCapsuleTiming` |
| Valeurs | `MeeshyStatusCapsuleRecipe` | idem | `meeshyStatusCapsuleRecipe(...)` |

Paramètres de la face, opaques, mêmes défauts partout :
- `message` (obligatoire ; vide ⇒ rien n'est rendu) ; `detail: String? = nil` ; `systemImage` / `icon` / `glyph = nil` ;
- `kind = info` : il ne colore rien ; il règle l'haptique, la priorité de l'annonce et le rôle ;
- `action = nil` ; `closeLabel: String? = nil` (un ✕ n'est dessiné que s'il est passé) ; `onDismiss = nil` ;
- `tone: MeeshyGlassTone? = nil` (celui de l'hôte) ; `tint: Color? = nil` (remis à K01) ; `isPressed: Bool? = nil` (fige l'action pour le catalogue).

`MeeshyStatusCapsuleItem` : `id: String` (opaque, stable pour un même refus), les champs de la face, `duration = automatic`. Hôte : `edge { bottom, top } = bottom` (sens de l'entrée et du glisser), `haptic { automatic, none } = automatic`. La fermeture vise un `id`, jamais son successeur.

Emplacement unique : `leading`, à la place de l'icône (anneau, drapeau, point d'état). Aucun emplacement de fin : l'action est typée.

## 3. États
- Message seul, deux lignes au plus : R10 (`warning`, sans icône).
- Icône et message : P2 (`info`, Wi-Fi barré).
- Message, détail et action : P3 (`failure`, « Réessayer » avec son glyphe) ; elle reste tant que l'hôte ne la retire pas.
- Ton `onLight` (option `light` de `caps()`), ton `theme` hors média, teintée (`tint`), avec ✕, action pressée, focus clavier, opaque (« réduire la transparence »), grande police (l'action passe sous le texte), remplacement d'un message par un autre : aucune vue, conservés du code.
- Absente : rien dans l'arbre, ni verre ni flou.

Loi 13 :
- pas de capsule pour un message vide ; pas d'icône par défaut selon `kind` ; pas de détail vide ; pas de ✕ sans `closeLabel` ; pas de chevron ; pas de seconde action ;
- une seule à la fois par hôte ; jamais d'alerte modale pour un refus (loi 12) ;
- pas de compteur ni de plafond au repos : elle n'existe qu'à la borne ;
- rien pour ce qui a déjà sa place : format indisponible (raison dans le ▾), progression (anneau), hors ligne durable (libellé de Publier) ;
- l'hôte ne la monte pas quand tout est rangé (R4).

## 4. Gestes et retours
- Apparition : l'HÔTE joue, une fois par `id`, l'haptique du site unique — `info` léger, `success`, `warning`, `failure` erreur — par `HapticFeedback`, `MeeshyHaptics`, `lib/view/haptics.ts` ; `haptic: none` laisse l'app jouer le sien. La face ne vibre jamais.
- Entrée : glissement de 8 pt depuis son bord et fondu, `MeeshyAnimation.springFast` ; sortie inverse. « Réduire les animations » : fondu seul, 150 ms. Remplacement : fondu enchaîné du texte, sans animer la largeur.
- Disparition (`MeeshyStatusCapsuleTiming.visibleMilliseconds`) : `automatic` ⇒ 4 s sans action, persistante avec une action ; au moins 6 s sous lecteur d'écran ; Android prend le plus long avec `getRecommendedTimeoutMillis` ; sur le web le minuteur s'arrête au survol et au focus.
- Silence (`speaks(id:at:last:)`) : le même `id` représenté dans les 2 s ne vibre ni ne s'annonce ; le minuteur repart.
- Action : `perform` part une fois, au relâcher, avec un `light` ; le fond blanc passe de 100 à 78 % à l'appui. L'hôte retire la capsule.
- Fermer, seulement si `onDismiss` existe : glisser de 24 pt vers son bord (elle suit le doigt, revient sous le seuil), ✕ s'il est dessiné, Échap sur le web quand le focus y est.
- Sans action ni `onDismiss`, elle ne prend aucun doigt : le toucher traverse jusqu'à la scène.

## 5. Accessibilité
- Annonce à l'apparition : « message, détail ». iOS : `AdaptiveAccessibility.announce`, priorité haute pour `failure`. Android : `liveRegion` Polite, Assertive pour `failure`. Web : région vivante montée en permanence par l'hôte, vide au repos, `role="status"`, `role="alert"` pour `failure`, `aria-atomic`.
- Tant qu'elle est visible, elle se lit : un élément de texte (nom = message, détail), puis l'action (rôle bouton, nom = `label`), puis ✕ (nom = `closeLabel`). Icône et glyphes masqués. Avec `onDismiss` : action nommée « Fermer » pour VoiceOver et TalkBack.
- L'apparition ne prend jamais le focus. Web : l'action et ✕ sont des `<button type="button">` dans l'ordre de tabulation, anneau `:focus-visible` de K01 ; si le focus était dedans à la disparition, il retourne à l'élément qui l'avait avant.
- Cibles : 44 pt, 48 dp, 44 px pour l'action (dessinée en 36) et pour ✕.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le texte grandit, message jusqu'à quatre lignes, l'action passe dessous, alignée à la fin ; rien n'est rogné ; web en `rem`.
- RTL : icône au début, action à la fin, texte aligné au début ; le glyphe de l'action ne se reflète pas.
- Contraste, calculé depuis la recette, au pire sur blanc pur sans flou : message 6,12:1 sur `deep` dense, 5,07:1 sur `onLight` ; détail à 85 % : 4,97:1 sur dense, encre pleine sur `onLight` ; action `indigo950` sur blanc 15,99:1. Plancher 4,5:1 ; chaque plateforme inscrit sa mesure dans les vecteurs.
- « Réduire la transparence » : K01 rend opaque.

## 5 bis. Performance
- Ne se re-rend jamais : la scène, la pilule et l'hôte quand la capsule entre, change ou sort. Elle est une surimpression qui ne déplace rien. iOS : face `Equatable`, minuteur dans le modificateur. Android : paramètres stables, état dans l'hôte. Web : seul l'hôte s'abonne ; survol et appui en CSS.
- S'anime : `transform` (translation) et opacité. Jamais le flou, l'ombre, la largeur ni la mise en page.
- Un seul flou, celui de K01, retiré de l'arbre quand elle est absente.
- Un minuteur, annulé au remplacement et au démontage ; aucun singleton, rien de retenu une fois l'écran quitté.
- Budget : buter sur 1000 caractères en pleine frappe ne perd aucune image et ne dit la borne qu'une fois par 2 s.

## 6. Jetons et mesures
Planche (téléphone de 390) : rayon 22, marges 10 et 14, écart 10, largeur au contenu, 350 au plus ; texte 13/18 demi-gras blanc ; détail 12 moyen ; icône 18 ; action : blanc plein, hauteur 36, marges 16, écart 6, 13 gras, glyphe 14, encre `#0E1117` ; verre `deep` dense (`rgba(14,17,23,.66)`), `onLight` sur scène claire ; posée à 106 du bas, soit 14 au-dessus d'une pilule de 64 posée à 28.

Jetons : `MeeshyRadius.xlPlus` (22) ; `MeeshySpacing.smPlus` (10), `.mdPlus` (14, marge et écart à la barre), `.lg` (16), `.xsPlus` (6), `.xl` (20, marge latérale) ; `MeeshyFont.subheadSize` (13), `.smallSize` (12) ; `MeeshyIconSize.lg` (18), `.sm` (14) ; `MeeshyControlSize.regular` (36), `.tapTarget` ; encres `MeeshyColors.onMedia`, `.onMediaSecondary`, `indigo950` ; leurs pendants `MeeshyPalette` / `MeeshyMediaChromeColors` et `--color-on-media`, `--ios-indigo-950`, `--target-min`. Verre : `.meeshyGlass(in:tone:density: .dense, tint:)`, `MeeshyGlass`, `<MeeshyGlass density="dense">`, jamais interactif. Largeur 350, durées 4000 / 6000 / 2000 ms, seuil 24, opacités 85 et 78 % : dans `MeeshyStatusCapsuleRecipe` et `MeeshyStatusCapsuleTiming`, nulle part ailleurs.

## 7. Jumeaux
K14 ne rebranche ni ne supprime rien : il promeut le plus complet, et les lots d'intégration changent les écrans.
- iOS. DEVIENT : `ComposerLimitCapsuleView`, `ComposerLimitCapsule` (un message à la fois, minuteur gardé par génération, sommeil injecté), `ComposerSystemLimitSpeaker` (haptique, annonce, affichage) et la loi `ComposerLimitNotice.speaks`, dans `Features/Composer/ComposerLimitFeedback.swift`. Restent à l'app : `ComposerLimitFeedback.message`, `ComposerLimitNoticeBoard`.
- iOS, supprimés : par I2, ces quatre types et le montage de `ComposerSceneSurface.swift:451` ; par I7, le toast d'échec partiel (`ComposerPublishMenu.swift:552`), qui devient P3 ; par I1, `CallControlsNoticePill` (1 appel) et `CallCaptureAlertCapsule` (1 appel, rouge par `tint`) ; par I10, `FeedbackToastView`, `FeedbackToastType`, `FeedbackToastReveal` (la face du toast ; `FeedbackToastManager`, 303 appels, et `FeedbackToastOverlay` restent) et `ErrorBannerView` (0 appelant).
- Android. DEVIENT : `MeeshyFeedbackToast` (`sdk-ui/component/MeeshyToast.kt`, 6 appels) pour la face, `FeedbackToastTiming` (`core/model`) pour la loi, et la sémantique de `FeedbackToastCenterHost` (région vivante, haptique par nature, glisser pour fermer).
- Android, supprimés : par I2, `SceneNoticeLine` et `StorySocleNotice` ; par I1, `CallToastHost` et `CallVideoNoticePill` ; par I10, `MeeshyFeedbackToast`, `ToastPill` et leurs hôtes (`FeedbackToastHost`, `ConnectionFeedbackHost`, viseur, `RecentMediaGrid`) ; `FeedbackToastCenter` reste.
- Web. DEVIENT : `CallControlToast` (`components/call-control-overlays.tsx` : verre, rôle par nature, 4 s, action « Réglages »), complété par l'action de `SendToastHost`.
- Web, supprimés : par I1, `CallControlToast` ; par I2, la branche `placeRefusal` de `StudioFooterMessage` (`routes/story-compose-footer.tsx`) ; par I7, `StudioPendingBand` (`routes/story-compose-pending.tsx`), les branches `publishFailure` du même pied et les lignes `data-mood-offline` / `data-mood-error` de `routes/status-compose.tsx` ; par I10, `SendToastHost` et `NoticeBanner` de `composer-tray.tsx`.
- Pas des jumeaux, intacts : `SyncPill`, `MeeshySyncPill`, `sync-pill.tsx` ; `PendingPublicationPill` et `UnsentPublicationsToast` (des lois sans vue) ; `MeeshyNotificationToast`, `notification-toast.tsx` ; `CallStatusPill` (pastille d'état permanente) ; `system-notice.tsx`.

## 8. Témoins exigés
Comportements (`MeeshyStatusCapsuleTests`, `MeeshyStatusCapsuleTest`, `meeshy-status-capsule.test.tsx`) :
- loi : durée pour chaque couple durée × action × lecteur d'écran ; silence de 2 s par `id` ; nature ⇒ haptique, priorité, rôle ;
- face : message vide ⇒ rien ; ni icône, ni détail, ni action, ni ✕ sans leur paramètre ; deux lignes au plus ; action sous le texte en grande police ; ordre inversé en RTL ;
- hôte : un seul retour haptique par `id`, par le site unique, aucun avec `none` ; une annonce, à la bonne priorité ; sortie à l'heure de la loi, horloge injectée ; persistante avec action ; un minuteur en retard ne ferme jamais le successeur ; glisser, ✕ et Échap appellent `onDismiss(id)` ; le toucher traverse sans action ; le focus n'est pas pris, et il est rendu sur le web ; fondu seul sous « réduire les animations » ;
- contraste du message, du détail et de l'action calculé depuis la recette ;
- gardes de source : ni `glassEffect`, ni `adaptiveGlass`, ni `backdrop-filter`, ni singleton, ni couleur en dur dans les fichiers de K14 ; web : `glass-site.mjs` et `check-kit.mjs` verts ;
- parité : `docs/product/kit/K14-MeeshyStatusCapsule.vectors.json`, écrit par le lot iOS, lu par les trois suites ; non-régression : aucun jumeau ni écran touché.

Instantanés (`MeeshyStatusCapsule/<id>.<variante>`) : `plafond` (R10, fond média), `hors-ligne` (P2), `echec` (P3, avec `presse`), `clair` (fond clair, `onLight`), `theme`, `teinte`, `fermable`, en `clair` et `sombre`, planches `grande-police` et `rtl` ; iOS : `-iOS26` et `-dessine` ; web : 390, 820 et 1440 px. Images enregistrées sur la branche du lot, puis comparées au vert.

Catalogue : entrée K14 remplie dans `MeeshyKitCatalog+K14.swift`, `KitCatalogK14.kt`, `components/kit/catalog/k14.tsx` ; il montre la FACE, donc ne vibre pas.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Le registre dit « une ligne » ; R10 en dessine deux, à 350 de large.
- Le jumeau iOS est une `Capsule()` au texte centré, cachée de VoiceOver, visible 2,2 s, teintée noir 55 % hors de K01 ; la planche dessine un rayon de 22 et un texte aligné au début.
- Les toasts sont colorés par nature (iOS, fonds pleins ; Android, icône teintée) et montent du haut ; la planche n'a que du verre, au-dessus de la pilule.
- Les durées divergent : 2,2 s, 2,5 s, 3 s, 4 s, 6 s.
- Sur P2 et P3 la capsule recouvre la ligne des références.
- Le web n'a aucune capsule au composer (texte rouge sous le socle, bandeau en haut) et son site haptique n'a ni `warning` ni `error`.
- La planche écrit `role="status"` même pour l'échec de P3 ; le détail à 70 % tombe à 3,96:1 sur blanc.
- `.ctl.white` n'a pas de composant du kit hors de K16.
- Registre : `ComposerLimitNoticeBoard`, `PendingPublicationPill` et `UnsentPublicationsToast` ne sont pas des vues ; « MeeshyToast » est un fichier, le composable s'appelle `MeeshyFeedbackToast` ; `ErrorBannerView` n'a aucun appelant ; la planche compte 73 vues.
- Le bandeau web porte deux actions (Supprimer, Réessayer) et « Annuler l'envoi ».

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. Message sur deux lignes au plus, quatre en grande police. (Une ligne tronquée ; sans limite.)
2. Rectangle arrondi de 22, texte aligné au début. (Capsule pleine et texte centré.)
3. Verre seul, dense, au ton de l'hôte ; `kind` ne colore rien ; la puce rouge des appels passe par `tint`. (Fond coloré par nature ; icône teintée.)
4. Pas d'icône par défaut. (Icône déduite de la nature.)
5. Une seule action, libellée, en capsule blanche de 36 dessinée par K14 ; ni toucher de toute la capsule ni chevron ; « Supprimer » revient à P4, « Annuler l'envoi » à l'anneau, à I7. (Deux actions ; capsule entière cliquable ; emplacement libre.)
6. ✕ seulement si l'hôte passe `closeLabel` ; sinon glisser, Échap ou l'hôte. I1 le passe pour l'avis d'appel, I7 sur le web seulement. (Toujours un ✕ ; jamais.)
7. 4 s, 6 s au moins sous lecteur d'écran, persistante avec une action, durée imposable par l'hôte. (Garder 2,2 s ou 3 s ; 6 s pour toute action.)
8. Le silence de 2 s par `id` entre dans la loi du kit. (Le laisser à chaque app.)
9. Face pure et hôte séparés ; l'hôte joue haptique, annonce et minuteur ; aucun singleton. (Composant qui joue seul ; état partagé.)
10. Quatre natures ; `failure` s'annonce en priorité et prend `role="alert"`. (Tout en `status`, comme la planche.)
11. Le site haptique du web reçoit `warning` et `error`. (Les rabattre sur `medium` ; pas d'haptique.)
12. La place reste à l'hôte ; K14 donne l'écart de 14 et la marge de 20 ; elle recouvre les références, comme dessiné. (L'hôte masque les références ; la capsule pousse la pilule.)
13. Détail à 85 %, encre pleine sur `onLight`. (70 % de la planche.)
14. Elle se lit tant qu'elle est visible. (Cachée après l'annonce.)
15. 350 de large au plus sur tout écran. (Largeur proportionnelle.)
16. Synchronisation, notification riche, `CallStatusPill` et lois sans vue ne sont pas absorbés. (Les absorber.)
17. Aucun jumeau rebranché dans K14 : I1, I2, I7 et I10 s'en chargent, avec captures. (Renvoyer `ComposerLimitCapsuleView` vers K14 dès ce lot.)
