import type { StatusMoodPost, StoryTrayAuthor, StoryTrayPost } from '@/lib/api/stories';

/**
 * **LE GROUPEMENT PAR AUTEUR EST UN TRAVAIL DE VUE** (#6080).
 *
 * Le serveur sert une story par ligne (`trayStorySelect`) ; un rail montre un
 * cercle par AUTEUR. Sans ce groupement, publier trois stories d'affilée
 * peindrait trois fois le même avatar — ce que ni iOS ni aucun produit du
 * genre ne fait.
 *
 * **L'ordre est celui d'iOS, et il n'est pas « le plus récent d'abord »** :
 * `StoryTrayView` met en tête l'utilisateur connecté (sa propre story, qu'il
 * peut rouvrir et gérer), puis les auteurs NON VUS, puis les vus — chaque
 * groupe trié par sa story la plus récente. Un rail trié par date seule
 * enterre le non-vu sous le déjà-vu dès qu'un ami publie deux fois.
 *
 * **Rien ici ne connaît le réseau ni le défilement** : une fonction pure, donc
 * éprouvable sans monter l'écran (motif `lib/view/conversation.ts`).
 */
export type StoryTrayGroup = {
  readonly authorId: string;
  readonly author: StoryTrayAuthor | undefined;
  /** Les stories de cet auteur, la plus récente d'abord. */
  readonly stories: readonly StoryTrayPost[];
  /** La plus récente, pour le tri et pour la miniature. */
  readonly latestAt: number;
  /** Vrai tant qu'une story de l'auteur n'a pas été vue par le lecteur. */
  readonly hasUnseen: boolean;
  /** Vrai pour le groupe du lecteur lui-même — il ouvre la tête du rail. */
  readonly isMine: boolean;
  /** **PAR OÙ CE GROUPE S'OUVRE** (#5817) — l'adresse que la tuile pose dans
   * `/story/$post`. Portée par le GROUPE, jamais recalculée au site d'appel :
   * c'est ici, et seulement ici, qu'on sait quelles stories sont vues (le
   * verdict de la passerelle ET l'avance optimiste de la session). */
  readonly entryStoryId: string;
  /** L'humeur COURANTE de l'auteur (`Post.moodEmoji`, `?scope=statuses`) —
   * `undefined` tant qu'aucune humeur active n'existe. Résolue à part
   * (`withMoods`) : les stories et les statuts sont deux CORPUS distincts côté
   * passerelle (`GET /social/posts?scope=stories` / `?scope=statuses`), fusionnés
   * ici comme le fait `LentilleRailEntry.moodEmoji` côté iOS
   * (`StoriesVivantsRail.swift`) — une pastille porte les deux signaux. */
  readonly moodEmoji?: string | null;
};

