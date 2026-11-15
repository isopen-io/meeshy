## Leçon 7 — Un fix "documenté + testé" peut vivre dans un hook jamais monté (2026-07-03)
`apps/web/hooks/useCallSignaling.ts` (répertoire `components/video-calls/`, PLURIEL) porte une
ré-émission `call:join` au reconnect socket, entièrement testée (`useCallSignaling.reconnect.test.ts`
vert) et créditée dans le backlog comme le miroir web du `didReconnect` iOS — mais n'est importé nulle
part dans l'app réellement rendue. Le composant monté à `app/call/[callId]/page.tsx` est
`components/video-call/CallManager.tsx` (SINGULIER), qui réagit bien à `'connect'` mais ne fait que
ré-attacher des listeners d'événements, jamais ré-émettre `call:join` — rendant tout l'investissement
gateway "résilience restart/reconnect" inopérant côté web malgré un test vert qui semblait le prouver.
**Règle : avant de créditer un fix "hook + test passent" dans un backlog, vérifier que ce hook/composant
est réellement import-atteignable depuis une route rendue (`grep` l'arbre d'imports depuis `app/**/
page.tsx` jusqu'au fichier en question) — un test vert sur du code mort ne prouve rien en production.**
Variante du thème sibling-drift (#5/#40/#42/#45/#50/#51/#55) : ici la divergence n'est pas entre deux
implémentations actives, mais entre une implémentation active et un jumeau non branché au nom de
répertoire trompeur (`video-call` vs `video-calls`).
