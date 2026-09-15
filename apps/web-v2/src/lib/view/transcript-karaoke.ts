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
