## 2026-07-22 — Essaim iOS : ne pas dupliquer une surface chaude ; tests source-introspection sous Linux

Deux PR de la branche `claude/laughing-thompson-qtvf62` auto-fermées sans merge par
l'automation de l'essaim : #2178 (staleness/conflit) et #2263 (**doublon rouge**). #2263
attaquait la durée VoiceOver des capsules audio de `CallView.swift` — mais **la même
correction avait déjà atterri sur `main`** via une autre PR de l'essaim (doctrine `.ignore`
verrouillée 206i/210i/211i, tests `test_audioDurationCapsules_collapseToIgnoreForNakedReadoutFix`
déjà présents). Mon test `test_audioCallLayout_durationReadout_isOpaqueElement_notCombine`
divergeait de l'état déjà mergé → 1 test rouge (4117 pass / 1 fail) → PR fermée.

**Règles :**
1. **Avant d'attaquer une surface, la re-vérifier contre `main` courant** — le dépôt est
   très mouvant (essaim parallèle). Un audit vieux de quelques heures est périmé : dans
   cette itération, 3 des 4 candidats icône-seule étaient déjà soldés sur `main`.
2. **Éviter les fichiers chauds** (`CallView.swift` : ≈40 tests, itéré en boucle par
   l'essaim). Préférer un fichier froid, un diff minuscule, un pattern déjà prouvé par un
   sibling. Collision = perte sèche (PR auto-fermée).
3. **Sans toolchain Xcode/Swift sous Linux, je ne peux PAS exécuter les tests iOS.** Pour
   qu'un test neuf soit fiable, utiliser l'idiome **source-introspection** du repo
   (`CallViewAccessibilityTests` : lecture du `.swift`, `source.contains(...)` scopé par
   fenêtre autour d'une ancre **unique**) — je peux alors le vérifier à 100 % au grep
   (Python mimant `vicinity()`) avant de pousser. Un test qui introspecte l'arbre
   d'accessibilité runtime est invérifiable côté agent → risque de rouge comme #2263.
4. Ancre de fenêtre = chaîne **unique** dans le fichier ; si la clé cherchée apparaît
   plusieurs fois (`common.close` ×2), ancrer sur un titre/identifiant unique proche et
   chercher vers l'avant avec un span mesuré (vérifié : distance réelle 743 → span 900).
