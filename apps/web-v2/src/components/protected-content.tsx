import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  BLUR_RADIUS_PX,
  REVEAL_ERROR_NOTICE_MS,
  ephemeralOf,
  formatRemaining,
  rendersContent,
  requiresConsume,
  reveal,
  settle,
  settleFog,
  showsAffordance,
  surrogateOf,
  type ProtectionKind,
  type RevealPhase,
} from '@/lib/reading-mode/protection';

import { Glyph } from './glyph';

/**
 * LE VOILE, LE TOMBSTONE ET LE MINUTEUR — miroir de `FocalProtectedContent.swift`
 * (`apps/ios/Meeshy/Features/Main/Focal/Row/`) et de la protection intégrée
 * de `ThemedMessageBubble`/`BubbleStandardLayout.swift` (D-23, #5676), pour
 * les DEUX peaux du fil (`focal-row.tsx`, `bubble.tsx`) — UN composant, la
 * loi vit dans `lib/reading-mode/protection.ts`, jamais réécrite ici.
 *
 * ADAPTATION AU WEB (D-23 §1.4 point 1, la seule qui compte pour ce fichier) :
 * le contenu voilé N'ENTRE dans le DOM que pendant la fenêtre de révélation.
 * `<button data-protected="hidden">` ne monte QUE le substitut
 * (`surrogateOf`, dérivé de la seule LONGUEUR) — jamais `children`. Un
 * `filter: blur()` posé sur le VRAI texte serait la protection ANNONCÉE et
 * non APPLIQUÉE (CLAUDE.md, cycle 124).
 */

const defaultNow = (): number => Date.now();

