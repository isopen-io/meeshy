# La boucle — porter les 31 vues du composer, une itération à la fois

Protocole d'exécution du milestone **#63** « Les 31 vues mobiles du composer sont implémentées ».
Ce fichier est le contrat complet ; le prompt `/loop` s'y réfère au lieu de le répéter à chaque tick.

---

## Les sept lois

**1. PRÉSERVER ET COMPLÉTER, jamais supprimer.** La maquette est une **cible**, pas une liste
d'autorisations. Ce que l'app porte en plus du document **se conserve**. Un élément absent de la
maquette n'est pas un élément à retirer — c'est un élément que la maquette n'a pas dessiné.
Ce qui manque se rajoute ; ce qui dépasse reste. Le décommissionnement de l'ancien est un **lot
séparé**, après matrice complète — jamais dans le commit d'une vue.

**2. En cas d'incohérence, trancher pour l'UTILISATEUR FINAL.** Pas pour la fidélité au document,
pas pour la commodité du code. Si la maquette et l'existant se contredisent, la question est
« qu'est-ce qui sert l'utilisateur ? », et la réponse s'écrit dans l'issue avant d'être codée.

**3. Conformité = disposition, hiérarchie, états, gestes, libellés.** Les polices, couleurs et
rayons passent par le design system Meeshy (`MeeshyColors`, `MeeshyFont`, `accentColor` de
conversation). L'écart typographique avec le document est **assumé**, jamais un défaut à corriger.
Les états comptent autant que la disposition : vide, chargement, erreur, hors-ligne.

**4. Budget 800–1100 lignes par fichier.** Un fichier hors budget se **découpe par responsabilité
AVANT** qu'une vue lui ajoute quoi que ce soit — extraire d'abord, ajouter ensuite. Jamais une
tranche arbitraire au milieu d'un type : une extension par surface, un type par fichier, les
sous-vues chez elles.

**5. La fin se PROUVE.** Une issue se ferme sur une capture du simulateur posée à côté de sa cible
et un gate vert — jamais sur une déclaration.

**6. Toute VIGNETTE montre la DONNÉE en visuel.** Jamais un carré vide, jamais un placeholder gris,
jamais une icône seule. Vignette d'**effet** (filtre, style de texte, fond), de **contenu en
édition**, de **slide** de carrousel, de **média**, de **son** (forme d'onde), de **fond**. Un
`Rectangle` de couleur là où une image est disponible est un **défaut**, pas un choix de design.
Le substitut n'est toléré que pendant le chargement, et il s'efface dès que la donnée arrive.

**7. L'édition des données se fait en TEMPS RÉEL.** Ce que l'utilisateur modifie se voit
**immédiatement** dans la scène, l'aperçu, la vignette et le document — sans validation
intermédiaire, sans attendre la fermeture d'une feuille. Un réglage qui ne prend effet qu'au
« Appliquer » fait choisir à l'aveugle. **Corollaire :** un éditeur temps réel doit porter un
**snapshot** pour que l'annulation restaure vraiment ce qui existait avant.

> **Ce que la loi 7 ne dit PAS.** Elle gouverne l'**effet**, pas le bouton. Les captures cibles
> portent des `OK` (`1c`), `APPLIQUER` (`2l`), `ENREGISTRER` (`3c`) — et ce ne sont pas des
> infractions : ces boutons **ferment une surface**, ils ne déclenchent rien. Le test qui tranche est
> unique : **le changement se voit-il AVANT qu'on appuie ?** Si oui, le bouton est une sortie, il est
> légitime. Si non, c'est une validation différée, et elle tombe. Un bouton nommé « Appliquer » qui
> n'applique rien — parce que tout est déjà appliqué — est bien nommé pour l'utilisateur : il dit
> « c'est bon, je garde ».

---

## La navigation — les 31 vues sont un GRAPHE

Les vues ne sont pas 31 écrans isolés. Chaque issue de vue déclare, **avant d'être codée** :
**d'où l'on vient** (la vue précédente et le geste qui amène ici) et **où l'on va** (les vues
atteignables et leur geste). Une vue livrée dont l'entrée ou la sortie n'est pas câblée n'est pas
livrée : elle est inatteignable, ou sans issue. L'enchaînement se vérifie au simulateur en suivant
le **chemin complet** depuis le fil, jamais en ouvrant la vue par un raccourci de code.

---

## Le cycle

### 1 — Choisir l'issue

