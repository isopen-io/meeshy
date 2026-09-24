import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  BLUR_RADIUS_PX,
  REVEAL_ERROR_NOTICE_MS,
  closeViewOnce,
  isViewOnceKind,
  openViewOnce,
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
import { useRevealPhasePublisher } from '@/lib/reading-mode/reveal-phase-channel';
import type { Attachment } from '@/lib/api/types';
import { purgeViewOnceMedia, viewOnceMediaUrlsOf } from '@/lib/api/view-once';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { attachmentSegments } from '@/lib/view/message-a11y-label';

import { Glyph } from './glyph';
import { ViewOnceOpenedContext } from './view-once-opened';

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
  attachments,
  surface,
  isMine = false,
  revealable = true,
  onConsumeViewOnce,
  now = defaultNow,
  children,
}: {
  readonly messageId: string;
  readonly kind: ProtectionKind;
  readonly isViewOnce: boolean;
  readonly contentLength: number;
  /**
   * LES PIÈCES DU MESSAGE — l'OBJET, plus seulement leur nombre (#7020).
   *
   * Le voile n'avait besoin que d'un compte (« y a-t-il quelque chose de
   * masqué ? »). Le CONSTAT d'un contenu RETENU a besoin de leur NATURE, et le
   * dire depuis un nombre obligerait à un second vocabulaire — exactement ce
   * que `PROTECTED_LABEL` interdit. Le nombre se dérive de la liste ; l'inverse,
   * non.
   */
  readonly attachments: readonly Attachment[] | undefined;
  readonly surface: 'row' | 'bubble';
  readonly isMine?: boolean;
  /**
   * LE CONTENU EST-IL SEULEMENT LÀ ? (#6862, lot C) — `false` quand la charge
   * ne PORTE PAS le texte masqué : la lecture souveraine de l'administration
   * retient `content`, `translations` et les URL des pièces AU SERVEUR
   * (`messageContentIsProtected`), et sert `isProtected` à la place.
   *
   * Sans ce drapeau, le voile offrait quand même son tap : « Toucher pour
   * révéler le contenu » découvrait une bulle VIDE. C'est le contrôle sans
   * effet que la loi 4 interdit, sous sa forme la plus trompeuse — non pas un
   * bouton qui ne fait rien, mais un bouton qui prétend tenir ce que personne
   * ne lui a donné.
   *
   * `true` par défaut : le fil ordinaire reçoit bien le texte, il est
   * simplement masqué à l'affichage, et le tap le révèle pour de bon.
   */
  readonly revealable?: boolean;
  readonly onConsumeViewOnce?: ((messageId: string) => Promise<boolean>) | undefined;
  readonly now?: (() => number) | undefined;
  readonly children: ReactNode;
}) {
  // Une vue unique DÉJÀ OUVERTE à l'arrivée (par moi, sur cet appareil ou un
  // autre) n'a AUCUNE fenêtre à ouvrir — `consumed` d'emblée. Une vue unique
  // à ouvrir part de `hidden`, MÊME si elle devient `opened` un instant plus
  // tard (la consommation met le message à jour DÈS le toucher) : c'est l'état
  // LOCAL, pas le `kind` du dernier rendu, qui pilote l'affichage — sinon la
  // puce « Déjà ouvert » couperait la lecture qu'on vient de commencer.
  const [phase, setPhase] = useState<RevealPhase>(() => (kind === 'opened' ? { phase: 'consumed' } : { phase: 'hidden' }));

  /**
   * CE QUE LE LECTEUR REGARDE EST FIGÉ AU TOUCHER (#7580). La consommation
   * PURGE la rangée du cache (texte, traductions, pièces) avant même la
   * réponse du serveur : l'hôte redessine alors des enfants VIDES. La fenêtre
   * de lecture rend donc les enfants tels qu'ils étaient à l'instant du geste,
   * et les oublie à la fermeture — plus rien ne les tient ensuite.
   */
  const liveChildren = useRef<ReactNode>(children);
  liveChildren.current = children;
  const liveAttachments = useRef<readonly Attachment[] | undefined>(attachments);
  liveAttachments.current = attachments;
  const [frozen, setFrozen] = useState<{ readonly children: ReactNode; readonly urls: readonly string[]; readonly media: boolean } | null>(null);

  /**
   * LA PHASE REMONTE (#7142) — ce composant la TIENT, et le nom accessible de
   * la rangée se compose AU-DESSUS de lui (`thread-modes.tsx`, `aria-label` sur
   * `[data-row]`). Sans cette émission, une rangée révélée peint son contenu
   * sous un nom qui dit encore « Contenu masqué », et un lecteur d'écran n'a
   * AUCUN chemin vers ce qu'il vient de dévoiler — le texte peint étant par
   * ailleurs `aria-hidden` (`plainTextHidden`, #7032, qui reste juste : le
   * texte vit dans le libellé, jamais deux fois).
   *
   * L'état publié est l'état LOCAL, celui-là même qui pilote l'affichage : la
   * rangée dit donc toujours ce qu'elle montre. Publier depuis un effet plutôt
   * que depuis `setPhase` couvre aussi le MONTAGE — une
   * vue unique déjà ouverte annonce `consumed` sans qu’aucun geste n’ait eu lieu.
   */
  const publishPhase = useRevealPhasePublisher();
  useEffect(() => {
    publishPhase(messageId, phase);
  }, [publishPhase, messageId, phase]);

  const attachmentCount = attachments?.length ?? 0;
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
    if (phase.phase !== 'revealed' || !Number.isFinite(phase.until)) return;
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
      const snapshot = {
        children: liveChildren.current,
        urls: viewOnceMediaUrlsOf(liveAttachments.current),
        media: (liveAttachments.current?.length ?? 0) > 0,
      };
      setPending(true);
      const ok = onConsumeViewOnce ? await onConsumeViewOnce(messageId) : false;
      setPending(false);
      if (!ok) {
        setRevealError(true);
        if (errorTimer.current !== null) clearTimeout(errorTimer.current);
        errorTimer.current = setTimeout(() => setRevealError(false), REVEAL_ERROR_NOTICE_MS);
        return;
      }
      setFrozen(snapshot);
      setPhase((current) => openViewOnce(current));
      return;
    }
    setPhase((current) => reveal(current, { now: now() }));
  }, [pending, isViewOnce, onConsumeViewOnce, messageId, now]);

  /** LA FERMETURE — un second toucher, la sortie de l'écran, ou la fermeture du plein écran. */
  const closeOpened = useCallback(
    (immediate: boolean) => {
      setPhase((current) => closeViewOnce(current, { now: now(), immediate }));
    },
    [now],
  );

  /* UNE FOIS REFERMÉE, RIEN NE RESTE (#7580) : les enfants figés sont
     oubliés, et les fichiers quittent les caches du navigateur. */
  useEffect(() => {
    if (phase.phase !== 'consumed' || frozen === null) return;
    void purgeViewOnceMedia(frozen.urls);
    setFrozen(null);
  }, [phase, frozen]);

  if (kind === 'deleted') return <ProtectionNotice kind="deleted" surface={surface} isMine={isMine} />;
  if (kind === 'expired') return null;

  /**
   * LE CONTENU RETENU AU SERVEUR (#6862) — testé AVANT `standard`, et c'est
   * tout l'intérêt : la loi de protection du CLIENT (`protectionOf`) ne
   * connaît ni `isEncrypted` ni `encryptionMode`, que `messageContentIsProtected`
   * (passerelle) compte parmi ses quatre causes. Un message chiffré arrive donc
   * ici en `standard` avec un texte VIDE — et rendrait une bulle vide, le
   * défaut exact que cette mention existe pour empêcher.
   *
   * Placé avant `standard`, ce garde couvre les QUATRE causes d'un seul coup,
   * parce qu'il lit le verdict SERVI et ne le recalcule pas.
   */
  /* `exactOptionalPropertyTypes` : une clé ABSENTE doit le RESTER, jamais
     devenir une clé posée à `undefined` — la discipline du chantier. */
  if (!revealable) {
    return (
      <ProtectionNotice
        kind="withheld"
        surface={surface}
        isMine={isMine}
        {...(attachments === undefined ? {} : { attachments })}
      />
    );
  }

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
  if (isViewOnceKind(kind)) {
    if (rendersContent(kind, phase) && frozen !== null) {
      if (frozen.media) {
        return (
          <>
            <ViewOnceChip state="viewing" />
            <ViewOnceStage onClose={() => closeOpened(true)}>{frozen.children}</ViewOnceStage>
          </>
        );
      }
      return (
        <ViewOnceTextWindow fogging={phase.phase === 'fogging'} onClose={() => closeOpened(false)}>
          {frozen.children}
        </ViewOnceTextWindow>
      );
    }
    if (kind === 'opened' || !showsAffordance(kind, phase)) return <ViewOnceChip state="opened" />;
    const chipLanguage = currentInterfaceLanguage();
    return (
      <>
        <ViewOnceChip state="sealed" pending={pending} onTap={onTap} />
        {revealError ? (
          <p
            role="status"
            className="protected-notice-error mt-1.5 flex items-center gap-1.5 rounded-quote px-2 py-1.5 text-check font-semibold"
          >
            <Glyph name="warningCircle" size={12} />
            <span>{translate(chipLanguage, 'message.veiled.error')}</span>
          </p>
        ) : null}
      </>
    );
  }

  /**
   * LA MATRICE VIENT DE LA LOI, jamais d'un `if` recopié ici : `rendersContent`
   * et `showsAffordance` (`reading-mode/protection.ts`) sont les DEUX seules
   * réponses au « quand monter les enfants » et au « quand offrir le tap ».
   */
  if (rendersContent(kind, phase)) {
    // LE BROUILLARD JOUE À LA FERMETURE, PAS À L'OUVERTURE (D-23 §1.4 point 6,
    // revue #5676 défaut 5) : `data-protected` reste `"revealed"` pendant
    // les DEUX phases qui rendent le contenu ; seul `data-fog` bascule.
    return (
      <div data-protected="revealed" className="protected-revealed">
        {children}
        <span className="protected-fog" data-fog={phase.phase === 'fogging' ? 'closing' : 'clear'} aria-hidden />
      </div>
    );
  }

  // L'affordance — seule surface où le contenu n'a PAS encore de raison
  // d'exister dans le DOM. Ses QUATRE textes viennent du catalogue (#7337) ;
  // la langue se lit ici pour la même raison que dans `ProtectionNotice`
  // ci-dessous (§ son doc-comment) — une lecture, jamais un abonnement.
  const veilLanguage = currentInterfaceLanguage();
  return (
    <>
      <button
        type="button"
        data-protected="hidden"
        data-surface={surface}
        className="protected-veil"
        aria-label={translate(veilLanguage, 'message.veiled')}
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
          {translate(veilLanguage, 'message.veiled.hint')}
        </span>
        {/* LE FLOU N'A NI PUCE NI ŒIL (#7580) : c'est la LIGNE qui est floutée.
            Un média flouté garde sa place, sans libellé par-dessus. */}
        {attachmentCount > 0 ? <span data-masked-media aria-hidden /> : null}
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
          <span>{translate(veilLanguage, 'message.veiled.error')}</span>
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
  attachments,
}: {
  /**
   * `withheld` (#6862) — le contenu n'est pas masqué À L'AFFICHAGE : il n'est
   * PAS DANS LA CHARGE. Distinct de `deleted` (« l'auteur l'a retiré ») : ici
   * le message EXISTE, entier, et c'est la passerelle qui refuse de le servir.
   *
   * Une vue unique ouverte n'est PLUS un tombstone (#7580) : elle a sa puce,
   * `ViewOnceChip`, et ne dit jamais « supprimé ».
   */
  readonly kind: 'deleted' | 'withheld';
  readonly surface: 'row' | 'bubble';
  readonly isMine?: boolean;
  /**
   * LE CONSTAT D'UN CONTENU RETENU (#7020) — les pièces que la passerelle LISTE
   * sans les servir, et qu'il faut pouvoir constater.
   *
   * Lu pour le SEUL `withheld`, et c'est une frontière, pas une commodité :
   * `deleted` raconte une histoire où la pièce n'existe PLUS — y compter des
   * images inventerait un fait. `withheld` dit l'inverse : le message est INTACT,
   * c'est la passerelle qui refuse de le servir, et `servedAttachment` liste
   * exprès ses pièces pour que l'administration puisse le CONSTATER.
   *
   * Ce qui sort reste le TYPE et le NOMBRE — jamais le nom, le poids, la durée
   * ni l'URL, que `MaskedAttachment` retient déjà pour la même raison
   * (leçon 275 : « une protection de CONTENU se mesure sur tout ce que la
   * charge TRANSPORTE »).
   */
  readonly attachments?: readonly Attachment[];
}) {
  /**
   * LES LIBELLÉS VIENNENT DU CATALOGUE (#7337) — ils étaient EN DUR, en
   * français, sur les trois tombstones que SEPT langues lisent. Les valeurs
   * sont celles du catalogue iOS là où il en a une (`bubble.system.deleted`).
   *
   * LA LANGUE SE LIT ICI, PAS EN PROP (même parti que `MaskedAttachment` et
   * `ViewerMaskedPage`) : ce substitut est rendu depuis CINQ chaînes
   * différentes — la bulle, la rangée plate, la grille, la visionneuse et la
   * lecture souveraine — dont aucune ne transporte de langue d'interface. Un
   * prop devrait traverser `ProtectedContent`, `Attachments`, `MediaGrid` et
   * `MediaViewer` pour atteindre des feuilles qui n'ont pas d'autre raison de
   * la connaître, alors que `currentInterfaceLanguage()` est une LECTURE
   * synchrone de `document.documentElement.lang`, jamais un abonnement : la
   * racine redessine déjà l'arbre entier quand la langue change
   * (`subscribeInterfaceLanguage`).
   */
  const language = currentInterfaceLanguage();
  const LABELS = {
    deleted: { label: 'message.deleted', aria: 'message.deleted' },
    withheld: { label: 'message.withheld', aria: 'message.withheld.a11y' },
  } as const satisfies Readonly<Record<'deleted' | 'withheld', { label: InterfaceCatalogKey; aria: InterfaceCatalogKey }>>;
  const label = translate(language, LABELS[kind].label);
  const ariaLabel = translate(language, LABELS[kind].aria);
  /* Le MÊME vocabulaire que l'oreille — `attachmentSegments` est le site
     unique, importé et jamais recopié (§ `PROTECTED_LABEL`). */
  const constat = kind === 'withheld' ? attachmentSegments(attachments).join(', ') : '';
  const media =
    constat === '' ? null : (
      <span data-withheld-media className="not-italic opacity-80">
        {' · '}
        {constat}
      </span>
    );

  if (surface === 'row') {
    return (
      <p
        data-protected="consumed"
        data-protection-notice={kind}
        /* AUCUN retrait ici : `FocalDeletedRow`/`FocalBurnedRow` posent
           `.padding(.leading, FocalMetrics.Text.indent)` parce qu'iOS n'a pas
           de gouttière — la rangée web, elle, vit DÉJÀ dans la colonne 2 d'une
           grille dont la colonne 1 vaut `TEXT_INDENT`. Le porter une seconde
           fois indentait le tombstone à 82 px quand toute autre parole du fil
           commence à 41 (mesuré en revue : texte à x=112 contre x=71). */
        className="italic text-bubble"
        style={{ color: 'var(--color-ios-ink-2)' }}
        aria-label={constat === '' ? ariaLabel : `${ariaLabel}, ${constat}`}
      >
        {label}
        {media}
      </p>
    );
  }

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <span
        data-protected="consumed"
        data-protection-notice={kind}
        className={`protected-notice protected-notice--${kind} inline-flex items-center gap-1.5 rounded-chip`}
        aria-label={constat === '' ? ariaLabel : `${ariaLabel}, ${constat}`}
      >
        <Glyph name="prohibit" size={12} style={{ color: 'var(--color-ios-ink-2)' }} />
        <span className="text-title italic" style={{ color: 'var(--color-ios-ink-2)' }}>
          {label}
          {media}
        </span>
      </span>
    </div>
  );
}