function instantOf(value: string | Date | undefined): number {
  if (value === undefined) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * `viewedIds` — l'avance OPTIMISTE de la session (`api/story-viewed-store.ts`,
 * alimentée par `markStoryViewedAction` au moment même où la story s'affiche),
 * pour la fenêtre pendant laquelle la passerelle n'a pas encore reservi son
 * verdict.
 *
 * **La passerelle SERT bien « vue par moi » sur le plateau** — `isViewedByMe`
 * (`StoryTrayPost`, `lib/api/stories.ts`), posé par `PostFeedService.ts` sur
 * les DEUX projections (tray et complète). Le commentaire qui affirmait le
 * contraire ici était FAUX (défaut relevé § 2 de la spécification #5817,
 * corrigé dans ce lot). Les deux sources s'UNISSENT, elles ne se classent
 * pas : vue ⇔ la passerelle le dit OU ce lecteur vient de la voir.
 */
export function groupStoriesByAuthor(
  stories: readonly StoryTrayPost[],
  options: { readonly viewerId: string | undefined; readonly viewedIds: ReadonlySet<string> },
): readonly StoryTrayGroup[] {
  const parAuteur = new Map<string, StoryTrayPost[]>();
  for (const story of stories) {
    const authorId = story.author?.id;
    if (authorId === undefined) continue;
    const deja = parAuteur.get(authorId);
    if (deja === undefined) parAuteur.set(authorId, [story]);
    else deja.push(story);
  }

  /* LE VERDICT « VUE PAR MOI » SE PROJETTE UNE FOIS, ICI (#5817,
     revue-correction), et c'est une UNION MONOTONE, jamais une priorité :
     `isViewedByMe === true` (la passerelle) OU `viewedIds` (ce que ce lecteur
     vient de faire). Un `false` servi par la passerelle est un INSTANTANÉ, pris
     avant le `POST /posts/:id/view` que le lecteur vient d'émettre — le laisser
     gagner rallumait l'anneau d'une story qu'on venait de regarder, mesuré au
     pilotage navigateur (l'anneau d'Inès restait accentué après ses DEUX
     stories, le corpus de fixtures portant `isViewedByMe: false`). Rien ne
     peut rendre un « vu » local faux : on l'a vraiment vue.

     Le projeter SUR la story plutôt que de le recalculer à chaque lecture ferme
     la porte à une SECONDE loi : `hasUnseen`, `entryStoryId` et tout
     consommateur en aval lisent désormais le MÊME champ, et un site qui
     oublierait `viewedIds` ne peut plus diverger en silence. */
  const withSeenVerdict = (s: StoryTrayPost): StoryTrayPost => {
    const seen = s.isViewedByMe === true || options.viewedIds.has(s.id);
    return s.isViewedByMe === seen ? s : { ...s, isViewedByMe: seen };
  };

  const groupes: StoryTrayGroup[] = [];
  for (const [authorId, lot] of parAuteur) {
    const triees = lot.map(withSeenVerdict).sort((a, b) => instantOf(b.createdAt) - instantOf(a.createdAt));
    groupes.push({
      authorId,
      author: triees[0]?.author,
      stories: triees,
      latestAt: instantOf(triees[0]?.createdAt),
      hasUnseen: triees.some((s) => s.isViewedByMe !== true),
      isMine: options.viewerId !== undefined && authorId === options.viewerId,
      entryStoryId: entryStoryIdOf(triees),
    });
  }

  // Trois rangs, jamais une date seule : moi, puis le non-vu, puis le vu.
  return groupes.sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return b.latestAt - a.latestAt;
  });
}

/**
 * **FUSIONNE LE CORPUS DES HUMEURS DANS LES GROUPES DE STORIES** (#5652).
 *
 * Le rail « vivants » d'iOS peint UNE pastille par auteur, portant à la fois
 * l'anneau de story ET le badge d'humeur (`LentilleRailEntry.moodEmoji`,
 * `StoriesVivantsRail.swift`) — deux corpus, une seule vue. Ici, seuls les
 * auteurs qui ont DÉJÀ une entrée (au moins une story) reçoivent leur humeur :
 * un auteur qui n'a QU'un statut, sans story, n'a pas encore de pastille dans
 * ce rail — écart assumé de ce premier jet, la fusion complète (créer une
 * pastille pour un statut seul) est un travail de plus grande ampleur que ce
 * lot ne couvre pas.
 *
 * `Post.moodEmoji` (schema.prisma) — la PLUS RÉCENTE humeur de chaque auteur,
 * le corpus étant déjà trié `createdAt desc` par `PostFeedService.getStatuses`.
 */
export function withMoods(
  groups: readonly StoryTrayGroup[],
  moods: readonly StatusMoodPost[],
): readonly StoryTrayGroup[] {
  const moodByAuthor = new Map<string, string>();
  for (const post of moods) {
    const authorId = post.author?.id ?? post.authorId;
    if (authorId === undefined || moodByAuthor.has(authorId)) continue;
    if (post.moodEmoji === null || post.moodEmoji === undefined || post.moodEmoji === '') continue;
    moodByAuthor.set(authorId, post.moodEmoji);
  }
  if (moodByAuthor.size === 0) return groups;
  return groups.map((g) => {
    const mood = moodByAuthor.get(g.authorId);
    return mood === undefined ? g : { ...g, moodEmoji: mood };
  });
}

