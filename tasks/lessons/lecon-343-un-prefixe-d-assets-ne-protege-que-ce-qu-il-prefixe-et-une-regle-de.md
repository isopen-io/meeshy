## Leçon 343 — Un préfixe d'assets ne protège que ce qu'il PRÉFIXE, et une règle de routage publie tout ce qu'elle réclame

**Contexte.** Lot L-0.5 de la v3 web. `apps/web-v3` pose `assetPrefix: '/__v3'`, et le routeur
Traefik `frontend-v3` (priority=100, devant le `frontend` legacy à priority=1) réclamait
`PathPrefix('/__v3')`. Le doc-comment du compose affirmait que `/__v3` « est l'adresse des assets de
la zone » et que sans elle c'est « chunk 404, page blanche ». Vrai — pour les chunks. La revue
croisée a mesuré les deux moitiés manquantes.

**(a) `assetPrefix` ne préfixe que les URL que Next FABRIQUE pour ses propres bundles.** Mesuré sur
le serveur standalone que l'image lance : un chunk répond à `/_next/…` ET à `/__v3/_next/…`
(200/200) ; `public/probe.txt` répond à `/probe.txt` et **pas** à `/__v3/probe.txt` (200/404) ;
`app/robots.txt` et `app/icon.svg` — les conventions de métadonnées de l'App Router — répondent à
`/robots.txt` et `/icon.svg`, **pas** sous `/__v3` (200/404). Toute cette classe d'actifs est donc
servie à la RACINE de l'URL et retombe, derrière Traefik, sur le routeur attrape-tout : **c'est le
LEGACY qui la sert**. Le sprite d'icônes et les images OG du rôle premier sont exactement de cette
classe. Deuxième moitié du même angle mort : l'étage runner du `Dockerfile` ne portait aucun
`COPY /app/public ./public` (le legacy l'a) et `output:'standalone'` ne recopie pas `public/` —
le jour où le répertoire apparaît, l'image ne l'embarque même pas.

**(b) une règle de routage PUBLIE tout ce qu'elle réclame.** `next build` n'émettait aucune PAGE
d'App Router (`app-path-routes-manifest.json` = `{"/healthz/route":"/healthz"}`), donc la limite
`/_not-found` n'existait pas : `/__v3/quoi-que-ce-soit` répondait le **404 anglais du routeur
Pages**, sans `<html lang>`, sans le script anti-flash de thème, hors design system — et cette page
était publiquement joignable, PRIORITAIRE sur le legacy. Le dépôt le SAVAIT (le message de
`check-app-router-built.mjs` le dit mot pour mot) mais l'imprimait avec un `!` non bloquant, et
personne n'avait relié ce constat au fait que le lot rendait justement ce chemin atteignable.

> **Un préfixe d'assets répond « où sont mes bundles », jamais « où est la frontière de ma zone ».**
> La question à poser à une zone n'est pas « les chunks arrivent-ils ? » mais **« qu'est-ce que
> cette application sert à une URL que la règle ne réclame pas — et qu'est-ce que la règle réclame
> que cette application ne sert pas ? »**. Les deux sens coûtent : le premier fait servir un actif
> de la v3 par le legacy, le second publie une page d'erreur que personne n'a dessinée. C'est le
> corollaire déjà écrit dans la conception (« tout chemin absent de la règle est servi par
> `apps/web` ») appliqué aux ACTIFS et plus seulement aux ROUTES — la moitié qui manquait.

**Ce qui l'attrape** (`scripts/check-v3-pipeline.mjs`, invariants 19-21, chacun sondé par une
mutation) : l'inventaire de ce que la zone sert se LIT sur le disque (`public/**`, conventions de
métadonnées, pages, route handlers), les chemins réclamés se LISENT dans la règle, et le garde
rougit dans les deux sens ; un troisième invariant tient ensemble `public/` et le `COPY` du runner.
La règle a été réduite à `PathPrefix('/__v3/_next')` — la zone d'assets, et rien d'autre tant
qu'aucune page n'est émise.

**Corollaire trouvé en passant, même famille — un fichier que le pipeline n'embarque pas.**
`.gitignore:28` (`**/*/*.d.*`) emportait `apps/web-v3/scripts/check-app-router-built.d.mts`, la
déclaration écrite à la main qu'importe `__tests__/app-router-build.test.ts`. Mesuré en déplaçant le
fichier : le type-check de `@meeshy/web-v3` — l'étape que ce lot venait de rendre **BLOQUANTE** —
tombe en `TS7016`. Le lot livrait donc un gate rouge au premier clone frais. Le garde le dit
désormais (invariant 22) en discriminant sur la SOURCE de la règle d'ignore : ce que le `.gitignore`
du paquet demande est voulu, ce qu'une règle de la racine emporte ne l'est pas.

> **Rendre une étape BLOQUANTE, c'est vérifier qu'elle passe sur un CLONE, pas sur son arbre de
> travail.** Un fichier présent sur le disque et absent du dépôt ne se voit dans aucun `run` local ;
> il se voit en une commande — `git ls-files --others --ignored --exclude-standard --directory` sur
> le paquet, puis `git check-ignore -v` sur ce qu'elle rend.
