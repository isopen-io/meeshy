## Leçon 625

**Playwright résout ses routes dans l'ORDRE INVERSE de leur enregistrement : la dernière posée gagne. Un attrape-tout posé après une route précise l'avale, et le gate accuse le code.**

Sur le gate du plateau (#6943), l'ordre était :

```js
await context.route('**/api/v1/posts', capture);   // la route qui MESURE
await context.route('**/api/v1/**', vide);         // l'attrape-tout
```

Verdict : « AUCUN POST /api/v1/posts n'est parti — rien à relire ». L'écran publiait parfaitement ; l'attrape-tout, enregistré en dernier, servait `{data:null}` à la publication. **Quinze invariants sur seize étaient verts, et le seizième accusait la feature.**

C'est la forme la plus coûteuse de faux rouge : il ne ressemble pas à un défaut d'outillage, il ressemble à la fonctionnalité qui ne marche pas — on va chercher dans le code de publication, qui est juste.

> Devant un gate qui dit « rien ne s'est passé » là où l'écran fait visiblement la chose, **soupçonner l'ordre des interceptions avant le code**. Et poser l'attrape-tout EN PREMIER, avec un commentaire qui dit pourquoi cet ordre est l'inverse de l'intuition — sans quoi le prochain lot le « rangera » proprement et repaiera la demi-heure.