/** Le nom affiché, dans l'ordre de repli d'iOS — jamais un identifiant brut. */
export function storyAuthorLabel(group: StoryTrayGroup): string {
  const a = group.author;
  if (a === undefined) return '';
  if (group.isMine) return 'Votre story';
  const complet = [a.firstName, a.lastName].filter((p) => p !== undefined && p !== '').join(' ');
  return a.displayName ?? (complet !== '' ? complet : (a.username ?? ''));
}

/**
 * **LE RAIL TIENT-IL LA PLACE ?** — la loi, écrite une fois et mesurable.
 *
 * Le rail réserve sa hauteur pendant que son corpus est en vol : c'est ce qui
 * tient l'`offsetTop` du contenu identique avant et après la résolution (gate
 * de la passerelle, « AUCUN saut »). Rien de plus, et surtout pas plus
 * longtemps.
 *
 * **Un squelette est une PROMESSE, et une tentative qui a déjà échoué ne
 * promet plus rien.** Le prédicat d'origine — « aucune donnée ET pas d'erreur »
 * — restait vrai pendant TOUTES les nouvelles tentatives de react-query (trois
 * par défaut, en repli exponentiel). Corpus injoignable : le rail peignait sa
 * bande plusieurs secondes au-dessus d'un écran vide, puis disparaissait. Le
 * gate de la passerelle l'a chiffré — « peuplé 174 px, vide 174 px », quand
 * l'écart attendu était justement la hauteur du rail.
 *
 * `failureCount === 0` borne la promesse à la PREMIÈRE tentative : un corpus
 * LENT garde sa place, un corpus qui répond NON la perd immédiatement.
 */
export function railTientLaPlace(requete: {
  readonly data: unknown;
  readonly isError: boolean;
  readonly failureCount: number;
}): boolean {
  return requete.data === undefined && !requete.isError && requete.failureCount === 0;
}

/**
 * **PAR OÙ UN GROUPE S'OUVRE** (#5817) — le rail et la liste des stories
 * nomment une PERSONNE (`openingGroup`, `StoryViewerRequestOrigin.swift:18-49`) ;
 * c'est donc ICI, jamais dans le lecteur, que se décide QUELLE story de
 * cette personne ouvrir. Une seule adresse (`/story/$post`) sert alors les
 * deux intentions — targetingStory pour un lien direct, openingGroup pour un
 * tap de tuile qui a déjà résolu son entrée.
 *
 * **MÊME ORDRE que `entryIndexFor`** (`lib/stories/playback.ts`) — première
 * NON VUE en ordre de LECTURE (la plus ANCIENNE d'abord), sinon la plus
 * ancienne tout court. `stories` arrive ici trié DESC (l'ordre du PLATEAU,
 * pour l'anneau et la miniature) : le premier point de correction de ce lot
 * avait pris ce tri pour l'ordre de lecture et posait donc la story la plus
 * RÉCENTE en entrée — l'inverse exact d'`entryIndexFor`, qui lit le corpus
 * complet ASC.
 *
 * **CE QU'ELLE NE FAIT PAS, DÉLIBÉRÉMENT** : sauter les stories EXPIRÉES.
 * `entryIndexFor` le fait parce qu'il tient l'horloge du lecteur ; le plateau
 * ne la tient pas, et l'y injecter n'apporterait rien — l'adresse posée ici
 * est une ENTRÉE, et `resolvePlayablePosition` (le seul site qui connaît
 * `now`) avance jusqu'à la première story lisible depuis elle. Deux lois qui
 * se DISENT identiques et ne le sont pas coûtent plus cher qu'une frontière
 * dite à voix haute.
 */
export function entryStoryIdOf(stories: readonly StoryTrayPost[]): string {
  const oldestFirst = [...stories].sort((a, b) => instantOf(a.createdAt) - instantOf(b.createdAt));
  const unseen = oldestFirst.find((s) => s.isViewedByMe !== true);
  return (unseen ?? oldestFirst[0])?.id ?? '';
}
