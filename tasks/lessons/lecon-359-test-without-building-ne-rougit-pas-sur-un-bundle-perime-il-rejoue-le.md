## Leçon 359 — `test-without-building` ne rougit pas sur un bundle périmé : il rejoue le passé

**2026-08-31.** Deux sessions, deux entrées différentes, la même nuit, le même
piège — c'est pour ça qu'elle est écrite à deux voix.

`xcodebuild build-for-testing` échoue. `xcodebuild test-without-building`
s'exécute quand même, sur le bundle **précédent**, et rend un résumé
parfaitement normal : suites nommées, comptes plausibles, `EXIT=0`.

| entrée | ce qui a cassé le build | ce que le run a rendu |
|---|---|---|
| moi | un `xcodegen` voisin avait retiré du pbxproj la référence à un fichier neuf encore non committé ⇒ `cannot find 'ConversationCatchUpLaw' in scope` | les chiffres de l'état que je venais de NEUTRALISER exprès pour éprouver le rouge — j'ai failli conclure que mon correctif ne marchait pas |
| session voisine | une erreur d'ordre d'arguments | `** TEST BUILD FAILED **` **puis 129 tests verts**, lus dans cet ordre |

> **Un canal de statut qui rend des chiffres plausibles est plus dangereux
> qu'un canal muet.** Ici il ne ment pas sur les tests — il dit la vérité sur
> un PASSÉ qu'on ne lui a pas demandé.

**La parade, et elle doit être un GATE, pas une relecture** :

```bash
xcodebuild build-for-testing … > build.log 2>&1
BUILD_RC=$?
if [ "$BUILD_RC" -eq 0 ]; then
    xcodebuild test-without-building …
else
    echo "BUILD ROUGE — aucun test lancé"; exit 1
fi
```

**Le gate porte sur le CODE DE SORTIE, pas sur un motif du journal** — et cette
précision a coûté un faux ROUGE avant d'être écrite. La première version cherchait
`grep -q "TEST BUILD SUCCEEDED"` ; **avec `-quiet`, xcodebuild n'imprime pas cette
ligne**, et un build parfaitement vert était déclaré rouge. La parade contre un
faux vert avait fabriqué un faux rouge, ce qui est le même défaut retourné : on
juge un fait sur son ÉCHO plutôt que sur lui-même.

Deux pièges de coquille vont avec :

- **ne pas mettre de tube derrière la commande jugée.** `xcodebuild … | grep …`
  fait de `$?` le statut de `grep`, jamais celui du build (`${PIPESTATUS[0]}` le
  rattrape, mais le plus sûr est de rediriger vers un fichier et de filtrer
  ensuite) ;
- **capturer `$?` sur la ligne SUIVANTE**, avant tout autre appel — un `echo`
  intercalé l'écrase.

Deux corollaires qui ne se devinent pas :

- **Le rouge qu'on fait tourner exprès est le moment le plus exposé.** On
  ATTEND des échecs, donc on lit les échecs comme la confirmation attendue.
  C'est exactement là que le bundle périmé passe inaperçu — il rend le rouge
  qu'on espérait, pour la mauvaise raison. Faire tourner le rouge exige donc
  de vérifier le build DEUX fois : à la neutralisation et à la restauration.
- **Un fichier neuf non committé est une bombe à retardement dans un arbre
  partagé** : n'importe quel `xcodegen generate` d'un voisin le fait entrer au
  pbxproj, et n'importe quelle restauration de ce pbxproj l'en fait sortir. Le
  committer tôt coûte moins cher que de diagnostiquer sa disparition.

Même famille que [[reference_status_channel_lies_about_the_fact]] : le canal
de statut ment sur le fait — ici en disant vrai sur autre chose.
