## Leçon 339 — Un artefact de DEV n'est pas un artefact de PROD, et la preuve d'un build se prend sur `next start`

Cycle : revue croisée du lot L-0.5 de la v3 web (issue #4396, « Le paquet apps/web-v3 existe et se
construit »).

Le lot livrait `app/layout.tsx` + `app/theme-script.tsx`, onze témoins verts, `next build` en exit 0,
et un rapport prouvant `assetPrefix` et `ThemeScript` par une capture du **HTML réellement servi sur
:3300**. La capture venait de `bun run dev`.

En `bun run build && bun run start`, la MÊME URL rend autre chose : `next build` avec un `layout.tsx`
**seul** émet **zéro route d'App Router** (`.next/app-build-manifest.json` → `{"pages":{}}`, pas de
`.next/server/app`). La coquille et son `ThemeScript` sont du **code mort dans l'artefact** ; la seule
réponse HTML est le 404 anglais du routeur **Pages** — sans `lang`, sans thème, ~101 kB de JS pour
rendre une chaîne statique. Les onze tests étaient vrais, et vrais de rien qui parte en production.

> **`next dev` compile à la demande ce que `next build` n'émet que s'il est ROUTÉ.** Le dev rend le
> layout parce qu'on lui demande une URL ; le build ne l'émet que si une route l'atteint. Un fichier
> qui existe n'est pas un fichier qui SORT. La preuve d'un build se prend donc sur son artefact —
> `next start`, ou le manifeste — jamais sur le serveur de développement.

**Le piège de second tour, mesuré** : ajouter `app/not-found.tsx` ne change **rien** — le manifeste
reste vide. `/_not-found` n'est généré que si l'App Router possède au moins une **page**. Un
correctif « évident » qui ne se vérifie pas sur le manifeste APRÈS l'ajout laisse le défaut entier.

**Deux formes générales, valables hors Next :**

- **Un test qui passe par le rendu ne dit rien de ce qui est DÉPLOYÉ.** `renderToStaticMarkup` prouve
  que la fonction rend ; il ne prouve pas qu'un chemin de requête l'atteint. La question à poser à
  toute suite verte sur une coquille : *quelle requête, dans l'artefact, fait exécuter ce code ?*
  C'est la forme du cycle 122 (« qui AFFICHE ce que le résolveur élit ? ») portée du Prisme au build.
- **Un gate se pose sur la SORTIE, pas sur la source.** Le correctif durable n'est pas un test de
  plus sur le layout, c'est `bun run build` = `next build && node scripts/check-app-router-built.mjs`,
  qui lit le manifeste et sort en 1 s'il est vide. Prouvé rouge en retirant la route.
