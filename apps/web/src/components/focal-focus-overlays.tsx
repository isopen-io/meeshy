import { AuthorAvatar } from './author-avatar';
import { PersonName } from './person-name';
import { Check, Flags, PrismPastille, ReactionChip } from './message-blocks';
import {
  FLAG_LIMIT_MAGNIFIED,
  IDENTITY_AVATAR_SIZE,
  IDENTITY_CHIP_HEIGHT,
  IDENTITY_NAME_SIZE,
} from '@/lib/reading-mode/metrics';
import { focusStampLabel } from '@/lib/reading-mode/stamp';
import type { Delivery } from '@/lib/view/message';
import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { translate } from '@/lib/i18n-catalog';

/**
 * LES SUPERPOSITIONS DE LA RANGÉE ÉLUE (#5648) — extraites de `focal-row.tsx`
 * pour que la Lentille magnifiée (et les surfaces à venir) copient la MÊME
 * partition, plutôt que d'en réécrire une jumelle. Miroir de
 * `Main/Focal/Row/FocalRow.swift:848-1047`.
 *
 * QUATRE SUPERPOSITIONS, aucune ne réserve de hauteur — `position: absolute`
 * sur le bloc de contenu, TOUTES à l'intérieur du cadre de verre à
 * `--focus-card-margin` de ses bords (#8506, directive porteur 2026-09-28 :
 * « place les contrôleurs et détails à l'intérieur du cadre, en laissant de
 * l'espace sur les bords ») — l'identité et la bande ne chevauchent plus ses
 * lignes haute et basse ; ancré par les variables CSS de
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

/**
 * `continuation` — une SUITE de groupe n'a pas de ligne d'identité réservée
 * dans son flux : sa pastille d'identité se pose AU-DESSUS de sa première
 * ligne, et le cadre monte d'autant pour l'englober (#8506).
 */
export function FocusCard({ continuation = false }: { readonly continuation?: boolean }) {
  return (
    <div className="glass glass-card focus-card" aria-hidden {...(continuation ? { 'data-continuation': '' } : {})} />
  );
}

