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

Ordre : **les découpes hors budget d'abord si la vue les touche** (#4102–#4105), puis les vues dans
l'ordre `1a…1h`, `2a…2l`, `3a…3h`, `4b`, `4c`, `4f` — le tour `t1` pose les fondations dont les
autres dépendent.

Poser `Status = In Progress` dans le projet org #1 avant d'écrire une ligne.

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
