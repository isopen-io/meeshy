import { useQuery } from '@tanstack/react-query';

import { CollapsibleSection } from '@/components/collapsible-section';
import { adminCount } from '@/lib/admin/format';
import type { AdminDeps } from '@/lib/api/admin';
import { adminUserStatsQueryOptions, type AdminUserStats } from '@/lib/api/admin-user-stats';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { AdminAbsence, AdminSkeleton, AdminStatTile } from './admin-parts';

/**
 * **LES STATISTIQUES D'UN MEMBRE, EN TUILES** (#7845 C).
 *
 * ## Six tuiles d'abord, le reste sur demande
 *
 * La passerelle sert vingt-cinq compteurs. Les poser tous dans la colonne
 * d'identité en ferait une colonne plus haute que l'écran, et noierait les six
 * chiffres qui disent QUI est ce membre — combien il écrit, où, depuis quand,
 * avec qui. Les autres (modération, liens, social fin) se déplient sous
 * « Toutes les statistiques » : rien n'est caché, tout n'est pas crié.
 *
 * ## Une tuile peut AGRÉGER, jamais inventer
 *
 * « Réactions » additionne celles posées sur des messages et sur des
 * publications, « Pièces jointes » les fichiers de messages et de
 * publications : deux compteurs servis, un seul geste de l'utilisateur. Aucune
 * tuile ne se calcule depuis autre chose que des compteurs servis.
 *
 * ## Un signalement RETENU se lit « — », pas « 0 »
 *
 * Sans `canModerateContent`, la passerelle rend les trois compteurs de
 * signalements à `null`. La tuile reste (la fiche a la même forme pour tous
 * les rôles), affiche « — » et le DIT au lecteur d'écran (« non communiqué ») :
 * un tiret muet se lirait « tiret », un zéro affirmerait un fait.
 *
 * ## Une panne n'est pas un zéro
 *
 * Le décodeur rend 0 pour un compteur NON SERVI dans une charge lisible ; une
 * requête refusée, elle, ne rend aucune tuile — une grille de zéros dirait
 * « ce membre n'a rien fait », ce qui est un fait, pas une panne.
 */

type Tuile = {
  readonly id: string;
  readonly label: AdminPlainCatalogKey;
  readonly valeur: (stats: AdminUserStats) => number | null;
};

const compte = (cle: keyof AdminUserStats['counts']) => (stats: AdminUserStats) => stats.counts[cle];

const PRINCIPALES: readonly Tuile[] = [
  { id: 'messagesSent', label: 'admin.stats.messages', valeur: compte('messagesSent') },
  { id: 'conversations', label: 'admin.stats.conversations', valeur: compte('conversations') },
  { id: 'translations', label: 'admin.stats.translations', valeur: compte('translations') },
  { id: 'friends', label: 'admin.stats.friends', valeur: compte('friends') },
  { id: 'posts', label: 'admin.stats.posts', valeur: compte('posts') },
  { id: 'memberDays', label: 'admin.stats.memberDays', valeur: compte('memberDays') },
];

const SECONDAIRES: readonly Tuile[] = [
  { id: 'stories', label: 'admin.stats.stories', valeur: compte('stories') },
  { id: 'reels', label: 'admin.stats.reels', valeur: compte('reels') },
  { id: 'comments', label: 'admin.stats.comments', valeur: compte('comments') },
  {
    id: 'reactions',
    label: 'admin.stats.reactions',
    valeur: (s) => s.counts.messageReactions + s.counts.postReactions + s.counts.commentReactions,
  },
  { id: 'attachments', label: 'admin.stats.attachments', valeur: (s) => s.counts.attachments + s.counts.postMedia },
  { id: 'friendRequestsPending', label: 'admin.stats.friendRequests', valeur: compte('friendRequestsPending') },
  { id: 'friendRequestsSent', label: 'admin.stats.pendingOut', valeur: compte('friendRequestsSent') },
  { id: 'contacts', label: 'admin.stats.contacts', valeur: compte('contacts') },
  { id: 'communities', label: 'admin.stats.communities', valeur: compte('communities') },
  { id: 'reportsReceived', label: 'admin.stats.reportsReceived', valeur: compte('reportsReceived') },
  { id: 'reportsMade', label: 'admin.stats.reportsMade', valeur: compte('reportsMade') },
  { id: 'reportsOnMessages', label: 'admin.stats.reportsOnMessages', valeur: compte('reportsOnMessages') },
  { id: 'sessionsActive', label: 'admin.stats.sessions', valeur: compte('sessionsActive') },
  { id: 'bans', label: 'admin.stats.bans', valeur: compte('bansTotal') },
  { id: 'shareLinks', label: 'admin.stats.shareLinks', valeur: compte('shareLinks') },
  { id: 'trackingLinks', label: 'admin.stats.trackingLinks', valeur: compte('trackingLinks') },
  { id: 'affiliations', label: 'admin.stats.affiliations', valeur: compte('affiliations') },
];

function Grille({
  tuiles,
  stats,
  language,
}: {
  readonly tuiles: readonly Tuile[];
  readonly stats: AdminUserStats;
  readonly language: InterfaceLanguage;
}) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {tuiles.map((tuile) => {
        const valeur = tuile.valeur(stats);
        return (
          <AdminStatTile
            key={tuile.id}
            id={tuile.id}
            label={translateAdmin(language, tuile.label)}
            value={valeur === null ? '—' : adminCount(valeur, language)}
            {...(valeur === null ? { valueLabel: translateAdmin(language, 'admin.stats.withheld') } : {})}
          />
        );
      })}
    </dl>
  );
}

export function AdminUserStatsPanel({
  userId,
  language,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
}) {
  const stats = useQuery(adminUserStatsQueryOptions(deps, userId));

  return (
    <section aria-labelledby="admin-stats-title" className="grid gap-2" data-admin-stats>
      <h2 id="admin-stats-title" className="ps-1 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translateAdmin(language, 'admin.stats.title')}
      </h2>
      {stats.data !== undefined ? (
        <>
          <Grille tuiles={PRINCIPALES} stats={stats.data} language={language} />
          <CollapsibleSection id="admin-stats-more" title={translateAdmin(language, 'admin.stats.more')} card={false} defaultOpen={false}>
            <Grille tuiles={SECONDAIRES} stats={stats.data} language={language} />
          </CollapsibleSection>
        </>
      ) : stats.isPending ? (
        <AdminSkeleton rows={3} />
      ) : (
        <AdminAbsence language={language} unavailable="admin.stats.unavailable" />
      )}
    </section>
  );
}
