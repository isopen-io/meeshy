# Test du Parser Markdown Custom

Ce fichier montre tous les éléments supportés par notre parser markdown léger.

## Formatage de Texte

**Texte en gras** avec des astérisques
__Texte en gras__ avec des underscores

*Texte en italique* avec un astérisque
_Texte en italique_ avec un underscore

~~Texte barré~~ avec des tildes

`Code inline` avec des backticks

## Retours à la Ligne

Premier paragraphe.
Deuxième ligne du même paragraphe.
Troisième ligne qui devrait être collée.

Nouveau paragraphe séparé.

## Titres

# Titre niveau 1
## Titre niveau 2
### Titre niveau 3
#### Titre niveau 4
##### Titre niveau 5
###### Titre niveau 6

## Liens

[Lien vers Google](https://google.com)
[Mention utilisateur](/u/john)
[Lien de tracking](m+ABC123)

## Images

![Image test](https://picsum.photos/200/300)

## Blocs de Code

```javascript
function hello() {
  console.log("Hello World!");
  return true;
}
```

```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n-1)
```

```
Code sans langage spécifié
Plusieurs lignes
Préservées
```

## Citations

> Ceci est une citation
> Sur plusieurs lignes

## Listes

### Liste non ordonnée

- Premier élément
- Deuxième élément
- Troisième élément

* Item avec astérisque
* Autre item

### Liste ordonnée

1. Premier élément
2. Deuxième élément
3. Troisième élément

### Listes imbriquées

- Item niveau 1
  - Item niveau 2
  - Autre item niveau 2
    - Item niveau 3
    - Autre item niveau 3
  - Retour niveau 2
- Retour niveau 1
- Dernier item niveau 1

### Liste mixte (ordonnée et non-ordonnée)

1. Premier point principal
   - Sous-point A
   - Sous-point B
     - Détail B.1
     - Détail B.2
   - Sous-point C
2. Deuxième point principal
   1. Sous-point numéroté 1
   2. Sous-point numéroté 2
      - Détail non-numéroté
      - Autre détail
   3. Sous-point numéroté 3
3. Troisième point principal

### Liste complexe avec formatage

- Item avec **texte en gras**
  - Sous-item avec *italique*
    - Sous-sous-item avec `code inline`
  - Lien dans sous-item : [Google](https://google.com)
- Item avec :rocket: emoji
  - Sous-item avec ~~texte barré~~

## Séparateur Horizontal

---

***

___

## Combinaisons

**Texte en gras avec du *italique* à l'intérieur**

Lien vers [**Google en gras**](https://google.com)

> Citation avec **gras** et *italique* et `code`

## Cas Spéciaux

Texte normal avec des * étoiles * qui ne devraient pas être en italique si mal formaté.

Texte avec ** espaces ** mal placés qui devraient être corrigés.

Lien de tracking Meeshy : m+ABC123 (sera automatiquement transformé en lien)

URL directe : https://example.com (sera automatiquement transformée en lien cliquable)

URL avec texte personnalisé : [Visitez notre site](https://meeshy.me)

## Test Retours à Ligne

Ligne 1
Ligne 2
Ligne 3

Ligne 4


Ligne 5 (avec plusieurs lignes vides)

## Tables Markdown

| Nom       | Âge | Ville        |
|-----------|-----|--------------|
| Alice     | 30  | Paris        |
| Bob       | 25  | Lyon         |
| Charlie   | 35  | Marseille    |

### Table avec alignement

| Gauche    | Centre  | Droite |
|:----------|:-------:|-------:|
| A         | B       | C      |
| Texte     | Texte   | Texte  |
| Left      | Center  | Right  |

## Task Lists

- [x] Tâche terminée
- [x] Autre tâche terminée
- [ ] Tâche en cours
- [ ] Tâche à faire
- [ ] Tâche avec **gras** et *italique*

### Task Lists imbriquées

- [x] Projet Phase 1
  - [x] Sous-tâche 1.1
  - [x] Sous-tâche 1.2
    - [x] Détail 1.2.1
    - [x] Détail 1.2.2
  - [x] Sous-tâche 1.3
- [ ] Projet Phase 2
  - [x] Sous-tâche 2.1
  - [ ] Sous-tâche 2.2
    - [x] Détail 2.2.1
    - [ ] Détail 2.2.2 en cours
  - [ ] Sous-tâche 2.3

## Emoji Shortcodes

:smile: :heart: :thumbsup: :rocket: :pizza: :fire:

Texte avec emoji :joy: au milieu de la phrase.

**Smileys** : :smile: :grin: :joy: :heart_eyes: :wink: :thinking:

**Gestes** : :thumbsup: :thumbsdown: :wave: :clap: :muscle: :pray:

**Coeurs** : :heart: :blue_heart: :green_heart: :yellow_heart: :purple_heart:

**Nature** : :dog: :cat: :tree: :sunflower: :rose: :butterfly:

**Nourriture** : :pizza: :burger: :coffee: :cake: :sushi: :beer:

**Symboles** : :check: :x: :star: :fire: :warning: :tada:

**Drapeaux** : :fr: :us: :gb: :de: :es: :it:
