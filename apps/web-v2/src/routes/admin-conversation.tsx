import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { visibleAdminSections } from '@/lib/admin/sections';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useRoute } from '@/lib/router';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { AdminConversationReading } from '@/routes/admin-conversation-reading';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LA LECTURE D'UNE CONVERSATION DE L'INSTANCE** (#6862) — `/adm/conversations/$conversation`.
 *
 * Directive porteur du 2026-09-16 : « lectures des messages, audio, images
 * associé lorsqu'on est au moins de rang bigboss » — étendue le même jour aux
 * ADMIN, « pour le moment ».
 *
 * ## CET ÉCRAN N'A PLUS DE RENDU À LUI, ET C'EST LE LOT
 *
 * Il en portait un : `Piece()` et `Message()`, des `<li>` plats, sans bulle,
 * sans regroupement, sans citation, sans Prisme — cent lignes qui redisaient
 * de travers ce que le fil sait dire. Ce n'était pas une vue simplifiée : une
 * conversation lue SANS son Prisme n'est pas la même conversation, puisque
 * chaque message y apparaît dans la langue de son auteur plutôt que dans celle
 * du lecteur.
 *
 * Tout le rendu vit désormais dans `AdminConversationReading`, partagé avec la
 * modale de la fiche d'un membre : **un seul site de rendu, jamais deux**. Ce
 * qui reste ici est ce qui appartient à CET écran — la garde de droits, le
 * cadre, et la réponse à « le prisme de QUI ».
 *
 * ## LE PRISME DE QUI, SUR CET ÉCRAN
 *
 * Celui de l'ADMINISTRATEUR, et c'est la seule réponse honnête : cette adresse
 * ouvre une conversation de l'instance, sans membre administré. Il n'y a
 * personne dont on puisse emprunter la langue. La modale de la fiche d'un
 * membre, elle, en a un — et elle sert SA langue (`lib/admin/prisme-membre.ts`).
 *
 * Le VIEWER suit la même logique : `resolveViewer` rend l'administrateur
 * lui-même. S'il participe à cette conversation, ses messages restent les
 * siens ; sinon rien n'est « à lui », ce qui est exactement la vérité.
 */

export default function AdminConversationScreen() {
  const language = currentInterfaceLanguage();
  const route = useRoute();
  const conversationId = String((route.params as Record<string, unknown>).conversation ?? '');

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));
  const autorise = visibleAdminSections(identite.data?.permissions ?? null, identite.data?.role).some(
    (section) => section.id === 'conversations',
  );

  const lecteur = useReaderLanguages();
  const session = useStore(sessionStore, (etat) => etat.session);
  const viewer = resolveViewer({ source: apiDeps.source, session });

  const titre = translateAdmin(language, 'admin.convDetail.title');

  if (identite.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminSkeleton rows={4} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminDenied language={language} />
      </AdminScreenFrame>
    );
  }

  return (
    <AdminScreenFrame language={language} title={titre} back="admin" fills>
      <AdminConversationReading
        conversationId={conversationId}
        language={language}
        readerLanguages={lecteur.languages}
        readerLocale={lecteur.locale}
        viewer={viewer}
      />
    </AdminScreenFrame>
  );
}
