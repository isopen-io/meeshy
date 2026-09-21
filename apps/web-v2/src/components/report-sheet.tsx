import { REPORT_REASONS, type ReportReason } from '@/lib/api/reports';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Sheet } from './sheet';

/**
 * **LA FEUILLE QUI DEMANDE LE MOTIF** (#7187).
 *
 * ## POURQUOI UNE FEUILLE, ET PAS UN BOUTON QUI ENVOIE
 *
 * **Signaler sans motif n'est pas un signalement, c'est un clic.** La
 * modération qui le reçoit n'aurait rien à en faire, et la personne qui
 * signale n'aurait aucune idée de ce qu'elle vient de dire. Le serveur
 * accepterait pourtant un `reason` vide (`creerSchema.reason` est `optional`) :
 * l'exigence est donc posée ICI, là où l'intention se forme.
 *
 * ## LES HUIT MOTIFS SONT CEUX DU SERVEUR
 *
 * `REPORT_REASONS` les reprend de `creerSchema.reportType`
 * (`routes/reports/index.ts:48-57`). Les réénumérer ici ouvrirait la porte au
 * défaut que ce dépôt connaît bien : une liste tenue à la main qui diverge de
 * ce qu'elle énumère. La feuille itère la constante, dans son ordre.
 *
 * ## ET IL N'Y A PAS DE SECONDE CONFIRMATION
 *
 * Choisir un motif EST la confirmation. Un « êtes-vous sûr ? » par-dessus
 * ferait payer deux gestes pour une action que l'on peut déjà abandonner en
 * fermant la feuille — et la dimension 7 demande le chemin nominal en deux
 * gestes au plus.
 */
export function ReportSheet({
  name,
  busy,
  onPick,
  onClose,
}: {
  readonly name: string;
  readonly busy: boolean;
  readonly onPick: (reason: ReportReason) => void;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();

  return (
    <Sheet title={translate(language, 'report.title')} onClose={onClose}>
      <li>
        <p data-report-body className="px-4 pb-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'report.body')}
        </p>
      </li>
      {REPORT_REASONS.map((reason) => (
        <li key={reason}>
          <button
            type="button"
            data-report-reason={reason}
            disabled={busy}
            onClick={() => onPick(reason)}
            /* La cible tient le plancher de 44 px, et le libellé est à GAUCHE :
               une liste de motifs se parcourt du regard, pas au centre. */
            className="flex w-full items-center rounded-chip px-4 text-body focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            style={{ minHeight: 44, color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
            aria-label={`${translate(language, `report.reason.${reason}` as 'report.reason.spam')} — ${name}`}
          >
            {translate(language, `report.reason.${reason}` as 'report.reason.spam')}
          </button>
        </li>
      ))}
    </Sheet>
  );
}
