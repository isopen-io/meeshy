import { useQuery } from '@tanstack/react-query';

import { Avatar } from '@/components/avatar';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { adminAnonymousOneQueryKey, loadAdminAnonymousOne, type AdminAnonymousOne } from '@/lib/api/admin-anonymous';
import { apiDeps } from '@/lib/api/deps';
import { adminSpaceOf } from '@/lib/admin/admin-space';
import { adminMoment } from '@/lib/admin/format';
import { visibleAdminSections } from '@/lib/admin/sections';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useParams, useRoute } from '@/lib/router';
import { initialsOf } from '@/lib/view/conversation';
import { AdminDenied, AdminLine, AdminScreenFrame, AdminSection, AdminSkeleton } from '@/routes/admin-parts';
import { Link } from '@/routes/route-table';

/**
 * **LA FICHE D'UN ANONYME** (#7873) — `/adm/anonymous/$participant`.
 *
 * Ce qu'un administrateur doit savoir d'une personne sans compte : sous quel
 * nom elle parle, dans quelle conversation, depuis quand, combien de
 * messages, avec quelles permissions. Ni jeton, ni adresse IP, ni empreinte
 * d'appareil : la passerelle ne les sert plus (#4157) et le décodeur ne les
 * garderait pas.
 *
 * La conversation s'OUVRE en lecture souveraine — sous motif écrit et trace
 * (#6862) — seulement pour qui porte la section des conversations (rang
 * ADMIN+) : le lien n'est offert qu'à qui la passerelle ne refusera pas.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

function Entete({ fiche, language }: { readonly fiche: AdminAnonymousOne; readonly language: InterfaceLanguage }) {
  const etat = fiche.leftAt !== null ? 'admin.anonymous.left' : fiche.isActive ? 'admin.filter.active' : 'admin.users.inactive';
  return (
    <div className="flex items-center gap-3">
      <Avatar
        initials={initialsOf(fiche.displayName)}
        color="var(--color-ios-ink-3)"
        size={56}
        name={fiche.displayName}
        {...(fiche.avatar === '' ? {} : { src: fiche.avatar })}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-title font-semibold" style={{ color: INK }}>
          {fiche.displayName}
        </p>
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.nav.anonymous')} · {translateAdmin(language, etat)}
        </p>
      </div>
    </div>
  );
}

export default function AdminAnonymousOneScreen() {
  const language = currentInterfaceLanguage();
  const { participant } = useParams<'/admin/anonymous/$participant'>();
  const { key } = useRoute();
  const espace = adminSpaceOf(key);
  const retour = espace === 'adm' ? 'admAnonymous' : 'adminAnonymous';

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const sections = visibleAdminSections(identite.data?.permissions ?? null, identite.data?.role);
  const autorise = sections.some((section) => section.id === 'anonymous');
  const peutLire = sections.some((section) => section.id === 'conversations');

  const fiche = useQuery({
    queryKey: adminAnonymousOneQueryKey(participant),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminAnonymousOne({ ...apiDeps, participantId: participant, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    enabled: autorise,
    retry: false,
  });

  const titre = translateAdmin(language, 'admin.anonymous.title');

  if (identite.isPending || (autorise && fiche.isPending)) {
    return (
      <AdminScreenFrame language={language} title={titre} back={retour}>
        <AdminSkeleton rows={5} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame language={language} title={titre} back={retour}>
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  const donnees = fiche.data;
  if (donnees === undefined || donnees === null) {
    return (
      <AdminScreenFrame language={language} title={titre} back={retour}>
        <p className="text-body" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.user.unavailable')}
        </p>
      </AdminScreenFrame>
    );
  }

  const conversation = donnees.conversation;

  return (
    <AdminScreenFrame language={language} title={titre} back={retour}>
      <div className="grid gap-5 lg:grid-cols-2" data-admin-anonymous-one={donnees.id}>
        <div className="lg:col-span-2">
          <Entete fiche={donnees} language={language} />
        </div>
        <AdminSection titre={translateAdmin(language, 'admin.user.account')}>
          <AdminLine label={translateAdmin(language, 'admin.col.language')} valeur={donnees.language.toUpperCase() || '—'} />
          <AdminLine label={translateAdmin(language, 'admin.col.messages')} valeur={String(donnees.messageCount)} />
          <AdminLine label={translateAdmin(language, 'admin.col.joined')} valeur={adminMoment(donnees.joinedAt, language)} />
          <AdminLine label={translateAdmin(language, 'admin.col.lastActive')} valeur={adminMoment(donnees.lastActiveAt, language)} />
          {donnees.leftAt === null ? null : (
            <AdminLine label={translateAdmin(language, 'admin.anonymous.left')} valeur={adminMoment(donnees.leftAt, language)} />
          )}
        </AdminSection>
        <AdminSection titre={translateAdmin(language, 'admin.col.conversation')}>
          <AdminLine label="#" valeur={conversation?.title || conversation?.identifier || '—'} />
          {donnees.shareLink === null ? null : (
            <AdminLine label={translateAdmin(language, 'admin.anonymous.link')} valeur={donnees.shareLink.name} />
          )}
          {conversation !== null && peutLire ? (
            <Link
              to={espace === 'adm' ? 'admConversation' : 'adminConversation'}
              params={{ conversation: conversation.id }}
              data-admin-anonymous-conversation
              className="justify-self-end text-body font-semibold"
              style={{ color: 'var(--color-ios-brand)', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
            >
              {translateAdmin(language, 'admin.anonymous.openConversation')}
            </Link>
          ) : null}
        </AdminSection>
        {donnees.permissions.length === 0 ? null : (
          <AdminSection titre={translateAdmin(language, 'admin.anonymous.permissions')}>
            {donnees.permissions.map((permission) => (
              <AdminLine
                key={permission.key}
                label={permission.key}
                valeur={translateAdmin(language, permission.granted ? 'admin.list.yes' : 'admin.list.no')}
              />
            ))}
          </AdminSection>
        )}
      </div>
    </AdminScreenFrame>
  );
}
