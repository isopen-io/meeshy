import { translate } from '@/lib/i18n-catalog';
import { isMessagePiecesCatalogLoaded, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';

/**
 * LA BANDE DE REPRISE D'UN ENVOI ÉCHOUÉ (revue-correction #5813, défauts
 * majeurs 2 et 7) — SITE UNIQUE partagé par `bubble.tsx` et `focal-row.tsx`,
 * pour que les deux peaux tiennent la MÊME règle de cible tactile et la
 * MÊME règle de refus permanent, sans jumelle à resynchroniser (deux copies
 * de ce bloc divergeaient déjà sur la couleur du texte).
 *
 * `onRetry === undefined` ⇒ REFUS PERMANENT (`permanentOf`,
 * `lib/view/use-send.ts`, dérivé d'`isPermanentFailure`,
 * `lib/api/outcome.ts`) : la CAUSE reste affichée, le REJEU disparaît —
 * jamais un bouton qui promet un rejeu impossible (403/401 ne peuvent pas
 * aboutir en rejouant le MÊME appel, quel que soit le nombre de tentatives).
 * La bande devient un `<div>` sans `Réessayer`, jamais un `<button>` inerte ;
 * seul « Abandonner » y reste (`onDiscard`, ci-dessous).
 *
 * `min-height: 44` est la cible tactile du dépôt (dimension 5, « cibles
 * >= 44 px ») — la bande était mesurée à 27 px, le seul contrôle de
 * réparation du fil sous la règle que le dépôt tient déjà ailleurs
 * (`routes/conversations.tsx`, l'erreur de liste). `text-mini` (11px,
 * `--ios-font-footnote`) remplace `text-check` (10px, `--ios-font-caption`) —
 * un token DÉRIVÉ plus grand (D-4), jamais une valeur inventée.
 *
 * `onDiscard` (#12632) — « ABANDONNER » retire l'envoi du fil et de l'outbox.
 * Un refus permanent n'avait plus AUCUN geste : la bulle restait jusqu'au
 * rechargement. Il le gagne, et un refus passager le gagne à côté de
 * « Réessayer » : la bande devient alors un `<div>` qui porte DEUX boutons
 * frères, chacun de 44 px — jamais un bouton dans un bouton — qu'un filet
 * muet (`data-send-separator`) tient à distance : le geste irréversible ne
 * se touche pas en visant « Réessayer ». Son libellé vit dans le catalogue du
 * fil : tant qu'il n'est pas chargé, le geste se tait.
 */
export function FailedSendBand({
  reason,
  onRetry,
  onDiscard,
  textColor,
}: {
  readonly reason?: string;
  readonly onRetry?: () => void;
  readonly onDiscard?: () => void;
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
  const className = 'mb-1.5 flex w-full items-center gap-1.5 rounded-quote px-2 text-start text-mini font-semibold';
  const style = {
    backgroundColor: 'color-mix(in srgb, var(--color-error) 18%, transparent)',
    color: textColor,
    minHeight: 44,
  };
  const titleProp = reason === undefined ? {} : { title: reason };

  /* `data-send-failed` / `-label` / `data-send-retry` : les POIGNÉES des
     gates (#7337). Ils désignaient la bande par son texte français, et ne
     pouvaient donc la trouver que tant qu'elle n'était pas traduite. */
  const discard =
    onDiscard === undefined || !isMessagePiecesCatalogLoaded(language) ? null : (
      <button
        type="button"
        data-send-discard
        data-variant="destructive"
        onClick={onDiscard}
        className="shrink-0 px-1 text-mini font-semibold"
        style={{ minHeight: 44, minWidth: 44, color: textColor, textDecoration: 'underline' }}
      >
        {translateMessagePieces(language, 'message.menu.discard')}
      </button>
    );

  if (onRetry === undefined) {
    return (
      <div data-send-failed="permanent" className={className} style={style} {...titleProp}>
        <Glyph name="warningCircle" size={12} />
        <span data-send-failed-label className="flex-1">{label}</span>
        {discard}
      </div>
    );
  }

  if (discard !== null) {
    return (
      <div className={className} style={style}>
        <button
          type="button"
          data-send-failed="retryable"
          onClick={onRetry}
          {...titleProp}
          className="flex flex-1 items-center gap-1.5 text-start font-semibold"
          style={{ color: textColor, minHeight: 44 }}
        >
          <Glyph name="warningCircle" size={12} />
          <span data-send-failed-label className="flex-1">{label}</span>
          <span data-send-retry style={{ textDecoration: 'underline' }}>{translate(language, 'message.send.retry')}</span>
        </button>
        <span data-send-separator aria-hidden="true" className="mx-2 shrink-0 self-stretch" style={{ width: 1, marginBlock: 10, backgroundColor: 'currentColor', opacity: 0.35 }} />
        {discard}
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
