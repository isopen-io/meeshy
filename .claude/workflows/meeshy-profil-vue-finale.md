# Workflow « profil, vue finale » (#18857)

`meeshy-profil-vue-finale.js` développe le profil en trois faces à partir du kit, **une chaîne par session** : `serveur`, `ios`, `android`, `web`. Chaque chaîne avance lot après lot et fusionne dans `dev` avant de commencer le lot suivant.

La planche fait foi : [`docs/product/profil-vue-finale.md`](../../docs/product/profil-vue-finale.md).

## Lancer

Quatre sessions, une par chaîne. Dans chacune, une phrase suffit :

```
Lance le workflow meeshy-profil-vue-finale avec { "plateforme": "serveur" }
```

```
Lance le workflow meeshy-profil-vue-finale avec { "plateforme": "ios" }
```

```
Lance le workflow meeshy-profil-vue-finale avec { "plateforme": "android" }
```

```
Lance le workflow meeshy-profil-vue-finale avec { "plateforme": "web" }
```

Les quatre peuvent partir en même temps. L'ordre conseillé est `serveur` et `ios` d'abord (le contrat et la référence), `android` et `web` ensuite : ils lisent le lot iOS équivalent s'il est déjà sur `dev`.

| Argument | Défaut | Rôle |
|---|---|---|
| `plateforme` | obligatoire | la chaîne de la session |
| `attribution` | aucune | lignes de pied de commit de la session |
| `seulement` | tous | liste de clés de lots à jouer |
| `sauter` | aucun | liste de clés de lots à ne pas jouer |
| `fusionner` | `true` | `false` laisse toutes les PR ouvertes, empilées |
| `milestone` | aucun | numéro du milestone, une fois créé par le porteur |
| `essais` | 2 | tours de correction d'un rouge |

Reprise : relancer le même workflow avec la même `plateforme`. Les lots dont l'issue est fermée sont sautés ; la chaîne repart au premier lot ouvert.

## Ce que fait une chaîne

| Étape | Ce qui sort |
|---|---|
| Ouvrir | la sous-issue de chaque lot, retrouvée par sa « clé de lot » ou créée sous #18857 |
| Développer | un lot à la fois par `meeshy-issues-dev` : branche poussée tôt, témoin rouge puis vert, gardes, revue, audit des lots sensibles, preuve CI, PR vers `dev` |
| Fusionner | le guichet : `dev` fusionnée dans la branche, gardes rejouées sur l'arbre fusionné, fusion de la PR, issue fermée avec sa preuve |

La chaîne s'arrête au premier lot qui ne fusionne pas et dit pourquoi. Elle ne passe jamais au lot suivant par-dessus un lot ouvert.

## Les lots

Serveur, dans l'ordre : `serveur-fiche-par-cercle` · `serveur-adresse-courte` · `serveur-mes-adresses` · `serveur-apercu-lien-personne`.

iOS, Android et web jouent les mêmes neuf lots, préfixés par la plateforme (`ios-…`, `android-…`, `web-…`) :

| Clé | Ce que le lot livre |
|---|---|
| `kit-atomes-a` | K26 mouvement, K40 bouton, K41 pastille, K42 jauge, K45 médaillon, K46 note, K55 touche |
| `kit-atomes-b` | K33 échelle de proximité, K35 lecteur d'onde, K37 rangée verrouillée, K51 marque de traduction, K53 pas-à-pas, squelette de K38 |
| `kit-assemblages-a` | K27 bannière, K28 en-tête repliable, K30 billet, K31 carte à code, K32 action libellée, K34 chiffres, K39 rangée de personne, K43 carte de groupe, K44 en-tête de section |
| `kit-assemblages-b` | K36 épingle, K38 bloc d'état, K47 tuiles de choix, K48 groupe d'avatars, K49 grille de médias, K50 graphique, K52 liste réordonnable, K54 tracé, K29 avatar qui voyage |
| `vitrine-publique` | **le profil public** : ma Vitrine, « Voir comme » par cercle, la page publique |
| `fiche-relation` | **le profil de la relation** : la fiche d'un autre en trois faces, selon le cercle commun |
| `face-liens` | la face Liens : lien de profil, QR, adresses, liens créés |
| `carte-action` | la carte comme action, l'avatar qui devient l'épingle |
| `etats` | vide, chargement, erreur, hors ligne, bloqué, introuvable |

Pour n'avoir d'abord que les deux écrans demandés, sur une plateforme dont le kit est déjà livré : `{ "plateforme": "ios", "seulement": ["ios-vitrine-publique", "ios-fiche-relation"] }`.

## Pourquoi il n'y a pas de conflit

1. **Chemins disjoints entre chaînes.** `serveur` écrit sous `services/gateway/` et `packages/shared/` ; `ios` sous `apps/ios/` et `packages/MeeshySDK/` ; `android` sous `apps/android/` ; `web` sous `apps/web/`. Le guichet refuse une PR qui touche un fichier hors des chemins de sa chaîne.
2. **Un seul lot ouvert par chaîne.** Le lot suivant part du `dev` qui contient le précédent : pas de PR empilée, pas de fichier disputé à l'intérieur d'une chaîne (catalogue du kit, catalogue de langues, projet Xcode).
3. **`dev` entre dans la branche, jamais l'inverse.** Avant chaque fusion : `git merge origin/dev`, les corrections de `dev` gardées, puis les gardes et la preuve rejouées sur l'arbre fusionné.
4. **Ce qui est partagé a un seul écrivain.** Les types et routes : la chaîne `serveur`. Les vecteurs de recette `docs/product/kit/K<nn>-*.vectors.json` : la chaîne `ios`. La planche et ce workflow : personne pendant le chantier.
5. **Un besoin hors de ses chemins devient une issue**, pas un commit. Le lot reste rétrocompatible : si le serveur ne sert pas encore un champ, l'écran s'en passe.
6. **Les identifiants ne se disputent pas.** Les numéros K26–K55 sont des propositions ; un lot garde le nom du composant et signale le numéro si le registre du kit en a pris un entre-temps.

## Avant le premier lancement

- La planche et ce workflow doivent être sur `dev` : les lots travaillent dans des arbres tirés de `origin/dev`.
- Les décisions ouvertes n'empêchent pas de partir : #18844 (trois icônes sans règle) et #18845 (profil d'un autre sur le web large). Les lots concernés prennent le choix de la planche et le disent dans leur PR.
- Le milestone du chantier est à créer par le porteur ; passer ensuite son numéro en `milestone`.

## Ce que le workflow ne fait pas

- La recette sur appareil et sur staging, la promotion en production.
- Le partage sans contact, la position Sang côté client et le mode fantôme : la planche les montre, aucun lot ne les livre.
- Les fiches de contrat au format du kit réel (`docs/product/kit/K26…K55-*.md`) : les planches-fiches de la planche en tiennent lieu.