export function FocusIdentity({
  initials,
  name,
  accent,
  src,
  username,
  storyRing,
  continuation = false,
}: {
  /** Suite de groupe : la pastille se pose au-dessus de la première ligne (#8506). */
  readonly continuation?: boolean;
  readonly initials: string;
  readonly name: string;
  readonly accent: string;
  /**
   * OÙ MÈNE L'IDENTITÉ DE LA RANGÉE ÉLUE (#7528) — la puce RECOUVRE la ligne
   * d'identité (passée à `opacity: 0`) : sans ces deux valeurs, le doigt qui
   * touchait l'avatar ou le nom tombait sur une superposition inerte, et le
   * profil n'était plus atteignable sur la rangée même qu'on lit. Les deux
   * liens sont `redundant` : la puce est `aria-hidden`, et l'avatar de tête,
   * hors du masque, porte le chemin annoncé.
   */
  readonly username?: string | undefined;
  readonly storyRing?: AuthorStoryRing | undefined;
  /**
   * LA PHOTO DE L'EXPÉDITEUR (#6975) — RÉSOLUE PAR L'HÔTE, jamais ici : la
   * chip d'identité en focus est la superposition de la rangée qu'elle élit,
   * et `focal-row.tsx` a déjà descendu `participantAvatarOf(message.sender)`
   * pour son propre avatar. Deux descentes pour un même expéditeur, c'est la
   * paire qui finit par servir deux visages (`CLAUDE.md` § Prisme).
   */
  readonly src?: string;
}) {
  return (
    <div
      className="focus-identity flex items-center gap-1.5"
      style={{ minHeight: IDENTITY_CHIP_HEIGHT }}
      aria-hidden
      {...(continuation ? { 'data-continuation': '' } : {})}
    >
      <AuthorAvatar
        initials={initials}
        color={accent}
        size={IDENTITY_AVATAR_SIZE}
        {...(src === undefined ? {} : { src })}
        {...(typeof username === 'string' && username !== '' ? { profileUsername: username, name } : {})}
        {...(storyRing === undefined ? {} : { storyRing, name })}
        redundant
      />
      {/* `IDENTITY_NAME_SIZE` (13,5) est une cote GÉOMÉTRIQUE dérivée de
          `FocalMetrics.FocusStrip.identityNameSize` — un nombre, pas une
          couleur (D-4 vaut pour la palette) : elle voyage en style inline,
          comme `AVATAR_SIZE`/`TEXT_INDENT` le font déjà ailleurs dans ce
          fichier, plutôt que par une classe Tailwind inventée pour une
          seule cote sans équivalent de token. */}
      <PersonName
        name={name}
        username={username}
        {...(storyRing === undefined ? {} : { storyRing })}
        redundant
        className="font-semibold"
        style={{ color: 'var(--color-ios-ink)', fontSize: IDENTITY_NAME_SIZE }}
      />
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
  myReactions,
  onToggleReaction,
}: {
  readonly servedLanguage: string;
  readonly originalLanguage: string;
  readonly footerLanguages: readonly string[];
  readonly active: string | null;
  /**
   * LES DEUX PRISES DE LANGUE SONT OPTIONNELLES (#6862, revue-correction) —
   * la bande de focus est montée par la rangée ÉLUE, y compris chez un hôte en
   * LECTURE SEULE (l'administration). Sans elles, la pastille reste en
   * indicateur muet et les drapeaux ne se montent pas : un drapeau qui ne
   * change pas le texte lu est le contrôle sans effet de la loi 4.
   */
  readonly onToggleOriginal?: () => void;
  readonly onPickLanguage?: (code: string) => void;
  readonly reactions: readonly (readonly [string, number])[];
  /** Les emojis que CE lecteur a posés sur ce message — la capsule `mine`. */
  readonly myReactions?: readonly string[];
  /**
   * LA CAPSULE BASCULE (#8536, « l'idée est de rendre ces boutons d'action
   * rapides et accessibles ») — sur l'élu, TOUTE capsule est un bouton : la
   * mienne retire ma réaction, celle d'autrui y pose la mienne. Même loi que
   * le menu du message (`useMessageMenu.onMenuReact` → `toggleReactionPlan`).
   * Absente (hôte en lecture seule), la capsule reste inerte.
   */
  readonly onToggleReaction?: (emoji: string) => void;
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
                  language={currentInterfaceLanguage()}
                  subject="message"
            servedLanguage={servedLanguage}
            originalLanguage={originalLanguage}
            active={active}
            {...(onToggleOriginal === undefined ? {} : { onToggle: onToggleOriginal })}
          />
        </span>
      ) : null}
      {footerLanguages.length > 0 && onPickLanguage !== undefined ? (
        <span className="focus-chip">
          <Flags languages={footerLanguages} active={active} onPick={onPickLanguage} limit={FLAG_LIMIT_MAGNIFIED} />
        </span>
      ) : null}
      {reactions.map(([glyph, count]) => (
        <span key={glyph} className="focus-chip">
          <ReactionChip
            glyph={glyph}
            count={count}
            mine={myReactions?.includes(glyph) ?? false}
            {...(onToggleReaction === undefined ? {} : { onToggle: () => onToggleReaction(glyph) })}
          />
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
  onOpen,
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
  /**
   * OUVRE LA FICHE DU MESSAGE (#8536, « quand je touche la date : ça n'ouvre
   * pas les détails du message ») — le même panneau que « Plus… » au menu du
   * message. Présent, le tampon devient un BOUTON nommé comme la coche de la
   * bulle (`message-detail.open`) ; l'heure reste dans son `<time>`.
   */
  readonly onOpen?: () => void;
}) {
  const label = (
    <>
      {focusStampLabel({ sentAt, now, timeString, locale })}
      {isMine && delivery !== null ? (
        <span className="ms-1 inline-flex align-middle">
          <Check status={delivery} isMine={isMine} {...(sendStartedAt === undefined ? {} : { sendStartedAt })} />
        </span>
      ) : null}
    </>
  );
  const className = 'focus-stamp focus-chip text-time font-semibold tabular-nums';
  const style = { color: 'var(--color-ios-ink)' };
  if (onOpen === undefined) {
    return (
      <time className={className} dateTime={sentAt.toISOString()} style={style}>
        {label}
      </time>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={translate(currentInterfaceLanguage(), 'message-detail.open')}
      onClick={onOpen}
    >
      <time dateTime={sentAt.toISOString()}>{label}</time>
    </button>
  );
}
