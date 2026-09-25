/**
 * LA TRANSCRIPTION SUIT LA LECTURE (#6306) — loi PURE, aucune vue, aucun DOM.
 *
 * Miroir du karaoké d'iOS (`AudioPlayerView.swift:701`, « la transcription à
 * plat suit la LECTURE »), porté comme fonction plutôt que comme composant
 * pour que les deux plateformes se vérifient sur les mêmes cas.
 *
 * **La donnée existait déjà, et rien ne la lisait.** `TranscriptionSegment`
 * (`packages/shared/types/attachment-transcription.ts`) porte `startMs`,
 * `endMs`, `text` et `speakerId` ; `Attachment.transcription.segments` voyage
 * jusqu'au web. Le fil n'en prenait que `.text` (`api/prism.ts`) : les segments
 * arrivaient et aucun consommateur ne les regardait. Ce lot ne va donc RIEN
 * chercher de neuf à la passerelle — il lit ce qui dormait.
 */

/** Ce que la loi exige d'un segment — un sous-ensemble de `TranscriptionSegment`. */
export type TimedSegment = {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
};

/**
 * Trie par instant de DÉPART sans muter l'entrée.
 *
 * La passerelle ne garantit pas l'ordre du tableau, et s'y fier ferait dépendre
 * l'affichage d'un détail de sérialisation — une transcription juste
 * s'allumerait dans le désordre selon la façon dont le JSON a été assemblé.
 */
const chronologiques = (segments: readonly TimedSegment[]): readonly TimedSegment[] =>
  [...segments].sort((a, b) => a.startMs - b.startMs);

/**
 * L'index, DANS LE TABLEAU D'ORIGINE, du segment prononcé à `positionSeconds`.
 *
 * Trois règles, et chacune vient d'un défaut qu'elle évite :
 *
 * - **`start <= t < end`** : une borne appartient au segment qui COMMENCE. À
 *   1,000 s exactement, sans cette convention, deux segments se disent actifs —
 *   ou aucun, selon le sens des comparaisons.
 * - **Un TROU garde le précédent allumé.** Whisper laisse des blancs sur les
 *   silences ; éteindre pendant la respiration ferait clignoter la
 *   transcription à chaque pause de la voix.
 * - **Après la fin, le dernier RESTE.** La transcription se tait avant la
 *   piste (silence de queue) : rendre `null` éteindrait le karaoké sur les
 *   dernières secondes, ce qui se lit comme un bug d'affichage, pas comme un
 *   silence.
 *
 * Rend `null` pour une transcription vide, jamais `0` — un index par défaut
 * surlignerait un segment qui n'existe pas.
 */
export function activeSegmentIndex(
  segments: readonly TimedSegment[],
  positionSeconds: number,
): number | null {
  if (segments.length === 0) return null;

  const ms = Math.max(0, positionSeconds * 1000);
  const ordonnés = chronologiques(segments);

  // Le dernier segment dont le départ est déjà passé. Couvre d'un seul geste le
  // cas nominal, le trou (on garde le précédent) et la queue (on garde le
  // dernier) — trois branches deviennent une propriété.
  // `noUncheckedIndexedAccess` : un accès indexé rend `T | undefined`, même sur
  // un tableau qu'on vient de tester non vide. On part donc du premier élément
  // OBTENU, jamais d'un index supposé sûr.
  const [premier] = ordonnés;
  if (premier === undefined) return null;

  let candidat = premier;
  for (const segment of ordonnés) {
    if (segment.startMs > ms) break;
    candidat = segment;
  }
  const index = segments.indexOf(candidat);
  return index === -1 ? null : index;
}

/**
 * L'instant, EN SECONDES, où déplacer la lecture quand on touche un segment.
 *
 * Le geste attendu est « relis-moi ça » : on rend le DÉBUT, jamais le milieu ni
 * la fin, qui couperaient le mot que le lecteur vient de désigner. `null` pour
 * un index hors bornes — un appelant ne doit pas pouvoir déplacer la lecture
 * vers un segment qui n'existe pas.
 */
