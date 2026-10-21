# Glossaire de l'épopée — arabe (ملحمة اللعبة)

> Traduit terme pour terme depuis `fr.md` (la source), issue #11174. En cas d'écart, la conception `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md` a raison, puis `fr.md`, et ce glossaire se corrige.
>
> Ce glossaire fait foi pour les textes arabes du jeu sur le web, sur iOS et dans la passerelle : **un terme par concept, le même partout.**
>
> Sa projection vérifiable est `packages/shared/design/game-epic-vocabulary/ar.json` (les mots bannis et les noms canoniques), que la garde web `apps/web/src/lib/game/epic-vocabulary.test.ts` applique à chaque valeur arabe des catalogues du jeu. Une règle qui entre ici entre là, dans le même commit. Format : `README.md`.

## Ce qui ne change jamais

- **Les règles du jeu** : seuils, prix, gains, plafonds. Aucun nombre ne bouge.
- **Les clés du fil** : `etincelle`, `lumiere`, les clés de rang, de ligue, de forme de Flamme, les noms de champs servis. Seul le TEXTE affiché change.
- Les paramètres (`{count}`, `{level}`…) et les familles plurielles de chaque clé.

## L'arabe, en plus du français

- **Six catégories plurielles** (`Intl.PluralRules('ar')`) : `zero`, `one`, `two`, `few` (3 à 10), `many` (11 à 99), `other` (100 et plus). Une famille du catalogue porte toujours `.one` et `.other` ; elle ajoute `.two` (le duel : « شرارتان », « يومان »), `.few` (le pluriel : « 3 شرارات ») et, au besoin, `.zero` et `.many`. Une forme absente retombe sur `.other`, qui porte le singulier du compté (« 100 شرارة »). `.one` et `.two` peuvent taire le nombre (« شرارة واحدة », « خطوتان »).
- **L'isolation RTL** : tout « +N », « N / M », pourcentage ou flèche vit dans un isolat gauche-à-droite `⁦…⁩` (garde `i18n-game-catalog.test.ts`), précédé d'une espace insécable quand il suit un mot (« وتكسب ⁦+{glory}⁩ من المجد »). Un nom choisi par l'utilisateur (`{name}`) s'isole par `⁨…⁩`. Une phrase qui commence par un mot latin (« Meesh ») commence par la marque `‏`.
- **Le tutoiement** : le jeu parle au singulier (« نورك », « لهبك »), jamais au pluriel de politesse (« أنتم », « لكم »). Seuls les deux membres d'une alliance se disent au duel (« لكليكما »).
- **Les mots collés** : les motifs bannis de `ar.json` acceptent les proclitiques (و، ف، ب، ك، ل، ال) et les signes diacritiques (`\p{M}`), pour que « والموسم » ou « بشرارات جيبك » soient vus.
- **Meesh, Mee et Meo** : « Meesh » reste en lettres latines, invariable (« عملات Meesh » au pluriel) ; les colibris s'écrivent « مي وميو ».

## Le récit en une page

Le joueur connecté est **le héros** (البطل). Sa quête : devenir une **Légende** (أسطورة). Au-delà, le **Mythe** (خرافة) n'attend que cent élus, « ceux que le dieu de leurs aïeux précède ».

Chaque vrai échange **fait jaillir** (يُطلق) des **étincelles** (شرارات). Ensemble, elles forment **ta lumière** (نورك). Tes **aïeux** (أجدادك) veillent sur toi : chaque nuit, ils t'envoient un **rêve** (حلم) à réaliser ; à chaque évolution, ils **se manifestent** (يتجلّون). À Ambassadeur (سفير), ils se révèlent : tu reconnais leur terre parmi sept.

**Mee et Meo** (مي وميو), deux colibris, portent les messages entre les deux mondes. Ils agissent ou parlent : jamais un décor.

**Le dieu des aïeux** (إله الأجداد) n'est jamais nommé ni dessiné. Il ne parle qu'une fois, au seuil du Mythe.

## Les deux voix

