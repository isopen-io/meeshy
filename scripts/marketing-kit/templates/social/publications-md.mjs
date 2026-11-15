import { KIT_LANGS } from '../../lib/locales.mjs'
import { PUBLICATIONS, LIEUX } from './textes/publications.mjs'
import { HASHTAG } from './textes/langues.mjs'

const NOMS = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', ar: 'العربية' }

// Les dix publications de lancement, dans les sept langues, prêtes à copier (§ 5).
export const publicationsMarkdown = () =>
  [
    '# Meeshy — 10 publications de lancement, 7 langues',
    '',
    'Source : `docs/marketing/campagne-2026-09/contenu-par-format.md` § 5 (#7728). Écrites en français par le compte officiel ; les autres langues sont celles que le Prisme sert au lecteur — à poster telles quelles si l’équipe publie par langue. L’arabe est à relire par un locuteur natif avant publication.',
    '',
    `Hashtag de campagne (défi de CAMPAGNE, aucun défi n’existe dans l’app) : ${KIT_LANGS.map((l) => `${l} \`${HASHTAG[l]}\``).join(' · ')} — fr, en et es viennent du plan ; de, it, pt et ar sont proposés et restent à figer.`,
    '',
    'Modération renforcée sur Global dès J1 (premier écran social des nouveaux comptes, souvent mineurs).',
    '',
    ...PUBLICATIONS.flatMap((p) => [
      `## ${p.n}. ${LIEUX[p.lieu]}${p.note ? ` — ${p.note}` : ''}`,
      '',
      ...KIT_LANGS.flatMap((l) => [`**${l} — ${NOMS[l]}**`, '', '```text', p.texte[l], '```', '']),
    ]),
  ].join('\n')
