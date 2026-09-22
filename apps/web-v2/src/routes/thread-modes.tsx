import { Suspense, lazy, useCallback, useState, type Ref } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Bubble } from '@/components/bubble';
import { FocalRow } from '@/components/focal-row';
import { SummarySkeleton } from '@/components/summary/summary-skeleton';
import { TypingRosterCell } from '@/components/typing-roster-cell';
import { UnreadSeparator } from '@/components/unread-separator';
import type { RevealPhase } from '@/lib/reading-mode/protection';
import { RevealPhaseChannel } from '@/lib/reading-mode/reveal-phase-channel';
import type { ListPaginationState } from '@/lib/lens/pagination';
import type { Conversation, Message } from '@/lib/api/types';
import type { TypingEntry } from '@/lib/api/typing-store';
import type { Viewer } from '@/lib/api/viewer';
import { dayLabel, type PlacedMessage } from '@/lib/grouping';
import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { useLongPress } from '@/lib/view/long-press';
import { checkStatusOf, isMineOf } from '@/lib/view/message';
import type { LocalDelivery } from '@/lib/view/message';
import { unreadSeparatorLabel } from '@/lib/view/unread-separator';
import { composeMessageLabel } from '@/lib/view/message-a11y-label';
import { isSystemMessage } from '@/lib/view/message-badges';
import { served } from '@/lib/api/prism';
import type { SelectionState } from '@/lib/view/selection';
import { usesFlatRow } from '@/lib/reading-mode/decision';
import { protectionOf } from '@/lib/reading-mode/protection';
import { destructionPhaseOf } from '@/lib/view/ephemeral-destruction';
import { resolveEphemeralDeadline } from '@/lib/view/ephemeral-reception';
import type { ThreadScene } from '@/lib/reading-mode/scene';

/**
 * LE RÉSUMÉ VIVANT (#5695) — module À LA DEMANDE, déplacé ICI avec le
 * montage qui le charge (voir le doc-comment du fichier) : `ThreadModes`
 * n'entre elle-même dans le CHUNK DU FIL qu'au premier rendu de
 * `routes/thread.tsx` (import statique d'une route déjà scindée par route),
 * donc ce `lazy()` continue de différer `summary-host` jusqu'au premier
 * rendu en mode Résumé, exactement comme avant l'extraction.
 */
const SummaryHost = lazy(() => import('@/components/summary/summary-host'));

/** Aucune annonce de destruction — identité STABLE, pour ne pas refaire un
 *  ensemble à chaque rendu de la liste. */
