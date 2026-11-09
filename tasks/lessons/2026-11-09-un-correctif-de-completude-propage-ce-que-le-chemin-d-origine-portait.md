## 2026-11-09 — Un correctif de COMPLÉTUDE propage ce que le chemin d'origine portait : avant de faire voyager un champ sur trois chemins, demander ce qu'il fait sur le premier (#17080, #17177)

#17080 est un lot de complétude, et son énoncé est irréprochable : un champ
voyage sur un éventail et manque aux deux autres, le symptôme est visible, le
témoin s'écrit en une ligne. Le geste évident — le passer aux deux autres —
aurait **triplé une fuite** que l'éventail de référence portait déjà.

Le cadrage l'a trouvé avant la première ligne de code, en posant au champ la
question qu'on pose d'ordinaire à une garde : *qu'est-ce qui l'autorise, là où il
voyage déjà ?* Réponse : rien. `createNotification` posait
`encryptedContent: context.encryptedContent || ''` sous `showPreview` et sous
rien d'autre — ni le verrou `notificationLocKey` qui garde le détail douze
lignes plus haut, ni le prédicat qui garde le média.

> **Un champ qu'on s'apprête à RÉPANDRE doit être audité comme s'il était
> nouveau.** Le fait qu'il voyage déjà sur un chemin de production se lit comme
> une autorisation ; ce n'est qu'une ancienneté. Et la question est bon marché :
> elle se pose une fois, au cadrage, sur le site d'origine — pas sur les deux
> sites qu'on allait écrire.

Conséquence de lot : les deux moitiés ne se livrent pas séparément. Livrer
#17080 seul aurait porté la fuite à la RÉPONSE et à la MENTION — dont la
bannière perce la sourdine — pendant que l'issue de la fuite serait restée
ouverte, étiquetée « trouvée en chemin ».

Corollaire de forme, du même lot : **deux sources pour une décision valent mieux
être une seule, et le choix se fait sur l'appelant le plus PAUVRE.** La règle
est appliquée par l'éventail d'envoi (qui tient le message en mémoire) et par la
relecture partagée (`MessageBannerSource.deviceEnvelope`) — pas par un
paramètre, parce que le chemin d'ÉDITION appelle le lot de mentions sans
composer aucune charge push et ne l'aurait jamais câblé. « Une garde de
confidentialité se relit CHEZ ELLE, pas dans ses paramètres » vaut dans les deux
sens : un paramètre dont l'absence RETIRE une feature est un demi-correctif
autant qu'un paramètre dont l'absence désactive une garde.
