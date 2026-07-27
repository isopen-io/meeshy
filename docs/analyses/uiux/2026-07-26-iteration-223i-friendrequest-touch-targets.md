# iOS UI/UX — Iteration 223i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`
**Axe** : HIG / accessibilité **motrice** — les trois commandes de l'écran passent
au plancher de 44 × 44 pt
**Base** : `main` HEAD `2450cdb82`

## Contexte

221i (`MiniAudioPlayerBar`, PR #2363) a ouvert la piste des cibles tactiles et
a livré un inventaire : **18 frames de bouton sous 44 pt sur 13 fichiers**, avec
la consigne explicite de les traiter **au cas par cas** — « certains peuvent déjà
être couverts par un `.contentShape` plus large ou un parent tappable ; pas de
conversion en masse sans lire le contexte ».

Cette itération applique cette consigne à `FriendRequestListView`, et **le cas
par cas change la réponse** : ici la bonne correction n'est pas d'agrandir les
pastilles mais d'agrandir la **zone tactile** en laissant le visuel intact.

### Pourquoi cet écran d'abord

`apps/ios/CLAUDE.md` écrit la règle (« Minimum touch target: 44x44pt (Apple HIG
requirement) »). Cet écran la viole sur **ses trois seules commandes**, et deux
d'entre elles sont **irréversibles socialement** : accepter ou refuser une
demande d'ami. Une erreur de doigt ne coûte pas un aller-retour de navigation,
elle refuse quelqu'un.

| Contrôle | Cible réelle | Plancher | Écart |
|---|---|---|---|
| Retour (`chevron.backward`, l.54-61) | **aucun `frame`** → ~17 pt (glyphe `.callout`) | 44 | **−61 %** |
| Refuser (l.178-187) | 36 × 36 | 44 | −18 % |
| Accepter (l.189-207) | 36 × 36 | 44 | −18 % |

Trois aggravants, dans l'ordre de gravité :

1. **Le retour n'a aucun `frame`.** La cible d'un `Button` est exactement la
   région de layout de son label ; un glyphe `.callout` seul fait ~17 pt. C'est
   le **seul** chemin de sortie de l'écran (`dismiss()`), et c'est la plus petite
   cible des trois — le pire rapport conséquence/taille.
2. **Refuser et Accepter sont contigus** (`HStack(spacing: 8)`). Des cibles trop
   petites *adjacentes* se piègent mutuellement : un doigt qui manque
   « Accepter » ne tombe pas dans le vide, il tombe sur « Refuser ». Le mode de
   défaillance n'est pas « rien ne se passe », c'est **l'action inverse**.
3. **Accessibilité motrice** : tremblement, mobilité réduite, usage en marche.

Révélateur du même angle mort que 221i : le **VoiceOver de cet écran est déjà
soigné** — les 3 commandes ont un `.accessibilityLabel` localisé, la rangée
d'identité est fusionnée en une annonce unique (`children: .combine`), le titre
porte `.isHeader`. La passe **lecteur d'écran** a été faite ; la passe
**motrice**, jamais.

## Correctif (223i)

### Le patron : zone tactile ≠ taille visible

221i a agrandi ses commandes parce que leur `frame` **était** le visuel. Ici les
pastilles ont un fond (`Circle().fill(…)`) : les agrandir à 44 changerait le
dessin de l'écran. Le patron Apple correct est d'emballer le visuel dans une
région de layout plus grande :

```swift
Image(systemName: "xmark")
    .frame(width: 36, height: 36)          // ← pastille visible, INCHANGÉE
    .background(Circle().fill(…))
    .frame(width: 44, height: 44)          // ← zone tactile
    .contentShape(Circle())
```

`.contentShape` est indispensable : sans lui, la couronne transparente entre la
pastille de 36 et le bord de 44 ne participe pas de façon fiable au hit-testing.

### Le `spacing: 8` devient `spacing: 0` — et le rythme visuel ne bouge pas

C'est ce qui borne le coût en largeur, exactement comme dans 221i :

| | Largeur du couple | Écart visible entre pastilles |
|---|---|---|
| Avant (`36 + 8 + 36`) | 80 pt | 8 pt |
| 44 pt en gardant `spacing: 8` | 96 pt | 8 + 4 + 4 = **16 pt** |
| 44 pt avec `spacing: 0` | **88 pt** | 4 + 4 = **8 pt** |

Une pastille de 36 centrée dans 44 laisse 4 pt de retrait transparent de chaque
côté : à `spacing: 0`, ces retraits **redeviennent** l'écart de 8 pt d'origine.
Coût net : **+8 pt** de largeur, et **0 pixel de différence** entre les deux
pastilles et leur espacement.

### Le retour : `alignment: .leading`

Un `.frame(width: 44, height: 44)` nu **centrerait** le chevron dans sa boîte et
le décalerait de ~13 pt vers la droite. `alignment: .leading` le laisse là où il
est : le glyphe ne bouge pas, la zone tactile s'étend vers la droite et le bas.

### Le contrepoids d'en-tête suit

L'en-tête est un `HStack` symétrique : `[retour] Spacer() [titre] Spacer()
[Color.clear]`. Ce `Color.clear.frame(width: 24)` (l.72) existe pour contrebalancer
le retour. Il passe à **44** pour rester son miroir.

**Ce n'est pas un no-op visuel, et il serait malhonnête de le prétendre** : le
titre était centré entre un contrôle de ~17 pt et un contrepoids de 24 pt, donc
**décentré d'environ 3 pt vers la gauche**. Avec 44 des deux côtés il devient
réellement centré. Le changement va dans le sens de la correction, mais c'en est
un — il mérite un coup d'œil au review.

### Hauteur

L'en-tête porte déjà `.padding(.vertical, 12)` autour d'un glyphe `.callout`
(~21 pt) ⇒ ~45 pt de haut : la boîte de 44 **n'ajoute rien**. La rangée de
demande contient un `MeeshyAvatar` de 52 pt, donc la boîte de 44 n'y ajoute rien
non plus.

## Hors périmètre (délibéré)

**`MessageOverlayMenu.videoControls`** — c'est la cible que 221i désignait comme
la pire (14 × 14, l.1028), et je l'ai écartée **après lecture**, ce que la
consigne « au cas par cas » demandait précisément :

- ses trois commandes de transport (play/pause `relative(14)`, ∓5 s
  `relative(12)`, toutes `.buttonStyle(.plain)` donc sans padding) partagent leur
  rangée avec un `Slider`, un compteur `%`, un `Spacer`, un libellé de temps et
  un menu de vitesse — **six** éléments ;
- les porter à 44 pt coûte **~+71 pt** dans une rangée dont la largeur est bornée
  par celle de la bulle de message : risque réel de troncature ou de débordement
  du libellé de temps et du chip de vitesse ;
- l'issue propre passe probablement par la **suppression du compteur `%`**
  redondant (déjà `.accessibilityHidden(true)`, l'information est portée par le
  `Slider` et le libellé de temps) — c'est un arbitrage de design, pas un
  correctif de surface, et il ne se valide pas sans simulateur.

Noté en suite 224i+ avec ce raisonnement, plutôt que forcé ici à l'aveugle.

## Tests

`apps/ios/MeeshyTests/Unit/Views/FriendRequestListTouchTargetTests.swift` (neuf,
idiome source-introspection du dépôt).

5 tests / 12 assertions :

1. **Retour** — `.frame(width: 44, height: 44, alignment: .leading)` **et**
   `.contentShape` présents dans la fenêtre de 260 caractères qui suit
   `Image(systemName: "chevron.backward")`. **Assertion ancrée** : ces deux
   modificateurs existent ailleurs dans le fichier après ce lot, un `contains`
   global serait vert sans la correction du retour.
2. **Contrepoids d'en-tête** — `Color.clear.frame(width: 44)`, et **absence**
   de `Color.clear.frame(width: 24)` (le miroir doit suivre, pas coexister).
3. **Refuser / Accepter** — la pastille visible reste à 36
   (`frame(width: 36, height: 36)` présent **deux** fois) tandis que la zone
   tactile de 44 et `contentShape(Circle())` apparaissent **deux** fois chacune.
   C'est le cœur du patron : sans le compte de 36, une correction qui aurait
   grossi les pastilles passerait.
4. **`spacing: 0`** sur le `HStack` des deux actions — c'est lui qui préserve
   l'écart visible de 8 pt ; sans lui la rangée s'élargit de 16 pt.
5. **Verrou de couverture** — exactement 3 `frame(width: 44, height: 44` pour
   3 contrôles, et exactement 3 `.accessibilityLabel` : si l'écran gagne une
   commande, le test la signale au lieu de la laisser hors plancher.

**RED prouvé : 10/12 assertions rouges** contre `main` `2450cdb82` (les 2 vertes
sont les comptes de `frame(width: 36…)`, qui existaient déjà — c'est précisément
ce que le correctif doit **préserver**). **GREEN : 12/12.**

## Vérification

- Pas de toolchain Swift (Linux) → assertions vérifiées **déterministement** par
  correspondance de chaînes, RED recalculé sur la source de `main` extraite par
  `git show` (pas sur une supposition) ; équilibre accolades / parenthèses /
  crochets des 2 fichiers au tokenizer (chaînes retirées **avant** les
  commentaires) : **0 / 0 / 0**.
- Gate réel = CI `iOS Tests`. Fichier de test neuf → enregistré par
  `xcodegen generate`, **0 édition de `project.pbxproj`**.
- Nom de classe `FriendRequestListTouchTargetTests` : ne matche aucun token de
  `FINAL_PHASE_CLASS_PATTERN` → phase 1, aucun effet sur l'état de session.
- Collision essaim : 4 PR ouvertes (#2365 android, #2364 gateway, #2363
  `MiniAudioPlayerBar`, #2362 `AffiliateCreateView`) — **aucune** ne touche
  `FriendRequestListView.swift`. Numéro **223i** choisi strictement > 222i
  (le plus haut en vol, #2362).

## Bilan

**1 fichier de production, 6 lignes touchées.** 3 contrôles sous le plancher HIG
portés à 44 × 44 sans changer la taille d'une seule pastille ni l'écart entre
elles. 0 clé i18n, 0 couleur, 0 logique, 0 réseau, 0 `import`.

## Suites (224i+)

1. **`MessageOverlayMenu.videoControls`** — arbitrer la suppression du compteur
   `%` redondant (déjà `accessibilityHidden`) pour libérer la largeur, **puis**
   porter les 3 commandes de transport à 44. Demande un simulateur.
2. Reste de l'inventaire 221i, toujours au cas par cas : `CommentMediaView:33`
   (18), `ConversationListHelpers:375` (34), `MyStoriesView:162`,
   `StoryViewerContainer:175`, `WidgetPreviewView:475`,
   `ConversationListView+Overlays:994/1005`.
3. Envisager un modificateur partagé `.meeshyHitTarget(_ size: CGFloat = 44,
   shape:)` pour que le patron « visuel inchangé + zone étendue » cesse d'être
   recopié à la main. À faire **après** 2–3 applications, pour que
   l'abstraction soit tirée par des cas réels et non devinée.
