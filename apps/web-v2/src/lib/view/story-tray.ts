import type { StoryTrayAuthor, StoryTrayPost } from '@/lib/api/stories';

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
};

function instantOf(value: string | Date | undefined): number {
  if (value === undefined) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * `viewedIds` — les stories que CE lecteur a ouvertes. La passerelle ne sert
 * pas « vue par moi » sur le plateau (`trayStorySelect` porte `viewCount`, un
 * COMPTE, qui ne dit pas QUI) : c'est donc au client de le tenir, exactement
 * comme `reaction-store.ts` tient « mes réactions » pour la même raison.
 * Un compte de 2 ne dit pas qui.
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

  const groupes: StoryTrayGroup[] = [];
  for (const [authorId, lot] of parAuteur) {
    const triees = [...lot].sort((a, b) => instantOf(b.createdAt) - instantOf(a.createdAt));
    groupes.push({
      authorId,
      author: triees[0]?.author,
      stories: triees,
      latestAt: instantOf(triees[0]?.createdAt),
      hasUnseen: triees.some((s) => !options.viewedIds.has(s.id)),
      isMine: options.viewerId !== undefined && authorId === options.viewerId,
    });
  }

  // Trois rangs, jamais une date seule : moi, puis le non-vu, puis le vu.
  return groupes.sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return b.latestAt - a.latestAt;
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
