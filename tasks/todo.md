# Refonte de la liste des conversations (peau Lentille) — 2026-08-22

Branche : `feat/conversation-list-revamp` · worktree `../v2_meeshy-liste-conv`

## Décisions produit actées

| Sujet | Décision |
|---|---|
| Périmètre | Peau **Lentille** uniquement (`LentilleConversationRow`, `StoriesVivantsRail`, `LentilleFocusCard`). Exception : la remise à zéro des non-lus se vérifie dans **toutes** les versions de la vue. |
| Catégorie | Sur la **carte de focus magnifiée**, coin haut-gauche, tapable → sous-menu « Déplacer vers… » déjà écrit. Assume le revirement du 2026-08-22. |
| Effectif | **En bas à droite du cadre** de la rangée. Lecteur autorisé (admin de groupe OU plateforme ADMIN/BIGBOSS/**MODERATOR**) → entier **sans plafond**. Sinon plafond **199** → « 199+ ». Décision serveur. |
| Date | **Dans la bulle** d'aperçu, en bas à droite (comme l'heure d'une bulle de message). |
| Synchro | Icône ⟳ **retirée** de la rangée, renvoi automatique conservé. La **pastille rouge de non-lus** prend sa place. |
| Non-lus | Remise à zéro **dès l'ouverture**, en réutilisant le cache + la base locale existants. Aucun nouveau chemin de données. |

Tranché sans question (conventions du dépôt) : pas d'effectif sur un DM (`type != .direct`) ; preview de story en cercle recadré comme le tray ; anneau vu/non-vu rebranché ; mood et point de présence restent exclusifs (`MeeshyAvatar`).

## Lots

### Lot 1 — Droit de voir l'effectif exact (serveur)
- [ ] RED `packages/shared/__tests__/member-visibility.test.ts` : MODERATOR et admin de groupe voient l'entier ; membre simple plafonné à 199 → « 199+ »
- [ ] `packages/shared/utils/member-visibility.ts` : le droit combine platformRole (ADMIN|BIGBOSS|MODERATOR) **et** rôle de conversation (creator|admin)
- [ ] 4 sites gateway : `conversations/core.ts:953,1219`, `search.ts:326`, `participants.ts:324`
- [ ] 5 fanouts socket : `participants.ts:1060,1276`, `leave.ts:180`, `ban.ts:136,274`
- [ ] Schémas : le champ traverse `api-schemas.ts` (1204 **et** 1385) — sinon strippé en silence

### Lot 2 — Rangée : bulle, date dedans, effectif, pastille non-lus
- [ ] RED : la date n'est plus sur la ligne de titre ; elle est portée par la bulle, dans les 7 branches d'aperçu
- [ ] RED : `RelativeTimestampText` reste le seul porteur de la date (garde anti-régression)
- [ ] Bulle d'aperçu (fond, rayon, teinte clair/sombre) — cote dans `LentilleMetrics` + miroir `lentille-tokens.json`
- [ ] Effectif en bas à droite du cadre
- [ ] Pastille rouge de non-lus à la place de ⟳ ; retrait de l'icône de synchro
- [ ] `renderFingerprint` replie `memberCount` + `unreadCount` (sinon gel silencieux)

### Lot 3 — Trail de stories : preview + mood animé
- [ ] `LentilleRailEntry` gagne `previewURL`, `moodEmoji`, `hasUnviewed`
- [ ] Mapping dans `lentilleRailEntries` / `lentilleRailSelfEntry` — résolveur **partagé** avec le tray (pas de 3e implémentation)
- [ ] Badge mood animé, gardé reduce-motion

### Lot 4 — Catégorie sur la carte de focus
- [ ] `notchChip` haut-gauche + hit-testing local ré-armé
- [ ] Toucher → sous-menu « Déplacer vers… » existant, call site unique de `moveToSection`
- [ ] Rien affiché si la conversation n'a pas de catégorie
- [ ] `renderFingerprint` replie `sectionId`

### Lot 5 — Remise à zéro des non-lus (toutes versions de la vue)
- [ ] Auditer : Lentille, Themed, carte focal, web
- [ ] Vérifier la remise à zéro à l'ouverture sur chaque chemin (cache + GRDB)

### Lot 6 — Alignements et espacements
- [ ] Rangs 8 pt / squelette 16 pt / header 16 pt → une seule constante
- [ ] Bandes de section pleine largeur (`x=0 w=402`) vs rangs (`x=8 w=386`)
- [ ] Bouton flottant « Flux » posé sur l'avatar d'un rang
- [ ] Barre de recherche flottante qui coupe un rang
- [ ] Trail collée au 1er header (0 pt)
- [ ] Section rendue vide (2 headers empilés)
- [ ] Carte focal qui recouvre la trail
- [ ] Format de date « 1mois » (espace manquant)

## Vérification
`./apps/ios/meeshy.sh test` complet + passe simulateur clair/sombre, DM/groupe, avec/sans non-lus.

## Revue

### Ce qui est livré (branche `feat/conversation-list-revamp`, poussée)

| Lot | État | Preuve |
|---|---|---|
| 1 — droit de voir l'effectif exact (serveur) | livré | jest vert · **réserve A4** ci-dessous |
| 2 — rangée : bulle, date dedans, effectif, pastille | livré | 236 tests iOS, `Row.height` 64→88 |
| 3 — trail : preview + mood animé | livré | SDK vert, `MoodBadge` neuf |
| 4 — catégorie sur la carte de focus | livré | 34/34, `renderFingerprint` replie `sectionId` |
| 5 — audit des non-lus | rendu | I1–I4, W1–W2 documentés |
| 6 — alignements | **3 vrais défauts sur 8** | ci-dessous |

Gate complet du 2026-08-22 : **15 400 tests iOS, 0 échec**, web 490/0, `check-law-literals` vert.
`origin/main` intégré (61 commits, sans conflit), build de validation `exit 0`.

### Lot 6 — le résultat le plus instructif du chantier

**3 défauts réels, corrigés :**
- **D8** — `RelativeTimeFormatter` rendait « 1mois ». « mois » est un MOT entier, pas une
  abréviation comme `s`/`h`/`j`. Android écrivait déjà `%1$d mois`
  (`sdk-ui/values-fr/strings.xml:63`) : **c'est iOS qui divergeait de la référence en
  place**, pas une préférence de goût. Corrigé au `defaultValue` ET au catalogue (fr, it) ;
  diff catalogue de 2 lignes exactement, aucune resérialisation.
- **D1-squelette** — `.padding(.horizontal, 16)` posé sur le CONTENEUR du `LazyVStack`
  s'appliquait aux DEUX branches du mux, alors que le mux ne portait que sur le type de
  rangée. La liste sautait de 8 pt latéralement au démarrage à froid.
- **D2** — les boutons flottants mordaient la Dynamic Island (disque à `y=50`) et
  recouvraient 60 % / 57 % de deux boutons du header. Voir la cause racine ci-dessous.

**6 faux positifs** — et c'est la leçon : *six défauts sur huit venaient de ma méthode de
mesure ou d'une lecture trop rapide.*
- D1-header, D5 : comportements **documentés** (fond pleine largeur du sticker épinglé ;
  section repliée)
- D3 : la barre de recherche se masque d'elle-même au défilement
- D4, D6, D7 : cotes prises sur une liste **en mouvement**

### Pièges mesurés, à ne pas repayer

1. **`simctl install` par-dessus une app existante ne remplace pas le dylib.** Deux
   mesures fausses avant de comprendre : je jugeais une UI antérieure aux lots.
   `simctl uninstall` d'abord, toujours.
2. **`idb` rend le cadre TRANSFORMÉ, pas le cadre de layout.** L'effet de scène met les
   rangées à l'échelle : mesurer pendant un défilement fabrique des chevauchements qui
   n'existent pas. Mesurer AU REPOS, et vérifier qu'on est bien en position 0 (si le
   premier élément a un `y` négatif, la liste est défilée).
3. **Un dialogue système réduit l'arbre d'accessibilité à ~5 éléments.** Ce n'est pas un
   écran vide.
4. **`grep -c` qui compte 0 rend exit 1.** Lu comme « build failed » alors que le build
   disait `BUILD SUCCEEDED`.
5. **`-only-testing` ne matche pas Swift Testing comme XCTest** : « Executed 0 tests » +
   « TEST SUCCEEDED ». Toujours extraire le compte réel.
6. **Un test peut passer en choisissant lui-même l'entrée que l'appelant ne fournit pas.**
   Voir D2 ci-dessous — le cas le plus coûteux du lot.

### D2 — la cause racine, et pourquoi aucun test ne l'a vue

`FreeFloatingButtonsContainer` (`FloatingButtons.swift:124-176`) calcule
`minY = safeArea.top + topSafeZone + halfButton` à partir du `GeometryReader` de son
`body` — que le `.ignoresSafeArea()` de la ligne suivante étend à l'écran entier,
ramenant les insets à **zéro**. La formule est juste ; son ENTRÉE est nulle en production.
Les 50 pt censés protéger le haut étaient donc comptés depuis le bord PHYSIQUE, dont 59
déjà mangés par l'encoche.

`test_screenPoint_topLeft_matchesBoundsMinCorner` ne l'a jamais vu **parce qu'il choisit
lui-même `safeArea.top = 59`**. Il valide la formule sur une entrée que l'appelant ne
fournit pas : vert, pendant que le produit est faux. Le témoin neuf assied la garantie sur
l'entrée RÉELLE (`EdgeInsets()` nul).

Le `50` vivait en **trois copies** devant rester d'accord au point près (`FloatingButtons`,
`RootView.menuLadder`, `RootView.FeedButtonAnchor` — ce dernier se documente comme miroir
EXACT du calcul du conteneur). Elles lisent maintenant `FloatingButtonSafeZone.top`
= `maxTopInset` (62) + `CollapsibleHeaderMetrics.expandedHeight` (64) = **126**, cote
dérivée et non magique.

### Restes assumés

- **D2 résiduel — décision produit en attente.** Flux recouvre désormais les commandes de
  la trail (82-87 %). Dégager la trail (fin `y=199.3`) demanderait `topSafeZone = 173.3`,
  ce qui poserait le disque sur la 1re rangée (228.7-316.7) : **impasse géométrique**. En
  position « coin haut », un bouton flottant recouvre forcément quelque chose. Recommandé :
  passer la position par défaut en bas (idiome FAB), qui libère tout l'en-tête. 2 constantes.
- **`.ignoresSafeArea()` non corrigé.** Faire remonter la vraie safe area demande une
  refonte du conteneur, non validable sans passe visuelle. Symptôme majoré, cause racine
  documentée sur `FloatingButtonSafeZone`.
- **A4 — le correctif serveur est inatteignable en production.** `core.ts:401` et `:454`
  filtrent sur `participants.some.userId`, or `Participant.userId` est **null** pour un
  anonyme : `findMany` ne remonte rien et la boucle ne tourne jamais. Les 2 tests ne
  passent que parce que `mockResolvedValue` **ignore le `where`**. Corriger « pour de
  vrai » demande de brancher `whereClause` sur `isAnonymousViewer`, ce qui change ce que
  la route rend aux anonymes — au-delà du périmètre demandé. **À arbitrer.**
- **`list.row.height` est partagé avec le web** : les rangées web passent à 88 px avec
  leur ancien contenu à 2 bandes. À désolidariser ou à faire suivre.
- **Doublon header épinglé / pilule** : jamais diagnostiqué, en cours de contre-expertise.

### Rectification du 2026-08-23 — la contre-expertise renverse 3 des 6 faux positifs

Un agent adversaire a contesté mes classements. **Le bilan réel est 7 vrais défauts sur 8,
pas 3.** Les 3 faux positifs confirmés le sont pour de MEILLEURES raisons que les miennes.

| | Mon classement | Verdict | État |
|---|---|---|---|
| D4 trail collée | faux positif | **VRAI DÉFAUT** | corrigé, mesuré 8,0 pt |
| D5 section repliée | faux positif | **VRAI DÉFAUT** | corrigé (chevron) |
| D7 chevauchement | faux positif | **VRAI DÉFAUT** | diagnostiqué, arbitrage |
| D1-header, D3, D6 | faux positifs | confirmés | — |
| doublon pilule | jamais diagnostiqué | **VRAI DÉFAUT** | correctif prêt, non appliqué |

**D7 — ma dispense était fausse.** J'avais invoqué « `idb` rend le cadre transformé par
l'échelle ». Or l'échelle ne PEUT PAS mordre un header : `scale = 1 − 0.04f ≤ 1`, ancrée,
donc une rangée qui rétrécit ÉLOIGNE ses bords de ses voisins. Le coupable est
`LentilleFocusBreathing`, une TRANSLATION de ±18 pt posée sur les rangs seuls et jamais sur
les headers. Deux relevés indépendants (9,6/8,9 puis 9,2/9,1 pt) et l'arithmétique boucle :
`18 − 8 − (88 − h)/2 = 9,6` pour `h = 87,3`.

Mon correctif — faire porter la même loi au sticker — a été **rejeté par la mesure** : sur
un élément ÉPINGLÉ, l'`.offset` étend le cadre d'accessibilité de façon durable (h 21,3 →
39,3, encore à 3 s). J'ai failli conclure « aggravation » sur ce chiffre : le même piège que
la contre-expertise venait de me reprocher, en sens inverse. **Critère de validité retenu :
`h` du header == 21,3, sinon la mesure ne vaut rien.**

Les deux issues restantes touchent un réglage PRODUIT — écrêter la respiration à la marge
(18 → 8, effet réduit) ou porter le gap de section à 18 (densité réduite). Non tranché.

**D4 s'est réfuté avec mon propre chiffre** : ma note d'origine mesurait déjà 199,3/199,3
AU REPOS ; l'argument « liste défilée » valait pour D6, pas pour D4. Cause : le rail iOS
n'avait aucun padding vertical là où le jumeau web porte `py-2`. Corrigé par jeton +
2 miroirs ; jonction re-mesurée à **8,0 pt**.

**D5 — le sticker taisait ce qu'il savait.** `LentilleSticker` DÉCLARAIT et STOCKAIT
`isExpanded` sans jamais le lire : paramètre mort, zéro test. Replier une section rendait
deux bandes identiques empilées, indiscernables d'un défaut de rendu. Corrigé par un chevron
conditionné à `onToggle != nil` (`chevron.forward`, qui s'inverse en RTL).

**Rectification documentaire** : le commentaire justifiant la pleine largeur du sticker par
« sinon les rangs réapparaissent dans les gouttières » est FAUX — rien n'entre jamais dans
ces 8 pt. Bonne conclusion, mauvaise preuve ; le vrai motif est la parité avec la peau web.

### Collision de chantier — DEUX implémentations de la même demande

`feat/lentille-row-chrome` (autre session) est déjà sur `main` (`266fcb765`) et recouvre mes
lots 2/3/4 fichier pour fichier. Les deux lisent des directives différentes données à des
moments différents : « la date à l'intérieur de la bulle » (moi) contre « enlever le contour
sur le dernier message » (eux). Captures comparées envoyées au porteur produit ; **ma branche
ne peut pas remonter tant que ce n'est pas tranché**. Ni l'un ni l'autre lot ne re-merge sur
ces fichiers en attendant.

### Non-régression après D2/D8/D1

63 suites, **736 tests exécutés**, aucune à 0 test. Les échecs sont tous PRÉEXISTANTS : le
crash `malloc 0x262c5a6f0` est daté à 17:13, 1 h 34 avant le premier commit, même adresse,
même test.
