## Leçon 564 — Un worktree sous `/tmp` rend ROUGE toute garde qui soustrait la racine du dépôt d'un chemin

2026-09-10, iOS (#6017). `test_everyPerTargetCatalogIsMapped` a rougi en
nommant quatre catalogues introuvables — `/privateapps/ios/Meeshy/Localizable.xcstrings`.
Une heure perdue à chercher ce que mon diff avait cassé dans le catalogue :
rien. La garde calcule un chemin relatif au dépôt par soustraction de
préfixe,

```swift
$0.path.replacingOccurrences(of: env.repoRoot.path + "/", with: "")
```

et ses deux termes ne viennent pas de la même source : `repoRoot` dérive de
`#filePath`, que le compilateur rend TEL QU'ÉCRIT (`/tmp/conformite/…`),
pendant que l'énumération vient de `FileManager`, qui RÉSOUT les liens
(`/private/tmp/conformite/…`). Sur macOS `/tmp` est un lien vers
`/private/tmp` : la soustraction retire `/tmp/conformite/` du MILIEU de la
chaîne et laisse `/private` collé au reste.

> **Un rouge qui nomme un chemin déformé mesure la MACHINE, pas le code.**
> Avant de chercher ce que le diff a cassé, relire le chemin que le message
> imprime : s'il n'est pas celui qu'on attendrait, la garde ne parle pas de
> nous.

Le correctif n'a touché aucune ligne : `git worktree move` vers
`~/Documents/v2_meeshy-conformite` — **la convention que `CLAUDE.md` écrit
déjà** (« ../v2_meeshy-{branch-name}, sibling du repo principal ») — et la
garde est passée verte. J'avais adopté `/tmp` pour la commodité ; la
convention avait une raison que je n'avais pas cherchée.

Corollaire pour qui voudrait « durcir » la garde : `resolvingSymlinksInPath()`
sur les deux termes la rendrait insensible au problème, mais ce serait
corriger le témoin pour une faute de l'atelier. La garde a raison en CI, où
le dépôt est à son vrai chemin.