export function ProtectedContent({
  messageId,
  kind,
  isViewOnce,
  contentLength,
  attachmentCount,
  surface,
  isMine = false,
  onConsumeViewOnce,
  now = defaultNow,
  children,
}: {
  readonly messageId: string;
  readonly kind: ProtectionKind;
  readonly isViewOnce: boolean;
  readonly contentLength: number;
  readonly attachmentCount: number;
  readonly surface: 'row' | 'bubble';
  readonly isMine?: boolean;
  readonly onConsumeViewOnce?: ((messageId: string) => Promise<boolean>) | undefined;
  readonly now?: (() => number) | undefined;
  readonly children: ReactNode;
}) {
  // Un message déjà `burned` À L'ARRIVÉE (viewOnceCount ≥ maxViewOnceCount,
  // jamais localement révélé) n'a AUCUNE fenêtre à ouvrir — `consumed`
  // d'emblée. Un message `veiled` part de `hidden`, MÊME s'il devient
  // `burned` un instant plus tard (la consommation serveur met à jour le
  // message AVANT que la fenêtre locale de 5 s ne s'éteigne) : c'est l'état
  // LOCAL, pas le `kind` du dernier rendu, qui pilote l'affichage — sinon le
  // tombstone couperait la fenêtre de révélation qu'on vient de payer
  // (D-23 §1.4 point 4, le comportement retenu est celui de la BULLE iOS).
  const [phase, setPhase] = useState<RevealPhase>(() => (kind === 'burned' ? { phase: 'consumed' } : { phase: 'hidden' }));
  const [pending, setPending] = useState(false);
  const [revealError, setRevealError] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (errorTimer.current !== null) clearTimeout(errorTimer.current);
    },
    [],
  );

  // LE PREMIER PAS hors de `revealed` : un minuteur posé sur `until`,
  // recalculé à chaque entrée en révélation, nettoyé au démontage — la
  // MÊME discipline que `cancel()` sur `BubbleBlurRevealLifecycle`. `settle`
  // n'atterrit plus directement sur `hidden`/`consumed` : il ouvre la
  // fenêtre de fermeture (`fogging`), que le second minuteur ci-dessous
  // referme.
  useEffect(() => {
    if (phase.phase !== 'revealed') return;
    const delay = Math.max(0, phase.until - now());
    const timer = setTimeout(() => {
      setPhase((current) => settle(current, { now: now(), isViewOnce }));
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, isViewOnce, now]);

  // LE SECOND PAS : le brouillard achève sa fermeture (`FOG_DURATION_MS`),
  // et `settleFog` rend la main au voile (`hidden`) ou au tombstone
  // (`consumed`). Deux minuteurs distincts plutôt qu'un seul recalculé,
  // pour la MÊME raison que ci-dessus — chacun n'agit que sur SA phase.
  useEffect(() => {
    if (phase.phase !== 'fogging') return;
    const delay = Math.max(0, phase.until - now());
    const timer = setTimeout(() => {
      setPhase((current) => settleFog(current, { now: now() }));
    }, delay);
    return () => clearTimeout(timer);
  }, [phase, now]);

  const onTap = useCallback(async () => {
    if (pending) return;
    if (requiresConsume({ isViewOnce })) {
      setPending(true);
      const ok = onConsumeViewOnce ? await onConsumeViewOnce(messageId) : false;
      setPending(false);
      if (!ok) {
        setRevealError(true);
        if (errorTimer.current !== null) clearTimeout(errorTimer.current);
        errorTimer.current = setTimeout(() => setRevealError(false), REVEAL_ERROR_NOTICE_MS);
        return;
      }
    }
    setPhase((current) => reveal(current, { now: now() }));
  }, [pending, isViewOnce, onConsumeViewOnce, messageId, now]);

  if (kind === 'deleted') return <ProtectionNotice kind="deleted" surface={surface} isMine={isMine} />;
  if (kind === 'expired') return null;
  if (kind === 'standard') return <>{children}</>;

  /**
   * LA MATRICE VIENT DE LA LOI, jamais d'un `if` recopié ici : `rendersContent`
   * et `showsAffordance` (`reading-mode/protection.ts`) sont les DEUX seules
   * réponses au « quand monter les enfants » et au « quand offrir le tap ».
   * Les rejouer dans ce fichier ferait exactement la jumelle que le
   * doc-comment de la loi interdit — et une jumelle que ses propres témoins
   * ne verraient pas (mesuré en revue : la loi était testée et n'était
   * appelée par aucun rendu).
   */
  if (rendersContent(kind, phase)) {
    // LE BROUILLARD JOUE À LA FERMETURE, PAS À L'OUVERTURE (D-23 §1.4 point 6,
    // revue #5676 défaut 5) : `data-protected` reste `"revealed"` pendant
    // les DEUX phases qui rendent le contenu ; seul `data-fog` bascule de
    // `"clear"` à `"closing"` quand `fogging` s'ouvre — le nœud
    // `.protected-fog` est déjà monté à ce moment (il ne NAÎT jamais
    // opaque), donc la transition CSS ordinaire suffit, sans
    // `@starting-style` ni second rendu.
    return (
      <div data-protected="revealed" className="protected-revealed">
        {children}
        <span className="protected-fog" data-fog={phase.phase === 'fogging' ? 'closing' : 'clear'} aria-hidden />
      </div>
    );
  }

  if (!showsAffordance(kind, phase)) {
    return <ProtectionNotice kind="burned" surface={surface} isMine={isMine} />;
  }

  // L'affordance — seule surface où le contenu n'a PAS encore de raison
  // d'exister dans le DOM.
  return (
    <>
      <button
        type="button"
        data-protected="hidden"
        data-surface={surface}
        className="protected-veil"
        aria-label="Contenu masqué"
        /* iOS sert DEUX chaînes distinctes — l'étiquette `bubble.content.hidden`
           et l'INDICE `bubble.content.hidden.hint` (`FocalProtectedContent.swift:56-73`).
           Sur le web, `aria-label` REMPLACE le contenu dans le calcul du nom
           accessible : le texte du `<span>` ci-dessous n'était donc annoncé par
           PERSONNE (mesuré en revue). `aria-describedby` le rend à sa vraie
           fonction — une description, lue APRÈS le nom, exactement comme un
           `accessibilityHint`. */
        aria-describedby={`${messageId}-reveal-hint`}
        aria-busy={pending || undefined}
        onClick={onTap}
      >
        {/* `text-bubble leading-[1.35]` — LA MÊME typographie que le texte
            réel (`bubble.tsx:180`, `focal-row.tsx:262`), pas la police par
            défaut du navigateur (revue #5676, résidu du défaut 4) : sans
            elle, un message qui enjambe DEUX lignes voilait sur 24 px/ligne
            (16 px/1,5 par défaut) et révélait sur 20,25 px/ligne
            (`--ios-font-body` 15 px × 1,35) — un écart de 3,75 px par ligne,
            invisible sur un message d'UNE ligne (le plancher commun de
            44 px l'absorbe) et démasqué dès que le contenu enjambe deux
            lignes dans la bulle, plus étroite que la rangée plate. */}
        <span
          data-surrogate
          aria-hidden
          className="text-bubble leading-[1.35]"
          style={{ filter: `blur(${BLUR_RADIUS_PX}px)`, userSelect: 'none' }}
        >
          {surrogateOf(contentLength)}
        </span>
        <span className="sr-only" id={`${messageId}-reveal-hint`}>
          Toucher pour révéler le contenu
        </span>
        {attachmentCount > 0 ? (
          <span data-masked-media aria-hidden>
            {isViewOnce ? 'Voir une fois' : 'Contenu masqué'}
          </span>
        ) : null}
      </button>
      {/*
        LA GRAMMAIRE D'UN ÉCHEC, PAS CELLE D'UN CONTENU (revue #5676,
        défaut 6) : la légende vivait EN ENCRE DE CORPS, à l'intérieur du
        bouton-voile — sur un écran dont tout le contrat est « rien en
        clair », du texte pleine taille qui apparaît dans le rectangle gris
        se lit exactement comme le secret qu'on vient de refuser. Elle
        porte désormais la MÊME grammaire que l'échec d'envoi voisin
        (`--color-error`, fond à 18 %, glyphe, `focal-row.tsx:353-366`) et
        vit HORS du voile — sous lui, jamais dedans — pour ne plus faire
        varier sa hauteur (le troisième saut du même défaut).
      */}
      {revealError ? (
        <p
          role="status"
          className="protected-notice-error mt-1.5 flex items-center gap-1.5 rounded-quote px-2 py-1.5 text-check font-semibold"
        >
          <Glyph name="warningCircle" size={12} />
          <span>Révélation impossible pour l’instant</span>
        </p>
      ) : null}
    </>
  );
}

/**
 * LE TOMBSTONE — deux peaux, les libellés iOS (`FocalSystemRows.swift:32-58`,
 * `BubbleSystemViews.swift:13-85`), jamais le contenu.
 */
export function ProtectionNotice({
  kind,
  surface,
  isMine = false,
}: {
  readonly kind: 'deleted' | 'burned';
  readonly surface: 'row' | 'bubble';
  readonly isMine?: boolean;
}) {
  const label = kind === 'deleted' ? 'Message supprimé' : 'Vu et supprimé';
  const ariaLabel = kind === 'deleted' ? 'Message supprimé' : 'Message vu et supprimé';

  if (surface === 'row') {
    return (
      <p
        data-protected="consumed"
        /* AUCUN retrait ici : `FocalDeletedRow`/`FocalBurnedRow` posent
           `.padding(.leading, FocalMetrics.Text.indent)` parce qu'iOS n'a pas
           de gouttière — la rangée web, elle, vit DÉJÀ dans la colonne 2 d'une
           grille dont la colonne 1 vaut `TEXT_INDENT`. Le porter une seconde
           fois indentait le tombstone à 82 px quand toute autre parole du fil
           commence à 41 (mesuré en revue : texte à x=112 contre x=71). */
        className="italic text-bubble"
        style={{ color: 'var(--color-ios-ink-2)' }}
        aria-label={ariaLabel}
      >
        {label}
      </p>
    );
  }

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <span
        data-protected="consumed"
        className={`protected-notice protected-notice--${kind} inline-flex items-center gap-1.5 rounded-chip`}
        aria-label={ariaLabel}
      >
        <Glyph
          name={kind === 'deleted' ? 'prohibit' : 'flameFill'}
          size={12}
          style={{ color: kind === 'deleted' ? 'var(--color-ios-ink-2)' : 'var(--color-warn)' }}
        />
        <span className="text-title italic" style={{ color: 'var(--color-ios-ink-2)' }}>
          {label}
        </span>
      </span>
    </div>
  );
}

