# Plan — Iteration 69i (2026-06-30) — iOS

## Objectif
Épuration de code mort : retirer le cluster `ReplyThreadOverlay` (vue jamais instanciée,
ancienne implémentation remplacée par `ThreadView`) + `ReplyThreadLoader` (service à
consommateur unique mort) + son test, sans toucher au chemin vivant (`ThreadView` /
`ThreadRepliesLoader`).

## Pré-vérification (faite)
- `ReplyThreadOverlay` instancié nulle part (`grep "ReplyThreadOverlay("` → 0 hors def).
- `ReplyThreadLoader` consommé uniquement par `ReplyThreadOverlay:98`.
- `ThreadView` (vivant, sheet `ConversationView:581`) utilise `ThreadRepliesLoader` (endpoint
  distinct `messages?replyToId=…`) → indépendant.
- `ThreadData` (modèle public SDK) reste — suppression d'API SDK publique hors-scope.

## Étapes
1. **Suppression** (`git rm`) :
   - `apps/ios/Meeshy/Features/Main/Views/ReplyThreadOverlay.swift`
   - `apps/ios/Meeshy/Features/Main/Services/ReplyThreadLoader.swift`
   - `apps/ios/MeeshyTests/Unit/Services/ReplyThreadLoaderTests.swift`
2. **Commentaires pendants** :
   - `ThreadView.swift:247` — retirer la référence au symbole supprimé.
   - `ThreadRepliesLoader.swift` (docstring) — rendre autonome (retirer « Sibling of
     `ReplyThreadLoader` »).
3. **Vérif anti-référence pendante** : `grep` repo-wide → seules restent les entrées du
   `project.pbxproj` (artefact généré, **non édité** — CI régénère via XcodeGen) et les logs
   `tasks/todo*.md` (historiques, non compilés).

## Vérification
- **Gate = CI `ios-tests.yml`** : `xcodegen generate` (exclut les fichiers supprimés) →
  `build-for-testing` (compile app + tests sans les symboles morts) → `test-without-building`
  sur simu 18.2. Build vert = preuve qu'aucun symbole pendant ne subsiste.
- Pas de build local (SwiftUI absent sous Linux). Pas de nouveau test (suppression pure ;
  le test retiré couvrait un service mort).

## Risques / mitigations
- **Perte du client `/threads/:parentId`** : capacité déjà absente de l'app en cours
  (vue morte) ; le modèle SDK `ThreadData` + le endpoint gateway restent intacts →
  ré-câblage trivial si jamais nécessaire. Documenté en différé.
- **pbxproj périmé localement** : `meeshy.sh` build le pbxproj committé (potentiellement
  périmé) — sans incidence CI (régénération). Conforme à la doctrine XcodeGen.

## Suivi routine
- Branche : `claude/upbeat-euler-g7wb0a` (repartie de `origin/main` propre).
- MAJ `docs/plans/uiux/branch-tracking.md` (entrée 69i).
- Après CI verte : merge dans `main`, puis suppression de la branche.
