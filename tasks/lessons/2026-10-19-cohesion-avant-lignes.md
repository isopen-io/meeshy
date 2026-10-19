## 2026-10-19 — La cohésion prime sur le nombre de lignes : extraire de vrais types, pas des fichiers (#10988)

**La correction du porteur.** Un chantier faisait passer tous les fichiers Swift sous
1 000 lignes. Retour : « c'est la cohésion — extraire de vrais types — il faut appliquer la
bonne pratique ». Couper `Type.swift` en `Type+X.swift` satisfait le compteur de lignes et
ne change rien : c'est le même type, avec les mêmes fonctions de 400 lignes et le même état
partagé, dispersé sur plus de fichiers. Le budget de lignes mesurait un symptôme.

**La règle pour moi.** Avant de découper, nommer la responsabilité que le nouveau type
porte. Si je ne sais pas la dire en une phrase, je déplace des lignes, je n'extrais rien. Un
type se mesure en UNITÉ (déclaration + extensions du module, <= 1 500), une fonction tient
sur un écran (<= 80), l'état privé reste `private`. Le cliquet
`apps/ios/scripts/check_cohesion_budget.sh` tient la règle ; le budget par fichier n'est
plus qu'un indicateur secondaire.

**Deux pièges de compilation, rencontrés sans compilateur Swift.**
1. *Type imbriqué nommé sans son propriétaire.* Une fois la méthode extraite dans un type
   frère, `Etat` (imbriqué dans `Proprietaire`) ne se résout plus : il faut
   `Proprietaire.Etat`. Après toute extraction, relire chaque nom imbriqué cité dans le code déplacé.
2. *Méthode redéfinie par une sous-classe de test.* Une méthode déplacée dans une
   `extension` ne peut plus être surchargée (`override`) : une déclaration d'extension n'est
   pas dispatchée dynamiquement. Chercher `override` dans les doubles de test avant de déplacer.

**Une garde négative qui lit UN fichier verdit en silence après un découpage.**
`AppSourceGuard.splitUnits` : une garde qui prouve l'absence d'un motif dans `X.swift`
passe quand le motif part dans `X+Y.swift`. Une garde négative doit lire l'unité entière
(tous les fichiers du type), et un témoin positif doit prouver qu'elle trouve le motif là où
il vit désormais.

### Les lecteurs d'un fichier Swift ne sont pas tous en Swift (CI de la PR #11031)

Avant de déplacer du code hors d'un fichier Swift, chercher qui le LIT par chemin
dans TOUT le dépôt, pas seulement dans `MeeshyTests` et `MeeshySDKTests` : des
gates web (`apps/web/scripts/lib/curve-story-reader.mjs` lisait le cadrage du
lecteur de story dans `StoryViewerView+Canvas.swift`), des témoins du gateway
(`CallEventsHandler-cross-platform-event-contract.test.ts` relevait les
événements d'appel dans `MessageSocketManager.swift`) et des cliquets de dépôt
(`scripts/check-accent-color-hardcoding.mjs`, dont la regex comptait
`HexColor(hex:` comme une couleur posée). Commande :

    git ls-files '*.mjs' '*.js' '*.ts' '*.py' '*.sh' | xargs grep -l "<Fichier>.swift"

et, pour chaque hit qui LIT (readFileSync, open), lancer le script.