/**
 * LE BADGE ÉPHÉMÈRE — miroir de `BubbleEphemeralBadge`/`BubbleMetaBadges.swift:146-171`.
 * Tient SON PROPRE minuteur (1 s), s'arrête à l'expiration et au démontage —
 * `memo` : c'est LUI seul qui re-rend au tic, jamais la rangée qui le monte
 * (la promesse `memo` de `FocalRow`/`Bubble`).
 */
export const EphemeralBadge = memo(function EphemeralBadge({
  expiresAt,
  now = defaultNow,
  onExpired,
}: {
  readonly expiresAt: Date | string;
  readonly now?: () => number;
  readonly onExpired: () => void;
}) {
  const [remaining, setRemaining] = useState(() => ephemeralOf(expiresAt, now()));

  useEffect(() => {
    const state = ephemeralOf(expiresAt, now());
    setRemaining(state);
    if (state.state !== 'running') return;
    const interval = setInterval(() => {
      const next = ephemeralOf(expiresAt, now());
      setRemaining(next);
      if (next.state !== 'running') clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;
  useEffect(() => {
    if (remaining.state === 'expired') onExpiredRef.current();
  }, [remaining.state]);

  if (remaining.state !== 'running') return null;
  const label = formatRemaining(remaining.remainingSeconds);
  return (
    <span
      data-ephemeral
      className="protected-ephemeral-badge rounded-chip inline-flex items-center gap-1"
      aria-label={`Message éphémère, expire dans ${label}`}
    >
      <Glyph name="flameFill" size={11} />
      <span className="tabular-nums font-bold text-chip">{label}</span>
    </span>
  );
});
