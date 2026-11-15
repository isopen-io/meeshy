## Leçon 278 — un garde-fou câblé au mauvais MOMENT du cycle de vie est du code mort que la forme du test ne peut pas voir (2026-08-24, routine appels)

`promoteRingingCallToCallKitIfNeeded()` (iOS `CallManager.swift`) existe pour
un cas précis : un appel entrant qui sonne EN APP (CallKit volontairement
sauté parce que l'app était au premier plan) doit être promu à CallKit s'il
passe en arrière-plan avant d'être décroché — sinon iOS peut suspendre l'app
en plein sonnage, sans carte d'appel verrouillée, et l'appel se perd
silencieusement. La fonction est correcte, testée, bien gardée. Le seul
endroit qui l'appelle est l'observateur `didEnterBackgroundNotification`, et
cet observateur n'était armé QUE par `startBackgroundMonitoring()`, appelée
depuis un SEUL site : `transitionToConnected()`.

Or la fonction ne fait quelque chose QUE quand l'appel sonne encore
(`callState == .ringing(isOutgoing: false)`) — c'est-à-dire précisément AVANT
que `transitionToConnected()` n'ait jamais pu s'exécuter. Les deux conditions
sont mutuellement exclusives par construction : le garde-fou entier était
inatteignable, une fenêtre de panne qui existait depuis l'introduction de la
fonction, en production, sans qu'aucun test ne rougisse.

### Pourquoi trois tests corrects n'ont rien vu

Les trois tests existants (`test_backgroundObserver_promotesStillRingingCallToCallKit`,
`test_promoteRingingCallToCallKitIfNeeded_guardsOnRingingIncomingNotYetOnCallKit`,
`test_promoteRingingCallToCallKitIfNeeded_neverPromotesInChina_evenWhileRinging`)
vérifient tous la FORME du code : « l'observateur appelle bien la fonction »,
« la fonction a bien les bons guards », « le guard régional est bien câblé ».
Aucun ne vérifie que l'observateur lui-même est un jour ARMÉ pendant que
l'appel sonne. La fonction et son appelant étaient chacun individuellement
irréprochables ; c'est la RELATION temporelle entre le moment où on les monte
et le moment où ils doivent agir qui était rompue — et aucun des trois tests
ne pose cette question-là.

> **Un test qui vérifie qu'un handler CONTIENT le bon appel ne vérifie pas
> que le handler est un jour MONTÉ au bon moment.** Pour un garde-fou dont
> l'utilité dépend d'une fenêtre temporelle (« pendant que X, avant que Y »),
> le test à écrire n'est pas seulement « la fonction fait-elle le bon geste ? »
> mais **« le site qui l'arme est-il vivant PENDANT la fenêtre qu'elle
> couvre ? »** — ici, l'armement au CONNECT ne peut pas couvrir une fenêtre
> qui se ferme avant le connect.

### Le correctif expose un second défaut latent

Rendre la promotion atteignable a immédiatement révélé un second bug resté
invisible tant que le premier chemin était mort : `startRingtone()` (jouée en
app quand CallKit est sauté) ne s'arrêtait jamais au moment de la promotion
réussie — CallKit joue alors SON PROPRE `ringtoneSound` (même asset
`Ringtone.caf`) par-dessus la boucle `AVAudioPlayer` encore active, dont la
session auto-activée (`.playAndRecord`) risque en prime de bloquer le
`didActivate` de CallKit. **Rendre un chemin mort à nouveau vivant peut
réveiller un défaut qui dormait DERRIÈRE lui** — le corriger dans le même lot,
pas dans un suivi, parce que le premier correctif seul aurait été une
régression (double sonnerie) dans le cas exact qu'il vise à réparer.
