## Un contrôle qui REPART reste touchable — donc il RECOUVRE ce qu'on visait (2026-11-21, #20151)

**Mesurer le centre d'une cible puis frapper ses coordonnées suppose que, d'ici au toucher, rien ne s'est mis ENTRE les deux.** `centerOfSelector` + `page.touchscreen.tap` : deux allers-retours, et entre eux une interface qui bouge.

Le garde `check-calls-controls` a rougi sur deux PR sans rapport, sur un seul de ses quatre gabarits, avec les deux mêmes lignes (« le panneau du journal n'apparaît pas », puis « `[data-call-journal]` introuvable »). Une réexécution est passée — ce qui prouve l'intermittence, **jamais l'innocuité**.

### Ce que la mesure a dit, et ce qu'elle a démenti

Hypothèse écrite dans l'issue : *la pilule se replie encore, la boîte bouge.* Elle bouge, de **3 px en une image** — et ce n'était pas la cause : le point calculé restait DANS la boîte (`pointInBox: true`). La pile d'éléments à ce point l'a dit :

```
DIV[data-call-rail-scroll]                 ← ce qui reçoit le toucher
DIV.glass-call.pointer-events-auto[data-call-rail=call]
BUTTON[data-call-captions-journal]         ← la cible, DESSOUS
```

Le rail « L'appel » était **encore là, par-dessus**, en train de sortir. Le garde avait demandé sa fermeture puis n'avait attendu que l'ÉTAT (`data-call-layer === 'idle'`, qui bascule tout de suite) ; la sortie dure 300 ms, `pointer-events-auto` compris — et c'est **écrit, voulu, référencé** : « un rail qui repart reste TOUCHABLE jusqu'au bout de sa sortie (#17643), comme iOS ». Le produit a raison ; le garde frappait trop tôt.

Sans rien forcer : `elementFromPoint` au centre calculé rendait le rail **2 fois sur 4**, et le journal s'ouvrait pourtant 4 fois sur 4 — le rail était parti ENTRE le calcul et le toucher. En ralentissant la seule sortie des rails à 3 s, ce qui ne fait qu'élargir la fenêtre que la charge d'un coureur de CI élargit pour de vrai : **0 ouverture sur 5** avec l'ancien geste, **5 sur 5** avec le nouveau.

### Les trois règles

1. **Devant un toucher qui manque sa cible, ne pas demander « la boîte a-t-elle bougé ? » mais « qu'est-ce qui est AU-DESSUS de ce point ? »** — `document.elementsFromPoint` (pluriel) répond en une ligne et nomme le coupable. La première question a une réponse plausible (oui, de 3 px) qui ferme l'enquête sur une fausse piste.
2. **On ne frappe que ce qu'on ATTEINT.** Attendre que plus aucune animation FINIE ne tourne (une pulsation sans fin ne se termine jamais : elle ne s'attend pas), **et** vérifier que `elementFromPoint` au centre calculé atteint bien la cible. Jamais un `waitForTimeout`. Une cible durablement recouverte échoue alors **en le disant**, au lieu de deux lignes muettes sur un symptôme trois étages plus bas.
3. **Un comportement produit VOULU peut rendre tout geste par coordonnées intrinsèquement instable.** Ici la décision « un contrôle qui part reste touchable » est juste, et elle fait de chaque toucher calculé sur ce qui est dessous une course. Le correctif n'est pas de revenir sur la décision : c'est que l'instrument la CONNAISSE.

### Et un corollaire de lecture d'un rouge intermittent

« Un seul gabarit rougit, les trois autres passent » se lisait comme une propriété de ce gabarit (*le plus contraint, 320 px*). Faux : **le bloc n'existe qu'à ce gabarit** — aucune comparaison n'était possible, et 1 sur 1 n'est pas une distribution. Avant d'expliquer pourquoi un seul cas échoue, vérifier que les autres l'EXÉCUTENT.

Preuve : commentaire de mesure sur #20151, `scripts/check-calls-controls.mjs` (`posed` / `tapOn`), journal `tasks/web-gate-controls-flake-2026-11-21-20151.md`.
