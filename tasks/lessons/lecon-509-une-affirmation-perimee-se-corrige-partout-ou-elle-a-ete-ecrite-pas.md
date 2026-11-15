## Leçon 509 — Une affirmation périmée se corrige partout où elle a été ÉCRITE, pas là où on la relit

**Contexte (2026-09-04, #5041).** `MediaEditTool` refusait de servir RECADRER et
COUPER, avec sa raison en doc-comment : « absent du contrat (#5085) — aucun champ
du modèle ne les porte ». Un pair a signalé que le commit `a0f2a86aa9`, du matin
même, avait posé `MediaCropRect`, `StoryMediaObject.crop`, le round-trip
`CanvasV3Migration` et `StoryMediaLayer.applyCrop`. **L'affirmation était fausse
depuis quelques heures, et rien dans le fichier ne pouvait le dire.**

J'ai corrigé la ligne, en table, avec le SHA qui l'avait périmée. Le pair est
revenu : **la même phrase vivait dans le fichier d'à côté**, à deux mots près —
`ComposerObjectEditorView+Media.swift`, qui portait « ⌗ RECADRER et ✂ COUPER
manquent au CONTRAT : aucun champ du modèle ne les porte ».

### Les deux erreurs, et la seconde est la plus instructive

1. **Croire un doc-comment qui justifie un refus.** Il se relit comme une raison
   de ne pas toucher au code, alors qu'il n'est que le compte rendu d'un monde
   qui peut avoir changé. Un refus documenté est **daté**, et sa date n'est
   écrite nulle part.

2. **Croire avoir fini après avoir corrigé LA ligne.** C'est le sentiment de
   complétude qui laisse la jumelle en place : on a cherché « la phrase fausse »
   dans le fichier qu'on avait sous les yeux, jamais « les sites qui portent
   cette affirmation ».

> **La question n'est pas « ai-je corrigé la ligne ? » mais « combien de sites
> portent cette phrase ? »** — et elle se répond par un `grep` sur
> l'AFFIRMATION, pas sur le fichier :
>
> ```
> grep -rn "absent du contrat|manquent au CONTRAT|aucun champ du modèle" apps/ios packages/MeeshySDK
> ```
>
> Deux sites. C'est la forme documentaire de la leçon 501 bis (« un site unique
> n'est unique que dans son fichier ») : ce qui vaut pour une règle vaut pour la
> phrase qui la justifie.

### Ce qui a été fait, et pourquoi la citation reste

L'affirmation périmée n'est pas EFFACÉE : elle est citée entre guillemets et
datée. Effacer une justification fausse laisse le prochain lecteur sans moyen de
savoir qu'elle a existé — et il la réécrira, avec la même bonne foi. La table à
jour vit désormais à **un seul endroit** (`MediaEditTool`) ; le second fichier y
renvoie au lieu de la recopier, sans quoi le défaut d'aujourd'hui serait
reprogrammé pour demain.

### Le corollaire, valable au-delà des commentaires

Le verdict n'a pas changé — ni recadrage ni scission ne sont servis. **Seule la
RAISON a changé**, et c'est elle qu'un relecteur consulte avant de décider s'il
peut lever le refus. Un commentaire qui garde le bon verdict pour un motif mort
est plus dangereux qu'un commentaire absent : il fait échouer la prochaine
tentative de le lever, en donnant une raison qu'on ne peut plus vérifier.
---

---