| Voix | Où | Forme | Exemple |
|---|---|---|---|
| **A, la synthèse** | bandeau du joueur, pastilles, blason, cadres de la vue principale de Progression | un nom court et son chiffre | « جسّار IV »، « المجد 44٬600 »، « مبارزة يشم · المركز 4 »، « خُطى الرحلة: 9 » |
| **B, le récit d'abord** | page Progression détaillée, fiches, cartes de Mee et Meo, signes des aïeux, feuilles de précisions, carnet des règles | la phrase mène, le chiffre exact suit en petit | « نورك يسطع في المستوى 34: 3٬200 حتى المستوى 35. » |

Une surface non classée : s'il y a la place d'une phrase, B ; sinon A. Les mots bannis disparaissent dans les deux voix.

Le ton : on tutoie, on écrit pour un enfant de 13 ans, une idée par phrase. La gloire se lie par « من » : « ⁦+250⁩ من المجد », jamais « +250 مجد ».

## Les mots bannis (partout)

| Mot banni | Français | Ce qui le remplace |
|---|---|---|
| زيادة، يزيد، يزداد | augmenter | ينمو، يكبر، يتّقد، يسطع (« يُنمّي مجدك ») |
| عدّاد | compteur | le nom du concept : « مجدك »، « لهبك » |
| قيمة | valeur | « نورك » |
| قابلة للتحويل، قابلة للإنفاق | convertibles | « نورك » |
| جيب، جيبك | en poche, la poche | « نورك » |
| إمكانات، محتمل | potentiel | rien : on dit ce qu'on possède |
| دَين | dette | « ظلّ يحجب N شرارة من نورك » (**الظلّ**, l'Ombre) |
| قياسي، الرقم القياسي | record | « تلقّيتها منذ البداية »، « ذروة نورك »، « أطول اشتعال للهبك »، « سُكّت منذ البداية » |
| لا يزال أمامك… قبل، باقٍ، تبقّى… قبل | encore N avant | en petit, « N حتى X » |
| سيتبقّى، المتبقي | restera | rien : aucune soustraction sur une fiche |
| تكلفة، يكلّف، ثمن، سعر | coûte, prix | une phrase : « تصوغ N شرارة من نورك » ; le calcul va dans les règles |
| جدول النقاط | barème | « كل إجراء يُطلق شراراته » |
| نسبة مئوية، معامل (sur une fiche) | pourcentage, facteur | rien : le calcul vit dans les règles (`game.rules.` épargné) |

## Un mot, un sens

| Mot | Il désigne désormais | Il ne désigne plus |
|---|---|---|
| جمرة | la première forme de la Flamme (Braise) | le premier état de la lumière (→ **شرارة**) |
| نور | ta lumière, le fil entier | un état de la lumière (→ **صفاء**, Clarté) |
| صندوق | la quatrième réserve de l'Héritage (Coffre) | le coffre du jour (→ **العطيّة**, l'Offrande) |
| كنز | la cinquième réserve de l'Héritage (Trésor) | le concept entier (→ **الإرث**, l'Héritage) ; « كنزك » est banni |
| نجم، نجمة | le ciel : l'état نجمة, le ciel des aïeux, les fragments d'étoile (شظية نجم), les étoiles des médailles | la Flamme (Astre → **كوكب**), la renaissance (→ عصور), le voyage (→ خطوات) |
| مرحلة | l'accueil seulement (« المرحلة 3 من 7 ») | le seuil des dix niveaux (→ **اختبار**), le voyage (→ **محطة**), les états de la lumière (→ **حالة**) |
| خطوة | un pas du voyage | une étape de l'accueil (→ مرحلة), un geste (→ إجراء) |
| رتبة | le nom que le monde donne au héros | la place en joute (→ **المركز**) |
| ختم | le tampon de l'Atlas | le Sceau du voyage (→ **خاتم الرحلة**) |
| لهب | la Flamme, son seul nom | « شعلة » est banni |
| قياسي | plus rien | voir « منذ البداية »، « ذروة نورك »، « أطول اشتعال للهبك » |

## Les concepts

