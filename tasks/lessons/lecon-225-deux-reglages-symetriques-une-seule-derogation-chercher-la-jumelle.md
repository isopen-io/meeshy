## Leçon 225 — deux réglages symétriques, une seule dérogation : chercher la JUMELLE avant de croire la règle appliquée (2026-08-17, routine messaging, cycle 59)

`useInfiniteConversationsQuery` portait `refetchOnWindowFocus: false` avec un
commentaire de huit lignes qui énumérait précisément les trois dommages d'un refetch
d'infinite (N requêtes, écritures socket écrasées, ligne dupliquée à la frontière sous
pagination par OFFSET). Il ne portait pas `refetchOnReconnect: false` — et le
QueryClient global tourne en `'always'` sur les DEUX. Le dommage restait donc armé,
sur un déclencheur plus fréquent que celui qui avait été fermé.

Le fichier NOMMAIT `refetchOnReconnect` dix lignes plus haut, pour expliquer qu'il ne
couvre pas les coupures de socket — sans que personne remarque qu'il était toujours
actif à faire du mal. **Un réglage cité dans un commentaire pour son insuffisance
n'est pas un réglage désactivé.** Quand un filet de sécurité existe en paire
(focus/reconnect, mount/reconnect, add/remove), une dérogation posée sur un seul
membre est le défaut, pas la correction.

### Le corollaire qui compte : un témoin VERT au-dessus d'un défaut vivant

Le même déclencheur utilisateur (`window.online`) portait un SECOND chemin
destructeur, dans un autre fichier : un hook qui invalidait `['conversations']`,
préfixe de `['conversations','infinite']`. Corriger l'un des deux ne changeait RIEN à
la panne visible — et le témoin qui garde le premier passe au vert, parce qu'il ne
monte pas le hook du second.

**Règle : quand deux chemins pendent au même déclencheur, prouver les deux ROUGES
séparément avant de toucher au code.** Ici, un témoin jetable isolant le second (le
premier déjà neutralisé) a montré la page rejouée quand même. Sans cette mesure,
j'aurais livré une dérogation, un témoin vert, et une panne intacte. C'est la
troisième forme en trois cycles du même piège (cycle 58 §4.2, cycle 74 §1) : la
question à se poser n'est jamais « mon témoin passe-t-il ? » mais « **que verrait le
porteur si mon témoin passait et que le défaut restait ?** ».

### Et : un défaut déjà écrit dans le dépôt, classé trop bas

`docs/bandwidth-analysis/01-socketio.md` portait ce défaut en MOYENNE-15, bon fichier,
bonnes lignes — classé « gaspillage de bande passante, 100 KB ». Le préfixe de clé n'y
était pas relevé, donc ni le rejeu de TOUTES les pages, ni la ligne dupliquée. Sa
correction recommandée était littéralement ce qu'un autre module implémentait déjà.
**Un audit qui nomme un défaut dans le mauvais registre de gravité l'enterre plus
sûrement qu'un audit qui l'oublie** : l'entrée existe, donc personne ne la rouvre.
Devant une entrée d'audit ancienne, recalculer la sévérité depuis le code avant de la
croire.
