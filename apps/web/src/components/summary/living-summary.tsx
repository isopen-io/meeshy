import { EpisodeList } from './episode-list';
import { FaceRamp } from './face-ramp';
import { SummarySkeleton } from './summary-skeleton';
import type { ConversationAnalysisSummary } from '@/lib/api/conversation-analysis';
import type { LivingSummaryModel } from '@/lib/summary/assembly';
import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';

/**
 * LE RÉSUMÉ VIVANT — miroir `LivingSummaryView.swift` (#5695, étape 8) :
 * fond plein, squelette OU contenu, en-tête, rampe, épisodes, panneau
 * agent, « Reprendre le fil » collé en bas au-dessus du composeur.
 */
export function LivingSummary({
  model,
  agentSummary,
  showsSkeleton,
  isComplete,
  onReplyToPerson,
  onOpenEpisode,
  onResumeThread,
  lang,
}: {
  readonly model: Pick<LivingSummaryModel, 'digest' | 'faceRamp'>;
  readonly agentSummary: ConversationAnalysisSummary | null;
  readonly showsSkeleton: boolean;
  readonly isComplete: boolean;
  readonly onReplyToPerson: (entry: FaceRampEntry) => void;
  readonly onOpenEpisode: (episode: ConversationEpisode) => void;
  readonly onResumeThread: () => void;
  /** Posé quand la locale de CADRAGE (`READER_LOCALE`) diffère de celle du document. */
  readonly lang?: string;
}) {
  return (
    <div data-summary className="flex flex-1 flex-col gap-4 px-0.5 pt-5 pb-4">
      {showsSkeleton ? (
        <SummarySkeleton />
      ) : (
        <>
          <header className="flex flex-col gap-1">
            <h2 className="font-black" style={{ fontSize: 'var(--text-summary-title)', color: 'var(--color-ios-ink)' }}>
              Résumé Vivant
            </h2>
            <p
              style={{ fontSize: 'var(--text-summary-counts)', color: 'var(--color-ios-ink)', opacity: 0.7, fontWeight: 600 }}
            >
              {model.digest.messageCount} message{model.digest.messageCount === 1 ? '' : 's'} · {model.digest.participantCount}{' '}
              personne{model.digest.participantCount === 1 ? '' : 's'}
            </p>
            {isComplete ? null : (
              /*
                LE JETON D'ENCRE INDIGO PAR SCHÉMA (revue #5695) — et non
                `--color-ios-brand`. MESURÉ sur le dist : `indigo500` en
                TEXTE de 12 px vaut 4,45:1 en sombre et 4,47:1 en clair,
                sous la barre AA de 4,5 que `check-reading-mode.mjs` pose
                déjà pour la citation. `--color-day-ink` est le jeton
                GÉNÉRÉ (D-4, `MessageDaySeparator.swift`) que le dépôt
                sert déjà pour de l'encre indigo lisible dans les DEUX
                schémas — indigo-200 en sombre, indigo-700 en clair. La
                teinte iOS `indigo500` reste juste sur un fond NOIR plein ;
                elle ne l'est pas sur les deux fonds du web.
              */
              <p
                data-partial-window
                style={{ fontSize: 'var(--text-summary-partial)', color: 'var(--color-day-ink)', fontWeight: 500 }}
              >
                Sur les {model.digest.messageCount} derniers messages
              </p>
            )}
          </header>

          <FaceRamp entries={model.faceRamp} onTap={onReplyToPerson} />

          <EpisodeList episodes={model.digest.episodes} onOpen={onOpenEpisode} {...(lang !== undefined ? { lang } : {})} />

          {agentSummary !== null ? (
            <section
              aria-label="Vue d'ensemble de l'agent"
              className="rounded-row-ios p-3"
              style={{ border: '1.5px dashed var(--color-ios-brand)' }}
            >
              <p className="text-[12px] font-black" style={{ color: 'var(--color-ios-brand)' }}>
                ✦ Vue d&rsquo;ensemble de l&rsquo;agent
              </p>
              <p className="text-title" style={{ color: 'var(--color-ios-ink)', opacity: 0.85 }}>
                {agentSummary.text}
              </p>
            </section>
          ) : null}
        </>
      )}

      <button
        type="button"
        onClick={onResumeThread}
        aria-label="Reprendre le fil, retourner à la conversation"
        /*
          `mt-auto` AVANT `sticky` (revue #5695) — iOS pose ce bouton dans un
          `VStack { Spacer(); … }` HORS du ScrollView : il est TOUJOURS en
          bas. `sticky` seul ne colle que lorsque le contenu DÉBORDE ;
          mesuré sur `/c/c-rattrapage`, `main.scrollHeight === clientHeight`
          — le bouton flottait 153 px au-dessus du composeur, au milieu du
          vide. `mt-auto` le pousse en bas quand le contenu est court,
          `sticky` le retient en vue quand il est long.
        */
        className="sticky bottom-0 mt-auto min-h-11 w-full rounded-chip px-4 py-3 text-bubble font-bold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)' }}
      >
        Reprendre le fil
      </button>
    </div>
  );
}

export default LivingSummary;
