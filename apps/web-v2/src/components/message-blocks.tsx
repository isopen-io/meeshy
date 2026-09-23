import { useEffect, useState, type ReactElement } from 'react';

import type { Message } from '@/lib/api/types';
import type { Delivery } from '@/lib/view/message';
import { forwardLabelOf, type MessageBadge } from '@/lib/view/message-badges';
import { languageColor, flag, languageName } from '@/lib/languages';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { META_TEXT_OPACITY } from '@/lib/reading-mode/metrics';
import { shouldRevealSendingClock } from '@/lib/send/send-clock';

import { activeDecorativeEffects } from '@/lib/effects';
import { quotedPreviewOf, type QuotedMediaKind } from '@/lib/view/quoted-preview';

import { Glyph, GlyphSvg, type GlyphShape } from './glyph';
import { GLYPHS, type GlyphName } from './glyphs';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { THREAD_STATES_GLYPHS } from './glyphs-thread-states';

/**
 * LES BLOCS DE CONTENU D'UN MESSAGE — extraits de `bubble.tsx` (#5566, étape 0
 * de la spécification) pour que la rangée plate du Fil (`focal-row.tsx`) et la
 * bulle (`bubble.tsx`) rendent le MÊME contenu : citation, bande de langues,
 * réactions et coche d'envoi.
 *
 * `Voice` et `Attachments` (pièces jointes — vocal, image, fichier) ont
 * DÉMÉNAGÉ vers `attachment-blocks.tsx` (#5805, § 5 étape 0 de la
 * spécification) : leur RESPONSABILITÉ a changé (« widgets de média », que
 * les stories, le feed et les commentaires monteront aussi), et ce fichier
 * ne les réexporte pas — une seule adresse pour les importer.
 *
 * Deux PEAUX, un seul contenu — sans cette extraction, `focal-row.tsx`
 * deviendrait la jumelle de `bubble.tsx` sur exactement les langues (règle du
 * dépôt : « UNE source de vérité, aucune jumelle divergente »). Ce que ce
 * fichier NE PORTE PAS : le rayon de bulle, le fond, l'alignement
 * gauche/droite — ça reste le métier de chaque peau.
 */

export const CHECKS: Record<Delivery, { readonly name: GlyphName; readonly size: number; readonly read: boolean } | null> = {
  pending: { name: 'clock', size: 10, read: false },
  sent: { name: 'check', size: 10, read: false },
  delivered: { name: 'checks', size: 10, read: false },
  read: { name: 'checks', size: 11, read: true },
};

export const STATUS_LABEL: Record<Delivery, string> = {
  pending: 'en cours d’envoi',
  sent: 'envoyé',
  delivered: 'remis',
  read: 'lu',
};

/**
 * LA PASTILLE DU PRISME — elle ne se montre QUE si le texte affiché est une
 * TRADUCTION (« la traduction ne se signale que par la pastille du pied ») et
 * elle a un EFFET : elle ouvre, et referme, le message dans sa langue
 * d'origine. Elle était rendue INCONDITIONNELLEMENT et sans `onClick` — donc
 * elle mentait deux fois : sur un message non traduit, et à chaque clic.
 *
 * Le geste double celui du premier drapeau du pied, et c'est voulu :
 * l'exploration de l'original est l'affordance DISCRÈTE du Prisme, le pied
 * étant l'affordance EXHAUSTIVE (toutes les langues servies).
 *
 * ## SANS `onToggle`, ELLE INFORME ET NE PROMET RIEN (#6862, revue-correction)
 *
 * La lecture souveraine de l'administration est le premier hôte du dépôt qui
 * n'a AUCUNE prise de langue : on ne change pas la langue lue au nom d'un
 * tiers. Le bouton y restait pourtant peint, focalisable, annoncé « Afficher
 * le message dans sa langue d'origine » — et son clic n'appelait rien. C'est
 * le contrôle sans effet de la loi 4, sous la forme qui a déjà coûté au dépôt
 * (`PostCard`, cycle 123 du `CLAUDE.md`) : cliquer ne changeait PAS le texte lu.
 *
 * Le FAIT reste dit — « ce texte est une traduction » est l'indicateur discret
 * du Prisme (§ Transparence), et le retirer priverait le lecteur d'une
 * information vraie. Seul le GESTE disparaît : une `<span>`, donc ni halte de
 * tabulation, ni `aria-pressed`, ni verbe à l'infinitif.
 */
/**
 * CE QUE LA PASTILLE QUALIFIE (#7141). « Afficher le message dans sa langue
 * d'origine » sur un commentaire serait traduit et FAUX : le vocabulaire fait
 * partie de la justesse, pas de la décoration. Trois sujets, neuf clés plates —
 * l'accord (« traduit » / « traduite ») ne se paramètre pas d'une langue à
 * l'autre.
 */
export type PrismSubject = 'message' | 'comment' | 'post';

/* Des tables FERMÉES (`Record<PrismSubject, …>`) plutôt qu'une clé composée :
   un sujet de plus fait rougir `tsc` ICI, au lieu de rendre une clé absente que
   le catalogue servirait telle quelle. */
