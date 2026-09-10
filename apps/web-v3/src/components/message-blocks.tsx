import { useEffect, useState, type ReactElement } from 'react';

import type { Message } from '@/lib/api/types';
import type { Delivery } from '@/lib/view/message';
import { languageColor, flag, languageName } from '@/lib/languages';
import { shouldRevealSendingClock } from '@/lib/send/send-clock';

import { Glyph } from './glyph';
import type { GlyphName } from './glyphs';

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
 */
export function PrismPastille({
  servedLanguage,
  originalLanguage,
  active,
  onToggle,
}: {
  servedLanguage: string;
  originalLanguage: string;
  active: string | null;
  onToggle: () => void;
}) {
  if (servedLanguage === originalLanguage) return null;
  const isOpen = active === originalLanguage;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isOpen}
      aria-label={
        isOpen
          ? 'Masquer le message dans sa langue d’origine'
          : 'Afficher le message dans sa langue d’origine'
      }
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
 * un contour d'accent, miroir `BubbleReactionsOverlay.swift:189-199` — SANS
 * en faire un `<button>` : la BASCULE par la capsule reste hors de ce lot
 * (`bulle.md` écart 8), seul le rail du menu du message réagit
 * (`message-menu.tsx`).
 *
 * LA MARQUE EST TEXTUELLE, PAS `aria-pressed` (revue #5814) : `aria-pressed`
 * n'est défini QUE sur `role="button"`. Posé sur ce `<span>` sans rôle, il
 * était ignoré par la norme — et, chez les lecteurs d'écran qui le prennent
 * quand même, il annonçait un BOUTON BASCULE que rien ne bascule : très
 * exactement le contrôle qui ment que la loi 4 du dépôt interdit, et sur
 * CHAQUE capsule du fil (`aria-pressed="false"` était rendu partout). La
 * ligne hors écran porte déjà l'information, elle seule reste.
 */
export function ReactionChip({ glyph, count, mine = false }: { glyph: string; count: number; mine?: boolean }) {
  return (
    <span
      className="flex items-center gap-0.5 rounded-chip px-1.5 py-0.5 text-check"
      style={{
        backgroundColor: mine ? 'color-mix(in srgb, var(--accent) 16%, var(--color-ios-card))' : 'var(--color-ios-card)',
        border: mine ? '1px solid var(--accent)' : '1px solid var(--color-edge)',
      }}
    >
      <span aria-hidden>{glyph}</span>
      <span className="tabular-nums opacity-70">{count}</span>
      <span className="offscreen">
        {count} réaction{count > 1 ? 's' : ''} {glyph}
        {mine ? ' — la vôtre' : ''}
      </span>
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
}: {
  status: Delivery;
  isMine: boolean;
  /** Epoch ms du DÉBUT de la tentative en cours (`outbox-store.ts`) — SEUL
   * `status === 'pending'` en tient compte (§5 étape 9 de la spécification
   * #5813) : sous ce seuil, aucune horloge ne clignote. */
  sendStartedAt?: number;
}) {
  if (!isMine) return null;
  const check = CHECKS[status];
  if (!check) return null;
  const glyph = (
    <Glyph
      name={check.name}
      size={check.size}
      title={STATUS_LABEL[status]}
      {...(check.read ? { style: { color: 'var(--color-read)' } } : {})}
    />
  );
  if (status === 'pending' && sendStartedAt !== undefined) {
    return <SendingClock startedAt={sendStartedAt}>{glyph}</SendingClock>;
  }
  return glyph;
}

/**
 * La bande de drapeaux du pied — au plus `limit` (4 par défaut, la cote
 * historique de ce composant). La rangée ÉLUE du fil (#5648) passe
 * `FLAG_LIMIT_PLAIN` (3) sur sa ligne basse ordinaire et
 * `FLAG_LIMIT_MAGNIFIED` (5) sur sa bande de focus
 * (`FocalMetrics.FocusStrip.flagLimitPlain/.flagLimitMagnified`,
 * gardées par `scripts/check-curve.mjs`) — deux cotes iOS, un seul
 * composant.
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
// panneau — rapprochant du même mouvement web-v3 de la cible iOS
// (`FocalRow.swift:1082`, `onSetActiveDisplayLanguageForGroup`, qui change
// le texte SERVI). La portée PAR GROUPE (iOS l'applique à toute la suite,
// web-v3 reste par rangée) demeure un écart ASSUMÉ, tracé en dehors de ce
// lot (`targets/focal-script.md` § 10 écart 4).

export function Quote({
  quote,
  isMine,
  onJump,
}: {
  quote: NonNullable<Message['replyTo']>;
  isMine: boolean;
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
  return (
    <button
      type="button"
      onClick={onJump}
      className="mb-1.5 flex w-full rounded-quote text-left"
      style={{ backgroundColor: isMine ? 'var(--color-quote-mine)' : 'var(--color-quote)' }}
      aria-label={`Aller au message de ${quote.sender?.displayName ?? 'l’expéditeur'}`}
    >
      <span
        className="w-1 shrink-0 rounded-full"
        style={{
          backgroundColor: isMine ? 'color-mix(in srgb, white 70%, transparent)' : 'var(--accent)',
        }}
        aria-hidden
      />
      {/* Le nom et le texte cite COULENT DANS LE MEME PARAGRAPHE (directive
          iOS #5103) : deux lignes separees feraient de la citation un bloc
          aussi haut que le message, et c'est le message qu'on vient lire. */}
      <span className="min-w-0 py-2 pr-2.5 pl-2 text-title">
        <span className="font-semibold" style={{ color: isMine ? 'white' : 'var(--accent)' }}>
          {quote.sender?.displayName ?? ''}{' '}
        </span>
        <span className="line-clamp-2" style={{ color: isMine ? 'var(--color-meta-mine)' : 'var(--color-ios-ink-2)' }}>
          {quote.content}
        </span>
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
  const label = reason === undefined ? 'Non envoyé' : `Non envoyé — ${reason}`;
  const className = 'mb-1.5 flex w-full items-center gap-1.5 rounded-quote px-2 text-left text-mini font-semibold';
  const style = {
    backgroundColor: 'color-mix(in srgb, var(--color-error) 18%, transparent)',
    color: textColor,
    minHeight: 44,
  };
  const titleProp = reason === undefined ? {} : { title: reason };

  if (onRetry === undefined) {
    return (
      <div className={className} style={style} {...titleProp}>
        <Glyph name="warningCircle" size={12} />
        <span className="flex-1">{label}</span>
      </div>
    );
  }

  return (
    <button type="button" onClick={onRetry} {...titleProp} className={className} style={style}>
      <Glyph name="warningCircle" size={12} />
      <span className="flex-1">{label}</span>
      <span style={{ textDecoration: 'underline' }}>Réessayer</span>
    </button>
  );
}
