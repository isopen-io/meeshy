import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { NotificationRow } from '@/components/notification-row';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories';
import type { NotificationRecord } from '@/lib/notifications/record';

import {
  NOTIFICATIONS_TOP_RESERVE,
  NotificationCategoryRail,
  NotificationsEmpty,
  NotificationsError,
  NotificationsHeader,
  NotificationsSkeleton,
} from './notifications';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';

/**
 * LA CLOCHE DESSINÉE (#6288) — chaque état est un composant PUR, rendu sans
 * DOM ni TanStack Query (motif `feed.test.tsx`). Un écran blanc n'est pas un
 * état : les quatre (chargement, vide, erreur, hors-ligne) ont chacun leur
 * témoin, et la rangée prouve ce qu'aucune capture ne dit — où elle MÈNE et
 * ce qu'elle ANNONCE.
 */

const noop = () => undefined;

const record = (partial: Partial<NotificationRecord>): NotificationRecord => ({
  id: 'n1',
  type: 'user_mentioned',
  title: 'Kwame Mensah vous a mentionné',
  content: '@vous tu peux relire la PR ?',
  actor: { id: 'u-kwame', username: 'kwame', displayName: 'Kwame Mensah', avatar: null },
  context: { conversationId: 'c-deploiement', conversationTitle: 'Équipe déploiement', conversationType: 'group' },
  metadata: {},
  state: { isRead: false, createdAt: '2026-09-13T08:00:00.000Z' },
  ...partial,
});

const NOW = new Date('2026-09-13T08:05:00.000Z');

const row = (notification: NotificationRecord) =>
  renderToStaticMarkup(
    <ul>
      <NotificationRow notification={notification} language="fr" now={NOW} onOpen={noop} onMarkRead={noop} onDelete={noop} />
    </ul>,
  );

describe('l’en-tête', () => {
  test('le titre, un retour NOMMÉ vers la liste, et le compte de non-lues', () => {
    const html = renderToStaticMarkup(<NotificationsHeader language="fr" unread={3} onMarkAllRead={noop} />);
    expect(html).toContain('Notifications');
    expect(html).toContain('aria-label="Revenir aux conversations"');
    expect(html).toContain('3 non lues');
    expect(html).toContain('Tout lire');
  });

  test('un seul non-lu se dit au singulier', () => {
    expect(renderToStaticMarkup(<NotificationsHeader language="fr" unread={1} onMarkAllRead={noop} />)).toContain('1 non lue');
  });

  test('à zéro, ni compte ni « Tout lire » — un bouton sans effet ne s’affiche pas', () => {
    const html = renderToStaticMarkup(<NotificationsHeader language="fr" unread={0} onMarkAllRead={noop} />);
    expect(html).not.toContain('Tout lire');
    expect(html).not.toContain('non lue');
  });
});

describe('le rail des catégories', () => {
  test('onze puces, une seule pressée, chacune une cible de 44', () => {
    const html = renderToStaticMarkup(<NotificationCategoryRail language="fr" selected="mentions" onSelect={noop} />);
    expect(html).toContain('aria-label="Catégories de notifications"');
    expect(html.match(/<button/g)?.length).toBe(NOTIFICATION_CATEGORIES.length);
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(html).toContain('data-category="mentions" aria-pressed="true"');
    expect(html.match(/min-height:44px/g)?.length).toBe(NOTIFICATION_CATEGORIES.length);
    for (const label of ['Toutes', 'Non lues', 'Réactions', 'Système']) expect(html).toContain(label);
  });

  /** Les libellés restent aux JETONS d'encre : la teinte catégorielle d'iOS
   * (le blanc sur jaune de sa puce pleine) ne tient pas le contraste AA. */
  test('le texte d’une puce est à l’encre, jamais à la teinte de sa catégorie', () => {
    const html = renderToStaticMarkup(<NotificationCategoryRail language="fr" selected="social" onSelect={noop} />);
    expect(html).toContain('color:var(--color-ios-ink)');
    expect(html).not.toContain('color:#F8B500');
  });
});