/**
 * LA PUCE DE LA VUE UNIQUE (#7580, règle porteur du 2026-09-23) — UNE seule,
 * à la place du contenu :
 * - `sealed` : « (1) · Touchez pour afficher », le « 1 » cerclé PLEIN, violet
 *   d'accent. C'est un bouton : le toucher OUVRE (et consomme).
 * - `opened` : la même puce, fond ATTÉNUÉ, « (1) · Déjà ouvert ». Aucun geste,
 *   et jamais un mot de suppression.
 * - `viewing` : la puce que la rangée garde pendant qu'un média est ouvert en
 *   plein écran — inerte, le plein écran est la seule surface active.
 *
 * Le « 1 » cerclé REMPLACE le mot « Vue unique » : il n'est écrit nulle part.
 * Le libellé accessible dit la phrase complète. Tient sur UNE ligne
 * (`whitespace-nowrap`) : le texte n'est jamais tronqué.
 */
export function ViewOnceChip({
  state,
  pending = false,
  onTap,
}: {
  readonly state: 'sealed' | 'opened' | 'viewing';
  readonly pending?: boolean;
  readonly onTap?: () => void;
}) {
  const language = currentInterfaceLanguage();
  const opened = state === 'opened';
  const glyph = opened ? 'numberCircleOne' : 'numberCircleOneFill';
  const label = translate(language, opened ? 'message.viewOnce.opened' : 'message.viewOnce.tap');
  const aria = translate(language, opened ? 'message.viewOnce.opened.a11y' : 'message.viewOnce.sealed.a11y');
  const content = (
    <>
      <Glyph name={glyph} size={16} />
      <span aria-hidden className="opacity-70">
        ·
      </span>
      <span>{label}</span>
    </>
  );
  const className = `view-once-chip view-once-chip--${opened ? 'opened' : 'sealed'} inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip text-title font-semibold`;

  if (state === 'sealed') {
    return (
      <button
        type="button"
        data-protected="hidden"
        data-view-once-chip="sealed"
        data-glyph={glyph}
        className={className}
        aria-label={aria}
        aria-busy={pending || undefined}
        onClick={(event) => {
          event.stopPropagation();
          onTap?.();
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      data-protected={opened ? 'consumed' : 'revealed'}
      data-view-once-chip={state}
      data-glyph={glyph}
      className={className}
      role="img"
      aria-label={aria}
    >
      {content}
    </span>
  );
}

/**
 * LE TEXTE D'UNE VUE UNIQUE, OUVERT À SA PLACE (#7580). Il se referme — et la
 * puce passe à « Déjà ouvert » — dès qu'on le RETOUCHE ou dès qu'il SORT DE
 * L'ÉCRAN au défilement. La sortie se lit par `IntersectionObserver` : une
 * rangée recyclée par le virtualiseur se démonte de toute façon, et remonte
 * sur un message déjà purgé, donc « Déjà ouvert ».
 */
function ViewOnceTextWindow({
  fogging,
  onClose,
  children,
}: {
  readonly fogging: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || typeof IntersectionObserver === 'undefined') return;
    let seen = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          seen = true;
          continue;
        }
        if (seen) onCloseRef.current();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-protected="revealed"
      data-view-once-open=""
      className="protected-revealed"
      onClick={(event) => {
        event.stopPropagation();
        onCloseRef.current();
      }}
    >
      {children}
      <span className="protected-fog" data-fog={fogging ? 'closing' : 'clear'} aria-hidden />
    </div>
  );
}

/**
 * LE PLEIN ÉCRAN D'UNE VUE UNIQUE MÉDIA (#7580) — image, vidéo, audio,
 * document ou sticker s'ouvrent ici, et la FERMETURE fait passer la puce à
 * « Déjà ouvert ». Monté dans `document.body` : une rangée du fil est
 * transformée (`translateY`), et un `position: fixed` y serait relatif à elle.
 * Échap, le bouton de fermeture et le retour Android (`useBackDismiss`)
 * ferment ; le reste de l'application est inerte pendant ce temps.
 */
function ViewOnceStage({ onClose, children }: { readonly onClose: () => void; readonly children: ReactNode }) {
  const language = currentInterfaceLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useBackDismiss(onClose);

  useLayoutEffect(() => {
    const root = document.getElementById('root');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root?.setAttribute('inert', '');
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      root?.removeAttribute('inert');
      previouslyFocused?.focus();
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={translate(language, 'message.viewOnce.sealed.a11y')}
      data-view-once-stage=""
      className="view-once-stage"
    >
      <button
        ref={closeRef}
        type="button"
        className="view-once-stage-close"
        aria-label={translate(language, 'message.viewOnce.close')}
        onClick={onClose}
      >
        <Glyph name="x" size={22} />
      </button>
      <div className="view-once-stage-content">
        <ViewOnceOpenedContext.Provider value>{children}</ViewOnceOpenedContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
