import { META_TEXT_OPACITY } from '@/lib/reading-mode/metrics';

/**
 * L'HEURE D'UN MESSAGE SYSTÈME, au-dessus de lui — la même pour la rangée, la capsule et la carte d'appel.
 */
/* LA TEINTE (revue-correction #5936, défaut majeur 5) — `--color-ios-ink-2`
   à `META_TEXT_OPACITY` (0,55), le cran MÉTA déjà dérivé et déjà tenu pour
   AA ailleurs dans le fil (`.focal-meta`, `EditedMark`), JAMAIS
   `--color-meta` (0,50, le littéral que la régression F-083 avait laissé) :
   mesuré 2,44:1 (heure, clair) / 3,98:1 (texte) — sous AA dans les QUATRE
   runs, l'heure à un fantôme quasi invisible. `--color-ios-ink-2` seul
   n'est appliqué QU'UNE fois ici (pas de second `× 0.7` sur l'heure comme
   avant : une opacité composée deux fois assombrissait l'heure PLUS que le
   texte qu'elle précède). */
/* L'HEURE PRÉCÈDE TOUJOURS LE TEXTE, sur les DEUX peaux
   (`BubbleSystemNoticeView.swift:107-113`/`BubbleJoinNoticeView.swift`,
   `FocalSystemNoticeRow.swift`) : « un message système est un JALON du
   fil, pas une parole » — même sous la capsule des Bulles, iOS grave
   l'heure AU-DESSUS d'elle, jamais dedans. */

export function SystemNoticeTime({ timeString }: { readonly timeString: string }) {
  return (
    <time className="text-[9.5px] font-semibold" style={{ color: 'var(--color-ios-ink-2)', opacity: META_TEXT_OPACITY }} aria-hidden>
      {timeString}
    </time>
  );
}
