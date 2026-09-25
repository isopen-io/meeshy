## Leçon 493 — Un correcteur mort en vol laisse un arbre MIXTE, et six formes que la revue avait bien vues

**Contexte (2026-09-03, #4938 — revue finale du chantier « conversation sans
latence »).** Le workflow de revue adverse a rendu cinquante constats ; l'agent
correcteur en a traité vingt-quatre puis est tombé sur une limite de session,
laissant vingt-six fichiers modifiés et non commités — passerelle, SDK, app,
tests — sans journal de ce qui était fini. Rien ne rougissait : `git status`
ne distingue pas un hunk terminé d'un hunk interrompu.

### Relire chaque hunk avant de lui faire confiance — et ce que la relecture a rendu

Sans toolchain Swift, la compile est un RAISONNEMENT, hunk par hunk. La
relecture a validé l'essentiel et attrapé ce qu'un `git add -A` aurait
embarqué :

- une `struct` imbriquée dans une classe `@MainActor`, construite depuis une
  `Task.detached` — elle hérite de l'isolation de son hôte (SE-0466) et il lui
  faut `nonisolated` explicite, comme `MessageListSnapshotPrep.Fingerprint` ;
- six lignes ajoutées à `ConversationSocketHandler.swift`, un fichier HORS
  BUDGET — le cliquet de taille l'aurait refusé en CI ; l'édition est redevenue
  neutre en lignes ;
- deux blocs de doc-comment identiques collés l'un sous l'autre dans un test.

> **Un agent qui meurt ne rend pas un état, il rend un arbre.** La question
> n'est pas « qu'a-t-il fait ? » mais « qu'a-t-il laissé à MOITIÉ ? » — et
> elle se répond hunk par hunk, jamais au `--stat`.

### Six défauts, six formes à retenir

1. **Une garde négative ne doit pas être un SOUS-MOT de ce que sa garde
   positive exige.** `XCTAssertFalse(code.contains("ReplyReference("))` deux
   lignes sous `XCTAssertTrue(code.contains("optimisticReplyReference("))` :
   la seconde chaîne contient la première, la garde interdisait ce qu'elle
   prescrivait. Ancrer sur ce qui DISTINGUE (`= ReplyReference(`,
   l'affectation qui signe une composition manuelle).
2. **Une transition servie sans fin anime des pas qui ne sont pas les siens.**
   La dernière annonce du clavier restait servie « jusqu'à la suivante » —
   avec un doc-comment qui en avouait le coût : chaque croissance du composeur
   clavier baissé traînait de 0,25 s sur la courbe UIKit. Un TEMPO expire avec
   le mouvement qu'il décrit (`KeyboardTransition.isLive`) ; une HAUTEUR, non.
   Un coût « dit à voix haute » dans un commentaire n'est pas payé pour
   autant.
3. **Deux prismes gravent deux citations.** Le chemin REST descendait
   `ConversationLanguagePreferences.resolved`, le chemin socket
   `preferredContentLanguages` (repli « fr », jamais `Locale.current`) : le
   même message cité se gravait sous deux textes selon le chemin qui l'avait
   ingéré, et chaque ouverture rejouait un changement de ligne — et un
   reconfigure — pour un contenu identique. La règle TS (« la descente est UNE
   fonction », `resolvePrismTranslation()`) vaut en Swift : `ReaderPrism`.
4. **Le budget de l'ENVOI n'est pas le plafond du MOTEUR.** Attendre la
   reconnaissance « jusqu'au délai du transcripteur » (8 s, séquentiel par
   vocal) retenait le FICHIER : bulle « en cours d'envoi », destinataire sans
   rien — l'envoi était devenu PLUS lent qu'avant le lot censé le rendre
   instantané. Deux constantes, deux questions : à partir de quand la
   reconnaissance est-elle perdue ? combien de temps un tap a-t-il le droit
   d'attendre ? (`sendWaitBudget`, 700 ms.)
5. **Un `guard isAuthorized` sans demande est un interrupteur que personne ne
   peut allumer.** « Jamais de demande d'autorisation », écrit comme une
   vertu, rendait la transcription automatique INERTE pour tout utilisateur
   n'ayant jamais accordé Speech ailleurs. Une feature « automatique » qui
   dépend d'une permission doit la DEMANDER — au moment le moins intrusif
   (après le geste, dans la tâche de fond, sans retenir l'envoi), une fois.
6. **Une lecture du MainActor depuis une boucle d'écriture sérielle fait
   dépendre la persistance du rendu qu'elle est censée décharger.** Le prisme
   voyage DANS l'opération, résolu par le producteur, déjà sur le MainActor.

### Le cliquet se REMESURE, et le nombre se DIT

62 304 → 62 306 : la branche avait fait baisser la dette de 21 lignes pendant
que dev en posait 23 dans trois hôtes qu'elle ne touche pas. Remesuré sur
l'arbre fusionné, jamais soustrait — et le commentaire nomme les trois
fichiers, pour qu'un plafond qui monte de deux se lise comme une dette de dev,
pas de ce lot.
