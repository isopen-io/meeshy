import { Avatar } from './avatar';
import { Check, Flags, PrismPastille, ReactionChip } from './message-blocks';
import {
  FLAG_LIMIT_MAGNIFIED,
  IDENTITY_AVATAR_SIZE,
  IDENTITY_CHIP_HEIGHT,
  IDENTITY_NAME_SIZE,
} from '@/lib/reading-mode/metrics';
import { focusStampLabel } from '@/lib/reading-mode/stamp';
import type { Delivery } from '@/lib/view/message';

/**
 * LES SUPERPOSITIONS DE LA RANGÉE ÉLUE (#5648) — extraites de `focal-row.tsx`
 * pour que la Lentille magnifiée (et les surfaces à venir) copient la MÊME
 * partition, plutôt que d'en réécrire une jumelle. Miroir de
 * `Main/Focal/Row/FocalRow.swift:848-1047`.
 *
 * QUATRE SUPERPOSITIONS, aucune ne réserve de hauteur — `position: absolute`
 * sur le bloc de contenu, ancré par les variables CSS de
 * `reading-mode/metrics.ts::sceneStyleVars()` (posées sur `<main>` par
 * `thread.tsx`, héritées jusqu'ici) : élire une rangée ne fait JAMAIS sauter
 * ses voisines (`FocalRow.swift:168-170`, « largeur stable, zéro relayout »).
 *
 * `FocusCard` et `FocusIdentity` sont `aria-hidden` : ils DOUBLENT ce que la
 * rangée porte encore dans l'arbre (l'en-tête d'identité reste monté, à
 * `opacity: 0` — invisible à l'œil, lisible au lecteur d'écran). `FocusStamp`
 * reste LISIBLE (`<time>`) : c'est la seule information que le révélé retire
 * à une rangée non élue et que rien d'autre ne restitue.
 *
 * `FocusStrip`, lui, N'EST PAS `aria-hidden`, et c'est une CORRECTION de
 * revue (#5648) : il ne double rien — la ligne basse ordinaire passe à
 * `visibility: hidden` sur la rangée élue (`focal-row.tsx`, correction de
 * revue #5648 défaut bloquant 3 : la DÉMONTER faisait perdre 26 px à la
 * rangée et poussait cette bande SUR le texte qu'elle vient d'élire), donc
 * ces boutons sont les SEULS contrôles de Prisme ATTEIGNABLES de la rangée —
 * `visibility: hidden` retire les leurs du clavier et de l'arbre
 * d'accessibilité aussi sûrement qu'un démontage, juste sans reprendre leur
 * hauteur. Les masquer par `aria-hidden` seul (sans `visibility`) laissait
 * un `<button>` FOCALISABLE sous un `aria-hidden="true"` (anti-motif WCAG
 * mesuré : un lecteur d'écran ne l'annonce pas, la tabulation l'atteint
 * quand même) et retirait au lecteur d'écran la seule mention que ce
 * message est traduit.
 */

export function FocusCard() {
  return <div className="focus-card" aria-hidden />;
}

export function FocusIdentity({
  initials,
  name,
  accent,
}: {
  readonly initials: string;
  readonly name: string;
  readonly accent: string;
}) {
  return (
    <div
      className="focus-identity flex items-center gap-1.5"
      style={{ minHeight: IDENTITY_CHIP_HEIGHT }}
      aria-hidden
    >
      <Avatar initials={initials} color={accent} size={IDENTITY_AVATAR_SIZE} />
      {/* `IDENTITY_NAME_SIZE` (13,5) est une cote GÉOMÉTRIQUE dérivée de
          `FocalMetrics.FocusStrip.identityNameSize` — un nombre, pas une
          couleur (D-4 vaut pour la palette) : elle voyage en style inline,
          comme `AVATAR_SIZE`/`TEXT_INDENT` le font déjà ailleurs dans ce
          fichier, plutôt que par une classe Tailwind inventée pour une
          seule cote sans équivalent de token. */}
      <span className="font-semibold" style={{ color: 'var(--color-ios-ink)', fontSize: IDENTITY_NAME_SIZE }}>
        {name}
      </span>
    </div>
  );
}

export function FocusStrip({
  servedLanguage,
  originalLanguage,
  footerLanguages,
  active,
  onToggleOriginal,
  onPickLanguage,
  reactions,
}: {
  readonly servedLanguage: string;
  readonly originalLanguage: string;
  readonly footerLanguages: readonly string[];
  readonly active: string | null;
  readonly onToggleOriginal: () => void;
  readonly onPickLanguage: (code: string) => void;
  readonly reactions: readonly (readonly [string, number])[];
}) {
  /* `PrismPastille` rend `null` quand la langue servie EST la langue
     d'origine (rien à basculer) : sans cette garde, sa capsule restait
     montée, VIDE — une pilule de 32×24 teintée à l'accent, sans contenu ni
     effet, mesurée sur la capture `thread-focal-scene.dark.png` (correction
     de revue #5648). La capsule est le CADRE d'un contrôle, jamais une
     décoration autonome. */
  const showsPastille = servedLanguage !== originalLanguage;
  if (!showsPastille && footerLanguages.length === 0 && reactions.length === 0) return null;
  return (
    <div className="focus-strip flex items-center gap-1">
      {showsPastille ? (
        <span className="focus-chip">
          <PrismPastille
            servedLanguage={servedLanguage}
            originalLanguage={originalLanguage}
            active={active}
            onToggle={onToggleOriginal}
          />
        </span>
      ) : null}
      {footerLanguages.length > 0 ? (
        <span className="focus-chip">
          <Flags languages={footerLanguages} active={active} onPick={onPickLanguage} limit={FLAG_LIMIT_MAGNIFIED} />
        </span>
      ) : null}
      {reactions.map(([glyph, count]) => (
        <span key={glyph} className="focus-chip">
          <ReactionChip glyph={glyph} count={count} />
        </span>
      ))}
    </div>
  );
}

export function FocusStamp({
  sentAt,
  now,
  timeString,
  locale,
  delivery,
  isMine,
  sendStartedAt,
}: {
  readonly sentAt: Date;
  readonly now: Date;
  readonly timeString: string;
  readonly locale: string;
  /** `null` ⇒ aucun accusé peint — un envoi ÉCHOUÉ, dont la bande de reprise
   * porte seule l'état (`checkStatusOf`, `lib/view/message.ts`). */
  readonly delivery: Delivery | null;
  readonly isMine: boolean;
  /** #5813, étape 9 — même horloge des 200 ms que la colonne méta ordinaire. */
  readonly sendStartedAt?: number;
}) {
  return (
    <time
      className="focus-stamp focus-chip text-time font-semibold tabular-nums"
      dateTime={sentAt.toISOString()}
      style={{ color: 'var(--color-ios-ink)' }}
    >
      {focusStampLabel({ sentAt, now, timeString, locale })}
      {isMine && delivery !== null ? (
        <span className="ml-1 inline-flex align-middle">
          <Check status={delivery} isMine={isMine} {...(sendStartedAt === undefined ? {} : { sendStartedAt })} />
        </span>
      ) : null}
    </time>
  );
}