const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * LE MONTAGE DES MODES — extrait de `routes/thread.tsx` (#5878) : au-delà de
 * 1000 lignes le budget du dépôt (CLAUDE.md § Code Style) demande un
 * découpage « sans se discuter », et le fichier l'avait de nouveau atteint
 * (1042 lignes, D-29/D-30) après une première extraction
 * (`thread-header.tsx`, #5814). AUCUNE règle nouvelle ici : chaque prop est
 * la valeur déjà calculée par l'écran — motif `Sheet`/`FocusStrip`
 * (composant SANS état propre, comme `ThreadHeader`).
 *
 * Rend soit le Résumé Vivant (`mode === 'summary'`), soit la rangée
 * plate/bulle virtualisée — jamais les deux (`thread.tsx`, doc-comment de
 * `ThreadScreen`). La prochaine surface à monter ICI est la Rivière (D-21) :
 * c'est précisément pour qu'elle ait un fichier sous le budget où s'ajouter
 * que ce découpage précède son lot, plutôt que de le suivre.
 */
/**
 * **LA TÊTE DU FIL — LA PAGINATION VERS LE PASSÉ** (#6972).
 *
 * Elle vit AU-DESSUS de la liste virtualisée et HORS d'elle : les `<li>` du
 * `<ol>` sont tous en `position: absolute` et la hauteur du `<ol>` est celle
 * que le virtualiseur calcule — y glisser une rangée de flux fausserait sa
 * géométrie. En frère AVANT le `<ol>` (dont le `margin-block-start: auto`
 * pousse la liste en bas quand le fil est court), elle est exactement au
 * sommet du contenu défilable, là où la sentinelle doit être.
 *
 * ## ELLE FAIT UN PIXEL DANS TOUS LES ÉTATS, ET C'EST LA MOITIÉ DU TRAVAIL
 *
 * La première écriture de ce composant rendait les quatre cas du pied de la
 * Lentille — trois points à `py-4` pendant le chargement, caption +
 * « Réessayer » sur échec. Mais cette bande est AU-DESSUS de ce qu'on lit :
 * grandir de 1 px à 40 px pousse tout le fil de 39 px vers le bas À L'INSTANT
 * où la page part, puis le ramène quand elle arrive. Le lecteur voit son
 * historique sauter DEUX fois pour une page qui s'est chargée correctement —
 * et l'ancrage, qui tient la distance au BAS du contenu, ne peut rien y faire :
 * ce n'est pas l'insertion qui bouge, c'est l'indicateur.
 *
 * Le RETOUR VISIBLE (points de chargement, refus + « Réessayer ») FLOTTE donc
 * au-dessus du défileur, posé par `routes/thread.tsx` en frère absolu de
 * `<main>` — la même doctrine que la pilule de jour et le bouton « revenir en
 * bas » (« un enfant `position: absolute` d'un conteneur qui défile DÉFILE
 * AVEC LUI »). Ici ne reste que la PRISE : un pixel, jamais plus, jamais
 * moins.
 *
 * Le marqueur est posé dans les QUATRE états — y compris `exhausted`, qui ne
 * montre rien. Sans lui, « la sentinelle est désarmée parce que l'historique
 * est épuisé » et « la sentinelle n'a jamais été câblée » rendraient le même
 * DOM, donc le même verdict : un gate vert des deux côtés de la mutation
 * qu'il existe pour mesurer. `data-thread-older` est du même genre que
 * `data-pagination-footer` (`components/lens-pagination-footer.tsx`).
 *
 * `ref` n'est attaché QU'EN `idle` : un observateur posé pendant qu'une page
 * est en vol, ou après un échec, redemanderait la même page en boucle.
 */
function OlderHead({
  state,
  sentinelRef,
}: {
  readonly state: ListPaginationState;
  readonly sentinelRef: Ref<HTMLDivElement>;
}) {
  return (
    <div
      data-thread-older={state}
      aria-hidden
      className="shrink-0"
      style={{ height: 1 }}
      {...(state === 'idle' ? { ref: sentinelRef } : {})}
    />
  );
}

export type ThreadSummaryCapability = {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly windowCoversUnread: boolean;
  readonly lang?: string;
  readonly onReplyToPerson: (entry: FaceRampEntry) => void;
  readonly onOpenEpisode: (episode: ConversationEpisode) => void;
  readonly onResumeThread: () => void;
};

export function ThreadModes({
  mode,
  viewer,
  readerLocale,
  summary,
  placed,
  virtualizer,
  scene,
  readerLanguages,
  group,
  highlightedId,
  expiredIds,
  destroyingIds = EMPTY_IDS,
  jumpToMessage,
  consume,
  onEphemeralExpired,
  deliveryOf,
  startedAtOf,
  reasonOf,
  permanentOf,
  retry,
  displayLanguageOf,
  myReactionsOf,
  contentWithheld,
  selection,
  onRowTap,
  longPress,
  onPickLanguage,
  onReact,
  onOpenDetail,
  typists,
  typistAvatarOf,
  accent = 'var(--color-ios-brand)',
  older,
  readTrackingSentinelRef,
  unreadSeparatorMessageId = null,
  unreadCount = 0,
}: {
  readonly mode: ConversationReadingMode;
  readonly viewer: Viewer;
  readonly readerLocale: string;
  /**
   * LE RÉSUMÉ VIVANT (#5695), en UNE capacité — ses sept valeurs n'ont aucun
   * sens séparément, et les déclarer une à une obligeait tout hôte à en
   * fournir sept même sans jamais monter ce mode. `undefined` ⇒ la surface
   * n'a pas de résumé à montrer, et le mode `summary` RETOMBE sur le fil (la
   * chose même que le résumé résume) plutôt que de rendre un écran muet.
   */
  readonly summary?: ThreadSummaryCapability;
  // Rangée plate/bulle virtualisée
  readonly placed: readonly PlacedMessage[];
  readonly virtualizer: Virtualizer<HTMLElement, Element>;
  readonly scene: ThreadScene;
  readonly readerLanguages: readonly string[];
  readonly group: boolean;
  readonly highlightedId: string | null;
  readonly expiredIds: ReadonlySet<string>;
  /**
   * LES RANGÉES EN TRAIN DE BRÛLER (#7468) — une destruction ANNONCÉE, par le
   * chrome qui vient d'atteindre l'échéance ou par `message:expired` reçu
   * pendant l'affichage (`useEphemeralDestruction`). Elles se peignent ENCORE,
   * le temps de l'effet ; c'est `expiredIds` qui les retire ensuite.
   *
   * ABSENTE ⇒ aucune annonce : la fenêtre sans état (`destructionPhaseOf`)
   * suffit à faire brûler une échéance atteinte sous les yeux du lecteur, et
   * une surface en lecture pure (l'administration) n'a rien à animer.
   */
  readonly destroyingIds?: ReadonlySet<string>;
  readonly jumpToMessage: (messageId: string) => void;
  /**
   * ## LES CAPACITÉS SONT OPTIONNELLES, ET UNE CAPACITÉ ABSENTE EST ABSENTE
   *
   * Ce composant est le SEUL du chantier qui rende une liste de messages, et
   * il n'a longtemps eu qu'un hôte : le fil, où tout est interactif. La
   * lecture souveraine de l'administration (#6862) en est un second, en
   * LECTURE PURE — on n'y répond pas, on n'y réagit pas, on n'y consomme
   * surtout pas la vue unique de quelqu'un d'autre.
   *
   * Les fonctions ci-dessous sont donc facultatives AU TYPE plutôt que
   * bouchonnées chez l'appelant. Un bouchon silencieux (`() => {}`) rendrait
   * un contrôle qui a l'air d'exister et ne fait rien — le défaut exact que la
   * loi 4 interdit. Absentes, elles font DISPARAÎTRE le geste de l'arbre
   * rendu : pas de `tabIndex` sans appui long, pas de `onClick` sans
   * sélection, pas de bande de reprise sans accusé local.
   */
  readonly consume?: (messageId: string) => Promise<boolean>;
  readonly onEphemeralExpired?: (messageId: string) => void;
  readonly deliveryOf?: (messageId: string) => LocalDelivery | undefined;
  readonly startedAtOf?: (messageId: string) => number | undefined;
  readonly reasonOf?: (messageId: string) => string | undefined;
  readonly permanentOf?: (messageId: string) => boolean;
  readonly retry?: (messageId: string) => void;
  readonly displayLanguageOf?: (messageId: string) => string | undefined;
  readonly myReactionsOf?: (messageId: string) => readonly string[] | undefined;
  /**
   * LE CONTENU RETENU AU SERVEUR (#6862) — `true` ⇒ la charge ne porte PAS le
   * texte de ce message, et la peau rend sa mention au lieu d'offrir un voile
   * qui ne découvre rien (`ProtectedContent.revealable`). Le verdict vient de
   * la passerelle (`isProtected`) et ne se recalcule pas ici : `protectionOf`
   * ignore le chiffrement, que `messageContentIsProtected` compte.
   */
  readonly contentWithheld?: (messageId: string) => boolean;
  readonly selection?: SelectionState | null;
  readonly onRowTap?: (messageId: string) => void;
  readonly longPress?: ReturnType<typeof useLongPress>;
  readonly onPickLanguage?: (messageId: string, code: string) => void;
  /** Retire une réaction MIENNE en tapant sa capsule (#5865) — même geste
   * que `onPickLanguage`, une seule loi vers `useMessageMenu.onMenuReact`. */
  readonly onReact?: (messageId: string, emoji: string) => void;
  /**
   * LA COCHE OUVRE LA FICHE (#7352, V4) — câblé UNIQUEMENT sur `<Bubble>`
   * (mode `bulles`), jamais sur `<FocalRow>` : sa ligne méta reste
   * `aria-hidden` INCONDITIONNEL (revue #5935, `focal-row.tsx`), et y poser
   * un bouton reproduirait l'anti-motif WCAG que cette revue a fermé —
   * décision consignée dans `.cache/lecture-workflow/V4.md` § 1. Dans
   * `focal`/`script` (le DÉFAUT, D-7), la fiche reste atteignable par le
   * chemin déjà mûr : appui long sur la rangée → « Plus… » (2 gestes).
   */
  readonly onOpenDetail?: (messageId: string) => void;
  /** LE ROSTER ENTIER (#6171, G1) — `[]` ⇒ aucun frappeur connu ⇒ aucune
   * cellule (`useThreadTyping`, `lib/view/use-thread-typing.ts`). Jamais
   * tronqué à un seul frappeur : `typingAnnouncement`/`typingLead`
   * (`lib/view/typing-roster.ts`) composent le libellé et élisent le meneur
   * ICI, pour que la loi reste PARTAGÉE avec les autres surfaces (bouton
   * « revenir en bas », Rivière). */
  readonly typists: readonly TypingEntry[];
  /**
   * LA PHOTO DU FRAPPEUR, résolue par l'hôte (#6985). `TypingEntry` n'en porte
   * aucune, et `typing:start` non plus — élargir le fil dupliquerait
   * l'information à chaque frappe de chaque personne, alors que l'hôte a déjà
   * ses participants en cache. `undefined` ⇒ la cellule rend ses initiales,
   * comme avant : une surface sans roster (la lecture souveraine de
   * l'administration, `typists: []`) n'a rien à fournir.
   */
  readonly typistAvatarOf?: (userId: string) => string | undefined;
  /** La teinte de la conversation — `--color-ios-brand` à défaut. SEULE la
   * cellule de frappe la lit, et elle ne monte pas sans frappeur : une surface
   * sans temps réel (`typists: []`) n'a donc rien à en dire. */
  readonly accent?: string;
  /**
   * LA PAGINATION VERS LE PASSÉ (#6972) — une CAPACITÉ, comme `summary` : ses
   * trois valeurs n'ont aucun sens séparément, et `undefined` ⇒ la surface ne
   * pagine pas, donc AUCUNE tête n'est montée (la lecture souveraine de
   * l'administration, `routes/admin-conversation-reading.tsx`, sert une page et
   * une seule — lui poser une sentinelle promettrait un historique qu'elle ne
   * sait pas charger : loi 4).
   */
  readonly older?: {
    readonly state: ListPaginationState;
    readonly sentinelRef: Ref<HTMLDivElement>;
  };
  /**
   * LE MARQUAGE-LU (#7201, W1) — la sentinelle de PIED, symétrique
   * d'`OlderHead` : une prise d'un pixel après la dernière rangée, dont
   * l'intersection dit « le bas du fil est dans le cadre » à
   * `useReadTracking` (`lib/view/use-read-tracking.ts`). `undefined` ⇒
   * aucune sentinelle montée — la lecture souveraine de l'administration ne
   * doit accuser la lecture de PERSONNE.
   */
  readonly readTrackingSentinelRef?: (node: Element | null) => void;
  /**
   * LE SÉPARATEUR DE NON-LUS (#7202, D-L2/D-L3) — l'id du message qui OUVRE
   * la frontière (`firstUnreadBoundary().firstUnreadId`, gelé pour la
   * session par `useUnreadBoundary`, `lib/view/unread-boundary.ts`) : `null`
   * ⇒ aucun séparateur, même patron « capacité absente ⇒ rien monté » que
   * `older`/`readTrackingSentinelRef` ci-dessus — la lecture souveraine de
   * l'administration ne doit exposer la frontière de lecture de PERSONNE.
   */
  readonly unreadSeparatorMessageId?: string | null;
  /** Le compte affiché par le séparateur — sans effet si `unreadSeparatorMessageId` est `null`. */
  readonly unreadCount?: number;
}) {
  const viewerId = viewer.id ?? '';

  /**
   * LE REGISTRE DES PHASES DE RÉVÉLATION (#7142) — déclaré ICI, avant le
   * retour anticipé du mode `summary` : un hook posé plus bas ne serait pas
   * appelé à tous les rendus.
   *
   * `ProtectedContent` tient l'état ; il le PUBLIE par le canal, et ce
   * registre est ce que l'hôte en retient pour composer le nom accessible de
   * la rangée. Sans lui, une rangée révélée peint son contenu sous un
   * `aria-label` qui dit encore « Contenu masqué ».
   *
   * ## CE QU'IL NE GARDE PAS, ET POURQUOI
   *
   * 1. **`hidden` n'est jamais stocké** — c'est le défaut de
   *    `composeMessageLabel`. Au montage, chaque rangée voilée visible publie
   *    `hidden` : sans cette clause, l'écran paierait un re-rendu par rangée
   *    pour n'apprendre que ce qu'il supposait déjà.
   * 2. **`until` n'entre pas dans la comparaison.** Le libellé ne lit la phase
   *    qu'à travers `rendersContent`, qui ne regarde que son NOM
   *    (`protection.ts:153-157`). Deux phases de même nom rendent le même
   *    libellé : re-rendre sur un horodatage serait un rendu sans effet.
   *
   * Reste donc trois changements par révélation (`revealed` → `fogging` →
   * l'effacement ou `consumed`), mesurés à ≈ 1,1 ms pour 20 rangées visibles.
   */
  const [revealPhases, setRevealPhases] = useState<ReadonlyMap<string, RevealPhase>>(() => new Map());
  const publishRevealPhase = useCallback((messageId: string, phase: RevealPhase) => {
    setRevealPhases((current) => {
      const held = current.get(messageId);
      if (phase.phase === 'hidden') {
        if (held === undefined) return current;
        const next = new Map(current);
        next.delete(messageId);
        return next;
      }
      if (held !== undefined && held.phase === phase.phase) return current;
      return new Map(current).set(messageId, phase);
    });
  }, []);

  /**
   * UNE LECTURE D'HORLOGE PAR RENDU DE LISTE — jamais une par rangée : la
   * protection, l'échéance et le verdict d'expiration doivent tous trois
   * répondre du MÊME instant, sans quoi une rangée pourrait se déclarer échue
   * pour son chrome et vivante pour son voile.
   *
   * Déclarée AVANT le retour anticipé du mode Résumé, qui la lit aussi.
   */
  const renderNow = Date.now();

  if (mode === 'summary' && summary !== undefined) {
    /**
     * **UN ÉPHÉMÈRE N'Y SURVIT PAS À SON ÉCHÉANCE** (#7454, la moitié de la
     * règle qui revient au Résumé). Ce mode ne rend aucune rangée de message :
     * il rend un DIGEST — des comptes, des visages, des épisodes — et un texte
     * DÉRIVÉ d'un message échu le garderait en vie après sa disparition du
     * fil, sur le même écran, à un tap de distance.
     *
     * Le corpus est donc filtré AVANT d'entrer dans le résumé, par la MÊME
     * règle que les rangées (`resolveEphemeralDeadline`) — pas par une seconde
     * lecture de `expiresAt`.
     */
    const summaryMessages = summary.messages.filter(
      (message) =>
        destructionPhaseOf({
          deadline: resolveEphemeralDeadline({ message, isMine: isMineOf(message, viewerId), now: renderNow }),
          now: renderNow,
          destroying: destroyingIds.has(message.id),
          expired: expiredIds.has(message.id),
        }) !== 'gone',
    );
    return (
      /*
        LE RÉSUMÉ VIVANT (#5695) — SOUS l'en-tête (le `<main>` du fil est
        déjà un FRÈRE de `<header>`, jamais en dessous en z-order) :
        correction du défaut #5682 de la cible iOS, pas sa recopie.
        La scène (`useThreadScene`) est INERTE sur ce mode
        (`reading-mode/scene.ts`) — le virtualiseur reste construit
        (`useVirtualizer` ne peut pas être conditionnel) mais rien ne
        monte de rangée `[data-row]` ici.
      */
      <Suspense fallback={<SummarySkeleton />}>
        <SummaryHost
          conversationId={summary.conversation.id}
          messages={summaryMessages}
          participants={summary.conversation.participants}
          viewer={viewer}
          windowCoversUnread={summary.windowCoversUnread}
          locale={readerLocale}
          {...(summary.lang !== undefined ? { lang: summary.lang } : {})}
          onReplyToPerson={summary.onReplyToPerson}
          onOpenEpisode={summary.onOpenEpisode}
          onResumeThread={summary.onResumeThread}
        />
      </Suspense>
    );
  }

  /* LA LANGUE D'INTERFACE, UNE FOIS PAR RENDU DE LISTE (#7337) — jamais une
     fois par rangée : `composeMessageLabel` en a besoin pour ses tombstones et
     son badge de transfert, et une virtualisation en rend des dizaines. C'est
     une lecture de `document.documentElement.lang`, pas un abonnement — la
     racine redessine déjà l'arbre quand la langue change. */
  const interfaceLanguage = currentInterfaceLanguage();

  return (
    <RevealPhaseChannel publish={publishRevealPhase}>
      {placed.length === 0 ? (
        /*
          L'ÉTAT VIDE EST UN ÉTAT, pas une absence d'écran. Un fil sans
          historique qui rend du blanc laisse croire à un chargement qui ne
          finit pas — sur un réseau lent, c'est l'interprétation la plus
          naturelle et la plus fausse.
        */
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div className="grid gap-2">
            <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              Aucun message pour l’instant
            </p>
            <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
              Écrivez le premier — il sera traduit dans la langue de chacun.
            </p>
          </div>
        </div>
      ) : null}

      {/* LA TÊTE DU FIL (#6972) — AVANT le `<ol>`, donc au sommet du contenu
          défilable : voir le doc-comment d'`OlderHead`. Jamais montée sur un
          fil VIDE : une sentinelle qui intersecte immédiatement sur un écran
          sans rangée déclencherait une rafale de requêtes pour un écran qui
          restera vide (revue-correction #6195, le même défaut sur la
          Lentille). */}
      {older === undefined || placed.length === 0 ? null : (
        <OlderHead state={older.state} sentinelRef={older.sentinelRef} />
      )}

      <ol
        style={{
          position: 'relative',
          width: '100%',
          flexShrink: 0,
          marginBlockStart: 'auto',
          height: virtualizer.getTotalSize(),
        }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const p = placed[row.index];
          if (p === undefined) return null;
          const isElected = scene.elected === p.message.id;
          /* L'opinion de CE client sur l'envoi (#5813) — UNE lecture par
             rangée, réutilisée pour les deux peaux et pour l'horloge des
             200 ms (`sendStartedAt`, § 5 étape 9). */
          const rowDelivery = deliveryOf?.(p.message.id);
          const rowStartedAt = startedAtOf?.(p.message.id);
          const rowReason = reasonOf?.(p.message.id);
          /* UN REFUS PERMANENT N'OFFRE PAS DE REJEU (revue-correction
             #5813, défaut majeur 2) — 403/401 ne peuvent jamais aboutir en
             rejouant le MÊME appel ; `onRetry` disparaît, la cause reste.
             Hors ligne (`rowReason === undefined`, D-16) n'est jamais
             permanent : `permanentOf` lit `lastError`, absent tant qu'aucun
             appel n'est parti. */
          const rowPermanent = rowDelivery === 'failed' && (permanentOf?.(p.message.id) ?? true);
          const sendProps =
            rowDelivery === undefined
              ? {}
              : {
                  localDelivery: rowDelivery,
                  /* PAS DE REPRISE SANS CAPACITÉ DE REPRISE (#6862) : `retry`
                     absent ⇒ aucun `onRetry`, exactement comme un refus
                     permanent. Le bouton disparaît ; la cause reste affichée.
                     `permanentOf` absent retombe sur « permanent » pour la même
                     raison — fail-closed sur l'affordance, jamais un bouton qui
                     promet un rejeu que l'hôte ne sait pas jouer. */
                  ...(rowPermanent || retry === undefined ? {} : { onRetry: () => retry(p.message.id) }),
                  ...(rowStartedAt === undefined ? {} : { sendStartedAt: rowStartedAt }),
                  ...(rowReason === undefined ? {} : { sendFailureReason: rowReason }),
                };
          /* LE MENU DU MESSAGE (#5814) — trois lectures par rangée, motif
             `rowDelivery` ci-dessus : Traduire (langue explorée pour CE
             message), « la mienne » (réactions), et l'état de sélection. */
          const rowDisplayLanguage = displayLanguageOf?.(p.message.id);
          const rowMyReactions = myReactionsOf?.(p.message.id);
          const rowSelected =
            selection === null || selection === undefined ? undefined : selection.ids.includes(p.message.id);
          /* Le verdict SERVI, jamais recalculé (voir la prop). */
          const rowWithheld = contentWithheld?.(p.message.id) ?? false;
          /*
           * LE LIBELLÉ D'ACCESSIBILITÉ (#5774, travail 2/3) — UN SEUL site,
           * partagé par la rangée plate ET la bulle : `composeMessageLabel`
           * (`lib/view/message-a11y-label.ts`), nourri du MÊME texte SERVI
           * que celui que la rangée peint (`rowDisplayLanguage` inclus — un
           * témoin de RANG se lit sur un rang ≠ 1 du Prisme, CLAUDE.md
           * racine, leçon 261). Avant ce lot : `Message de ${sender}`, sans
           * texte, sans citation, sans média, sans accusé, sans badge.
           */
          const rowPreferredLanguages =
            rowDisplayLanguage === undefined ? readerLanguages : [rowDisplayLanguage, ...readerLanguages];
          const rowServed = served({
            preferredLanguages: rowPreferredLanguages,
            originalLanguage: p.message.originalLanguage,
            translations: p.message.translations,
            original: p.message.content,
          });
          /* LA PROTECTION GOUVERNE LE LIBELLÉ (revue #5774) — la MÊME loi et
             le MÊME `expiredIds` que les deux peaux consomment plus bas
             (`FocalRow`/`Bubble`, `expired={expiredIds.has(...)}`) : sans
             elle, `aria-label` annonçait EN CLAIR le texte que la rangée
             floute ou remplace par un tombstone. */
          /**
           * L'ÉCHÉANCE DE CE LECTEUR (#7454) — composée ICI, une fois par
           * rangée, et descendue aux deux peaux. C'est le SEUL site du
           * chantier qui appelle la règle : une peau qui la recalculerait
           * serait la jumelle que `ephemeral-reception.ts` existe pour
           * empêcher.
           *
           * Le VERDICT de retrait, lui, a changé au lot #7468 : ce n'est plus
           * « l'échéance est passée » mais la PHASE, qui insère une fenêtre de
           * destruction entre les deux (voir juste dessous).
           */
          const rowIsMine = isMineOf(p.message, viewerId);
          const rowDeadline = resolveEphemeralDeadline({ message: p.message, isMine: rowIsMine, now: renderNow });
          /**
           * TROIS PHASES, UNE LOI (#7468) — `destructionPhaseOf` tranche entre
           * « visible », « en destruction » et « partie », et elle le fait sans
           * état : la fenêtre se lit de l'échéance et de `renderNow`, si bien
           * qu'un rendu déclenché par n'importe quoi d'autre (une frappe, un
           * défilement) rend le même verdict que le tic du chrome. C'est ce qui
           * empêche la rangée d'être coupée net entre l'échéance et l'annonce.
           */
          const rowPhase = destructionPhaseOf({
            deadline: rowDeadline,
            now: renderNow,
            destroying: destroyingIds.has(p.message.id),
            expired: expiredIds.has(p.message.id),
          });
          const rowExpired = rowPhase === 'gone';
          const rowProtection = rowExpired ? 'expired' : protectionOf(p.message, renderNow);
          /* LA PHASE DE RÉVÉLATION EST ALIMENTÉE (#7142) — elle vit SOUS ce
             nœud (`ProtectedContent`, `useState`) alors qu'`aria-label` se
             pose AU-DESSUS, sur `[data-row]` ; elle remonte par le canal
             (`RevealPhaseChannel`, autour de ce rendu) et s'arrête dans
             `revealPhases`. Tant qu'elle était omise, le défaut FERMÉ de
             `composeMessageLabel` s'appliquait : une rangée voilée RÉVÉLÉE
             peignait son contenu pendant que son nom accessible disait encore
             « Contenu masqué » — et le texte peint étant `aria-hidden`
             (`plainTextHidden`, #7032), un lecteur d'écran n'avait AUCUN
             chemin vers ce qu'il venait de dévoiler.

             ABSENT ⇒ `hidden` : le registre ne garde que ce qui s'écarte du
             défaut (voir son doc-comment), si bien qu'une rangée au repos n'y
             occupe aucune entrée. */
          const rowLabel = composeMessageLabel({
            message: p.message,
            isMine: rowIsMine,
            servedText: rowServed.text,
            delivery: checkStatusOf(p.message, rowDelivery),
            protection: rowProtection,
            language: interfaceLanguage,
            contentWithheld: rowWithheld,
            phase: revealPhases.get(p.message.id) ?? { phase: 'hidden' },
          });
          return (
            <li
              key={p.message.id}
              data-index={row.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                insetInlineStart: 0,
                top: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
                /* CHAQUE rangée est un CONTEXTE D'EMPILEMENT (`transform`), et
                   les rangées se peignent dans l'ordre du DOM : les
                   superpositions de l'élue qui DÉBORDENT vers le bas (bande de
                   focus, tampon) passaient donc SOUS la rangée suivante.
                   Mesuré : `elementFromPoint` au centre du drapeau de la bande
                   rendait la rangée d'APRÈS — le contrôle était INATTEIGNABLE
                   au doigt et à la souris, quoique présent et fonctionnel
                   (correction de revue #5648). Élever la SEULE rangée élue
                   suffit ; aucune autre ne porte de débord. */
                ...(isElected ? { zIndex: 1 } : {}),
              }}
            >
              {p.opensDay ? (
                <div className="flex justify-center py-1.5">
                  <span
                    className="glass glass-card rounded-chip px-3 py-1 text-time font-semibold"
                    style={{
                      color: 'var(--color-day-ink)',
                      border: '0.5px solid var(--color-day-hairline)',
                    }}
                  >
                    {dayLabel(p.message.createdAt, { locale: readerLocale })}
                  </span>
                </div>
              ) : null}
              {p.message.id === unreadSeparatorMessageId ? (
                <UnreadSeparator label={unreadSeparatorLabel(currentInterfaceLanguage(), unreadCount)} />
              ) : null}
              {/* LE MODE DE LECTURE (#5566) : `focal`/`script` rendent la
                  rangée plate, `bubbles` reste la bulle historique — D-7,
                  D-8. `data-row` est le CANDIDAT d'élection de
                  `reading-mode/scene.ts` (#5648) — posé sur CHAQUE rangée,
                  candidat SEULEMENT quand la scène est armée (mode focal) —
                  et l'ANCRE du menu du message (#5814) : `useLongPress` vit
                  UNE fois dans cet écran (`messageMenu.longPress`, motif
                  délégation) et lit `dataset.row` au geste, jamais une
                  instance par rangée virtualisée. En SÉLECTION (#5814,
                  question 5), un tap bascule la coche au lieu d'ouvrir le
                  menu (`onRowTap`, gardé côté hook). */}
              {/* `exactOptionalPropertyTypes` (CLAUDE.md racine) : les trois
                  props du menu ne se POSENT que quand elles ont une valeur —
                  un `displayLanguage={undefined}` explicite est refusé au
                  type-check, même discipline que `sendProps` deux blocs plus
                  haut. */}
              {/* PAS d'`aria-selected` (revue #5814) — l'attribut n'existe pas
                  sur `role="article"`, et il était posé DEUX fois (ici et sur
                  la racine de la rangée). L'état de sélection est porté par
                  la COCHE de la rangée : un `role="checkbox"` réel, seul
                  chemin CLAVIER vers la bascule. Le clic sur la rangée
                  ENTIÈRE reste une commodité de souris/doigt. */}
              {/* UN MESSAGE SYSTÈME NE PORTE NI `data-row`, NI `tabIndex`, NI
                  LES GESTIONNAIRES D'APPUI LONG (revue-correction #5936,
                  défaut BLOQUANT 4) — `data-row` est l'ANCRE que
                  `useMessageMenu.openMenuFor` lit (`anchor.element.dataset
                  .row`) et le CANDIDAT d'élection de la scène (§ doc-comment
                  ci-dessus) : sans lui, aucun des deux n'atteint une rangée
                  système, exactement comme iOS délègue les rangées système à
                  `FocalSystemRows.view(…)`, jamais au menu de message
                  (`FocalRow.swift:131-141`). Un appui long y ouvrait le MÊME
                  menu « 😂 ❤️ 👍 😮 😢 🔥 ＋ · Sélectionner · Copier ·
                  Composer · Plus… » qu'une prise de parole — dont AUCUN
                  bouton n'avait d'effet (loi 4 prise en défaut : « un
                  contrôle existe s'il a un EFFET »). Le geste propre à un
                  résumé d'appel (détail d'appel, iOS) reste HORS tranche —
                  ce lot fait seulement SORTIR les rangées système de la
                  surface de gestes du message. `isSystemMessage` est le
                  SITE UNIQUE de cette loi (`lib/view/message-badges.ts`),
                  déjà consommé par `systemRowOf`/`composeMessageLabel`. */}
              {/* `tabIndex` ET les gestionnaires d'appui long vont ENSEMBLE
                  (#6862) : un `tabIndex={0}` sans geste est une halte de
                  tabulation qui n'ouvre rien — le clavier s'arrêterait sur
                  chaque rangée pour ne rien pouvoir faire. `data-row` reste
                  posé sans eux : c'est aussi le CANDIDAT d'élection de la
                  scène, qui n'a besoin d'aucun geste. */}
              {/* L'EFFET DE DESTRUCTION SE POSE ICI (#7468), sur le nœud qui
                  enveloppe LES DEUX peaux — jamais dans `FocalRow` ni dans
                  `Bubble`, qui l'auraient alors câblé chacune et laissé le mode
                  suivant sans rien. `.ephemeral-destroying` porte la combustion
                  ET le repli de la hauteur (`grid-template-rows: 1fr → 0fr`),
                  que le virtualiseur suit par son `ResizeObserver` : les
                  voisins se resserrent à mesure, sans saut de liste. Avec
                  `prefers-reduced-motion`, la feuille retombe sur un fondu. */}
              <div
                {...(rowPhase === 'destroying' ? { 'data-destroying': '', className: 'ephemeral-destroying' } : {})}
                {...(isSystemMessage(p.message) ? {} : { 'data-row': p.message.id })}
                {...(isSystemMessage(p.message) || longPress === undefined ? {} : { tabIndex: 0, ...longPress })}
                role="article"
                aria-label={rowLabel}
                {...(rowServed.language === '' ? {} : { lang: rowServed.language })}
                {...(rowSelected === undefined || onRowTap === undefined
                  ? {}
                  : { onClick: () => onRowTap(p.message.id) })}
              >
                {usesFlatRow(mode) ? (
                  <FocalRow
                    mode={mode}
                    place={p}
                    languages={readerLanguages}
                    viewerId={viewerId}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedId === p.message.id}
                    elected={isElected}
                    expired={rowExpired}
                    ephemeralDeadline={rowDeadline}
                    revealable={!rowWithheld}
                    {...(consume === undefined ? {} : { onConsumeViewOnce: consume })}
                    {...(onEphemeralExpired === undefined ? {} : { onEphemeralExpired })}
                    {...(rowDisplayLanguage === undefined ? {} : { displayLanguage: rowDisplayLanguage })}
                    {...(onPickLanguage === undefined
                      ? {}
                      : { onPickLanguage: (code: string) => onPickLanguage(p.message.id, code) })}
                    {...(rowMyReactions === undefined ? {} : { myReactions: rowMyReactions })}
                    {...(onReact === undefined ? {} : { onReact: (emoji: string) => onReact(p.message.id, emoji) })}
                    {...(rowSelected === undefined || onRowTap === undefined
                      ? {}
                      : { selected: rowSelected, onToggleSelect: onRowTap })}
                    {...sendProps}
                  />
                ) : (
                  <Bubble
                    place={p}
                    languages={readerLanguages}
                    isGrouped={group}
                    viewerId={viewerId}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedId === p.message.id}
                    expired={rowExpired}
                    ephemeralDeadline={rowDeadline}
                    revealable={!rowWithheld}
                    {...(consume === undefined ? {} : { onConsumeViewOnce: consume })}
                    {...(onEphemeralExpired === undefined ? {} : { onEphemeralExpired })}
                    {...(rowDisplayLanguage === undefined ? {} : { displayLanguage: rowDisplayLanguage })}
                    {...(onPickLanguage === undefined
                      ? {}
                      : { onPickLanguage: (code: string) => onPickLanguage(p.message.id, code) })}
                    {...(rowMyReactions === undefined ? {} : { myReactions: rowMyReactions })}
                    {...(onReact === undefined ? {} : { onReact: (emoji: string) => onReact(p.message.id, emoji) })}
                    {...(rowSelected === undefined || onRowTap === undefined
                      ? {}
                      : { selected: rowSelected, onToggleSelect: onRowTap })}
                    {...(onOpenDetail === undefined ? {} : { onOpenDetail })}
                    {...sendProps}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* LA SENTINELLE DE PIED (#7201, W1) — symétrique d'`OlderHead` : un
          pixel APRÈS la dernière rangée, jamais dans le flux typographique
          (`aria-hidden`, comme `OlderHead`). Montée dès qu'il y a au moins
          une rangée — même garde que la tête : une sentinelle qui intersecte
          IMMÉDIATEMENT sur un fil vide n'aurait rien à accuser. */}
      {readTrackingSentinelRef === undefined || placed.length === 0 ? null : (
        <div aria-hidden className="shrink-0" style={{ height: 1 }} ref={readTrackingSentinelRef} />
      )}

      {/* L'indicateur de frappe est une VRAIE cellule du flux, en queue —
          pas un overlay : il pousse le fil comme le ferait un message, donc
          l'arrivee du vrai message ne fait sauter aucune ligne. Extraite dans
          `components/typing-roster-cell.tsx` (#6171, G1) — le ROSTER ENTIER,
          jamais le seul premier frappeur ; doc-comment complet là-bas.
          `flat` (revue-correction #6171, défaut 4) — SEUL site de montage :
          Focal/Script (le mode PAR DÉFAUT, D-7) rendent la pastille + les
          trois points SANS capsule ni libellé visible, miroir
          `TypingIndicatorBubble(isFlat: readingMode != .bubbles)`. */}
      <TypingRosterCell
        typists={typists}
        accent={accent}
        flat={usesFlatRow(mode)}
        {...(typistAvatarOf === undefined ? {} : { avatarOf: typistAvatarOf })}
      />
    </RevealPhaseChannel>
  );
}