```bash
gh issue list --repo isopen-io/meeshy --milestone "Les 31 vues mobiles du composer sont implémentées" \
  --state open --limit 40 --json number,title -q '.[] | "#\(.number) \(.title)"'
```

L'ordre suit le **graphe de navigation**, jamais l'alphabet : une vue se code après celle qui y
mène. Six tours, précédés des découpes.

| Tour | Ce qu'il pose | Vues | Issues |
|---|---|---|---|
| **t0** | Les découpes hors budget (loi 4) — préalable à toute addition | — | #4102 #4103 #4104 #4105 |
| **t1** | **Le tronc** — sans lui rien n'est atteignable | `1a` → `1b` → `1c` → `1f` | #4071 #4062 #4064 · #4072 #4061 #4070 #4065 · #4073 #4063 · #4076 |
| **t2** | Les branches d'édition, toutes ouvertes depuis `1c` | `1d` `1e` `1g` `2d` `2e` `3b` `3c` | #4074 #4075 #4077 #4082 #4083 #4092 #4093 |
| **t3** | Les autres entrées vers le tronc | `3a` `2a` `2b` `2c` `4b` `4c` | #4091 #4079 #4080 #4081 #4099 #4100 |
| **t4** | Ce qui décide de l'envoi | `2l` `2k` `3d` `4f` | #4090 #4089 #4094 #4101 |
| **t5** | La lecture — ce que la publication devient | `1h` `2h` `2f` `2g` `3e` `3f` `3h` | #4078 #4086 #4084 #4085 #4095 #4096 #4098 |
| **t6** | Continuité et ruptures | `2i` `2j` `3g` | #4087 #4088 #4097 |

Poser `Status = In Progress` dans le projet org #1 avant d'écrire une ligne.

**Les 23 issues rouvertes le 2026-08-28** portent chacune une promesse faite sous l'ancien standard,
à re-vérifier sur la capture de sa vue. Elles se traitent **avec** la vue, jamais séparément.

| Vue | Issues rouvertes à re-vérifier sur cette capture |
|---|---|
| `1a` | #4047 #3883 #4031 #4032 #3882 #3904 #4034 #4030 #4029 #3884 #3547 #4053 #4057 #3546 #3544 |
| `1b` | #3939 #3885 #4035 #4038 #4031 #4032 #4047 #4052 #4053 |
| `1c` | #4035 #3888 #4038 #3939 |
| `1f` | #4057 #4034 #3548 #4053 #4112 |
| `1g` | #4047 #3883 #4038 #4053 |
| `2a` `2k` `3a` `4f` | #4030 #4029 #3884 #3547 #4053 |
| `2b` `4c` | #3546 |
| `2c` | #4052 #3880 |
| `2d` `2e` `2l` `3c` | #3880 |
| `2i` | #3544 |
| `3b` | #3904 #4034 #3548 |

**Trente-trois issues composer restent OUVERTES ailleurs** et portent chacune une part qu'une vue
doit ABSORBER — sans quoi la vue livre une surface sans sa chaîne. Elles ne changent pas de milestone :
la vue les cite, les absorbe, puis elles se ferment.

| Vue | Issues dont la part remonte ici |
|---|---|
| `1a` #4071 | #3998 (re-scoper la garde « absent vs grisé ») |
| `1b` #4072 | #4036 (amorces galerie / dernière capture, loi 9) · #3557 (9:16 borné au NEUF) |
| `1c` #4073 | #3990 (2 glyphes d'inspecteur) · #3557 |
| `1e` #4075 | #3561 (projection des **7** kinds, dont `mention`) |
| `1f` #4076 | #3995 (le lieu survit aux chemins inline) · #3992 (états in-flight et échec) · #3905 (communauté + découvrable à proximité) |
| `1g` #4077 | #4055 (chaîne d'écriture de `caption`) · #3994 (`order` écrit à l'index) |
| `1h` #4078 | #3980 (crédit par la FORME) · #3567 (recadré : carte de RÉEL et repost embarqué seuls) |
| `2a` #4079 | #3565 (share extension — le plan écrit) |
| `2b` #4080 | #3776 (moitié PROFIL de la garde) · #4037 (geste d'appui long, hors cadrage) |
| `2c` #4081 | #3979 (boucle sur la timeline du DOCUMENT) · #3980 |
| `2d` #4082 | #3970 (vocabulaire de geste transverse) · #3969 (vidéo) · #3968 (image) · #3967 (audio) |
| `2e` #4083 | #3952 (animations de texte) · #3993 (5 gardes négatives) |
| `2f` #4084 | #3566 (delta d'API `MeeshyScenePlayer(.reader)`) |
| `2i` #4087 | #3966 (position d'aperçu) · #3988 (toast « Brouillon enregistré — Jeter ») |
| `2k` #4089 | #3998 |
| `2l` #4090 | #3977 (repost borné, VERROUILLÉ avec sa raison) · #3976 (six niveaux, effectif, liste modifiable) |
| `3a` #4091 | #3783 (câblage des sites de présentation) · #3987 (dernier format présélectionné) |
| `3b` #4092 | #3958 (collage 2·3·4) · #3956 (GIF animé) · #3955 (détourage) · #3953 (sticker interactif) · #3788 (presse-papier) |
| `3c` #4093 | #3980 |
| `3d` #4094 | #3568 (charge amputée) · #3564 (son emprunté enfilé) · #3556 (exclusion mutuelle prouvée) · #3562 (N envois) |
| `3e` #4095 | #3891 (actions derrière `…` et `↑`) |
| `3f` #4096 | #4055 · #3994 · #3979 |
| `3g` #4097 | #3986 (vues après expiration) · #3985 (supprimer) · #3982 (section Publiées) · #3981 (l'Étagère devient Publiées + Archive) |

