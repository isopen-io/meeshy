## Leçon 369 — Les CINQ natures d'un contrôle qui ne fait pas ce qu'il annonce, et pourquoi une seule question ne les sépare pas

Trouvées en une nuit sur le composer iOS (#4073, #4558, #4560, #4561), en deux
sessions parallèles qui se corrigeaient l'une l'autre. Chacune ressemble aux
autres depuis le code ; chacune demande un correctif DIFFÉRENT, et se tromper de
nature fait appliquer le correctif de la voisine — c'est-à-dire retirer un
contrôle correct, ou brancher un contrôle qui n'aurait pas dû exister.

| nature | se rend ? | fait quelque chose ? | symptôme observable | correctif |
|---|---|---|---|---|
| contrôle **INERTE** | oui | non | un bouton qui ne fait rien | cesser de PEINDRE le contrôle |
| feature **NON ALIMENTÉE** | non | — | rien à l'écran | brancher la SOURCE |
| contrat **MORT** | — | jamais atteint | aucun | retirer, ou câbler |
| repli **MENTEUR** | oui | oui, en apparence | tardif, ailleurs, chez un autre | rendre l'ABSENCE impossible |
| règle **DOUBLÉE** par une liste | oui | oui | **aucun** | supprimer la LISTE, jamais la règle |

**La question « un hôte remplit-il le relais ? » ne sépare que les deux
premières.** Il en faut trois de plus, dans cet ordre :

1. *un hôte remplit-il le relais ?* — sépare l'inerte du câblé ;
2. *la condition de rendu peut-elle être VRAIE ?* — sépare l'inerte de la
   non-alimentée. `LentilleConversationRow.onJoinLiveCall` répond « non / oui »
   comme un contrôle inerte, mais vit sous `if let liveCall` avec `liveCall`
   passé `nil` explicitement et documenté à trois endroits. Le bouton ne peut pas
   se rendre, donc il ne promet rien : le retirer aurait cassé une feature qui
   n'attend qu'une donnée ;
3. *le site d'appel est-il ATTEIGNABLE ?* — sépare le contrat mort du reste.
   `UniversalComposerBar.onVoiceRecord` est bien invoqué, mais seulement depuis
   un chemin d'enregistrement interne que les quatre hôtes court-circuitent ;
4. *ce qu'il rend EXISTE-t-il ?* — attrape le menteur, et lui seul.

### Le menteur mérite sa ligne

`startRecording()` avait deux chemins. Le délégué confie un vrai
`AVAudioRecorder` au parent. Le chemin interne n'enregistre RIEN — aucun
`AVAudioRecorder`, aucune session audio, aucun fichier : un `Timer` qui
incrémente un compteur. À l'arrêt il ajoutait pourtant une pièce jointe `voice`
et appelait :

```swift
if let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("voice_\(Int(Date().timeIntervalSince1970)).m4a") as URL? {
    onVoiceRecord?(url, duration)
}
```

> **Un repli FABRIQUÉ ne se distingue pas d'un vrai résultat.** Une URL bien
> formée, un compteur qui avance, une pièce jointe qui apparaît : tout ce que
> l'écran montre est cohérent, et rien n'existe. Le mensonge n'est lisible qu'à
> la LECTURE, chez quelqu'un d'autre, plus tard.

Et `if let … as URL?` est un cast optionnel qui réussit toujours : **il a la
FORME d'une garde**. Le lecteur suivant lit « on a vérifié », et rien ne l'a été.

### La cinquième est la pire, parce qu'elle n'a aucun symptôme

`ComposerRailDoor.level` classe chaque porte — `.publication` / `.slide` /
`.object` / `.scene` — avec un `switch` exhaustif et un doc-comment par cas. Deux
fichiers plus loin, `ComposerSceneFloatingRail.doors` était un littéral écrit à
la main qui rangeait `.mention`, déclarée `.publication`, parmi ce qui vit sur la
scène.

> Ni inerte, ni non alimentée, ni morte, ni menteuse : **les deux existent, les
> deux compilent, les deux sont justes LOCALEMENT, et seule celle qui est
> APPELÉE compte.** Les quatre premières natures ont un symptôme observable ;
> celle-ci n'en a aucun — jusqu'au jour où on lit la règle raisonnée pour
> comprendre le produit, et qu'on décrit ce que le produit ne fait pas. Le
> doc-comment devient la documentation d'un code mort, et il documente
> sincèrement.

**Le correctif est ASYMÉTRIQUE, et c'est le point.** Aligner la liste sur la
règle laisserait les deux vivantes et rejouerait la divergence au cas suivant.
Supprimer la liste ferme la CLASSE, pas l'instance.

### Le motif transverse : ce qui trompe n'est pas ce qui est faux

Trois occurrences dans la même famille de fichiers, la même nuit :

- `editOverlayLayer` documenté « snap guides, **selection markers** » — seuls les
  guides existaient ;
- `startRecording` commenté « Internal recording (stories, etc.) » — l'usage
  n'avait plus de site ;
- `ComposerRailDoor.place` documentée « une pastille de lieu POSÉE sur la scène,
  distincte du LIEU de la publication » — elle ouvre le sélecteur de la
  publication.

> **Un doc-comment qui décrit ce que le code DEVRAIT faire ne se fait contredire
> par rien.** Il est juste dans son intention, il occupe le bon endroit, il
> emploie les bons mots — et c'est exactement ce qui empêche le lecteur suivant
> de vérifier qu'il est tenu. Ce qui trompe n'est pas ce qui est faux : c'est ce
> qui a l'air d'avoir été vérifié.

### Le témoin qui les attrape tous

Aucun gate ne les a trouvés. Tous ont été trouvés en regardant l'écran, ou en
suivant une donnée **jusqu'au pixel** — pas jusqu'à son consommateur, qui
s'arrête un cran trop tôt. La question opérante n'est ni « la règle est-elle
juste ? » ni « la vue est-elle montée ? » mais :

> **Qu'obtient le doigt ?**

Corollaire de méthode, payé deux fois : un `grep` de site d'appel doit couvrir
l'**unité** du type, jamais son fichier. Sur un type éclaté en huit extensions,
le fichier de base ne contient par construction que des déclarations — un
balayage qui s'y arrête rend « déclaré et jamais invoqué » pour absolument tout.
C'est pour cela que `AppSourceGuard.unitURLs(_:alsoIncluding:)` existe : ce n'est
pas un confort, c'est la seule définition correcte de « le code de ce type ».
