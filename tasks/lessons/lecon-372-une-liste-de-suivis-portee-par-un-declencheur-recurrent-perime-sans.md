## Leçon 372 — Une liste de suivis PORTÉE PAR UN DÉCLENCHEUR RÉCURRENT périme sans que rien ne le dise

Le 2026-08-31, la routine de la boucle de nuit portait, à chaque réveil, une
section « SUIVIS À OUVRIR EN ISSUES quand tu as un moment creux » — six entrées,
rédigées quand elles étaient vraies. Vérifiées une à une avant dépôt :

| entrée | état mesuré |
|---|---|
| quatre trous dans `routes/admin/users.ts` | **fait** — route souveraine extraite (`requireSovereign()`), seuil relevé à `canViewPresence`, aucun champ de jeton dans les `select` |
| hook `onRequest` de `@fastify/rate-limit` | **fait** (#4347) — `hook: 'preHandler'` dans les DEUX fichiers, plus un balayage qui le cliquette |
| découpage de `admin/agent.ts` (1977 l.) | **fait** — le fichier fait **85 lignes** |
| `analyticsConsentAt` + GET/PUT `/me/consents` | **présent** |
| `scope=hashtag\|sound` non fusionnés | **fusionnés** — union discriminée (`feed.ts:237-238`) |
| `thirdPartyServicesConsentAt` code mort | **partiel** — l'exigence est retirée, les références subsistent |

**Cinq sur six étaient périmées.** Les déposer aurait produit cinq issues
décrivant des défauts qui n'existent plus — du bruit qui coûte à qui les triera,
et qui décrédibilise les vraies.

> Une consigne figée dans un déclencheur récurrent est une **photographie** :
> elle était juste à l'instant où on l'a prise, et elle est rejouée à
> l'identique indéfiniment pendant que le dépôt avance. Le dépôt, lui, n'a
> aucun moyen de la corriger — elle ne vit pas dans le dépôt.

C'est la forme de la leçon 367 (« un décompte est une AFFIRMATION, y compris le
mien d'hier ») déplacée d'un inventaire vers une CONSIGNE. Et c'est plus
insidieux : un inventaire s'annonce comme un état, donc on pense à le
recompter ; une consigne s'annonce comme un ORDRE, et un ordre ne se vérifie
pas — il s'exécute.

**Règle** : avant de déposer une issue dictée par une consigne permanente,
mesurer que le défaut existe ENCORE. Le coût est d'un `grep` ; l'économie est
une issue fausse. Et quand la vérification renverse la consigne, c'est la
VÉRIFICATION qui gagne — puis on le dit, pour que la consigne soit corrigée à
sa source par qui en est propriétaire.

Corollaire sur la frontière : la consigne appartient à qui a créé la routine.
La corriger soi-même dans le déclencheur serait réécrire la demande de
quelqu'un d'autre à partir d'une sortie d'outil — ce qui n'est pas une demande.
On mesure, on documente ici, on remonte au porteur ; on ne réécrit pas sa
routine.
