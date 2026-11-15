## Leçon 550 — Un témoin qui garde son bilan pour la fin perd ce qu'il a vu

**Le fait.** Le témoin des états du fil relevait ses constats dans un tableau
et les imprimait à la sortie. Mutation testée — la reprise d'un envoi rendue
malhonnête (elle repasse en « en attente » même coupé) — le témoin a rendu :

```
    at .../check-thread-states.mjs:164
  log: [ "  - waiting for getByText('Réessayer')" ],
  name: 'TimeoutError'
```

Il AVAIT relevé le défaut : l'assertion précédente était déjà tombée. Mais
l'étape suivante cliquait une bande de reprise que la mutation venait de faire
disparaître, Playwright a levé, et le bilan n'a jamais été imprimé. Un défaut
parfaitement détecté, rendu sous la forme d'un incident d'outillage.

**Les deux règles.**

1. **Imprimer au fil de l'eau.** Ce qu'un témoin a constaté doit survivre à ce
   qui l'arrête ensuite. Un bilan différé est un bilan qu'on perd exactement
   quand il est le plus utile — c'est-à-dire quand quelque chose casse.
2. **Ce qui peut légitimement manquer se clique avec une garde.** Quand le
   défaut cherché EST l'absence d'un élément, l'attendre par un clic direct
   transforme une assertion en exception. Un helper qui rend `false` laisse le
   témoin nommer le défaut trouvé plutôt que l'endroit où il a buté — et
   permet de dire la nuance : « la bande avait déjà disparu hors ligne » n'est
   pas « la reprise ne marche pas ».

**Pourquoi ça compte plus qu'il n'y paraît.** Un gate qui rend une trace de
pile au lieu d'une phrase se fait diagnostiquer comme cassé, pas comme
déclencheur. C'est le même mécanisme que la leçon 548 : un témoin perd son
autorité par la QUALITÉ de ce qu'il rend, pas seulement par sa justesse. Ici il
avait raison, et il a eu l'air en panne.

**Corollaire de méthode.** Ce défaut ne s'est vu qu'en MUTANT le code — le
témoin était vert, et sa sortie verte était parfaite. **La sortie d'échec d'un
témoin est du code que seule une mutation exécute** : ne jamais la considérer
comme relue tant qu'on ne l'a pas lue en rouge.
