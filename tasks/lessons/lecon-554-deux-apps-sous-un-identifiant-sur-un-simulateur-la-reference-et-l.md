## Leçon 554 — Deux apps sous UN identifiant, sur UN simulateur : la référence et l'objet testé échangent leurs places en silence

Le 2026-09-09, la phase de conception du tour 3 de web-v3 a « capturé l'écran iOS »
d'un fil avec média et d'une story sur le simulateur « Meeshy Poc-Web-V31 », et a
décrit ce qu'elle voyait : contacts Kwame Mensah, Amina Diallo, Fatou Ba,
« absents de targets/seed.md », aucune story ouvrable. Ces noms sont les FIXTURES
de web-v3 (`apps/web-v3/src/lib/api/fixtures-base.ts`). L'agent regardait web-v3
dans sa coque Capacitor et le prenait pour `apps/ios` : les gates du tour 2 avaient
installé la coque (`App.app`) sur ce simulateur à 01:42, sous le même identifiant
`me.meeshy.app` que l'app native, et `simctl install` remplace sans un mot. Le
porteur l'a vu avant moi : « le tour prend exemple sur la mauvaise version d'iOS ».

**Pourquoi le garde-fou existant n'a pas tenu.** Le prompt disait déjà « le chemin
de `listapps` doit finir par Meeshy.app, pas App.app ». Une phrase de vérification
que l'agent PEUT sauter n'est pas une garde : rien ne l'obligeait à exécuter la
commande, et le drapeau bêta écrit par `defaults write` réussissait aussi bien sur
la coque, qui l'ignore. Tous les signaux « ça marche » étaient verts sur le
mauvais objet — la capture existait, elle était datée, elle avait un `.a11y.txt`.

**La forme générale.** Quand la RÉFÉRENCE et l'OBJET TESTÉ partagent un
emplacement (un identifiant de bundle, un port, un nom de conteneur, un chemin de
dist), toute étape qui installe l'un y efface l'autre, et l'étape aval qui
« regarde la référence » regarde ce qu'on vient de tester : une comparaison de soi
à soi, qui passe toujours. La règle : la référence vit sur SON emplacement, que le
pipeline de test n'écrit jamais ; et avant de la lire, on vérifie une propriété
que l'objet testé NE PEUT PAS avoir. Ici, trois : le chemin du bundle
(`/Meeshy.app`), l'arbre d'accessibilité (UN seul nœud = WKWebView, jamais une vue
native) et les DONNÉES (les comptes semés de `seed.md`, jamais les noms des
fixtures web). La troisième est la plus forte : elle ne dépend d'aucun outil, et
c'est elle que le rapport de l'agent avait déjà écrite sans la lire.

Détail : `.claude/workflows/meeshy-web-v3-bout-en-bout.js` § « DEUX SIMULATEURS »,
`apps/web-v3/targets/README.md` § « Comment ces cibles ont été prises »,
simulateur « Meeshy Ref-Native » (`3E761BC1-845D-49D2-8E4D-E0606E04D3E2`), #5805, #5806.
