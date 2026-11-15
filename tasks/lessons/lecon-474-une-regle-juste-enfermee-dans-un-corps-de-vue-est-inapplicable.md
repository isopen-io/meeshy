## Leçon 474 — Une règle JUSTE enfermée dans un corps de vue est inapplicable ailleurs, et personne ne le signale

**Le fait (2026-09-03, #4926).** La langue d'origine d'un AUDIO n'est pas celle
de son porteur : `FeedPost.originalLanguage` est la langue du TEXTE, et rien
n'oblige un vocal espagnol à voyager sous une légende française. Faire concourir
le porteur au rang du Prisme **prive le lecteur de sa traduction**.

Cette règle **existait, exacte, testée par l'usage** — dans
`ReelPageView.metaOriginalLanguage` :

```swift
if let audioMedia { return audioMedia.transcription?.language ?? reel.originalLanguage }
```

Écrite dans un corps de vue. Les **quatre autres surfaces** qui jouent un audio
ne pouvaient pas l'appliquer, même en le voulant : il n'y avait rien à appeler.

**Ce cas n'a aucun site où rougir.** Le réel est correct — ses témoins passent.
Les quatre autres sont incorrectes — mais elles n'appellent aucune règle, donc
aucune garde ne peut constater qu'elles s'en écartent. Une revue qui lit le réel
conclut « la règle est appliquée » ; une revue qui lit une carte de post ne voit
pas qu'il manque quelque chose.

> **La question à poser à une bonne règle n'est pas « est-elle juste ? » mais
> « est-elle ATTEIGNABLE depuis ailleurs ? »** Une règle correcte dans un corps
> de vue est, du point de vue du reste du dépôt, une règle qui n'existe pas.

Le témoin qui l'attrape n'interroge pas la justesse : il énumère les SURFACES où
la règle s'applique et exige de chacune qu'elle appelle la règle NOMMÉE —
c'est-à-dire qu'il transforme « appliquer » en quelque chose de vérifiable.
Corollaire de la 261 : une garde qui nomme UN fichier prouve que ce fichier
applique la règle, jamais que ce sont les seuls fichiers où elle s'applique.
