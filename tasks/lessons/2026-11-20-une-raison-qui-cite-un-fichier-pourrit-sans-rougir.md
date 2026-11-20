## Une raison qui cite un fichier pourrit sans rougir — et une raison morte protège moins qu'une raison absente

**#20045, 2026-11-20.** `routes/messages-writes.ts` justifiait une garde de
confidentialité ainsi : « cet événement pousse la position jouée à TOUTE la room,
et le web les persiste en cache (`use-socket-cache-sync.ts`) … sans qu'aucune
porte de lecture ne puisse le rattraper : le cache du destinataire le tient
déjà. »

`use-socket-cache-sync.ts` **n'existe plus dans le dépôt** — aucun fichier de ce
nom, seules des mentions dans `apps/web/src/lib/api/socket.ts` et son témoin. Et
le web n'enregistre rien de cet événement : il INVALIDE une clé de requête.

La garde, elle, est restée JUSTE — pour une raison plus simple que celle écrite :
le flux direct est le seul qui ne repasse pas par `_attachmentReadReceiptOptOuts`,
que la lecture REST applique. Rien n'a jamais rougi, parce qu'une garde correcte
avec une raison morte se comporte exactement comme une garde correcte.

### Pourquoi c'est pire qu'un commentaire absent

Sans raison, qui relit MESURE. Avec une raison périmée, qui relit CONCLUT — et ici
la conclusion naturelle était « le cache a disparu, donc la garde ne sert plus » :
le commentaire armait son propre retrait. C'est la même forme que le § « Ce que la
libération ne rend PAS, et c'est assumé » de #19971, qui déclarait indécidable un
état qui se mesurait en comptant quatre écrivains : **un commentaire qui affirme
décourage la mesure qui le contredirait.**

### La règle

Quand une raison repose sur un FAIT VÉRIFIABLE — un fichier qui existe, un site
qui émet, un `staleTime`, une colonne persistée — ne pas la laisser vivre
uniquement en prose. La poser dans une table que le typage rend TOTALE et qu'un
témoin relit :

- `UNQUEUED_FAMILY_VERDICT` (`socketio/unqueuedFamilyVerdict.ts`) déclare, pour
  chaque famille temps réel hors file, son verdict, le site qui l'émet et sa
  raison ; son `satisfies Record<UnqueuedFamily, …>` porte sur un ensemble
  **calculé** (les familles émises moins celles que `DRAINED_EVENT` rejoue), donc
  une famille neuve ne compile pas sans réponse ;
- `unqueued-family-verdict-sweep.test.ts` garde ce que le typage ne voit pas : le
  site cité EXISTE, et il ÉMET bien la famille qu'il justifie.

La mutation qui prouve ce témoin est l'incident lui-même : remplacer un
`emittedAt` par `hooks/use-socket-cache-sync.ts` le fait rougir. **Un défaut qu'on
vient de corriger est le meilleur rouge d'un cliquet** — et s'il n'en fait rougir
aucun, le cliquet ne garde pas ce qu'on croit.

### À quoi la reconnaître ailleurs
Chercher les commentaires qui citent un chemin, un nom de fichier ou un symbole
pour JUSTIFIER une garde. Le chemin peut avoir disparu, le symbole avoir changé de
rôle ; le gate, lui, n'en saura rien. Dans ce dépôt, où les doc-comments portent
l'essentiel de la doctrine, la prose EST l'interface — et une interface sans
témoin dérive.
