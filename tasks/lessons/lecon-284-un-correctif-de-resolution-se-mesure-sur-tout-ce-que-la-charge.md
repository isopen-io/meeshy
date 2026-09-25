## Leçon 284 — un correctif de résolution se mesure sur tout ce que la charge TRANSPORTE, pas sur sa seule chaîne (2026-08-24, cycle 128)

La leçon 275 disait cela d'une garde de CONFIDENTIALITÉ. Elle vaut identiquement
d'un correctif de RÉSOLUTION, et le cycle 123 en est l'exemplaire : il a donné à
la transcription d'un vocal sa propre source de Prisme, si bien que le TEXTE de
la bannière descend le prisme du lecteur depuis lors. Douze lignes plus bas, dans
le même objet littéral, le FICHIER attaché est resté `first?.fileUrl` —
l'original, sans condition, identique pour tous les lecteurs.

Un francophone recevant un vocal anglais voyait donc une bannière **en français**
au-dessus d'un `UNNotificationAttachment` qui **parle anglais**. Les trois clients
descendent pourtant déjà le Prisme sur la piste JOUÉE en conversation
(`AudioTrackLanguageResolver`, `resolveAutoLanguage`, `resolveTranslatedAudio`) :
l'écran verrouillé était la SEULE surface de la famille AUDIO qui ne le faisait
pas.

> **La question à poser à un correctif de Prisme n'est pas seulement « sert-il le
> bon texte ? » mais « qu'est-ce qui part À CÔTÉ du texte qu'il vient de
> corriger ? »** — et elle se répond en lisant l'objet remis LIGNE À LIGNE. Le
> niveau d'abstraction du correctif rend l'objet voisin invisible : il ne compose
> aucune chaîne, donc il n'apparaît dans aucune recherche de « qui traduit ce
> texte ? ».

Trois corollaires, tous mesurés dans ce lot.

### Le dépouillement partiel d'une source est ce qui laisse le médium derrière

`transcriptTranslationTexts()` est un site UNIQUE, correctement pensé, et il ne
prend de la carte de traductions que le TEXTE. La MÊME entrée porte l'`url`, le
`durationMs` et le `format` de la piste TTS — sur une colonne que le `select` de
l'éventail demande DEPUIS le cycle 123. La garde était donc GRATUITE, comme au
cycle 127 : deux champs de plus sur une lecture qui se faisait déjà.

**Un site unique de dépouillement ne garantit pas qu'on dépouille TOUT.** Il
garantit qu'on dépouille pareil. Quand on en écrit un, la question est : *que
contient encore l'enveloppe que je viens de jeter ?*

Et les deux jumelles ne rendent PAS le même jeu de langues, ce qui est le
point : une traduction TEXTE peut exister sans que le TTS ait produit sa piste.

### Élire DEUX fois, c'est risquer de servir deux langues

La piste est élue par la langue du TEXTE SERVI, jamais par une descente
indépendante. Deux descentes parallèles laisseraient la bannière dire « la
réunion est déplacée » au-dessus d'une piste espagnole — un défaut PIRE que celui
qu'on corrige, parce qu'il a l'air d'une traduction ratée plutôt que d'une
traduction absente. Une descente, deux projections : la discipline du cycle 123.

Corollaire de repli : quand l'élection réussit sur le texte et échoue sur le
médium (TTS manquant), le repli est l'ORIGINAL, et il est fail-OPEN. Le son
d'origine vaut mieux que le silence, et le texte reste servi traduit.

### Un nom de champ annonce l'unité de sa DESTINATION, jamais celle de sa SOURCE

Le second défaut du lot n'a pas été cherché : il s'est présenté dans le premier
témoin RED, qui a rendu **« 🎵 Audio · 0:00 »** pour un vocal de 12 unités.

`MessageAttachment.duration` est en MILLISECONDES — `schema.prisma` le dit, et le
doc-comment de `formatSingleAttachmentLabelI18n` le REDIT. Deux sites de
`createMessageNotification` la multipliaient par 1000 comme si elle était en
secondes ; un vocal de 34 s partait annoncé pour 9 h 26, sur le fil push ET dans
la ligne `Notification` persistée.

> **Deux lectures d'un MÊME champ, dans le MÊME objet littéral, sous deux
> unités.** Le doc-comment qui dit vrai est à quarante lignes de la ligne qui dit
> faux, et rien ne les confronte. Ce qui rend la conversion crédible est le NOM
> du champ d'ARRIVÉE (`…DurationMs`) : il déclare l'unité de la destination, et
> se relit comme une preuve que la source est dans une autre. **Devant tout
> `x * 1000` posé sous un nom qui finit par `Ms`, ouvrir le producteur.**

Gravité à dire honnêtement, comme toujours : le champ du FIL n'est lu par aucun
client (piège armé) ; le champ PERSISTÉ est décodé par le SDK iOS, dont la
fixture de sa propre suite pose la valeur JUSTE — le contrat était en
millisecondes et le gateway le violait.

### Et le maillon qu'on oublie de vérifier, c'est la ROUTE

Un correctif qui sert une URL différente n'a d'effet que si le client peut la
CHERCHER. Cinq maillons ont été vérifiés avant de conclure — résolution d'une URL
relative côté NSE, allowlist (schéma + hôte, aucun filtre de CHEMIN), route
gateway (`/attachments/file/*`, wildcard MULTI-segment, sans authentification),
emplacement du fichier sur disque, et mapping UTI.

Le dernier a changé le correctif : le producteur écrit `format: 'mp3'`
(extension NUE). Remis tel quel, il rate le `hasPrefix("audio/")` de `fileHints`
et retombe sur un `typeHint` NUL — pièce jointe rendue en dégradé. La
normalisation du mime n'est donc pas cosmétique, elle est portante ; et les deux
producteurs du dépôt divergeant (`'mp3'` / `'audio/mp3'`), le dépouillement
NORMALISE au lieu de choisir.

> **Vérifier la chaîne jusqu'au pixel n'est pas une formalité de fin de lot :
> c'est ce qui découvre les contraintes que le correctif doit satisfaire.**

**Note de voisinage (merge avec l'itération 262).** Les deux lots ont porté le
numéro 282 en parallèle ; celui-ci est renuméroté. Ils se touchent sans se
contredire : la 282 route les descentes de TEXTE du web vers la SSOT et laisse
`use-audio-translation.ts` HORS périmètre, en nommant la bonne raison — sur une
PISTE, la région porte une information (la voix), et la strripper changerait une
sémantique. Ce cycle-ci ne touche pas cette sélection non plus : il élit la piste
par la langue que la descente du TEXTE a déjà servie, donc il hérite de la
sémantique du texte au lieu d'en inventer une seconde.
