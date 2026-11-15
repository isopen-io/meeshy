## Leçon 205 — une erreur détectable en 3 secondes qui n'est révélée que par une porte de 15 minutes coûte N × 15 minutes (2026-08-16, PR #3078)

**Le fait.** Trois `if/else` de `ConversationListView.swift` portaient un
`.padding(.top, 60)` chaîné directement. En Swift un `if/else` est une
**instruction**, pas une expression : rien ne se chaîne dessus. La compilation
iOS de `main` est restée rouge pendant des heures, et le diagnostic émis ne
désignait ni la cause ni la bonne ligne —
`instance member 'padding' cannot be used on type 'View'`, à la ligne du
modificateur, pas à celle du bloc.

**Ce qui a vraiment coûté cher.** Pas le défaut : sa **boucle de retour**. Le
seul détecteur était un `xcodebuild` macOS de ~15 min, et le frontend Swift
s'arrête à la PREMIÈRE erreur du module. Trois occurrences dans un même fichier
= trois runs successifs, chacun ne révélant que la suivante. Le coût de la
correction n'était pas proportionnel à la difficulté du correctif (envelopper
dans un `Group`), mais au **produit** du nombre d'erreurs par la latence de la
porte qui les révèle.

**La règle.** *Quand une classe d'échec est (a) détectable statiquement et
(b) révélée uniquement par une porte coûteuse, corriger l'occurrence ne rend
rien. Il faut déplacer la détection en amont ET rendre la porte coûteuse
exhaustive.* Les deux, pas l'un ou l'autre : le garde amont ne couvre que le
motif qu'il connaît, la porte doit rester capable de tout dire du premier coup
sur ce qu'il ignore.

**Les deux gestes.** En amont, `scripts/check-swift-viewbuilder.sh` sur ubuntu
— quelques secondes, toutes les occurrences, avant que le runner macOS ne
démarre. En aval, `OTHER_SWIFT_FLAGS="-Xfrontend -continue-building-after-errors"` :
une ligne qui convertit N runs en un seul, plus une étape de remontée qui
déduplique les diagnostics et les publie en **annotations** ancrées sur
fichier/ligne — server-rendered sur la page du run, donc lisibles sans token
(leçon 265 : un step summary ne l'est pas).

**Corollaire sur l'écriture d'un détecteur.** La première formulation du garde
faisait de l'appariement d'accolades vers l'arrière et cherchait un mot-clé
d'instruction dans la ligne ouvrante. Elle a signalé 13 sites parfaitement
valides : `.onReceive(NotificationCenter.default.publisher(for: X)) { _ in`
contient `for`, mais comme **étiquette d'argument**, pas comme mot-clé. La
tentation est d'ajouter une exception (« ignorer `for:` »), puis une deuxième.
*Un détecteur dont les faux positifs appellent une liste d'exceptions qui
s'allonge est presque toujours formulé au mauvais niveau.* Reformulé — « la
ligne ouvrante est la dernière ligne significative à l'indentation de
l'accolade fermante » — les 13 faux positifs disparaissent d'un coup, sans
aucune exception : une fermeture de closure n'ouvre jamais sur un mot-clé.

**Le piège suivant, tombé dans la foulée.** La première version du garde était
verte sur tout le dépôt — et se trompait. Son énumération passait
`apps/ios/**/*.swift` non quoté à `git ls-files` : **bash l'expanse avant git**,
et sans `globstar` son `**` ne traverse pas les `/`. Résultat : 1435 fichiers
sur 2528, et parmi les 1093 manquants, `Features/Main/Views/ConversationListView.swift`
lui-même — le garde était aveugle au bug qui l'avait fait naître, tout en
affichant un ✓. La détection, elle, était juste : testée en lui passant le
fichier en argument, elle sortait les trois occurrences.

*Un garde a deux moitiés — ce qu'il cherche et où il regarde — et seule la
première est habituellement testée.* Une énumération qui rétrécit ne produit
jamais d'erreur : elle produit un succès, ce qui est le pire des deux. Le
self-test assure désormais les DEUX : le cas fautif est pris, ET l'énumération
remonte un volume plausible avec au moins un fichier en arborescence profonde.
Corollaire opératoire : *un garde tout neuf doit être vu ROUGE sur le défaut
réel, dans les conditions réelles* — pas sur une fixture, pas avec le fichier
passé à la main. Ici, remettre la version cassée de `main` en place et voir le
garde sortir en 1 est le seul geste qui distinguait les deux versions.

**Le troisième piège, payé au run suivant.** Le geste « rendre la porte
exhaustive » a été tenté en passant
`OTHER_SWIFT_FLAGS="-Xfrontend -continue-building-after-errors"` sur la ligne
de commande `xcodebuild`. Le build est devenu rouge avec **19 erreurs de
concurrence stricte** dans `MeeshyUI`, sur du code inchangé et vert partout
ailleurs. Cause : *un réglage de build passé en ligne de commande REMPLACE la
valeur, il ne s'y ajoute jamais* — il siège au sommet de la hiérarchie, où
`$(inherited)` n'a rien à hériter. Or **SwiftPM compile les `swiftSettings` de
`Package.swift` en `OTHER_SWIFT_FLAGS`** sur les cibles du package :
l'override a effacé `.enableUpcomingFeature("InferIsolatedConformances")`
(SE-0470) et `.enableUpcomingFeature("NonisolatedNonsendingByDefault")`
(SE-0461), et les diagnostics que ces deux features suppriment sont
mécaniquement remontés.

*Un réglage global n'est jamais gratuit quand une dépendance en dépend
silencieusement.* Le tell est visible sans rien connaître du flag ajouté : les
erreurs sortent **dans un module qu'on n'a pas touché**, et leur libellé nomme
exactement la garantie qu'une feature du langage apportait. Corollaire
d'emplacement : un drapeau Swift destiné au dépôt se pose dans
`apps/ios/project.yml`, qui ne porte QUE les cibles du dépôt — jamais sur
l'invocation `xcodebuild`, qui arrose aussi les paquets SPM.

Et une conclusion sur le geste lui-même : il n'a pas été redéposé ailleurs.
Le garde amont donne la classe visée en 1 s, la compilation par lots
parallèles remonte déjà plusieurs erreurs par run (19 sur celui-là), et ce qui
restait à gagner — l'exhaustivité DANS un fichier — ne valait pas un réglage
global dont je venais de mesurer le rayon d'action. *Quand un geste
d'observabilité vient de casser ce qu'il devait observer, la bonne réponse est
souvent de ne pas le replacer, pas de le replacer mieux.*

**Le signal, disponible avant tout diagnostic.** Un `xcodebuild` qui ne remonte
qu'UNE erreur alors que le diff touche plusieurs branches d'un même `switch`.
*Un compilateur qui n'a qu'une chose à dire sur un changement large n'a pas
fini de parler : il s'est arrêté.*

---
---
---