export function segmentSeekTarget(
  segments: readonly TimedSegment[],
  index: number,
): number | null {
  const segment = segments[index];
  return segment === undefined ? null : segment.startMs / 1000;
}

/** Ce que `karaokeSegments` lit d'une transcription — la forme audio/vidéo, sans l'exiger. */
type TranscriptionLike = { readonly language?: string; readonly segments?: readonly TimedSegment[] };

const timedOf = (value: unknown): readonly TimedSegment[] | undefined => {
  if (value === null || typeof value !== 'object' || !('segments' in value)) return undefined;
  const { segments } = value as { readonly segments?: unknown };
  return Array.isArray(segments) && segments.length > 0 ? (segments as readonly TimedSegment[]) : undefined;
};

/**
 * Les MOTS répartis sur la durée, au prorata de leur longueur (espace compris).
 *
 * Miroir du repli proportionnel d'iOS (`activeSegmentIndex`, « transcription
 * sans découpe temporelle → karaoké quand même synchronisé »), porté au mot
 * plutôt qu'au segment : un bloc unique surligné du début à la fin ne suit
 * rien. Une voix prononce un mot long plus longtemps qu'un mot court — la
 * longueur est la meilleure estimation que le texte seul autorise.
 */
const proportionalWords = (text: string, durationMs: number): readonly TimedSegment[] => {
  const words = text.split(/\s+/).filter((w) => w !== '');
  const weights = words.map((w) => w.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const bounds = weights.reduce<readonly number[]>((acc, w) => [...acc, (acc.at(-1) ?? 0) + w], [0]);
  return words.map((word, i) => ({
    startMs: Math.round(((bounds[i] ?? 0) / total) * durationMs),
    endMs: Math.round(((bounds[i + 1] ?? total) / total) * durationMs),
    text: word,
  }));
};

/**
 * LES BORNES DU TEXTE SERVI (#7911) — celles de la piste qu'on ENTEND.
 *
 * Miroir de `resolveDisplaySegments` (`AudioPlayerView+Transcription.swift:37`) :
 * 1. texte original ⇒ les segments de la transcription ;
 * 2. traduction ⇒ les segments de SA piste (`AttachmentTranslation.segments`) ;
 * 3. rien d'horodaté ⇒ les mots répartis sur la durée de la piste.
 *
 * **Garde : le texte et la piste parlent la MÊME langue.** Quand le Prisme sert
 * une traduction sans piste traduite, la voix reste l'originale : allumer le
 * texte français au rythme d'une voix anglaise affirmerait une synchronisation
 * qui n'existe pas (#6306, « un karaoké faux est pire qu'aucun karaoké »).
 */
export function karaokeSegments(params: {
  readonly transcription: TranscriptionLike | undefined;
  readonly translations: unknown;
  readonly servedText: string;
  readonly servedLanguage: string;
  readonly trackLanguage: string;
  readonly durationMs: number;
}): readonly TimedSegment[] | undefined {
  const { transcription, translations, servedText, servedLanguage, trackLanguage, durationMs } = params;
  if (servedText.trim() === '' || servedLanguage !== trackLanguage) return undefined;

  const stamped =
    servedLanguage === transcription?.language
      ? timedOf(transcription)
      : translations !== null && typeof translations === 'object'
        ? timedOf((translations as Readonly<Record<string, unknown>>)[servedLanguage])
        : undefined;
  if (stamped !== undefined) return stamped;

  return durationMs > 0 ? proportionalWords(servedText, durationMs) : undefined;
}

/** Le rôle d'un segment pendant l'écoute — `idle` partout quand rien ne joue. */
export type KaraokeTone = 'idle' | 'past' | 'active' | 'upcoming';

/**
 * Miroir de `inlineSegmentColor` (`AudioPlayerView+Transcription.swift:562`) :
 * l'actif ressort, les passés restent pleins, les suivants s'effacent — et à
 * l'arrêt (`active === null`) le texte redevient uniforme.
 */
export function karaokeTone(index: number, active: number | null): KaraokeTone {
  if (active === null) return 'idle';
  if (index === active) return 'active';
  return index < active ? 'past' : 'upcoming';
}