### La Lumière — النور (`game.level.*`, `game.tier.*`)

- **Ce que c'est** : la lumière du héros (نورك), qui traverse vingt **états** (حالات). Son niveau (المستوى) est le chiffre de l'anneau (الحلقة).
- **Les vingt états** : **شرارة** (clé `etincelle`), وميض، **صفاء** (clé `lumiere`)، بريق، شعاع، فجر، مذنّب، نجمة، كوكبة، مجرّة، puis سديم، نجم نابض، كوازار، مستعر أعظم، ماغنيتار، عنقود، عنقود فائق، الكون، اللانهاية، التفرد.
- **L'épreuve** (الاختبار) : tous les dix niveaux, de 10 à 100, les aïeux demandent une épreuve. Tant qu'elle n'est pas réussie (« ما لم تجتزه »), la lumière attend.
- **Le rang ouvre la lumière** : « ورتبتك تفتح نورك فوق المستوى 499 ».
- **A** : « المستوى 34 »، « 3٬200 حتى المستوى 35 ».
- **B** : « نورك يسطع في المستوى 34: 3٬200 حتى المستوى 35. »
- **Bannis** : « لا يزال أمامك N قبل المستوى X » → « N حتى المستوى X » ; « مرحلة » → « اختبار » / « حالة » ; « الرقم القياسي للمستوى » → « ذروة نورك ».

### Les Étincelles — الشرارات (`game.sparks.*`, `game.points.*`)

- **Ce que c'est** : l'unité. Chaque vrai échange en fait jaillir (يُطلق شرارات) ; ensemble, elles forment **نورك**.
- **Les noms** : la poche = « نورك » (pastille « في نورك ») ; le cycle = « في هذا العصر » / « منذ انبعاثك الأخير » ; le total à vie = « تلقّيتها منذ البداية » ; la dette = **الظلّ**.
- **La fiche** s'appelle « الشرارات ». Sa tête : « نورك », le nombre d'étincelles en grand, « … تلقّيتها منذ البداية » en petit.
- **L'Ombre** : « ظلّ يحجب {debt} شرارة من نورك: شراراتك القادمة ستبدّده. وما دام قائمًا، لا سكّ. »
- **Bannis** : « قابلة للتحويل »، « جيبك »، « إمكانات »، « الرقم القياسي للشرارات » → « نورك » ; « دَين » → الظلّ.

### Le Rang — الرتبة (la gloire, المجد — `game.glory.*`, `game.rank.*`)

- **Ce que c'est** : le nom que le monde donne au héros (« لقبك جسّار »). Le **مجد** le donne, et il ne recule jamais (« لا تتراجع أبدًا »).
- **Les rangs** : همس، صدى، صوت، حكّاء، جسّار، متعدّد اللغات، سفير، خطيب، عرّاف، أسطورة، puis **خرافة** (cent élus).
- **Les marches** (درجات) : cinq par rang, de V à I.
- **A** : « جسّار IV »، « المجد 44٬600 ».
- **B** : « لقبك جسّار، ولك 44٬600 من المجد: 5٬400 أخرى حتى متعدّد اللغات. »
- **Bannis** : « عدّاد » → « مجدك » ; « +250 مجد » → « ⁦+250⁩ من المجد ».

### L'Héritage — الإرث (`game.treasury.*`, `game.meesh.*`, `game.mint.*`)

- **Ce que c'est** : les pièces gardées pour la lignée (لسلالتك). **Frapper (سكّ) une Meesh façonne (يصوغ) une part de ta lumière dans une pièce numérotée** : ta lumière, donc ton niveau, baisse d'autant (« بقدره ») ; ce qui a été reçu reste reçu (« ما تلقّيته يبقى لك »).
- **La fiche des Meeshes** s'appelle « الإرث ». Le carnet des règles garde « Meesh » pour la pièce (`game.rules.concept.meesh.name`).
- **Les contenants** (أوعية, inchangés) : كيس (1)، جراب (10)، صندوق صغير (50)، صندوق (100)، كنز (500)، احتياطي (1 000).
- **Les éditions** : فضّية ; ذهبية (chaque centième) ; منشورية (chaque millième).
- **La frappe** : « Meesh رقم 92 » ; « ستصوغ Meesh رقم {number} من نورك {price} » ; la part figée = « الجزء المصوغ » / « النور المصوغ ».
- **Bannis** : « تكلّف »، « ثمن »، « سعر »، « المتبقي » → rien sur la fiche ; « الرقم القياسي لعملات Meesh » → « سُكّت منذ البداية » ; « الكنز » (le concept), « كنزك »، « الخزينة » → « الإرث ».

