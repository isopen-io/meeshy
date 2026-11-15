## Leçon 296 — Une suite CIBLÉE ne couvre pas le garde du code qu'elle change ; c'est la suite COMPLÈTE qui l'attrape (2026-08-27, régression E2 du crux de langue)

**Le fait.** E2 (#3887) devait « distinguer la langue du média de celle du texte ».
J'ai changé le crux `PublishIntent.document`
(`originalLanguage: transcription?.language ?? originalLanguage`
→ `originalLanguage: originalLanguage`) et vérifié en lançant `PublishIntentTests`
(vert) — la suite du fichier que je venais d'éditer. Mais le crux avait un garde
DÉDIÉ dans un AUTRE fichier, `ComposerDocumentToolChainTests.test_leCrux_laLangueParleeGagneSurLaCapsule_memeSurLaTroisiemeFabrique`,
dont le doc-comment nommait EXACTEMENT ma mutation comme la régression 7.4b :
un vocal PUR (`content == nil`) doit garder la langue PARLÉE. La suite ciblée l'a
laissé passer ; c'est la suite COMPLÈTE (8657 tests, avant merge) qui a rougi.

**La correction.** Le crux bascule sur la présence de TEXTE :
`content == nil ? (transcription?.language ?? originalLanguage) : originalLanguage`.
Vocal/média PUR → la langue parlée EST celle du contenu et gagne (7.4b intact) ;
texte + média → le texte garde la langue déclarée, le média la sienne sur
`mobileTranscription` (E2). Les deux vérités tiennent.

**La règle.** Un garde qui protège une règle ne vit PAS forcément dans le fichier
de la règle ni dans la suite qui porte son nom. Avant de changer une ligne
« crux » (surtout une signalée par un commentaire emphatique), chercher son garde
dans TOUT l'arbre de test (`grep` sur le nom de la fonction / la valeur), pas
seulement la suite du fichier édité. Et pour un MERGE sur main, faire tourner la
suite COMPLÈTE, jamais seulement les suites ciblées — c'est le seul filet qui
attrape le garde qu'on ne savait pas chercher. Corollaire de la leçon 275/288 :
« qu'est-ce qui garde CETTE ligne, et ailleurs que sous mes yeux ? »

Sites : `apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift`
(`document(...)`), `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentToolChainTests.swift`
(le garde 7.4b), `apps/ios/MeeshyTests/Unit/Services/PublishIntentTests.swift`
(le test E2). Commits `76d2a0987e` (régression) → `f3a5fbd267` (correctif).

---