const TRANSLATED_KEY = {
  message: 'prism.translated.message',
  comment: 'prism.translated.comment',
  post: 'prism.translated.post',
} as const satisfies Record<PrismSubject, string>;

const SHOW_KEY = {
  message: 'prism.original.show.message',
  comment: 'prism.original.show.comment',
  post: 'prism.original.show.post',
} as const satisfies Record<PrismSubject, string>;

const HIDE_KEY = {
  message: 'prism.original.hide.message',
  comment: 'prism.original.hide.comment',
  post: 'prism.original.hide.post',
} as const satisfies Record<PrismSubject, string>;

export function PrismPastille({
  servedLanguage,
  originalLanguage,
  active,
  language,
  subject,
  onToggle,
}: {
  servedLanguage: string;
  originalLanguage: string;
  active: string | null;
  /** La langue de l'INTERFACE — jamais celle du contenu, que le Prisme résout. */
  language: InterfaceLanguage;
  subject: PrismSubject;
  /** ABSENTE ⇒ l'hôte ne sait pas explorer une autre langue : aucun bouton. */
  onToggle?: () => void;
}) {
  if (servedLanguage === originalLanguage) return null;
  const isOpen = active === originalLanguage;

  if (onToggle === undefined) {
    return (
      <span
        data-prism-indicator
        className="grid size-[22px] place-items-center rounded-menu"
        style={{ color: 'var(--color-i400)' }}
      >
        <Glyph name="translate" size={12} />
        <span className="offscreen">{translate(language, TRANSLATED_KEY[subject])}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      data-prism-toggle
      onClick={onToggle}
      aria-pressed={isOpen}
      aria-label={translate(language, (isOpen ? HIDE_KEY : SHOW_KEY)[subject])}
      /* `tap-target-22` étend la zone TACTILE par un `::after` en débord
         (`app.css`) sans grandir le DESSIN — élargir visuellement ce bouton
         grandirait chaque message traduit. Défaut #5566 (revue, défaut 11
         puis défaut 1 de la revue-correction) : plein en VERTICAL (-11px,
         rien ne le dispute), borné en HORIZONTAL à la moitié du gap réel
         vers `Flags` (-2px) pour ne jamais voler le clic du premier drapeau —
         le geste PLEIN existe ailleurs (menu long-appui du message, hors
         périmètre de ce lot). */
      className="tap-target-22 grid size-[22px] place-items-center rounded-menu"
      style={{ color: isOpen ? languageColor(originalLanguage) : 'var(--color-i400)' }}
    >
      <Glyph name="translate" size={12} />
    </button>
  );
}

/**
 * `reactionSummary` est la forme DÉNORMALISÉE du serveur (`{ emoji: n }`) —
 * une seule lecture pour les DEUX peaux (bulle et rangée plate), sinon la
 * seconde oublie les réactions, ce qui est exactement arrivé.
 */
export function reactionEntries(
  summary: Message['reactionSummary'],
): readonly (readonly [string, number])[] {
  return Object.entries(summary ?? {});
}

/**
 * UNE pilule de réaction — la bulle la pose en débord, la rangée plate en
 * ligne basse. `mine` (#5814, T12) marque « CE lecteur a posé cet emoji » —
 * un contour d'accent, miroir `BubbleReactionsOverlay.swift:189-199`.
 *
 * DEVIENT UN `<button>` QUAND `onToggle` EST FOURNI (#5865, suivi de #5814
 * — `bulle.md` écart 8) : iOS retire déjà une réaction en tapant directement
 * sa propre capsule (`BubbleReactionsOverlay.swift`), seul le rail du menu
 * du message (appui long) le permettait ici. L'hôte (`bubble.tsx`,
 * `focal-row.tsx`) ne câble `onToggle` QUE sur les capsules `mine` — taper
 * la capsule d'AUTRUI n'a pas de sens (on ne bascule pas la réaction de
 * quelqu'un d'autre), donc `onToggle` reste `undefined` pour elles et la
 * capsule garde son rendu `<span>` d'origine.
 *
 * LA MARQUE RESTE TEXTUELLE, PAS `aria-pressed` (revue #5814) :
 * `aria-pressed` n'est défini QUE sur `role="button"`. Posé sur un `<span>`
 * sans rôle, il était ignoré par la norme — et, chez les lecteurs d'écran
 * qui le prennent quand même, il annonçait un BOUTON BASCULE que rien ne
 * bascule : très exactement le contrôle qui ment que la loi 4 du dépôt
 * interdit. Devenu un vrai `<button>`, son EFFET est nommé par `aria-label`
 * (« Retirer votre réaction … »), jamais par `aria-pressed` — retirer n'est
 * pas basculer entre deux états visibles du même contrôle.
 */
export function ReactionChip({
  glyph,
  count,
  mine = false,
  onToggle,
}: {
  glyph: string;
  count: number;
  mine?: boolean;
  /** Retire la réaction en tapant la capsule — fourni par l'hôte SEULEMENT
   * quand `mine` est vrai (#5865). */
  onToggle?: () => void;
}) {
  const style = {
    backgroundColor: mine ? 'color-mix(in srgb, var(--accent) 16%, var(--color-ios-card))' : 'var(--color-ios-card)',
    border: mine ? '1px solid var(--accent)' : '1px solid var(--color-edge)',
  };
  const content = (
    <>
      <span aria-hidden>{glyph}</span>
      <span className="tabular-nums opacity-70">{count}</span>
      <span className="offscreen">
        {count} réaction{count > 1 ? 's' : ''} {glyph}
        {mine ? ' — la vôtre' : ''}
      </span>
    </>
  );
  if (onToggle !== undefined) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Retirer votre réaction ${glyph}`}
        /* `tap-target-chip` (`app.css`) étend la zone TACTILE à 44 px sans
           grandir le DESSIN de la capsule (même dispositif que
           `tap-target-22`/`tap-target-34` plus haut dans ce fichier). */
        className="tap-target-chip flex items-center gap-0.5 rounded-chip px-1.5 py-0.5 text-check"
        style={style}
      >
        {content}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-0.5 rounded-chip px-1.5 py-0.5 text-check" style={style}>
      {content}
    </span>
  );
}

/**
 * L'HORLOGE RÉVÉLÉE APRÈS 200 MS (#5813, étape 9, miroir
 * `BubbleDeliveryCheck.swift:128-141`) — composant FEUILLE : c'est LUI qui
 * tient le minuteur, jamais la rangée qui l'englobe (`bulle.md`, écart 754,
 * doctrine D-23 déjà appliquée à l'éphémère : « écrire une seconde horloge
 * de révélation dans une peau » est le défaut interdit). `useState` +
 * `useEffect(setTimeout)`, désarmé au démontage — jamais un `setInterval`.
 */
function SendingClock({ startedAt, children }: { startedAt: number; children: ReactElement }) {
  const [revealed, setRevealed] = useState(() => shouldRevealSendingClock(startedAt, Date.now()));
  useEffect(() => {
    if (revealed) return;
    const remaining = Math.max(0, 200 - (Date.now() - startedAt));
    const timer = setTimeout(() => setRevealed(true), remaining);
    return () => clearTimeout(timer);
  }, [startedAt, revealed]);
  return revealed ? children : null;
}

export function Check({
  status,
  isMine,
  sendStartedAt,
  onOpen,
}: {
  status: Delivery;
  isMine: boolean;
  /** Epoch ms du DÉBUT de la tentative en cours (`outbox-store.ts`) — SEUL
   * `status === 'pending'` en tient compte (§5 étape 9 de la spécification
   * #5813) : sous ce seuil, aucune horloge ne clignote. */
  sendStartedAt?: number;
  /**
   * LA COCHE OUVRE LA FICHE (#7352, V4) — `undefined` ⇒ comportement
   * INCHANGÉ, un glyphe NU (`role="img"`, `title` pour nom accessible),
   * exactement comme avant ce lot. Fourni ⇒ le glyphe devient DÉCORATIF
   * (`aria-hidden`, `Glyph` sans `title`) À L'INTÉRIEUR d'un vrai
   * `<button>` nommé par son EFFET (`message-detail.open`, catalogue des
   * sept langues — Prisme Linguistique, jamais une chaîne en dur), pas par
   * le statut — même dispositif
   * que `ReactionChip` (capsule voisine de la même ligne méta,
   * `tap-target-chip`). SEUL `Bubble` (mode `bulles`) le câble
   * aujourd'hui : `FocalRow` (`focal`/`script`, le défaut, D-7) garde sa
   * ligne méta `aria-hidden` INCONDITIONNEL (revue #5935) — y poser ce
   * bouton reproduirait l'anti-motif WCAG que cette revue a fermé
   * (`V4.md` § 1).
   */
  onOpen?: () => void;
}) {
  if (!isMine) return null;
  const check = CHECKS[status];
  if (!check) return null;
  const glyph = (
    <Glyph
      name={check.name}
      size={check.size}
      {...(onOpen === undefined ? { title: STATUS_LABEL[status] } : {})}
      {...(check.read ? { style: { color: 'var(--color-read)' } } : {})}
    />
  );
  const node =
    onOpen === undefined ? (
      glyph
    ) : (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={translate(currentInterfaceLanguage(), 'message-detail.open')}
        className="tap-target-chip inline-flex items-center"
      >
        {glyph}
      </button>
    );
  if (status === 'pending' && sendStartedAt !== undefined) {
    return <SendingClock startedAt={sendStartedAt}>{node}</SendingClock>;
  }
  return node;
}

/**
 * La bande de drapeaux du pied — au plus `limit` (4 par défaut, la cote
 * historique de ce composant). La rangée ÉLUE du fil (#5648) passe
 * `FLAG_LIMIT_PLAIN` (3) sur sa ligne basse ordinaire et
 * `FLAG_LIMIT_MAGNIFIED` (5) sur sa bande de focus
 * (`FocalMetrics.FocusStrip.flagLimitPlain/.flagLimitMagnified`,
 * gardées par `scripts/check-curve.mjs`) — deux cotes iOS, un seul
 * composant.
 *
 * `onPick` reste REQUIS, à l'inverse de `PrismPastille.onToggle` (#6862,
 * revue-correction). Ces drapeaux sont un CONTRÔLE et rien d'autre — sans
 * geste, ils n'informent de rien qu'un lecteur puisse utiliser. Un hôte sans
 * prise de langue ne doit donc pas les monter du tout, et le type le lui dit :
 * rendre `onPick` optionnel ferait DISPARAÎTRE la bande en silence chez un
 * hôte qui a simplement oublié de la brancher — un contrôle absent ne se voit
 * dans aucun témoin (`vue sans consommateur`).
 */
export function Flags({
  languages,
  active,
  onPick,
  limit = 4,
}: {
  languages: readonly string[];
  active: string | null;
  onPick: (code: string) => void;
  limit?: number;
}) {
  return (
    /* `gap-1` (4px) et non `gap-0.5` (2px, defaut 1 de la revue-correction
       #5566) : le debord horizontal de `tap-target-22` (`app.css`) se borne a
       la MOITIE du gap reel pour ne jamais franchir la boite d'un voisin —
       avec 2px de gap la borne (1px) etait trop maigre pour offrir un
       agrandissement horizontal utile ; unifiee sur 4px (le meme gap que le
       conteneur pastille+drapeaux dans `bubble.tsx`/`focal-row.tsx`), elle
       porte -2px de chaque cote sans jamais se recouvrir. */
    <span className="flex items-center gap-1">
      {languages.slice(0, limit).map((code) => {
        const isActive = code === active;
        return (
          <button
            key={code}
            type="button"
            data-prism-flag={code}
            onClick={() => onPick(code)}
            aria-pressed={isActive}
            /* 22 px de DESSIN et non 44 : elargir cette cible grandirait
               CHAQUE bulle traduite. `tap-target-22` (`app.css`) etend la
               zone TACTILE par un `::after` en debord, sans toucher au
               layout — plein en vertical, borne en horizontal a la moitie
               du gap de 4px vers les freres (pastille et drapeaux voisins,
               defaut 1 de la revue-correction #5566) pour qu'aucun drapeau
               ne vole jamais le clic de son voisin. La compensation par un
               second geste a taille pleine ailleurs (menu « Plus »)
               N'EXISTE PAS dans ce depot (mesure, revue #5566 defaut 11) :
               cette classe est desormais la SEULE compensation, et elle est
               reelle — sans jamais deborder sur autrui. */
            className="tap-target-22 grid size-[22px] place-items-center rounded-menu leading-none transition-colors"
            title={languageName(code)}
          >
            <span className="flex flex-col items-center gap-px">
              <span style={{ fontSize: isActive ? 12 : 11 }}>{flag(code)}</span>
              <span
                className="block rounded-full"
                style={{
                  width: 10,
                  height: 1.5,
                  backgroundColor: isActive ? languageColor(code) : 'transparent',
                }}
              />
            </span>
          </button>
        );
      })}
    </span>
  );
}

// `SecondaryText` (le panneau « sous le texte » ouvert par un tap de
// drapeau) A ÉTÉ RETIRÉ EN REVUE (#5814, défaut majeur 12) : il tenait une
// loi de langue LOCALE à la rangée (`openLanguage`), divergente de celle du
// menu du message (`useMessageMenu.displayLanguages`) — un même geste
// (« quelle langue pour CE message ») rendait deux réponses contradictoires
// à l'écran (le pied révélait l'anglais, le sous-menu « Traduire » cochait
// toujours le français). Le pied et le sous-menu partagent désormais UN
// SEUL état (`displayLanguage`/`onPickLanguage`, D-14 : `served()` reste
// l'UNIQUE résolveur), qui SUBSTITUE le texte plutôt que de le doubler d'un
// panneau — rapprochant du même mouvement web-v2 de la cible iOS
// (`FocalRow.swift:1082`, `onSetActiveDisplayLanguageForGroup`, qui change
// le texte SERVI). La portée PAR GROUPE (iOS l'applique à toute la suite,
// web-v2 reste par rangée) demeure un écart ASSUMÉ, tracé en dehors de ce
// lot (`targets/focal-script.md` § 10 écart 4).

/**
 * LES BADGES DE TÊTE — épinglé, transféré (#5936). Miroir
 * `FocalRow.badgesSection` / `BubbleStandardLayout` : deux peaux, un seul
 * rendu — la loi qui les ORDONNE et les CALCULE vit dans `badgesOf`
 * (`lib/view/message-badges.ts`), ce composant ne fait qu'AFFICHER ce
 * qu'elle rend.
 *
 * `ephemeral` et `edited` (aussi présents dans `badgesOf`, pour que l'ORDRE
 * complet d'un message reste décidé à UN site) ne sont PAS peints ici :
 * `ephemeral` reste porté par `EphemeralBadge` (son propre minuteur,
 * `protected-content.tsx`, monté par chaque peau juste au-dessus de ces
 * badges) et `edited` par `EditedMark` ci-dessous (méta côté rangée plate,
 * inline côté bulle — jamais un badge de tête sur aucune des deux peaux,
 * `FocalMetaRow.swift:86`, `BubbleStandardLayout.swift:1064-1066`).
 *
 * `isMine`/`surface` n'entrent PAS dans la signature (bien que le brief les
 * nomme) : ni `BubblePinnedIndicator` ni `BubbleForwardedIndicator` ne
 * varient sur l'un ou l'autre (lu dans `ForwardBadgePolicy.swift` et
 * `BubbleMetaBadges.swift` — `isMe` y est déclaré mais jamais lu par le
 * corps), et `noUnusedParameters` (`tsconfig.json`) refuse un paramètre
 * mort.
 *
 * LA TEINTE (revue-correction #5936, défaut majeur 9) — CHAQUE badge reprend
 * la teinte iOS DE SA PROPRE SOURCE, jamais l'indigo de marque emprunté à un
 * AUTRE objet (`--color-day-ink` est le jeton du SÉPARATEUR DE JOUR — un
 * essai précédent l'avait servi ici pour contourner un défaut AA, ce que la
 * revue a refusé au regard de D-1) :
 * - épinglé — `--ios-pinned` sur le GLYPHE **et** le TEXTE, mono-teinte
 *   (`BubbleMetaBadges.swift:78-85`, `MeeshyColors.pinnedBlue` entier) ;
 * - transféré — `--color-ios-ink-3` (le cran `textMuted` DÉJÀ dérivé,
 *   `generate-from-ios.mjs:348/375`), miroir `theme.textMuted`
 *   (`BubbleMetaBadges.swift:111-118`) ;
 * - modifié — voir `EditedMark`, le cran MÉTA (`textSecondary.opacity(0.5)`).
 *
 * `--ios-pinned` (#3b82f6) mesure 3,68:1 en clair sur le fond de rangée —
 * sous la barre AA de 4,5:1 pour du texte de 11 px. Aucun cran plus sombre
 * n'existe côté Swift pour ce bleu (constante UNIQUE, theme-invariant,
 * aucune rampe 600-900) : en inventer un QUATRIÈME jeton web-v2 divergerait
 * de la palette DÉRIVÉE (D-4) plutôt que de réparer sa source. Écart CONNU
 * de la cible iOS elle-même (comme `textSecondary.opacity(0.5)` pour
 * « modifié », voir `EditedMark`) — issue compagnon #6010 sur le JETON iOS,
 * pas un raccourci pris dans web-v2.
 */
export function Badges({ badges }: { readonly badges: readonly MessageBadge[] }) {
  const head = badges.filter((badge) => badge.kind === 'pinned' || badge.kind === 'forwarded');
  if (head.length === 0) return null;
  return (
    /* `aria-hidden` (revue #5936, défaut majeur 8) — CE QUE CES BADGES
       DISENT EST DÉJÀ DANS `rowLabel` (`composeMessageLabel`, « … modifié,
       épinglé, transféré depuis X »), exactement comme le `<p>` de texte
       voisin ou la colonne méta : sans ce masque, un lecteur d'écran
       prononçait « épinglé » et « transféré depuis Salon » DEUX FOIS par
       message. */
    <div data-badges className="flex flex-wrap items-center gap-1" aria-hidden>
      {head.map((badge) =>
        badge.kind === 'pinned' ? (
          <span
            key="pinned"
            data-badge="pinned"
            className="flex items-center gap-1 text-check font-medium"
            style={{ color: 'var(--ios-pinned)' }}
            aria-label="Message épinglé"
          >
            <Glyph name="pushPin" size={11} style={{ transform: 'rotate(45deg)' }} />
            épinglé
          </span>
        ) : (
          <em
            key="forwarded"
            data-badge="forwarded"
            className="line-clamp-1 flex items-center gap-1 text-check italic"
            style={{ color: 'var(--color-ios-ink-3)' }}
          >
            <GlyphSvg glyph={THREAD_STATES_GLYPHS.arrowBendUpRight} size={11} />
            {forwardLabelOf(badge.attribution, currentInterfaceLanguage())}
          </em>
        ),
      )}
    </div>
  );
}

/**
 * L'INDICATEUR D'EFFETS DÉCORATIFS (#6175, revue-correction défaut majeur 1)
 * — `message.effectFlags` voyageait jusqu'au serveur sans qu'AUCUNE surface
 * web ne le rende : l'auteur qui cochait « Confettis » ne voyait jamais rien,
 * ni sur sa bulle optimiste ni après confirmation (CLAUDE.md racine, cycle
 * 122, « qui AFFICHE ce que le résolveur élit ? »).
 *
 * CE QUE CE LOT REND, ET CE QU'IL NE REND PAS ENCORE — assumé, pas oublié :
 * la charte v3 (règle 32, `app.css:202-224`, `decisions.md:988-990`)
 * n'autorise qu'UN SEUL `@keyframes` dans tout le dépôt (déjà pris par
 * `typingDot`) et n'anime QUE `opacity`/`scale`, jamais la géométrie. Les dix
 * effets d'iOS (`MessageEffectModifiers.swift`) sont pour la moitié des
 * secousses, des particules (confettis, feux d'artifice) ou une comète qui
 * parcourt le contour — un TRAVAIL DE PARTICULES que `règle 32` interdit
 * tel quel, et que le web LEGACY (`apps/web/components/common/
 * MessageEffects.tsx`, ~360 lignes à deux fichiers) réalise avec ses propres
 * `@keyframes` sous une charte différente, sans cette contrainte.
 * Repeindre dix animations SANS décision produit sur `règle 32` serait
 * exactement le défaut que #6175 corrige déjà ailleurs (composeurAccentOf,
 * défaut 2) : trancher une peinture sans sa cible. Ce badge rend donc
 * VISIBLE, de façon STATIQUE (zéro animation, zéro risque de saccade au
 * défilement d'une liste virtualisée), lequel effet l'auteur a choisi — glyphe
 * + libellés au survol/`title` — et diffère le CÉLÉBRATOIRE animé à une issue
 * compagnon qui statue d'abord sur l'exception à `règle 32`.
 *
 * `aria-hidden` (même discipline que `Badges`/`EditedMark` juste au-dessus) —
 * CE QUE CE BADGE DIT EST DÉJÀ DANS `rowLabel` (`composeMessageLabel`,
 * `message-a11y-label.ts`) : sans ce masque, un lecteur d'écran prononcerait
 * « effets actifs, confettis » une seconde fois après le libellé de la rangée.
 */
export function EffectsIndicator({ effectFlags }: { readonly effectFlags: number | undefined }) {
  const active = activeDecorativeEffects(effectFlags);
  if (active.length === 0) return null;
  const labels = active.map((effect) => effect.label).join(', ');
  return (
    <span
      data-badge="effects"
      aria-hidden
      className="flex items-center gap-1 text-check font-medium"
      style={{ color: 'var(--accent)' }}
      title={labels}
    >
      <GlyphSvg glyph={THREAD_MENU_GLYPHS.magicWand} size={11} />
      {active.length}
    </span>
  );
}

/**
 * « MODIFIÉ » — `BubbleMetaBadges.swift:13-61` : glyphe crayon + texte
 * italique, teinte MÉTA (blanche 60 % sur ma bulle, `--color-meta` sinon).
 * Côté rangée plate elle vit dans `.focal-meta`, AVANT `<time>`
 * (`FocalMetaRow.swift:86`) ; côté bulle, INLINE dans le corps, entre la
 * citation et le texte (`BubbleStandardLayout.swift:1064-1066`) — chaque
 * peau choisit où la monter, ce composant ne fait que la DESSINER.
 */
export function EditedMark({ onBrandBubble }: { readonly onBrandBubble: boolean }) {
  /* LA SURFACE DÉCIDE, PAS L'EXPÉDITEUR (revue-correction #5936).
     `--color-meta-mine` vaut `white 70%` (`ios.css:99`, dérivé de
     `BubbleFooter.swift:283`) : elle n'est AA que posée SUR l'indigo de
     marque. Un `isMine` la servait aussi à la rangée PLATE (qui n'a jamais
     de bulle) et au corps NU d'un emoji seul ou d'un sticker (qui sort de la
     boîte) — blanc sur fond clair, mesuré 1,3:1. iOS le tranche au même
     endroit : `BubbleFooter.compactMetaColor` (`:62-66`) sert « la couleur
     meta neutre quel que soit isMe » dès que le pied s'affiche hors d'une
     bulle.
     SINON (revue #5936, défaut majeur 9) : le cran MÉTA — `--color-ios-ink-2`
     (`textSecondary`) à `META_TEXT_OPACITY` (0,55, la même cote que
     `.focal-meta`, `reading-mode/metrics.ts`) — miroir
     `theme.textSecondary.opacity(0.5)` (`BubbleMetaBadges.swift:19-21`),
     JAMAIS `--color-day-ink` (le jeton du séparateur de JOUR, emprunté par
     un essai précédent pour contourner ce même défaut AA — refusé en revue :
     un badge n'emprunte pas la teinte d'un AUTRE objet). Ce cran mesure
     3,98:1 en clair — sous AA, mais c'est la valeur EXACTE qu'iOS porte
     (aveu `FocalMetaRow.swift:16-24`) : un écart CONNU de la cible, pas un
     raccourci de web-v2 — issue compagnon #6010 sur le JETON. */
  /* `aria-hidden` (revue #5936, défaut majeur 8) — « modifié » est déjà dans
     `rowLabel` (`composeMessageLabel`) : la rangée plate le masquait déjà,
     la bulle ne le faisait pas — asymétrie corrigée en posant le masque ICI,
     au site UNIQUE des deux peaux, plutôt qu'à chaque appelant. */
  return (
    <span
      data-badge="edited"
      aria-hidden
      className="flex items-center gap-1 text-check italic"
      style={
        onBrandBubble
          ? { color: 'var(--color-meta-mine)' }
          : { color: 'var(--color-ios-ink-2)', opacity: META_TEXT_OPACITY }
      }
    >
      <GlyphSvg glyph={THREAD_STATES_GLYPHS.pencilSimple} size={11} />
      modifié
    </span>
  );
}

/**
 * LE GLYPHE D'UN GENRE CITÉ — miroir `previewGlyph`
 * (`BubbleQuotedReply.swift:452-476`), qui nomme un TYPE. Décoratif ici (le
 * bouton entier SAUTE au message cité, il n'ouvre aucun média) : `GlyphSvg`
 * sans `title` pose donc `aria-hidden`, et le genre reste dit à l'oreille par
 * `inventory` sur le nom accessible du bouton.
 */
const QUOTE_GLYPH: Readonly<Record<QuotedMediaKind, GlyphShape>> = {
  image: GLYPHS.image,
  video: THREAD_STATES_GLYPHS.videoCamera,
  audio: GLYPHS.microphone,
  file: GLYPHS.file,
};

/** `Self.thumbnailSize` (`BubbleQuotedReply.swift`) — la vignette carrée de la citation. */
const QUOTE_THUMBNAIL_PX = 36;

export function Quote({
  quote,
  isMine,
  languages,
  onJump,
}: {
  quote: NonNullable<Message['replyTo']>;
  isMine: boolean;
  /**
   * LE PRISME DU LECTEUR (#7556) — celui que la rangée hôte a déjà reçu. Sans
   * lui, `Quote` rendait `quote.content` BRUT : le même message cité
   * s'affichait traduit dans le bandeau du composeur (`use-reply-preview.ts`,
   * qui descendait le Prisme) et en langue d'ORIGINE une fois gravé dans la
   * bulle.
   *
   * La langue EXPLORÉE au geste (`displayLanguage`) n'entre PAS ici : elle
   * appartient au message qui PORTE la citation, pas au message CITÉ.
   */
  languages: readonly string[];
  /**
   * SAUTE au message cité et le met en évidence — absent QUE lorsque l'hôte
   * n'a pas encore la liste complète des messages à portée (rare, jamais le
   * cas courant du fil). Le bouton promet une navigation par son nom
   * accessible : sans `onJump`, cette promesse serait fausse — donc câbler
   * cette prop est OBLIGATOIRE chez tout hôte du fil (`focal-row.tsx`,
   * `bubble.tsx`).
   */
  onJump: () => void;
}) {
  /* SITE UNIQUE (`lib/view/quoted-preview.ts`) — ce composant DESSINE, il ne
     RÉSOUT pas : une seconde descente ici servirait une autre langue que le
     bandeau du composeur, qui lit la même fonction. */
  const preview = quotedPreviewOf({
    quoted: quote,
    readerLanguages: languages,
    interfaceLanguage: currentInterfaceLanguage(),
  });
  const media = preview.media;
  const ink = isMine ? 'var(--color-meta-mine)' : 'var(--color-ios-ink-2)';
  /* L'INVENTAIRE REJOINT LE NOM ACCESSIBLE — `attachmentSegments`, le MÊME
     vocabulaire que `composeMessageLabel` (le bouton porte un `aria-label`,
     donc son contenu n'est PAS lu : sans ce segment, « une photo » n'était
     annoncée nulle part). */
  const label = [`Aller au message de ${quote.sender?.displayName ?? 'l’expéditeur'}`, ...preview.inventory].join(', ');

  return (
    <button
      type="button"
      onClick={onJump}
      className="mb-1.5 flex w-full rounded-quote text-left"
      style={{ backgroundColor: isMine ? 'var(--color-quote-mine)' : 'var(--color-quote)' }}
      {...(media === null ? {} : { 'data-quote-media': media.kind })}
      aria-label={label}
    >
      <span
        className="w-1 shrink-0 rounded-full"
        style={{
          backgroundColor: isMine ? 'color-mix(in srgb, white 70%, transparent)' : 'var(--accent)',
        }}
        aria-hidden
      />
      {/* LA VIGNETTE (#7556) — `quotedThumbnail` (`BubbleQuotedReply.swift:
          382-411`). Le flou ThumbHash tient la case AVANT la requête réseau ;
          `alt=""` + `aria-hidden` parce que le bouton porte déjà son nom. */}
      {media !== null && media.thumbnailSrc !== null ? (
        <span
          className="relative my-1.5 ml-1.5 shrink-0 overflow-hidden rounded-media"
          style={{
            width: QUOTE_THUMBNAIL_PX,
            height: QUOTE_THUMBNAIL_PX,
            ...(media.placeholderSrc === null
              ? {}
              : { backgroundImage: `url("${media.placeholderSrc}")`, backgroundSize: 'cover' }),
          }}
          aria-hidden
        >
          <img
            data-quote-thumb={media.kind}
            src={media.thumbnailSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
          {media.timebased ? <Glyph name="fillPlay" size={12} className="absolute inset-0 m-auto text-white" /> : null}
        </span>
      ) : null}
      {/* Le nom et le texte cite COULENT DANS LE MEME PARAGRAPHE (directive
          iOS #5103) : deux lignes separees feraient de la citation un bloc
          aussi haut que le message, et c'est le message qu'on vient lire. */}
      <span className="min-w-0 py-2 pr-2.5 pl-2 text-title">
        <span className="font-semibold" style={{ color: isMine ? 'white' : 'var(--accent)' }}>
          {quote.sender?.displayName ?? ''}{' '}
        </span>
        {media !== null && media.thumbnailSrc === null && !preview.isProtected ? (
          <GlyphSvg
            glyph={QUOTE_GLYPH[media.kind]}
            size={11}
            className="mr-1 inline-block align-baseline"
            style={{ color: ink }}
          />
        ) : null}
        <span
          className="line-clamp-2"
          style={{ color: ink }}
          {...(preview.language === '' ? {} : { lang: preview.language })}
        >
          {preview.text}
        </span>
        {/* LA DURÉE, quand elle existe — `detailsLabel` (`QuotedReplyPresentation
            .swift:107-151`) : « un ZÉRO n'est pas un fait », donc rien plutôt
            qu'un « 0:00 » qu'on croirait. */}
        {media !== null && media.durationLabel !== null ? (
          <span
            data-quote-duration={media.durationLabel}
            className="block text-check tabular-nums"
            style={{ color: ink, opacity: META_TEXT_OPACITY }}
          >
            {media.durationLabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * LA BANDE DE REPRISE D'UN ENVOI ÉCHOUÉ (revue-correction #5813, défauts
 * majeurs 2 et 7) — SITE UNIQUE partagé par `bubble.tsx` et `focal-row.tsx`,
 * pour que les deux peaux tiennent la MÊME règle de cible tactile et la
 * MÊME règle de refus permanent, sans jumelle à resynchroniser (deux copies
 * de ce bloc divergeaient déjà sur la couleur du texte).
 *
 * `onRetry === undefined` ⇒ REFUS PERMANENT (`permanentOf`,
 * `lib/view/use-send.ts`, dérivé d'`isPermanentFailure`,
 * `lib/api/outcome.ts`) : la CAUSE reste affichée, le GESTE disparaît —
 * jamais un bouton qui promet un rejeu impossible (403/401 ne peuvent pas
 * aboutir en rejouant le MÊME appel, quel que soit le nombre de tentatives).
 * La bande devient un `<div>` sans `Réessayer`, jamais un `<button>` inerte.
 *
 * `min-height: 44` est la cible tactile du dépôt (dimension 5, « cibles
 * >= 44 px ») — la bande était mesurée à 27 px, le seul contrôle de
 * réparation du fil sous la règle que le dépôt tient déjà ailleurs
 * (`routes/conversations.tsx`, l'erreur de liste). `text-mini` (11px,
 * `--ios-font-footnote`) remplace `text-check` (10px, `--ios-font-caption`) —
 * un token DÉRIVÉ plus grand (D-4), jamais une valeur inventée.
 */
export function FailedSendBand({
  reason,
  onRetry,
  textColor,
}: {
  readonly reason?: string;
  readonly onRetry?: () => void;
  readonly textColor: string;
}) {
  /* LES TROIS LIBELLÉS VIENNENT DU CATALOGUE (#7337) — « Non envoyé »,
     « Non envoyé — {reason} » et « Réessayer » étaient EN DUR, en français,
     sur la bande que SEPT langues lisent. La RAISON, elle, reste telle que
     l'appelant la sert : elle vient du refus (`lib/api/outcome.ts`), pas du
     catalogue, et sa place dans la phrase est décidée par la LANGUE
     (`{reason}`), jamais par une concaténation ici. */
  const language = currentInterfaceLanguage();
  const label =
    reason === undefined
      ? translate(language, 'message.send.failed')
      : translate(language, 'message.send.failed.reason', { reason });
  const className = 'mb-1.5 flex w-full items-center gap-1.5 rounded-quote px-2 text-left text-mini font-semibold';
  const style = {
    backgroundColor: 'color-mix(in srgb, var(--color-error) 18%, transparent)',
    color: textColor,
    minHeight: 44,
  };
  const titleProp = reason === undefined ? {} : { title: reason };

  /* `data-send-failed` / `-label` / `data-send-retry` : les POIGNÉES des
     gates (#7337). Ils désignaient la bande par son texte français, et ne
     pouvaient donc la trouver que tant qu'elle n'était pas traduite. */
  if (onRetry === undefined) {
    return (
      <div data-send-failed="permanent" className={className} style={style} {...titleProp}>
        <Glyph name="warningCircle" size={12} />
        <span data-send-failed-label className="flex-1">{label}</span>
      </div>
    );
  }

  return (
    <button type="button" data-send-failed="retryable" onClick={onRetry} {...titleProp} className={className} style={style}>
      <Glyph name="warningCircle" size={12} />
      <span data-send-failed-label className="flex-1">{label}</span>
      <span data-send-retry style={{ textDecoration: 'underline' }}>{translate(language, 'message.send.retry')}</span>
    </button>
  );
}