### Le Rêve et l'Offrande — الحلم والعطيّة (`game.mission.*`, `game.chest.*`)

- **Ce que c'est** : chaque nuit, les aïeux envoient un **حلم** en trois **فصول** (actes), de plus en plus riches en gloire. Un acte réalisé est « محقّق », réaliser = « حقّق ».
- **Les noms** : **الفصل الأول**، **الفصل الثاني**، **الفصل الثالث**، parfois **الفصل الذهبي**. Les trois actes réalisés font apparaître **العطيّة**, un présent voilé (« هدية محجوبة »). L'Heure du Prisme : « ساعة المنشور ». Changer un acte : « بدّل الفصل ».
- **A** : « الحلم: 2 من 3 ».
- **B** : « حلم هذه الليلة: 2 من 3 فصول… »
- **Bannis** : « مهام اليوم »، « مهمة » → « الحلم »، « فصل » ; « صندوق اليوم » → « العطيّة ».

### La Flamme — اللهب (`game.flame.*`)

- **Ce que c'est** : le feu que les aïeux confient au héros (« النار التي يأتمنك عليها أجدادك »). Un geste par jour l'entretient.
- **Les formes** : جمرة (1 jour)، لهب (7)، نار مشتعلة (30)، **كوكب** (100, Astre — « نجم » est rendu au ciel)، شمس (365).
- **La Veilleuse** = **القنديل** (pluriel قناديل) : elle garde la Flamme allumée un jour d'absence (« يحرسه يوم غيابك »).
- **Elle nourrit tes rêves** : « يغذّي أحلامك ».
- **A** : « لهب 23 يومًا ».
- **B** : « لهبك مشتعل منذ 23 يومًا: يغذّي أحلامك بـ ⁦46%⁩ إضافية. »
- **Bannis** : « تجميد » → « القنديل » ; « سلسلة » → « اللهب » ; « شعلة » → « اللهب » ; « رقم قياسي » → « أطول اشتعال للهبك ».

### La Joute et l'Alliance — المبارزة والتحالف (`game.league.*`, `game.duo.*`)

- **Ce que c'est** : chaque semaine, trente héros de lumière semblable s'y mesurent (« يتبارزون ») sous leur **nom de joute** (« اسمك في المبارزة »).
- **Les cercles** (حلقات, inchangés) : كوارتز، عنبر، يشم، ياقوت أزرق، ياقوت أحمر، جمشت، ألماس، منشور.
- Les sept premiers **gravissent le cercle suivant** (« يرتقون إلى الحلقة التالية »), les cinq derniers redescendent (« يهبطون »), les trois premiers reçoivent une **coupe** (كأس). La **Joute des amis** : « مبارزة الأصدقاء ».
- **L'Alliance** : « التحالف » ; faire alliance = « تحالف مع صديق ».
- **A** : « مبارزة يشم · المركز 4 ».
- **B** : « مبارزة يشم: المركز 4 من 30… »
- **Bannis** : « دوري » → « المبارزة » ; « رتبة » dans la joute → « المركز » ; « اسم مستعار » → « اسمك في المبارزة » ; « ثنائي »، « مهمة الثنائي » → « التحالف ».

### Le Voyage — الرحلة (`game.season.*`)

