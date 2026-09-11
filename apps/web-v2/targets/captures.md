> Captures de RÉFÉRENCE de la v3.1 (issue #5672, D-20) — prises le 2026-09-08 sur l'app iOS NATIVE (build 1800, version 1.0.7) au simulateur « Meeshy Poc-Web-V31 » (iPhone 16 Pro, iOS 26.1), DRAPEAUX BÊTA ACTIVÉS (preuve : `settings.beta.*.png`). Les PNG de ce dossier sont réduits à 388 × 844 (l'échelle logique de l'appareil) ; les originaux à 3× vivent hors dépôt (`.cache/web-v2-workflow/cibles-on/`, non versionné). Chaque `*.png` a son `*.a11y.txt` : l'arbre d'accessibilité complet pris au même instant (`idb ui describe-all`).

# Écrans CIBLES de l'app iOS Meeshy — drapeaux bêta **ACTIVÉS**

**Ce que ce dossier est.** La cible de la v3.1 web, telle que la directive porteur du 2026-09-08 la
définit : « la vue Lentille, les messages Focal, Script et Bulle, avec les dernières features activées »,
étendue le jour même à **Résumé et Rivière**, qui entrent au périmètre au même rang que les trois autres.

- **Simulateur** : « Meeshy Poc-Web-V31 », `54438823-4ADC-4536-88D2-FC441395FA04`, iPhone 16 Pro, iOS 26.1.
- **App** : NATIVE (`Meeshy.app`, `CFBundleVersion 1800`, version affichée **1.0.7**), construite ce matin
  à 08:11 — vérifié : `simctl listapps` rend un `Bundle` qui finit par `/Meeshy.app`, jamais `/App.app`.
- **Compte** : `cible-web-trois` (A) sur **staging**, session déjà ouverte, conservée.
- **Données** : voir `seed.md` (7 conversations + « Salon Rivière » à 5 membres et 40 messages).
- **Langue de l'app** : française (le compte a `systemLanguage: fr`). Les captures drapeaux ÉTEINTS de
  `.cache/web-v2-workflow/cibles/` sont en ANGLAIS — c'est un écart de session, pas un effet des drapeaux ;
  ne pas le lire comme une différence ON/OFF.

---

## 1. La procédure d'activation qui a MARCHÉ

```bash
U=54438823-4ADC-4536-88D2-FC441395FA04
xcrun simctl terminate $U me.meeshy.app
xcrun simctl spawn $U defaults write me.meeshy.app meeshy.pref.beta_features_enabled -bool true
xcrun simctl launch $U me.meeshy.app
```

`defaults write` **a pris du premier coup**, sans passer par l'UI. La preuve n'est pas la relecture par
`defaults read` (qui pourrait relire ce qu'elle vient d'écrire ailleurs) mais le plist du **conteneur de
l'app** :

```
.../Devices/54438823-…/data/Containers/Data/Application/00F85D20-…/Library/Preferences/me.meeshy.app.plist
  "meeshy.pref.beta_features_enabled" => true
```

**Pourquoi un seul interrupteur suffit** (lu dans `LentilleFeatureFlag.swift` + `BetaFeaturesPreference.swift`) :
la cascade est `environnement > clé PROPRE du drapeau > programme bêta`. Aucune des trois clés propres
(`meeshy.flag.lentille_list`, `…reading_modes`, `…riviere_mode`) n'existe sur cette installation, donc les
trois retombent sur le programme, qui vaut désormais `true`.

**Preuve à l'écran** — `settings.beta.light.png` / `settings.beta.dark.png` : section **BÊTA**, toggle
« Activer les bêta » **ON**, et les trois fonctionnalités listées **actives** (pastille verte ✓ et
`AXValue: "Activé"` dans l'arbre d'accessibilité) : **Liste Lentille**, **Modes de lecture**, **Mode Rivière**.

---

## 2. Les captures

Chaque `*.png` a son `*.a11y.txt` frère : l'arbre d'accessibilité complet (`idb ui describe-all`, JSON),
pris au même instant. `idb` est installé (`/opt/homebrew/bin/idb`) ; aucun script du skill `ios-simulator`
n'a été nécessaire.

### 2.1 La Lentille (liste de conversations)

| fichier | ce qui est à l'écran, de haut en bas | geste |
|---|---|---|
| `lentille.{light,dark}.png` | barre d'état · titre **« Meeshy Chats »** + boutons *Créer un lien de partage* / *Nouvelle conversation* · **`StoriesVivantsRail`** (avatar « CW » avec `+` *Ajouter une story*, pastille *Changer mon mood*, libellé « Cible… ») et, à droite, la bulle de menu **CW** avec son badge de notifications · rangée de filtres (`Tous / Non lus / Personnel / Privée / Ouvertes / Global…`) · **sticker de section `ÉPINGLES`** avec son chevron de repli · **`LentilleConversationRow`** « 📌 Voyage Lisbonne » + **`LentilleBridgeLine`** « Bruno Bêta : Hôtel à Alfama… » + badge **2** + « 9 min » · **sticker `AUJOURD'HUI`** · les rangées du jour, dont **« Veille Tech 🔕 »** rendue ATTÉNUÉE (titre, pont et badge tous en gris) · barre de recherche flottante en bas | à l'ouverture, liste au repos |
| `lentille.scrolled.{light,dark}.png` | fin de course : les stickers `ÉPINGLES` puis `AUJOURD'HUI` **épinglés en haut**, les rangées supérieures RÉDUITES et estompées (**`LentillePerspective`**), et **une seule rangée ÉLUE** (`LentilleFocusElection` + `LentilleMagnification`) — ici *Meeshy Global* — qui déploie : un **`LentilleSticker` « 🗂 Classer »**, le titre, le pont, une **encoche de mode `AUTO · Focal`** (le `Menu` de `LentilleModeMenu`), le badge « 🌐 199+ », et l'horodatage ABSOLU « Aujourd'hui à 08:44 » là où les autres rangées n'ont qu'un « 9 min » relatif · sous la liste, le bloc d'amorce « Et maintenant ? » | balayage vers le haut jusqu'en bas |
| `lentille.section-pill.{light,dark}.png` | frame prise **PENDANT** un balayage lent : les DEUX stickers de section empilés en haut, et la transition d'élection saisie à mi-course — la rangée sortante et la rangée entrante portent chacune un fantôme de leur état déployé | balayage de 2 s, capture à t≈1,1 s |

> **`SectionScrollPill` n'a PAS été observée.** La capsule flottante de `SectionScrollPill.swift`
> (ancrée `top 64`, `allowsHitTesting(false)`, effacée `ScrollTimePillLaw.lingerMs` après l'arrêt) n'apparaît
> sur aucune frame, y compris celles prises en plein geste. Ce qui porte l'identité de section à l'écran est
> le **`LentilleSticker` épinglé** (les bandeaux `ÉPINGLES` / `AUJOURD'HUI`), pas une pilule séparée. Les
> fichiers `lentille.section-pill.*` sont donc, honnêtement, des captures **de mi-défilement**, pas des
> captures de pilule. À vérifier sur une liste plus longue avant d'en conclure quoi que ce soit sur le code.

> **`lentille.stories-rail.*` n'a pas été créé** : le rail n'est pas une surface distincte — c'est la bande
> d'en-tête de `ConversationListView`, entièrement visible en haut de `lentille.{light,dark}.png`. Un fichier
> de plus aurait été un doublon.

> **`lentille.mode-menu.*` — NON CAPTURÉ, et c'est une observation, pas un renoncement.** L'encoche
> `AUTO · Focal` de la rangée élue est un `Menu` SwiftUI (`LentilleMagnification.swift:302`, `.menuStyle(.button)`,
> `.buttonStyle(.plain)`, `contentShape(Capsule)`). **Cinq tentatives** — tap court et appui long de 1 s, aux
> coordonnées exactes de la capsule recalculées à chaque essai depuis la position fraîche de la rangée
> (pt ≈ `(118…125, centre_rangée + 28)`) — ont **toutes ouvert la CONVERSATION** au lieu du menu : le geste
> du bouton de rangée l'emporte. L'arbre d'accessibilité le corrobore : la rangée élue est publiée comme un
> **`PopUpButton` unique couvrant toute la rangée** (`x=9 y=180 w=378 h=82`), avec le libellé de la
> conversation — l'encoche n'a pas d'élément propre. Soit le menu est inatteignable au doigt, soit `idb` ne
> sait pas le viser ; les deux méritent vérification manuelle. Le MÊME catalogue de modes est en revanche
> capturé depuis le fil, dans `reading-mode-sheet.*`.

### 2.2 Le fil — les cinq modes de lecture

Le fil de référence est **Équipe Produit** (4 messages, groupe de 2) pour Focal/Script/Bulles, et
**Salon Rivière** (40 messages, 5 membres) pour Résumé/Rivière/scène/heures.

| fichier | ce qui est à l'écran | geste |
|---|---|---|
| `thread.focal.{light,dark}.png` | en-tête flottant : bouton *Retour* portant la **pastille de non-lus (6)** · loupe · **`ReadingModeChip` « AUTO Focal »** · avatar de conversation « ÉP » teinté par l'`accentColor` · corps : **`FocalConversationStartRow`** (filigrane du groupe), pilule de jour « Aujourd'hui », puis des groupes **`FocalIdentityHeader`** (avatar + « Toi » en violet / « Bruno Bêta » en gras) suivis de **`FocalRow`** en TEXTE COURANT — aucune bulle, aucune alternance gauche/droite · affordance de réaction (☺) sous le dernier message · barre de composition | tap sur la rangée |
| `thread.script.{light,dark}.png` | identique en structure, chip devenu **« Script » SANS le préfixe AUTO** (choix manuel ⇒ `decision.reason == .sticky`). **Sur ce corpus, le rendu est visuellement indiscernable de Focal** : les 4 messages tiennent dans un écran, donc rien n'est ni magnifié ni aplati. La différence Focal↔Script se joue au défilement (voir `thread.focal.scene.*`) — la capture est honnête, mais elle ne DÉMONTRE pas l'écart | appui long sur le chip → « Script » |
| `thread.bubbles.{light,dark}.png` | le rendu historique : mes messages à DROITE en **bulle violette pleine**, ceux de l'autre à GAUCHE en bulle lavande, chacune avec son **`BubbleFooter`** (icône de traduction 🈯, heure `08:45`, doubles coches ✓✓ sur les miens) ; le DERNIER d'un groupe porte l'identité en pied (avatar + « Bruno Bêta » + `@cible-web-b49874`) | appui long sur le chip → « Bulles » |
| `thread.summary.{light,dark}.png` | **Résumé Vivant** : titre « Résumé Vivant », sous-titre « **40 messages · 2 personnes** », section « **Ce qui s'est passé** » avec une carte « Aujourd'hui · 40 messages » (chevron), et un bouton pleine largeur « **Reprendre le fil** » en bas. **Les deux captures ne sont PAS le même état** : en SOMBRE le chip dit « **AUTO Résumé** » et une ligne de plus s'affiche — « **Sur les 40 derniers messages** », la portée que l'orchestrateur annonce ; en CLAIR le chip dit « **Résumé** » seul (choix manuel, `reason == .sticky`) et **cette ligne disparaît** | **dark : AUTO** — l'orchestrateur l'a élu seul à la première ouverture (> 25 non-lus), exactement la décision que la consigne demandait de noter. **light : sélection manuelle** dans la feuille des modes, le fil ayant été lu entre-temps |
| `thread.river.{light,dark}.png` | **Rivière** : chip « Rivière » · **rail de couloir à gauche** (`RiverLaneHeaderStrip`) portant « ● TOI » · le flux en cartes, chacune précédée de son en-tête d'auteur (avatar + nom **coloré par couloir** : Bruno Bêta en BLEU, Cible Web Trois en ROUGE) et bordée en L de la couleur de son couloir · heure en pied de carte · à droite, l'élément `Axe du temps` (`RiverTimeHandle`, invisible au repos) | appui long sur le chip → « Rivière » |
| `river.scrolled.{light,dark}.png` | la Rivière après défilement : le contenu passe SOUS l'en-tête flottant, et le libellé du rail change de couloir (« TOI » → « **BRUNO BÊTA** ») | balayages |
| `river.time-handle.{light,dark}.png` | la **poignée du temps** RENDUE : piste verticale au bord droit + poignée arrondie à trois barres (≡) posée en bas de piste. Son `AXValue` est l'heure de la position lue (`09:02`) | capture à t≈0,9 s d'un balayage de 1,5 s (elle s'efface au repos) |
| `reading-mode-sheet.{light,dark}.png` | le catalogue `ReadingModeLensCatalog` en menu contextuel natif : **Focal ✓** (coché, grisé = courant) · Script · Bulles · Résumé · **Rivière** · séparateur · **✨ Automatique**. Sur *Équipe Produit* (2 membres), **Rivière est GRISÉE** — `activeParticipantCount (= memberCount) < 5` | **appui long** sur le `ReadingModeChip` |
| `thread.chip.{light,dark}.png` | cadrage où le chip et l'en-tête sont lisibles, après retour à **Automatique** : le chip reprend son préfixe **AUTO**. Son `help` d'accessibilité dit le contrat des deux gestes : « *Passe au mode suivant. Appui long pour la liste des modes.* » | menu → « Automatique » |
| `thread.direct.focal.{light,dark}.png` | la conversation DIRECTE A↔B en Focal : en-tête avec un **bouton d'appel** (📞) que les groupes n'ont pas, filigrane à DEUX silhouettes, et des rangées plates sans identité de groupe — « Toi » / « Bruno Bêta » seulement | tap sur la rangée « Bruno Bêta » |

### 2.3 Le fil — la scène, le révélé, le menu de message

| fichier | ce qui est à l'écran | geste |
|---|---|---|
| `thread.focal.scene.{light,dark}.png` | **la SCÈNE Focal ARMÉE** : le fond ENTIER prend une teinte (bleu nuit en sombre, bleu pâle en clair) au lieu du fond neutre · **une rangée est ÉLUE** et posée sur une **carte teintée à coins arrondis** · son **chip d'identité est AGRANDI** (avatar + « Toi » sortis de la colonne de texte, sur leur propre pastille) · une **affordance de réaction** (☺) à gauche de la carte · un **tampon daté** à droite : « **Aujourd'hui 09:02 ✓** » (date COMPLÈTE, là où les rangées ordinaires n'ont rien) · en en-tête, une **pilule de jour flottante « Aujourd'hui »** apparaît à gauche de la loupe · un bouton chevron ⌄ pour revenir en bas | **8 balayages enchaînés** de 0,12 s dans *Salon Rivière* (40 messages) ; capture ~1 s après le dernier, dans la fenêtre de 4,5 s |
| `thread.focal.timestamps.{light,dark}.png` | **le révélé des heures et des coches** (`FocalTimestampRevealState`, fenêtre `ScrollTimePillLaw.lingerMs = 900 ms`) : **CHAQUE** rangée affiche son heure `09:02` en fin de ligne, et les miennes leur coche ✓ — informations totalement absentes au repos. La comparaison directe avec `thread.focal.scene.*`, prise **1 s plus tard sur le même écran**, montre la fenêtre se refermer : il ne reste que le tampon de la rangée élue | capture ~0,2 s après le dernier balayage |
| `thread.message-menu.{light,dark}.png` | le menu contextuel d'un message : fond FLOUTÉ · **rail de réactions** (😂 ❤️ 👍 😮 😢 🔥 🎉 + `＋`) · le message SOULEVÉ avec son pied d'identité (avatar, « Bruno Bêta », 🈯, `09:02`, `@cible-web-b49874`) · puis la liste d'actions : **Sélectionner · Traduire · Copier · Composer · Plus…** | appui long de 1,3 s sur une rangée de message |

---

## 3. Ce qui DIFFÈRE des captures drapeaux ÉTEINTS

Référence lue : `.cache/web-v2-workflow/cibles/conversations.light.png` et `…/thread.message.light.png`.

### La liste — `conversations.light.png` (OFF) → `lentille.light.png` (ON)

| | drapeaux ÉTEINTS | drapeaux ACTIVÉS |
|---|---|---|
| sections | **aucune** — une liste plate | **stickers de section épinglés** : `ÉPINGLES` (avec chevron de repli), `AUJOURD'HUI` — `LentilleSectionResolver` |
| rangée | **carte lavande arrondie** posée sur le fond | **rangée à plat**, séparée par le rythme des sections — `LentilleConversationRow` |
| contenu de rangée | titre + badge « 🌐 199+ » + « 1 min », **et rien d'autre** | titre + **`LentilleBridgeLine`** (« Bruno Bêta : Hôtel à Alfama… », ou l'agrégat « Bruno Bêta · 2 messages ») + badge de non-lus + horodatage sur sa propre ligne |
| épinglage | invisible | **📌 dans le titre** + section propre en tête de liste |
| sourdine | invisible | **🔕 dans le titre** + rangée ENTIÈRE atténuée (titre, pont ET badge) |
| défilement | translation simple | **perspective** : réduction/estompage des rangées hautes, **élection** d'une rangée qui déploie sticker « Classer », **encoche `AUTO · Focal`**, badge de membres et **date absolue** |
| accessibilité | « Conversation avec Meeshy Global » | « Conversation avec Voyage Lisbonne, dernier message : …, 2 messages non lus, **épinglée** » / « …, **en silence** » |

### Le fil — `thread.message.light.png` (OFF) → `thread.focal.light.png` (ON)

| | drapeaux ÉTEINTS | drapeaux ACTIVÉS |
|---|---|---|
| en-tête | retour · loupe · avatar. **Aucun chip de mode** — conforme au code : `readingModeAffordanceCluster` rend `EmptyView` quand les capacités ne contiennent que `.bubbles` | retour **+ pastille de non-lus** · loupe · **`ReadingModeChip` « AUTO Focal »** · avatar |
| rendu du message | **bulle à queue**, texte en gras centré | **texte courant** groupé sous un `FocalIdentityHeader`, sans bulle ni queue |
| modes disponibles | un seul, implicite (`.bubbles`) | **cinq** — Focal, Script, Bulles, Résumé, Rivière — plus « Automatique », au tap (cycle) ou à l'appui long (menu) |
| défilement | rien de particulier | **scène armée** (carte teintée, chip agrandi, tampon daté) et **révélé des heures/coches**, tous deux inexistants OFF |
| heures | inscrites en dur sur la rangée | **masquées au repos**, révélées au geste |

---

## 4. Ce que je n'ai PAS pu capturer, et pourquoi

1. **`lentille.mode-menu.*`** — le `Menu` de l'encoche `AUTO · Focal` d'une rangée élue ne s'est pas ouvert :
   cinq tentatives (tap et appui long, coordonnées recalculées à chaque fois), toutes ont ouvert la
   conversation. Détail et coordonnées au § 2.1. Le catalogue équivalent est capturé depuis le fil
   (`reading-mode-sheet.*`).
2. **`lentille.section-pill.*` ne montre pas de pilule** — `SectionScrollPill` n'a été vue sur aucune frame ;
   les fichiers portent une capture de mi-défilement. Voir l'encadré du § 2.1.
3. **`lentille.stories-rail.*`** — délibérément non créé : le rail n'est pas une surface distincte, il est
   intégralement dans `lentille.{light,dark}.png`.
4. **La Rivière ne s'est pas déplacée LATÉRALEMENT.** Deux séries de balayages horizontaux (`330→90` puis
   `360→40`, 0,4–0,5 s) n'ont produit aucun décalage de couloir : ce qui a changé, c'est la position
   VERTICALE et, avec elle, le libellé du rail (`TOI` → `BRUNO BÊTA`). Avec deux locuteurs seulement, les
   couloirs semblent empilés, pas juxtaposés. `river.scrolled.*` est donc « la Rivière défilée », sans
   affirmer que le défilement était horizontal.
5. **L'écart Focal ↔ Script n'est pas démontré par `thread.script.*`** — voir § 2.2. Il faudrait le capturer
   sur *Salon Rivière* (40 messages), en armant la scène dans les deux modes.
6. **`riv4` n'a jamais été créé** — `RATE_LIMIT_EXCEEDED` sur `/auth/register` à la 4e inscription d'affilée.
   Sans conséquence : 5 membres suffisent au seuil de la Rivière.

## 5. Deux défauts d'affichage relevés en passant

Ni l'un ni l'autre n'était l'objet de la mission ; ils sont notés parce qu'ils sont visibles sur les cibles
que la v3.1 doit reproduire.

- **Le titre « Résumé Vivant » passe SOUS l'en-tête flottant** (`thread.summary.{light,dark}.png` : le mot
  « Résumé » est coupé par la pilule de retour). Le contenu du Résumé démarre trop haut.
- **La barre de composition recouvre la fin du fil** en mode Focal (`thread.focal.scene.*` : « Bruno Bêta /
  Script aplatit tout, sans magnification. » s'affiche PAR-DESSUS le champ « Message… »). Visible en clair
  comme en sombre.
