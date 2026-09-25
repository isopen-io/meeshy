## Leçon 348 — `private` au niveau FICHIER ne survit pas au déplacement du type qui s'en sert

**Le fait.** Découper `ComposerDocumentSurface.swift` (1 101 lignes) par TYPE — la porte, la vignette,
la vue — a compilé partout sauf en un point : `ComposerThumbnailDecoder`, un `private nonisolated enum`
déclaré au niveau du fichier d'origine, que seule la vignette appelle. La vignette partie, l'appel ne
voyait plus rien.

> **En Swift, `private` au niveau FICHIER est une visibilité de VOISINAGE**, pas d'appartenance. Elle
> lie deux déclarations par le hasard de leur cohabitation, et ce lien est invisible au lecteur qui
> découpe : rien, dans le corps du type qu'on déplace, ne dit qu'il dépend d'un voisin privé.

Le compilateur le signale — mais **au site d'APPEL, dans le fichier neuf**, jamais au site de
déclaration resté derrière. Le message (« cannot find X in scope ») ressemble à un oubli d'import
plutôt qu'à ce qu'il est : un compagnon laissé dans l'ancienne maison.

**La règle de découpage qui en tombe.** Avant de déplacer un type, chercher ce qu'il consomme et qui
est `private`/`fileprivate` dans le fichier d'origine :

```bash
grep -nE "^(private|fileprivate) " <fichier> # les candidats
```

Chacun se range dans l'un des trois cas, et le cas décide :
- **un seul consommateur** → il DÉMÉNAGE avec lui, et perd son `private` (il change de maison, plus de voisinage à protéger) ;
- **plusieurs consommateurs qui se séparent** → il sort dans un troisième fichier, à son propre nom ;
- **aucun consommateur déplacé** → il reste, et garde son `private`.

**Et `private(set)` tombe de la même façon, sur un découpage par EXTENSION.** Vérifié le même jour, sur
le découpage voisin de `StoryViewModel` : `@Published private(set) var activeUploads` limite l'écriture
au FICHIER de déclaration, et les trois sites qui mutent cette file étaient partis dans
`+Publication` et `+PublicationUpload`. Le compilateur rend alors « setter is inaccessible » — un
message qui ne nomme ni le découpage ni le fichier d'origine.

C'est la nuance qui manquait ci-dessus : un découpage par extension ne casse pas `fileprivate` entre
extensions du même type… mais il casse `private(set)`, parce que le `(set)` est une visibilité de
FICHIER, pas de type. Le remède est `internal(set)` — et ce n'est pas un relâchement : la protection
qui compte, « personne hors du module ne l'écrit », reste intacte.

**Pourquoi ce piège est propre au découpage PAR TYPE.** Un découpage par TRANCHE (`Type+Partie.swift`)
garde tout dans la même unité de compilation logique et ne casse que `private`, jamais `fileprivate`
— et les extensions du même type continuent de se voir. Un découpage par TYPE change de maison, donc
de voisinage. C'est le bon découpage, celui que la directive demande (« par responsabilité, pas par
tranche ») ; il faut simplement savoir qu'il déplace aussi des liens qu'on ne voit pas.

Voir la leçon 347 : le même découpage laisse trois dettes derrière lui — les gardes qui nomment le
fichier, la dette de taille et la dette de police. Celle-ci est la quatrième, et la seule que le
compilateur attrape.
