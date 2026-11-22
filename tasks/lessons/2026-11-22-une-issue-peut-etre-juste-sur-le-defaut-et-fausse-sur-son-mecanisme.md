## Une issue peut être juste sur le DÉFAUT et fausse sur son MÉCANISME — et c'est le mécanisme qui décide de la forme du correctif (2026-11-22, #20341, cycle 218)

*Mesuré le 2026-11-22 (#20341, cycle 218), en instruisant une issue qui se déclarait elle-même « risque instruit, pas incident constaté ».*

### Le fait

#20341 nommait un vrai défaut, avec les bons fichiers et les bonnes lignes :
deux branches de rattrapage pour une même fenêtre, et une liste qui n'existe
que dans l'une. Quatre affirmations la soutenaient. Vérifiées une par une avant
d'écrire une ligne de production, **deux étaient fausses** :

| affirmation de l'issue | mesure |
|---|---|
| « les catégories ne sont jamais rejouées au démarrage à froid » | **FAUX** — `loadCategories` → `revalidateCategories` relit le serveur au lancement. Le défaut n'est pas une absence, c'est une **course** : la relecture part AVANT l'entrée dans les rooms |
| « la branche de première hydratation est le signal de première connexion » | **FAUX** — c'est « la première liste non vide », qui vient du cache DISQUE. Elle peut donc PRÉCÉDER la connexion, et elle ne tire **jamais** pour un compte sans conversation (`.first { !$0.isEmpty }` sur un `CurrentValueSubject`) |

### Ce que ça aurait coûté de ne pas vérifier

Le correctif « évident » suggéré par l'énoncé était de poser les gestes
manquants sur la branche existante. En le faisant, le geste des catégories
aurait hérité d'un portier **muet pour toute une population** : un compte sans
conversation — qui a très bien des catégories créées sur le web — n'aurait
jamais rien rattrapé. Le lot aurait été vert, l'issue fermée, et le défaut
déplacé au lieu d'être corrigé.

C'est aussi ce qui a imposé DEUX témoins d'état (`storeHydrated`,
`socketConnected`) au lieu d'un : les deux déclencheurs arrivent dans un ordre
que personne ne contrôle, et l'énoncé supposait un ordre.

### La règle

**Les affirmations d'une issue se mesurent AVANT d'écrire, même — surtout —
quand sa conclusion est juste.** Une issue bien écrite, qui cite ses fichiers
et ses lignes, obtient une confiance que son énoncé n'a pas méritée ligne par
ligne : ce sont les affirmations de MÉCANISME (« rien ne le rejoue », « ce
déclencheur signifie X ») qui dérivent, parce qu'elles sont le fruit d'une
lecture et non d'une exécution.

Le discriminant pratique : **une affirmation d'ABSENCE (« rien ne… », «
jamais… », « aucun autre… ») se vérifie en cherchant les appelants, pas en
relisant le site.** Les deux corrections ci-dessus sont tombées sur un
`git grep` des appelants de deux fonctions.

### Corollaire

Quand la mesure corrige l'énoncé, **l'issue se corrige aussi** : la laisser
dire faux en la fermant laisse derrière un mécanisme erroné que le prochain
lot citera. Les deux corrections ont été écrites dans le journal du cycle et
dans le commentaire de clôture, pas seulement dans le code.

### Famille

Même famille que « un document qui dit vrai sur le principe et faux sur le
chemin est plus coûteux qu'un document absent » (`services/gateway/CLAUDE.md`,
§ cliquet de la table des routes) — appliquée ici à une issue plutôt qu'à un
`CLAUDE.md`, et à son mécanisme plutôt qu'à son chemin.