describe('les états', () => {
  test('vide sous « Toutes », sous « Non lues », et sous une famille nommée', () => {
    expect(renderToStaticMarkup(<NotificationsEmpty language="fr" category="all" />)).toContain('Aucune notification');
    expect(renderToStaticMarkup(<NotificationsEmpty language="fr" category="unread" />)).toContain('Aucune notification non lue');
    const calls = renderToStaticMarkup(<NotificationsEmpty language="fr" category="calls" />);
    /* Espaces INSÉCABLES dans les guillemets : à 320 px, le « » » fermant
       tombait seul sur sa ligne (capture de recette). */
    expect(calls).toContain('Aucune notification dans « Appels »');
    expect(calls).toContain('Vos notifications apparaîtront ici');
  });

  test('erreur en ligne : le motif, et « Réessayer » à 44', () => {
    const html = renderToStaticMarkup(<NotificationsError language="fr" online onRetry={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Impossible de charger les notifications');
    expect(html).toContain('Réessayer');
    expect(html).toContain('min-height:44px');
  });

  test('hors ligne : un motif DIFFÉRENT, qui promet le retour du réseau', () => {
    const html = renderToStaticMarkup(<NotificationsError language="fr" online={false} onRetry={noop} />);
    expect(html).toContain('Hors ligne');
    expect(html).not.toContain('Impossible de charger');
  });

  test('le squelette est un décor, masqué aux technologies d’assistance', () => {
    expect(renderToStaticMarkup(<NotificationsSkeleton />)).toContain('aria-hidden="true"');
  });

  /** La loi du couloir (`floating-corridor.ts`) : au repos, la première rangée
   * commence SOUS les disques flottants, jamais dessous. */
  test('la réserve du couloir amène la première rangée sous les disques', () => {
    expect(NOTIFICATIONS_TOP_RESERVE).toBeGreaterThan(0);
    expect(NOTIFICATIONS_TOP_RESERVE).toBeLessThan(FLOATING_CORRIDOR_BOTTOM);
  });
});

describe('une rangée', () => {
  test('non lue : elle le DIT au lecteur d’écran, et mène à la conversation', () => {
    const html = row(record({}));
    expect(html).toContain('data-read="false"');
    expect(html).toContain('Non lue');
    expect(html).toContain('Kwame Mensah vous a mentionné');
    expect(html).toContain('@vous tu peux relire la PR ?');
    expect(html).toContain('href="/c/c-deploiement"');
  });

  test('le titre du groupe est rappelé, jamais celui d’un direct', () => {
    expect(row(record({}))).toContain('Équipe déploiement');
    const direct = row(record({ context: { conversationId: 'c1', conversationTitle: 'Amina', conversationType: 'direct' } }));
    expect(direct).not.toContain('>Amina<');
  });

  test('l’heure relative courte d’iOS', () => {
    expect(row(record({}))).toContain('5 min');
  });

  /* La RÈGLE ne change pas — une ligne sans destination reste un bouton. Ce
     qui change est son EXEMPLE : `friend_request` servait de cas « sans
     destination » depuis que le web n'avait pas d'écran de contacts. Il en a
     un depuis #6363, et la ligne y mène depuis #7173. Garder l'ancien exemple
     aurait verrouillé le cul-de-sac au lieu de garder la règle. */
  test('une ligne SANS destination est un bouton, jamais un lien qui mentirait', () => {
    const html = row(record({ type: 'un_type_sans_ecran', context: {} }));
    expect(html).not.toContain('href=');
    expect(html).toContain('<button');
  });

  test('une demande de connexion mène à l’onglet où l’on y répond', () => {
    const html = row(record({ type: 'friend_request', context: { friendRequestId: 'fr1' } }));
    expect(html).toContain('href="/discover?onglet=requests&amp;demandes=received"');
  });

  test('une publication commentée montre sa vignette, décorative', () => {
    const html = row(
      record({ type: 'post_comment', context: { postId: 'p1' }, metadata: { postType: 'POST', postThumbnailUrl: 'https://cdn.meeshy.me/p1.jpg' } }),
    );
    expect(html).toContain('href="/post/p1"');
    expect(html).toContain('src="https://cdn.meeshy.me/p1.jpg"');
    expect(html).toContain('alt=""');
  });

  /**
   * LA VIGNETTE ET L'AVATAR SONT DES RÉFÉRENCES DE MÉDIA, pas des adresses
   * (#6388). `postThumbnailUrl` est `PostMedia.thumbnailUrl`
   * (`NotificationService.ts:3580`) et l'avatar est `User.avatar` : la
   * passerelle sert la CLÉ de stockage depuis #4324, et quelques lignes gardent
   * l'adresse héritée d'avant la migration 013. Posées telles quelles, la
   * première se résout contre le CHEMIN du document (`/notifications/2026/09/…`,
   * où le SPA rend son `index.html`) et la seconde contre la RACINE de la
   * passerelle — `net::ERR_FAILED`, puis `workbox … no-response`, ce que la
   * console de `staging.meeshy.me/notifications` montrait le 2026-09-13.
   */
  test('la vignette d’une publication passe par la route de flux — clé nue comme adresse héritée', () => {
    const cle = row(record({ type: 'post_comment', context: { postId: 'p1' }, metadata: { postThumbnailUrl: '2026/09/6aa607/thumb_p1.jpg' } }));
    expect(cle).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fthumb_p1.jpg"');

    const heritee = row(
      record({ type: 'post_comment', context: { postId: 'p1' }, metadata: { postThumbnailUrl: 'https://gate.meeshy.me/2026/09/6aa607/thumb_p1.jpg' } }),
    );
    expect(heritee).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fthumb_p1.jpg"');
  });

  test('l’avatar de l’acteur passe par la même route — jamais l’adresse servie telle quelle', () => {
    const html = row(
      record({ actor: { id: 'u-kwame', username: 'kwame', displayName: 'Kwame Mensah', avatar: 'https://gate.meeshy.me/2026/09/6aa607/harbor_41.png' } }),
    );
    expect(html).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fharbor_41.png"');
  });

  test('lue : aucune annonce « Non lue », et le menu de la rangée reste nommé', () => {
    const html = row(record({ state: { isRead: true, createdAt: '2026-09-13T08:00:00.000Z' } }));
    expect(html).toContain('data-read="true"');
    expect(html).not.toContain('Non lue');
    expect(html).toContain('aria-label="Actions de la notification"');
  });

  test('un appel manqué porte « Rappeler <nom> », du même type, HORS du lien de la rangée (A6, C12)', () => {
    const html = row(
      record({ type: 'missed_call', title: null, content: '📹 Appel vidéo manqué', context: { conversationId: 'c-kwame', conversationType: 'direct' }, metadata: { callType: 'video' } }),
    );
    const button = html.match(/<button[^>]*data-notification-call-back="([a-z]+)"[^>]*>/);
    expect(button?.[1]).toBe('video');
    expect(button?.[0]).toContain('aria-label="Rappeler Kwame Mensah"');
    const at = html.indexOf(button?.[0] ?? '<none>');
    expect(html.lastIndexOf('</a>', at)).toBeGreaterThan(html.lastIndexOf('<a ', at));
  });

  test('une notification qui n’est pas un appel manqué ne propose pas de rappeler', () => {
    expect(row(record({}))).not.toContain('data-notification-call-back');
  });
});

/**
 * « X EST SUR MEESHY » (#8143, recette 2026-09-26) — le titre persisté est une
 * PHRASE (« Marie est sur Meeshy ! ») : des initiales tirées du titre y lisaient
 * « ME » (Marie, est). Elles viennent du NOM de l'acteur, en lettres seules, et
 * la rangée s'annonce en entier au lecteur d'écran : qui, ce qui arrive, et
 * l'invitation à lui écrire.
 */
describe('la rangée « a rejoint Meeshy »', () => {
  const joined = (displayName: string) =>
    record({
      type: 'contact_joined',
      title: `${displayName} est sur Meeshy !`,
      content: 'Dites-lui bonjour 👋',
      actor: { id: 'u-marie', username: 'marie', displayName, avatar: null },
      context: {},
    });

  test('les initiales viennent du nom de l’acteur, jamais de la phrase du titre', () => {
    expect(row(joined('Marie'))).toContain('>MA</span>');
    expect(row(joined('Théo (foot)'))).toContain('>TF</span>');
  });

  test('le libellé lu dit qui, ce qui arrive et l’invitation', () => {
    const html = row(joined('Marie'));
    expect(html).toContain('Marie est sur Meeshy !');
    expect(html).toContain('Dites-lui bonjour 👋');
  });
});