**Quatorze vues ne sont couvertes par AUCUNE issue fermée** — elles partent de zéro, sans dette ni
promesse antérieure : `1d` `1e` `1h` `2d` `2e` `2f` `2g` `2h` `2j` `3c` `3e` `3g` `3h` `4b`.

**⚠️ La géographie de la scène a été ARBITRÉE le 2026-08-28.** Les six issues héritées (#4061 à
#4065, #4070) venaient de la planche rév. 27 et décrivaient **deux rails latéraux encastrant la
scène** — une disposition qu'**aucune capture ne montre**. Vérifié : `1b` porte **un seul** rail,
**flottant sur le bord DROIT** de la scène, à quatre actions (✎ ☺ ♫ #), et garde sa **rangée d'outils
basse permanente** ; `1c` et `3b` sont **plein écran, bord à bord, sans aucun rail**, l'inspecteur y
étant une **rangée horizontale de jetons** portant des valeurs lisibles (`TAILLE 38`, `0:00 → 0:06`).
Le document gagne — deux places pour deux rôles (le rail agit SUR la scène, la rangée fait ENTRER la
matière), la largeur est vitale en édition, et le pouce est en bas. Détail et ce qui survit du lot :
commentaire du 2026-08-28 sur #4061.

Trois arbitrages produit sont **posés** et gouvernent plusieurs vues (loi 2) :
- **Un profil impossible est GRISÉ AVEC SA RAISON, jamais absent** (#4030) — `1a` `2a` `2k` `3a` `4f`.
- **Une note vocale n'est JAMAIS un fond audio** ; l'intention se déclare par la porte empruntée,
  pas par la nature du fichier (#4052) — `1b` `2c` `2f` `2g` `2h` `3e`.
- **La géographie suit le document, pas la planche** (#4061) — `1a` `1b` `1c` `3b`.

### 2 — Lire la cible

La vue `<id>` a sa capture dans `cible/<id>.png` et sa doctrine dans `vues.md`. **Regarder l'image**,
pas seulement le texte : la disposition ne se lit pas dans une légende.

### 3 — Lancer l'app sur le bon simulateur

```bash
MEESHY_DEVICE_ID=C295B364-8CA6-4214-BC52-E411A97EBFE2 ./apps/ios/meeshy.sh run
```

`Meeshy-iOS26` = `C295B364-8CA6-4214-BC52-E411A97EBFE2`. **Sans `MEESHY_DEVICE_ID`, `meeshy.sh`
part sur le premier appareil nommé « iPhone … » et la mesure ne vaut pas pour son runtime.**
Build complet ≈ 113 s, incrémental ≈ 20 s.

Connexion (session persistante, à refaire seulement après un `erase`) :

```bash
set -a; . apps/ios/fastlane/.env; set +a
S=~/.claude/skills/ios-simulator/scripts
U=C295B364-8CA6-4214-BC52-E411A97EBFE2
python3 $S/navigator.py --udid $U --find-type TextField --enter-text "$DEMO_USER"
python3 $S/navigator.py --udid $U --find-text "Password" --enter-text "$DEMO_PASSWORD"
python3 $S/navigator.py --udid $U --find-text "Log in" --tap
# l'alerte système « Save Password? » est INVISIBLE à l'arbre : la fermer par coordonnées
idb ui tap --udid $U 201 545
```

### 4 — Atteindre la vue et capturer

```bash
idb ui describe-all --udid $U | python3 -c "
import sys,json
for o in json.load(sys.stdin):
    l=o.get('AXLabel') or o.get('AXValue'); f=o.get('frame') or {}
    if l: print(f\"{str(o.get('type'))[:10]:11} {str(l)[:38]:40} ({int(f.get('x',0))},{int(f.get('y',0))})\")"
python3 $S/navigator.py --udid $U --find-text "<libellé>" --tap
xcrun simctl io $U screenshot /tmp/reel-<id>.png
```

Le composer du fil s'ouvre par le bouton **« Share something »** de l'onglet Feed.

### 5 — Comparer

```bash
ffmpeg -y -loglevel error -i docs/product/MeeshyComposerDesign/cible/<id>.png -i /tmp/reel-<id>.png \
  -filter_complex "[0:v]scale=-1:1100,pad=iw+16:ih:0:0:0x1A1731[a];[1:v]scale=-1:1100[b];[a][b]hstack=inputs=2" \
  /tmp/compare-<id>.png
```

Lire le montage et **écrire l'écart élément par élément** dans l'issue, en nommant ce qui manque,
ce qui diffère et ce qui dépasse. Rappel de la loi 1 : « dépasse » ≠ « à retirer ».

### 6 — Implémenter

Réutiliser ou factoriser l'existant du composer (36 fichiers sous `Features/Main/Composer`) plutôt
que réécrire. Si le fichier visé dépasse 1 100 lignes, **le découper d'abord** (loi 4).
TDD quand le comportement est testable ; le gate iOS est non négociable.

### 7 — Vérifier

```bash
MEESHY_DEVICE_ID=C295B364-8CA6-4214-BC52-E411A97EBFE2 ./apps/ios/meeshy.sh run
xcrun simctl io $U screenshot /tmp/reel-<id>-apres.png
```

Refaire le montage. **Le screenshot fait foi — jamais l'arbre d'accessibilité**, qui peut décrire
une vue montée mais non affichée (mesuré le 2026-08-28 : l'arbre annonçait le composer pendant que
l'écran montrait le fil).

### 8 — Livrer

Commit par chemins explicites (`git commit -- <chemins>`), l'arbre porte souvent le travail d'une
autre session. Message en français, sujet = le résultat obtenu, corps = ce qui était faux et
pourquoi le correctif tient. `Closes #<n>`. Puis commentaire de clôture avec le montage, le gate
et les dimensions restantes — chaque dimension non mûre devient une issue.

---

## Pièges mesurés

| Piège | Symptôme | Parade |
|---|---|---|
| `detect_simulator` ignore les simulateurs du projet | mesure sur `iPhone 16 Pro` au lieu de `Meeshy-iOS26` | `MEESHY_DEVICE_ID=` |
| Arbre d'accessibilité d'une vue non affichée | l'arbre dit « composer », l'écran montre le fil | le screenshot fait foi |
| Alerte système invisible à l'arbre | `screen_mapper` rend « 1 element, 0 interactive » | capturer, taper par points (px ÷ 3) |
| `meeshy.sh screenshot <path>` | `Unknown flag` | `xcrun simctl io $U screenshot <path>` |
| ids de planches commençant par un chiffre | `'#1a' is not a valid selector` | `[id="1a"]` |
| Playwright sans navigateur installé | `Executable doesn't exist` | Chrome installé, via `capture-cibles.js` |
| `git commit` emporte tout l'index | le WIP d'une autre session part avec | `git commit -- <chemins>` |

## Ce qui ferme une issue

1. Le montage cible ↔ réel, joint en commentaire.
2. `./apps/ios/meeshy.sh build` vert.
3. Aucun fichier touché au-dessus de 1 100 lignes.
4. Les dimensions non mûres ouvertes en issues, jamais laissées implicites.
5. **Chaque vignette de la vue montre la vraie donnée** (loi 6) — vérifié sur la capture, pas sur le code.
6. **Chaque réglage de la vue s'y voit en direct** (loi 7) — la modification et son annulation, toutes deux filmées ou capturées.
7. **L'entrée et la sortie de la vue sont câblées** — le chemin complet depuis le fil a été parcouru au simulateur.
8. **La revue est conduite par Opus** et conclut sur les sept lois, une par une.
