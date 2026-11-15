## Un inventaire d'asymétries est une liste de QUESTIONS, pas de dettes

*Cycle 162 bis, #18537. Portée : tout cliquet qui fige un écart entre plateformes.*

Le cycle 161 a posé `socket-event-platform-parity-gate` : 29 événements « non portés par le web », sous une raison de famille juste — `apps/web` suit l'interface iOS, et « iOS et Android le lisent, le web pas encore » y est l'état NORMAL d'une feature non portée. Le cycle 161 a explicitement refusé d'en faire 32 issues de portage, pour ne pas substituer son verdict à celui du produit. C'était la bonne décision.

Deux des 29 n'étaient pas dans ce cas, et c'est précisément ce que l'inventaire permet de découvrir : `audio:transcription-failed` et `audio:translation-failed` ne manquaient pas à une feature non portée. Ils manquaient à une feature **déjà portée**, dont l'état d'échec était DESSINÉ — la puce « Transcription… », le plafond de silence de 90 s, la phrase « Transcription impossible » traduite dans les sept catalogues — et **jamais ALIMENTÉ**.

> **La question à poser à chaque ligne d'un tel inventaire n'est pas « faut-il la porter ? » mais « cette plateforme a-t-elle déjà l'ÉTAT que cet événement alimente ? ».** Si oui, ce n'est pas un portage qui manque — c'est une panne, et elle a au moins la priorité de la feature qu'elle dégrade.

Le symptôme, mesuré : la passerelle diffuse la panne en ~1 s ; le lecteur gardait la puce figée **90 secondes** (son plafond de silence), puis rendait la main **sans un mot**, le `notice` dessiné pour cette phrase exacte restant nul.

**Corollaire : un cliquet qui compte des CITATIONS ne prouve pas un branchement.** Mesuré sur ce lot — le cliquet de parité reste **VERT** si l'on retire le câblage de production, parce que les témoins neufs citent les deux constantes et qu'un fichier de test est une source comme une autre sous la racine balayée. Ce n'est pas une découverte : le doc-comment du cliquet l'écrit (« *cite* et non *écoute* »). Mais une limite écrite dans un doc-comment est inerte jusqu'au jour où quelqu'un appuie une DÉCISION sur l'outil. Ce jour-là, la relire fait partie du lot — et ce qui prouve le branchement est un témoin de SURFACE, partant de la CONSTANTE de contrat et traversant le site d'abonnement réel, jamais le cliquet.
