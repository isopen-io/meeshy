## Leçon 24 — F61 soldé : le fallback `@username` de `parseMentions` gardait une frontière gauche ASCII, jumelle résiduelle de F57 (2026-07-04, itération 96)

Suite de la Leçon 44 (mention par préfixe) et de F57 (it.95, `hasMentions` ASCII→Unicode). Le module
`mention-parser.ts` déclare `NAME_BOUNDARY_LEFT = (?<![\p{L}\p{N}_])` comme **source de vérité unique**
de la frontière de nom. Le path `@DisplayName` (l.40) la réutilise avec le flag `u` ; mais le fallback
`@username` réimplémentait la frontière gauche à la main en ASCII (`/(?<![\w])@(\w{1,30})/g`, sans flag
`u`). Or `\w` ASCII = `[A-Za-z0-9_]` : dès que le caractère précédant le `@` est une lettre Unicode
(`é`, `à`, cyrillique…), le lookbehind ASCII échoue silencieusement et le `@` interne d'une adresse
e-mail est capturé comme mention. Repro vitest : `parseMentions('écris à André@atabeth.com',
[{username:'atabeth'}])` retournait `['u1']` (mauvais user notifié) alors que `Andre@atabeth.com`
(ASCII) rendait `[]` — même entrée, une lettre accentuée d'écart, résultat opposé. **Fix (1 ligne) :
réutiliser la constante — `new RegExp(\`${NAME_BOUNDARY_LEFT}@(\\w{1,30})\`, 'gu')`.** Le flag `u`
n'upgrade que la frontière gauche en Unicode ; `\w{1,30}` reste ASCII (usernames ASCII par validation —
intentionnel). Comportement strictement plus restrictif (rejette des faux positifs e-mail), aucun cas
de mention légitime affecté. RED→GREEN + suite `packages/shared` 1258/1258 + `tsc` 0 erreur. **Règle :
quand un module déclare une constante « source de vérité unique » pour une frontière/charset, AUCUN
chemin voisin ne doit réimplémenter la même frontière à la main — auditer TOUS les paths du module
(F57 avait unifié `hasMentions` + `@DisplayName` mais oublié le fallback `@username` : un seul path
oublié réintroduit la dérive ASCII↔Unicode).**
