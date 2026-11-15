# Onboarding post-inscription — le parcours (brouillon, 2026-09-24)

Décision porteur du 2026-09-24 : court, interactif, joué après l'inscription, sur iOS, Android (coque web-v2) et web. Chaque étape se termine par un **geste réel qui rapporte déjà des points**. Cible : les 16-25 ans. Règle : ≤ 2 gestes sur le chemin nominal, et la complexité se paie dans le code.

## 1. Ce que le système sait déjà créditer (relevé dans le code)

Tout passe par **`EngagementService.recordActivity(userId, axisKey)`** (`services/gateway/src/services/engagement/EngagementService.ts:226`). Chaque appel fait quatre choses : il incrémente `EngagementCounter`, il grave un badge au palier 1 (`BADGE_THRESHOLDS = [1,10,50,100,500]`), il évalue les 5 succès plats, et il appelle `updateStreak` et `updateEngagementScore`. Les points valent `poids × élan`. Les poids sont dans `packages/shared/types/engagement.ts` : contenu 9, social 7, conversation 5, commentaire 3, outil 1. Premier palier de niveau : **10 points**.

| Geste | Où le crédit est posé | Ce qui tombe au premier geste |
|---|---|---|
| Envoyer un message texte ou vocal | `messagePostSaveEffects.ts:309` → `content.text_message` / `content.audio_message` | 9 points, badge `:1`, succès `achievement.first_content` (ou `first_voice`), série démarrée à 1 jour, **niveau 1 franchi** (9 + 5 ≥ 10) |
| Premier message dans une conversation donnée | `messagePostSaveEffects.ts:286` → `recordConversationActivity` | 5 points de plus |
| Publier une story, un réel ou un post | `routes/posts/publication.ts:455-478` → `content.story` / `content.reel` / `content.post`, plus `tool.direct_publish` ou `tool.in_app_edit` | 9 + 1 points, badge, `first_content` ; `achievement.editor` si le média passe par le montage |
| Commenter un post | `routes/posts/comments.ts:460` → `comment.text` / `comment.audio` | 3 points |
| Amitié **acceptée** | `routes/directory/friend-requests-core.ts:408` → `social.friendship`, qui crédite **les deux** personnes | 7 points chacune |
| Partager un post, lien suivi, invitation | `PostService.ts:1753`, `TrackingLinkService.ts:179`, `AffiliateTrackingService.ts:167` | 7 points |
| Succès composés (grammaire) | `GlobalAchievements.recordEvent` en `origin: 'geste'` : `parole.message.send.count:1`, `parole.message.react.count:1`, etc. | Vue de révélation (`celebratesUnprompted`), **0 point** : un succès ne crédite jamais de points (#5758) |

### Ce qui manque côté gateway (à ouvrir en issues avant de construire)

1. **Aucun crédit pour une préférence** : langues, photo de profil, notifications. Un écran « choisis tes langues » ne rapporte donc rien aujourd'hui. Il faut soit un axe `profile.*` (non répétable, du genre `conversation.*` : un seul crédit par champ, porté par une contrainte unique), soit accepter qu'une étape de réglage ne rapporte pas de points et que sa récompense soit visuelle (voir l'étape 1).
2. **Défaut à corriger avant l'étape 2.** Meeshy Global est de type `'global'` (`InitService.ts:117`, `seed-meeshy-conversation.ts:135`). Or `messagePostSaveEffects.ts:281-284` ne connaît que `communityId`, `public` et « le reste ». Le premier « salut » dans Global crédite donc **`conversation.private`**, ce qui est faux. Il faut soit ajouter l'axe `conversation.global`, soit ranger `global` dans `public`.
3. **Envoyer une demande d'ami ne crédite rien** : seule l'acceptation crédite. Pendant l'onboarding, la récompense arrive donc plus tard. C'est le bon choix contre le spam de demandes, et il faut l'assumer dans le texte (« +7 quand elle accepte »).
4. **Pas de modèle « suivre »** (aucun `Follow` dans `schema.prisma`), et les **suggestions ne sont pas servies** (#3687). L'étape « ajoute 3 profils » dépend de #3687, ou d'un repli sur les auteurs récents du fil public ou de Global.
5. **Aucun état d'onboarding côté serveur.** Le schéma n'a que `profileCompletionRate` (`schema.prisma:248`).
6. **Aucune garde anti-contenu répété dans Global.** Le seul `isDuplicate` trouvé (`MessageHandler.ts:440`) est l'idempotence de l'envoi, pas une déduplication du texte. Relevé borné à `slowMode|isDuplicate|duplicateMessage` dans `services/gateway/src`.

## 2. Le parcours : 5 étapes

Chaque carte suit le même gabarit : une illustration animée en haut, une phrase, **un seul bouton principal pré-rempli** (le défaut juste) et un lien « Plus tard » discret. En bas, une jauge de 5 points se remplit, et un compteur « +N » s'envole vers la pastille de points du tableau de bord.

### Étape 1 — « Ta langue, ton monde »
- **FR** : « Ici, chacun écrit dans sa langue. Toi, tu lis tout dans la tienne. » — **EN** : "Everyone writes in their own language. You read it all in yours."
- **Visuel** : une bulle « Hola, ¿qué tal? » qui se retourne et devient « Salut, ça va ? ». C'est le Prisme, montré en 2 secondes.
- **Action** : la langue principale est **déjà remplie** avec la locale de l'appareil (4e rang du Prisme, promue ici comme défaut) et confirmée en 1 tap. On peut ajouter une seconde langue avec des puces (le « seconde langue » de #5221).
- **Récompense** : pas de points aujourd'hui (manque n° 1). Un aperçu de ce qui arrive : la jauge de la première étape s'allume et affiche « 0 / 10 pts pour ton premier niveau ». Si le lot gateway ajoute `profile.languages`, l'étape rapporte 1 point (poids outil).
- **Si on passe** : la langue d'inscription est gardée. Rien n'est perdu.

### Étape 2 — « Dis salut au monde » (Meeshy Global)
- **FR** : « Meeshy Global, c'est le salon où tout le monde traîne. Balance un salut, sans pression. » — **EN** : "Meeshy Global is where everyone hangs out. Drop a hi, no pressure."
- **Visuel** : un aperçu du salon avec 3 bulles récentes, dans la langue de l'utilisateur.
- **Action** : un composer **pré-rempli et modifiable**, envoyé en 1 tap (voir la parade anti-spam au § 5). Le bouton 🎤 enregistre un vocal à la place.
- **Récompense, déjà servie** : 9 + 5 points, badge « Premier message », succès `first_content` ou `first_voice`, **niveau 1 franchi**, série « 1 jour 🔥 ». La vue de révélation du succès s'ouvre toute seule : on la garde, c'est le pic émotionnel du parcours.
- **Si on passe** : Global reste dans la liste, épinglé. Un rappel unique arrive plus tard (§ 3).

### Étape 3 — « Montre-toi » (première story)
- **FR** : « Les amis se font en montrant qui tu es. Une photo, un mot : c'est une story, elle disparaît en 24 h. » — **EN** : "Friends come from showing who you are. One pic, one line — it's a story, gone in 24h."
- **Visuel** : un anneau de story qui se remplit autour de l'avatar.
- **Action** : la caméra ou la galerie s'ouvre directement, avec une légende pré-remplie éditable (« Nouveau sur Meeshy 👋 »). La visibilité **publique** est proposée par défaut **seulement à partir de 18 ans**. De 16 à 17 ans, le défaut est « amis » (§ 5). Si l'utilisateur ne publie rien, on propose de commenter un post public du fil (3 points).
- **Récompense** : 9 + 1 points, badge « Première story », et `tool.in_app_edit` puis `achievement.editor` si l'éditeur est utilisé. La jauge montre « +10 ».
- **Si on passe** : la bulle « + » de l'avatar dans le rail de stories reste là, sans relance.

### Étape 4 — « Trouve ta bande »
- **FR** : « Ajoute 3 personnes qui te ressemblent. Quand elles acceptent, vous gagnez +7 tous les deux. » — **EN** : "Add 3 people who vibe like you. When they accept, you both get +7."
- **Visuel** : 6 cartes de profils avec leurs langues en commun et un contenu récent.
- **Action** : « Ajouter » sur chaque carte, un geste par carte. La source est #3687 ; en repli, les auteurs actifs de Global ou du fil public qui partagent une langue. La carte s'affiche seulement si **aucun** profil de moins de 18 ans n'est suggéré à un adulte, et inversement.
- **Récompense** : différée et **annoncée honnêtement**. `social.friendship` tombe à l'acceptation, pour les deux côtés, avec une notification et le badge « Premier lien ».
- **Si on passe** : l'écran Contacts garde la section « Suggestions ».

### Étape 5 — « On te prévient quand ça bouge » (notifications, au bon moment)
- Cette étape n'est **proposée que si l'étape 2, 3 ou 4 a produit quelque chose** qui peut appeler une réponse. Le déclencheur est contextuel, c'est ce qui a été appris du carrousel #5218.
- **FR** : « Quelqu'un va te répondre. Tu veux le savoir tout de suite ? » — **EN** : "Someone's about to reply. Want to know right away?"
- **Action** : « Oui » ouvre la fenêtre système (1 geste). « Pas maintenant » ne la déclenche jamais : la fenêtre iOS ne sert qu'une fois, on ne la gaspille pas.
- **Récompense** : pas de points (on ne paie pas une permission, cf. App Review §5.1.1). L'écran se termine sur un récapitulatif : « +23 pts · niveau 1 · série 1 🔥 · 2 badges. Demain, ta série passe à 2. » Deux sorties : **« Continuer à explorer »** (vers Global) et **« C'est bon pour aujourd'hui »**.
- **Si on passe** : un bandeau in-app réapparaît au premier message reçu, une seule fois.

**Budget** : 5 cartes, 1 à 2 gestes chacune, **moins de 90 s** sur le chemin nominal. Un bouton « Passer tout » est visible dès la première carte.

## 3. Règles

- **Détection côté serveur**, pour valoir sur tous les appareils. Nouveau champ sur `User` : `onboardingCompletedAt DateTime?` (règle du dépôt : pas de booléen jumeau), plus `onboardingSteps String[]` (ids des étapes vues : `languages|global|story|friends|notifications`). Ils sont servis par `GET /me` et écrits par `PATCH /me/onboarding { step, outcome: 'done'|'skipped' }`, une requête idempotente. On **ne dérive pas** l'état de l'engagement : un compte qui a déjà posté ailleurs saute l'étape en question. En revanche, cette dérivation **sert à pré-cocher les étapes** (compteur `content.story` > 0 ⇒ étape 3 déjà faite).
- **Reprise** : on rouvre la première étape absente de `onboardingSteps`. Le client garde l'étape en cache (cache d'abord) et le serveur arbitre. Au-delà de 7 jours sans finir, on pose `onboardingCompletedAt` et on n'insiste plus.
- **Comptes existants** : pas de parcours. Ils voient **une carte unique**, qu'on peut fermer, dans l'écran Progression (« Nouveau : gagne des points en publiant »), et seulement si leur `engagementScore` est inférieur à 10. Les autres ont déjà compris.
- **Invités et anonymes** : aucun parcours. `EngagementCounter.userId` exige un `User.id`, comme la garde déjà présente dans `messagePostSaveEffects.ts`. À la place, une carte « Crée ton compte pour garder tes points ».
- **Accessibilité** : chaque carte est un seul conteneur VoiceOver/TalkBack dont l'ordre est titre, texte, action, « Plus tard ». Le « +N » est annoncé (`UIAccessibility.post(.announcement)`, `aria-live="polite"`). Les animations sont remplacées par un fondu si Reduce Motion est actif. Le texte suit Dynamic Type jusqu'à AX5, ce qui impose des cartes défilables, jamais tronquées. Les cibles font au moins 44 pt. En arabe, la mise en page passe en RTL et la jauge se remplit de droite à gauche. Textes dans les 7 langues du catalogue, sans `defaultValue` qui masquerait une clé absente.
- **Hors-ligne** : les étapes 1 et 5 sont locales. Le message de l'étape 2 passe par l'OfflineQueue, affiché de façon optimiste avec « +14 en attente ». La récompense ne s'affiche qu'une fois l'accusé de réception reçu, jamais inventée. Les étapes 3 et 4 affichent « Dispo quand tu es en ligne » et peuvent être passées.

## 4. Mesure (lien avec #5220)

#5220 pose `registration_opened`, `account_created` et `first_message_sent`. On y ajoute, dans le même tableau de bord et les mêmes 3 clients :
`onboarding_started` → `onboarding_step_viewed{step}` → `onboarding_step_done{step, ms}` | `onboarding_step_skipped{step}` → `onboarding_completed{steps_done, total_ms}` | `onboarding_abandoned{last_step}`.
Du côté serveur, qui fait foi : `onboarding_reward_granted{axisKey, points}`, lu depuis `EngagementCounter`.
Indicateurs : taux de fin par étape, part des « salut » **modifiés** (proxy d'authenticité), rétention J1/J7 selon le nombre d'étapes faites, acceptations d'amitié à J3, et p95 du « premier message après inscription » (critère de #5220 : moins de 3 min).

## 5. Risques et parades

**Pression sur les 16-17 ans.**
- On n'affiche jamais de message de perte (« ta série va mourir ») ni de compte à rebours.
- Les rappels de série passent en opt-in, et sont coupés de 22 h à 8 h.
- Pas de classement public.
- Publication publique non proposée par défaut aux mineurs, pas de suggestion croisée entre mineurs et adultes.
- Le récapitulatif propose toujours de s'arrêter (« C'est bon pour aujourd'hui »).
- L'âge vient de la date de naissance d'inscription. Si elle n'est pas connue, on applique le régime mineur (fail-closed).

**Spam de « salut » identiques dans Global.**
- **Pas un texte fixe, mais un choix aléatoire parmi environ 20 gabarits** par langue. Chacun contient un trou personnel (« Salut, moi c'est {pseudo}, je parle {langues} — qui est de {ville/pays} ? ») et le curseur se place sur le trou. Si le texte n'est pas modifié, il part quand même.
- Côté serveur, **les messages envoyés depuis l'onboarding sont regroupés** : `metadata.source = 'onboarding'`, et Global rend les nouveaux venus d'une même fenêtre de 10 minutes sous **une seule ligne système** (« 👋 Aïcha, Tom et 12 autres viennent d'arriver — dis-leur salut »), dépliable. Cela prolonge `postJoinSystemMessage`, qui existe déjà.
- Les points sont inchangés (le crédit n'est pas lié à la visibilité). En revanche, **un texte identique à l'un des 50 derniers de Global en moins de 10 min ne crédite pas `content.text_message`**. Cela revient à ajouter la garde qui manque (manque n° 6), mais seulement pour Global.
- **Limite de débit dans Global** : un message toutes les 30 s pendant les 24 premières heures du compte.

**Autres risques.**
- Gagner des points pour des gestes vides : les poids récompensent la production, et l'élan multiplie. On garde `tool.*` à 1.
- Parcours perçu comme une porte : « Passer tout » est visible, et il n'existe pas d'écran bloquant.
- Divergence entre clients : le parcours est **déclaré par le serveur** (liste d'étapes, gabarits, éligibilité), et les deux racines (iOS, web-v2) ne font que l'afficher.

## 6. Issues à ouvrir (proposition)

Un milestone : « Un nouveau compte gagne son premier niveau en moins de 2 minutes ». Il contient :
- (a) champ `onboardingCompletedAt`/`onboardingSteps` et route ;
- (b) axe `conversation.global`, avec correction du crédit `private` ;
- (c) axe `profile.*` non répétable (décision produit) ;
- (d) regroupement des arrivées et garde anti-doublon dans Global ;
- (e) régime mineur (défauts de visibilité et de suggestions) ;
- (f) écrans iOS ;
- (g) écrans web-v2 ;
- (h) événements du funnel, en extension de #5220.
Dépendances : #3687 (étape 4) et #5221 (étape 1).
