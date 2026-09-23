import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  BLUR_RADIUS_PX,
  REVEAL_ERROR_NOTICE_MS,
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
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { attachmentSegments } from '@/lib/view/message-a11y-label';

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
  // Un message déjà `burned` À L'ARRIVÉE (viewOnceCount ≥ maxViewOnceCount,
  // jamais localement révélé) n'a AUCUNE fenêtre à ouvrir — `consumed`
  // d'emblée. Un message `veiled` part de `hidden`, MÊME s'il devient
  // `burned` un instant plus tard (la consommation serveur met à jour le
  // message AVANT que la fenêtre locale de 5 s ne s'éteigne) : c'est l'état
  // LOCAL, pas le `kind` du dernier rendu, qui pilote l'affichage — sinon le
  // tombstone couperait la fenêtre de révélation qu'on vient de payer
  // (D-23 §1.4 point 4, le comportement retenu est celui de la BULLE iOS).
  const [phase, setPhase] = useState<RevealPhase>(() => (kind === 'burned' ? { phase: 'consumed' } : { phase: 'hidden' }));

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
   * que depuis `setPhase` couvre aussi le MONTAGE — un message arrivé déjà
   * `burned` annonce `consumed` sans qu'aucun geste n'ait eu lieu.
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
        {attachmentCount > 0 ? (
          <span data-masked-media aria-hidden>
            {translate(veilLanguage, isViewOnce ? 'message.veiled.viewOnce' : 'message.veiled')}
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
   * PAS DANS LA CHARGE. Distinct de `burned` (« vu et supprimé », une histoire
   * qui s'est produite) et de `deleted` (« l'auteur l'a retiré ») : ici le
   * message EXISTE, entier, et c'est la passerelle qui refuse de le servir.
   * Dire l'un des deux autres raconterait un fait qui n'a pas eu lieu.
   */
  readonly kind: 'deleted' | 'burned' | 'withheld';
  readonly surface: 'row' | 'bubble';
  readonly isMine?: boolean;
  /**
   * LE CONSTAT D'UN CONTENU RETENU (#7020) — les pièces que la passerelle LISTE
   * sans les servir, et qu'il faut pouvoir constater.
   *
   * Lu pour le SEUL `withheld`, et c'est une frontière, pas une commodité :
   * `deleted` et `burned` racontent une histoire où la pièce n'existe PLUS (un
   * message retiré, une vue unique consommée) — y compter des images
   * inventerait un fait. `withheld` dit l'inverse : le message est INTACT,
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
   * sont celles du catalogue iOS là où il en a une (`bubble.system.deleted`,
   * `bubble.system.burned`, `bubble.system.burned.a11y`).
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
    burned: { label: 'message.burned', aria: 'message.burned.a11y' },
    withheld: { label: 'message.withheld', aria: 'message.withheld.a11y' },
  } as const satisfies Readonly<Record<'deleted' | 'burned' | 'withheld', { label: InterfaceCatalogKey; aria: InterfaceCatalogKey }>>;
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
        <Glyph
          name={kind === 'burned' ? 'flameFill' : 'prohibit'}
          size={12}
          style={{ color: kind === 'burned' ? 'var(--color-warn)' : 'var(--color-ios-ink-2)' }}
        />
        <span className="text-title italic" style={{ color: 'var(--color-ios-ink-2)' }}>
          {label}
          {media}
        </span>
      </span>
    </div>
  );
}