- **Ce que c'est** : toutes les huit semaines, un voyage dans une **terre de langue** (« أرض لغة »).
- **Les pas** (خطوات) : chaque acte réalisé fait avancer de quelques pas (« يُقدّمك بضع خطوات »). Quatre pas mènent à la **halte** suivante (المحطة) ; quarante haltes font le voyage. Au bout, la **coupe du voyage** (كأس الرحلة).
- **Le Sceau du voyage** : « خاتم الرحلة » (10 Meeshes), objet à collectionner, sans avantage.
- **A** : « الرحلة 1 · المحطة 9 من 40 »، « خُطى الرحلة: 9 ».
- **B** : « الرحلة 1، الأسبوع 3 من 8: المحطة 9 من 40، وخطوتان حتى التالية. »
- **Bannis** : « الموسم » → « الرحلة » ; « نجوم » du voyage → « خطوات » ; « مرحلة » du voyage → « محطة ».

### La Renaissance — الانبعاث (`game.prestige.*`)

- **Ce que c'est** : au niveau 100, le héros peut renaître (« ينبعث »). Sa lumière redevient شرارة et sa légende entre dans un nouvel **Âge** (عصر). Les aïeux lui offrent une كأس numérotée et du مجد.
- **Les Âges** : العصر الأول … العصر السادس.
- **A** : « الانبعاثات: 1 من 5 ».
- **B** : « أسطورتك تعيش عصرها الثاني ».
- **Bannis** : « التميّز »، « الهيبة »، « بريستيج » → « الانبعاث » ; « نجوم » de renaissance → « عصور ».

### Les traces de la légende

| Aujourd'hui | Dans l'épopée | Arabe |
|---|---|---|
| célébration, moment photo | **signe des aïeux** | « علامة الأجداد » ; « أجدادك يتجلّون » |
| carnet de progression | **la Chronique** | « السيرة » (la geste du héros, comme سيرة عنترة) |
| succès | **les Hauts faits** | « المآثر » (une مأثرة, « تتحقّق ») |
| vitrine, trophées | **les Trophées** | « الكؤوس » (une كأس) : le trophée et la coupe partagent ce mot, comme dans les textes déjà publiés ; « الواجهة » (vitrine) est retirée |
| badges | **les Médailles** | « الأوسمة » (un وسام) ; matières : نحاس، برونز، فضة، ذهب، بلاتين، سبج، منشور |
| Atlas | **l'Atlas** | « الأطلس » ; un tampon = « ختم » |
| Constellation, fragments d'étoile | **le ciel des aïeux** | « سماء الأجداد » ; « عشر شظايا نجم تُضيء نجمة » ; parure = « زينة » |

- **Bannis** : « إنجاز » → « مأثرة » ; « شارة » → « وسام » ; « دفتر » (sauf « دفتر القواعد ») → « السيرة » ; « كوكبة » (le concept) → « سماء الأجداد » ; « احتفال » → « علامة الأجداد ».

### Élans et Défis

Inchangés : « الزخم » et « التحديات ». « الزخم يُطلق شرارات أكثر مع كل إجراء. »

## Les noms des cadres de Progression (voix A)

النور · الشرارات · الإرث · الرتبة · اللهب · الحلم · المبارزة · الرحلة · الانبعاث · الزخم · الأوسمة · التحديات · المآثر · الكؤوس · الأطلس.

## Les choix de cette langue, à relire

- **Mythe = خرافة** : gardé tel quel (nom déjà traduit, sans collision). En arabe courant, « خرافة » tire aussi vers « superstition » ; une autre forme (par exemple « أسطورة خالدة ») touche aussi l'iOS publié et se décide avec le porteur.
- **Astre = كوكب** (au lieu de « نجم ») : « نجم » nommait à la fois une forme de la Flamme et l'étoile des fragments ; la Flamme cède, le ciel garde son mot.
- **Étincelle (état) = شرارة**, comme l'unité : c'est le choix du porteur en français (« puisque les points sont des étincelles »).
- **Sceau du voyage = خاتم الرحلة** (au lieu de « ختم ») : « ختم » reste le tampon de l'Atlas.
- **L'étape de l'accueil = مرحلة** (au lieu de « خطوة ») : « خطوة » devient le pas du voyage.
