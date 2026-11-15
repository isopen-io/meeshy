## Leçon 399 — Un lot qui change la POPULATION d'une liste doit relire ce qui la LIT

**Contexte.** Faire descendre le fond remplacé en son de contenu (leçon 396) a
rendu possible, pour la première fois, qu'une carte de contenu soit MUETTE : un
son de fond n'a pas de transcription. Or `documentTranscription` — écrite trois
semaines plus tôt, dans un autre lot, non touchée par celui-ci — servait
`documentTranscriptions[foregroundSounds.last.url]`. La dernière carte étant
désormais le son rétrogradé, elle rendait `nil` et **effaçait en silence la
transcription qu'un son précédent portait**.

**La leçon.** Le défaut ne vit pas dans les lignes que le correctif touche : il
vit dans celles qui LISENT ce que le correctif change. Une relecture du diff ne
peut pas le voir — par construction, la ligne fautive n'y figure pas. Après tout
changement de la population d'une collection (ce qui peut y entrer, dans quel
ordre, avec quelles propriétés absentes), **énumérer ses lecteurs et demander à
chacun : cette hypothèse tient-elle encore ?** Ici l'hypothèse était « la
dernière carte a une transcription », vraie tant que les cartes ne venaient que
d'un enregistrement.

C'est la forme de la leçon 275 (« une protection se mesure sur tout ce que la
charge TRANSPORTE ») appliquée non à une charge mais à un INVARIANT partagé.
