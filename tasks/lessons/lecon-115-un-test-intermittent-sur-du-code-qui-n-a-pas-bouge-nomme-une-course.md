## Leçon 115 — un test intermittent sur du code qui n'a pas bougé nomme une course, et la course est en général dans la production (2026-08-12, routine messaging, cycle 81)

`StoryUploadQueueTests.test_uploadSucceeds_dequeuesItsWriteAheadIntent` était rouge sur `dev` avec
deux runs verts antérieurs sur le MÊME code (fichier inchangé depuis `0737b063`). Le réflexe
« stabiliser le test » (attendre la queue plutôt que l'UI) aurait éteint le signal et laissé le
défaut.

1. **Intermittent + source figée ⇒ ordonnancement, pas régression.** Le seul travail utile est de
   trouver les deux choses que rien n'ordonne. Ici : le retrait de l'intent write-ahead
   (`Task.detached`) et la déclaration de succès à l'UI (`activeUploads`, toast, slot), sur le
   chemin de succès de `StoryViewModel.launchUploadTask`.
2. **Un `Task.detached` qui retire un garde de durabilité APRÈS que l'action gardée a réussi est un
   défaut de correction, pas une optimisation.** Le commentaire du site disait déjà ce que l'intent
   protège (« sinon le boot suivant re-publierait ») : le détacher ouvre une fenêtre où l'app meurt
   avec l'intent en base et la story déjà en ligne — le drain de boot la republie.
3. **Chercher le chemin jumeau avant de conclure au choix délibéré.** Le drain hors-ligne
   (`executeQueuedPublish`) awaitait ce même retrait depuis toujours : l'incohérence interne au
   fichier prouve la dette. Deux gestes opposés sur la même invariante, c'est l'un des deux qui a
   tort.
4. **Détacher ce qui doit l'être, awaiter ce qui doit l'être — dans le même correctif.** L'acteur
   (retrait de l'intent) s'awaite : c'est un saut d'acteur, et il ORDONNE. L'IO synchrone
   `nonisolated` (suppression du dossier médias) reste détachée : aucun boot n'en dépend une fois
   l'intent parti. Tout awaiter aurait mis du `FileManager` sur le MainActor ; tout détacher était le
   défaut d'origine.
