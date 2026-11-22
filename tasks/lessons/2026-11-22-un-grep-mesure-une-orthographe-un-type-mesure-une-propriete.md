## Un `grep` mesure une ORTHOGRAPHE ; un type mesure une PROPRIÉTÉ (2026-11-22, #20292, cycle 217)

#20292 décrivait six lecteurs de la loi des droits d'un participant, avec une
colonne « la surcharge est-elle CHARGÉE ? » : `oui` pour trois sites, `non` pour
un, `à mesurer` pour un autre. Avant de corriger, le lot a REMESURÉ par
`grep anonymousSession` sur les cinq fichiers appelants, et le relevé a rendu
**l'inverse** de l'issue — aucun site ne nommait `anonymousSession` sur le chemin
de la fabrique, les deux seules occurrences trouvées vivant dans une AUTRE
fonction du même fichier.

**Les deux relevés étaient faux, en sens opposés.** Le correctif a rendu le champ
REQUIS dans le type d'entrée de la fabrique, et le compilateur a tranché : **un
seul** des cinq sites rougissait. Les quatre autres portaient la surcharge
STRUCTURELLEMENT — leur ligne vient d'un `include` Prisma, qui garde le composite
sans que le mot apparaisse nulle part.

> **Une propriété de FORME se mesure avec le compilateur, jamais avec une
> recherche textuelle.** Un `grep` répond à « ce mot est-il écrit ici ? » ; la
> question posée était « cette ligne PORTE-t-elle ce champ ? », et les deux ne
> coïncident que lorsque le champ est projeté EXPLICITEMENT. Un `include`, un type
> dérivé (`Prisma.XGetPayload<…>`), un spread, un alias : chacun fait porter un
> champ à une ligne sans l'écrire.

Le sens de l'erreur n'est pas stable non plus — l'issue sur-comptait, le `grep`
sous-comptait. **On ne peut donc pas « corriger dans le bon sens » un relevé
textuel** : il faut changer d'instrument.

Le corollaire qui rend la règle actionnable : **quand la propriété qu'on veut
garder est une propriété de TYPE, la garde doit être un TYPE.** C'est ce que
l'issue appelait « une signature qui rende l'omission impossible », par
opposition à « un cliquet de projection sur les cinq `select` » — un cliquet
d'énumération ne voit que les sites qu'il nomme, et c'est précisément une
énumération qui a laissé cette famille vivre six fois ; un champ REQUIS couvre
les sites qui seront écrits demain, parce que l'omission y est une erreur de
compilation. Et surtout : **aucun témoin de VALEUR ne peut voir cette classe de
défaut** — un double Prisma rend ce qu'on lui dit, quel que soit le `select`,
donc un témoin de valeur reste VERT sur un site dont la requête ne ramène pas la
colonne. Le dépôt l'écrit déjà pour la résolution de langue (« le `select` est le
seul des trois qu'aucun témoin de rang ne peut voir ») : même propriété, autre
loi.

La question à poser, devant un tableau « ce site charge-t-il X ? » dans une
issue comme devant son propre `grep` qui le contredit : **qu'est-ce qui, dans ce
dépôt, ferait porter X à cette ligne sans écrire X ?** S'il existe une réponse —
et avec Prisma il y en a toujours une, `include` — le relevé textuel ne décide
pas. Faire décider le compilateur, et le laisser NOMMER les sites.

**Seconde moitié, du même lot : un témoin qui ne rougit pas accuse sa PRÉMISSE.**
Le lot a écrit un témoin censé prouver qu'un plan indisponible n'enfile rien. Il
est passé VERT du premier coup — pas parce que le code était juste, mais parce
que l'injection de panne ne se déclenchait **jamais** : elle faisait lever
`conversationShareLink.findMany`, que l'unité n'interroge que si une ligne porte
un `shareLinkId`, et les deux lignes du harnais avaient `shareLinkId: null`.
Devant un témoin qui ne tombe pas sous la mutation qu'il nomme, l'ordre des
suspects est donc : **la prémisse de l'injection d'abord, le témoin ensuite, le
code en dernier.** Ici la prémisse portait sur ce qu'une lecture INTERROGE, et la
réponse vivait dans une garde conditionnelle qu'aucune lecture du site d'appel ne
montre. C'est le jumeau de la leçon du cycle 214 (« une mutation qui ne rend pas
rouge accuse d'abord la MUTATION »), sur l'autre moitié du harnais : là c'était
la mutation qui était incomplète, ici l'injection de panne qui était inerte.

Sites : `packages/shared/utils/participant-rights.ts` (la loi déménagée et le
champ requis qui en découle, avec `participant-helpers.ts`),
`tasks/realtime-sync-audit-2026-11-22-cycle217-20292.md` (le journal du lot) et
`tasks/realtime-sync-audit-2026-11-22-cycle216-20305.md` (la prémisse inerte, en
détail).
