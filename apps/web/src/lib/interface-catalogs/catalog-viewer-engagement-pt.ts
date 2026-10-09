/** La feuille « Vues » enrichie (#9727), PORTUGAIS — voir `catalog-viewer-engagement-fr.ts`. */
import type { ViewerEngagementCatalog } from '@/lib/i18n-viewer-engagement-catalog';

const pt = {
  'viewerEngagement.shares.one': '{count} partilha',
  'viewerEngagement.shares.other': '{count} partilhas',
  'viewerEngagement.reposts.one': '{count} republicação',
  'viewerEngagement.reposts.other': '{count} republicações',
  'viewerEngagement.comments.one': '{count} comentário',
  'viewerEngagement.comments.other': '{count} comentários',
  'viewerEngagement.replies.one': '{count} resposta',
  'viewerEngagement.replies.other': '{count} respostas',
  'viewerEngagement.reactions': 'Reações: {emojis}',
  'viewerEngagement.viewedAt': 'Visto às {time}',
  'viewerEngagement.onlyViewed': 'Viu, sem outra interação',
  'viewerEngagement.openProfile': 'Ver perfil',
  'viewerEngagement.back': 'Voltar às visualizações',
  'viewerEngagement.openDetail': 'Ver o que {name} fez',
  'viewerEngagement.empty.subtitle': 'As pessoas que virem esta publicação aparecerão aqui.',
  'viewerEngagement.forbidden': 'Só o autor pode ver quem viu esta publicação.',
  'viewerEngagement.unavailable': 'O detalhe da atividade está temporariamente indisponível.',
} satisfies ViewerEngagementCatalog;

export default pt;
