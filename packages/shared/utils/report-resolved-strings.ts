/**
 * Textes localisés pour `report_resolved` (#3718 — art. 16 DSA : le déclarant
 * d'un signalement reçoit une réponse motivée). Fichier DÉDIÉ plutôt qu'ajouté
 * à `notification-strings.ts` : ce dernier est au plafond du cliquet de budget
 * de `packages/shared` (`shared-file-size-budget.test.ts`, `MAX_LINES = 1000`)
 * — 999 lignes sur `dev`, sans dette gelée qui l'autoriserait à grossir.
 */
import type { NotificationLanguage } from './notification-strings.js';

export type ReportResolvedOutcome = 'resolved' | 'rejected' | 'dismissed';

type ReportResolvedStrings = {
  readonly title: string;
  readonly actionTaken: string;
  readonly noAction: string;
};

const STRINGS: Record<NotificationLanguage, ReportResolvedStrings> = {
  fr: {
    title: 'Votre signalement a été examiné',
    actionTaken: 'Nous avons pris une mesure suite à votre signalement.',
    noAction: 'Après examen, nous n’avons pas identifié de violation de nos règles concernant votre signalement.',
  },
  en: {
    title: 'Your report has been reviewed',
    actionTaken: 'We took action based on your report.',
    noAction: 'After review, we did not find a violation of our rules related to your report.',
  },
  es: {
    title: 'Se ha revisado tu denuncia',
    actionTaken: 'Tomamos medidas a partir de tu denuncia.',
    noAction: 'Tras revisarlo, no encontramos ninguna infracción de nuestras normas relacionada con tu denuncia.',
  },
  pt: {
    title: 'A sua denúncia foi analisada',
    actionTaken: 'Tomámos uma medida com base na sua denúncia.',
    noAction: 'Após análise, não identificámos uma violação das nossas regras relacionada com a sua denúncia.',
  },
  de: {
    title: 'Deine Meldung wurde geprüft',
    actionTaken: 'Wir haben aufgrund deiner Meldung Maßnahmen ergriffen.',
    noAction: 'Nach Prüfung haben wir keinen Verstoß gegen unsere Regeln im Zusammenhang mit deiner Meldung festgestellt.',
  },
  it: {
    title: 'La tua segnalazione è stata esaminata',
    actionTaken: 'Abbiamo adottato provvedimenti in base alla tua segnalazione.',
    noAction: 'Dopo l’esame, non abbiamo riscontrato violazioni delle nostre regole relative alla tua segnalazione.',
  },
  ar: {
    title: 'تمت مراجعة بلاغك',
    actionTaken: 'اتخذنا إجراءً بناءً على بلاغك.',
    noAction: 'بعد المراجعة، لم نجد أي انتهاك لقواعدنا يتعلق ببلاغك.',
  },
  'zh-Hans': {
    title: '您的举报已处理',
    actionTaken: '我们已根据您的举报采取了措施。',
    noAction: '经审核，我们未发现与您的举报相关的规则违规行为。',
  },
};

const FALLBACK: NotificationLanguage = 'fr';

/** Titre + corps localisés pour `report_resolved`, choisis selon l'issue du signalement. */
export function reportResolvedStrings(
  lang: string | null | undefined,
  hasActionTaken: boolean,
): { readonly title: string; readonly content: string } {
  const entry = STRINGS[lang as NotificationLanguage] ?? STRINGS[FALLBACK];
  return { title: entry.title, content: hasActionTaken ? entry.actionTaken : entry.noAction };
}
