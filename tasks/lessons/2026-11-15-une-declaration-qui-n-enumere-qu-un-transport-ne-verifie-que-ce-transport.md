## Une déclaration qui n'énumère qu'un TRANSPORT ne vérifie que ce transport

*2026-11-15, cycle 165 — #17025 / #18623, constat de l'audit adversarial d'avant-fusion.*

**Le fait.** Le lot cherchait les événements socket porteurs de TEXTE qui
n'appliquent pas le plancher d'historique. Il ne l'a pas deviné : le dépôt
DÉCLARE l'ensemble, dans `TEXT_BEARING_TABLE` (`queuedEventContract.ts`), et le
défaut s'est trouvé par une soustraction — cinq familles déclarées, quatre
inscrites chez la loi. La cinquième était `attachment-updated`. Vérifiable,
mécanique, et c'est ce que le journal du cycle a présenté comme sa méthode.

La soustraction était juste. **Et elle ne pouvait pas voir deux canaux qui
portent le même texte, à sept lignes du site corrigé** :
`transcription:ready` et `audio-translation:*`, tous deux en
`io.to(roomName).emit(...)` nu dans la même fonction, le second avec l'URL de la
piste TTS.

La raison est structurelle, pas une inattention : **`TEXT_BEARING_TABLE`
énumère les familles de la FILE.** Ces deux événements ne sont jamais enfilés.
Ils ne figurent donc dans aucune table — et une soustraction ne rend que ce que
ses deux ensembles contiennent.

**Pourquoi c'est pire qu'une énumération incomplète.** Une liste écrite à la
main se sait faillible ; on la relit. Une liste DÉCLARÉE dans le dépôt, gardée
par un `Record` exhaustif au compilateur, se lit comme une source de vérité — et
elle en est une, pour sa question. La question qu'elle répond est « que faut-il
sceller avant Redis ? », pas « par où ce texte peut-il sortir ? ». Les deux se
ressemblent assez pour qu'on substitue l'une à l'autre sans le remarquer.

**La règle.** La leçon 261 dit qu'une énumération de sites porte DEUX
affirmations : « ces sites appliquent la règle » (vérifiable) et « ce sont les
sites où la règle s'applique » (presque jamais vérifiée). Il y en a une
TROISIÈME, et elle est muette : **« ce transport est le seul par lequel la
donnée sort ».**

Devant une table qui sert d'énumération, demander ce qu'elle énumère
RÉELLEMENT — une famille de contenu, ou une famille de *canal*. Si c'est un
canal, la question « ai-je tous les sites ? » n'a pas été posée.

**La forme outillée.** La donnée, pas la table : partir du CHAMP qui porte le
secret (`transcription`, `translations`) et chercher tous ses lecteurs, plutôt
que de partir d'une liste d'événements.

```
grep -rn "transcription\b" services/gateway/src/socketio --include=*.ts | grep -E "emit|payload"
```

**Le corollaire, qui est la leçon 275 d'un cran au-dessus.** Le lot a bien posé
la question de la leçon 275 — « qu'est-ce qui part À CÔTÉ de ce que je viens de
garder ? » — et l'a posée au bon endroit pour sa charge : il a vérifié le
`payload`, le `dedupKey`, les `participants`, l'`atRest`. Il l'a posée **à
l'intérieur de son émission**.

> La question ne s'arrête pas à la charge : **« qu'est-ce qui part à côté de mon
> ÉMISSION ? »** — c'est-à-dire, dans la fonction qui m'appelle, avant moi et
> après moi. Ici la réponse était à sept lignes au-dessus, dans le même `try`.
