## Une énumération de tables « par utilisateur » ne se relit pas dans la constante qui la porte

**Date** : 2026-11-06 · **Issue** : #16515 · **Trouvé en** : audit de synchronisation temps réel (routine d'amélioration continue)

### Le constat

`services/gateway/src/__tests__/preference-writer-sweep.ts` est un cliquet
exemplaire. Son doc-comment énonce la règle (« toute écriture d'une ligne par
utilisateur doit être suivie d'une diffusion sur la room personnelle »), nomme
les deux fois où elle a manqué, et conclut par la bonne question : *« et
celui-là, il diffuse ? »*. Chacune de ses treize lignes avait été ouverte et
vérifiée à la main.

Et il ne pouvait pas voir le défaut de ce cycle, parce que son
`PREFERENCE_MODELS` n'énumérait que trois tables :

```ts
const PREFERENCE_MODELS = ['userConversationPreferences', 'userCommunityPreferences', 'userStickerPack'] as const;
```

`userSticker` — « Mes stickers », la bibliothèque du COMPTE, quatre chemins
d'écriture, **zéro diffusion** — n'y était pas. Sa voisine `userStickerPack`,
l'étagère de packs, y était : même feuille, même écran, une ligne de différence
dans le nom.

### Pourquoi la vérification ne tombait pas dessus

C'est la **leçon 261 appliquée à un cliquet au lieu d'une prose** : une
énumération porte DEUX affirmations, et une seule est jamais vérifiée.

| affirmation | vérifiée ? |
|---|---|
| « ces sites appliquent la règle » | **oui** — treize lignes ouvertes une par une, et c'est écrit |
| « ce sont les tables où la règle s'applique » | **jamais** |

La seconde ne se vérifie pas en relisant le cliquet : tout y est juste. Elle se
vérifie **ailleurs**, dans `schema.prisma`, en demandant « quelle autre table
est par utilisateur ? ». Ce que le cliquet ne balaie pas, il le déclare
implicitement hors sujet — et il le déclare dans le silence, qui ne rougit
jamais.

### La forme générale

> **Un cliquet garde ce qu'il BALAIE. Son périmètre de balayage est une
> affirmation de plus, et c'est celle qu'il ne peut pas tenir lui-même.**

Trois corollaires, tous mesurés sur ce cas :

1. **La question juste ne se pose pas au cliquet, mais au SCHÉMA.** « Les sites
   gelés diffusent-ils ? » est la question du cliquet, et il y répond. « Quelle
   autre table est par utilisateur ? » est la question qui l'élargit, et il ne
   peut pas la formuler. Un cliquet d'inventaire gagne donc à écrire, dans son
   doc-comment, **où se relit son périmètre** — pas seulement ce qu'il gèle.
2. **Un défaut voisin a l'air couvert.** `userStickerPack` était dans la liste,
   diffusait, et rendait la famille « stickers » plausiblement gardée. Le
   préfixe partagé achève l'illusion : on lit `userSticker…` et on coche.
3. **Élargir un cliquet peut rendre deux verdicts opposés, et les deux comptent.**
   `userSticker` était un défaut de PRODUCTION ; `userConversationCategory`,
   l'autre table manquante, diffusait déjà sur ses quatre verbes — rien n'y
   était cassé. L'ajouter ne corrige rien **aujourd'hui** et ferme un piège
   armé : un cinquième écrivain muet n'y aurait fait rougir personne. Les deux
   entrent dans le même lot, et le journal dit laquelle est laquelle — sans
   quoi on annonce une panne qu'on n'a pas mesurée (règle du cycle 103).

### Piège de mise en œuvre, trouvé en élargissant

`userSticker` est un **préfixe** de `userStickerPack`. La regex du balayage
exigeait un `.` immédiatement après le nom du modèle, ce qui suffisait par
accident ; un `\b` a été ajouté, non pour ce couple-ci mais pour le prochain —
un inventaire juste par accident est faux au premier déplacement.

### Ce qu'il faut faire la prochaine fois

Devant tout cliquet d'inventaire dont le collecteur prend une LISTE de noms
(modèles, événements, routes, fichiers), avant de se fier à son vert :

```
1. où est la source qui dit ce que cette liste devrait contenir ? (schema.prisma,
   event-names.ts, le manifeste de routes…)
2. la confronter — mécaniquement, pas de mémoire
3. écrire la réponse dans le doc-comment du cliquet, pour que la question suivante
   parte de là et non de la liste
```

### Voir aussi

- `tasks/lessons.md` § Leçon 261 — « une énumération de sites porte DEUX affirmations »
- `services/gateway/decisions/2026-11-06-chaque-ecriture-de-mes-stickers-atteint-les-autres-appareils-16515.md`
- `services/gateway/CLAUDE.md` § « Cette entité a-t-elle une JUMELLE ? » — la forme outillée : compter les appelants du helper
