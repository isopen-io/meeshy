/**
 * Carte de visite partagée → comptes Meeshy (#8101).
 *
 * Une vCard reçue dans une conversation porte des numéros et des e-mails ; le
 * lecteur veut savoir si l'un d'eux est un compte Meeshy, pour s'y connecter
 * ou lui écrire. La résolution RÉUTILISE l'appariement du Répertoire
 * (`ContactDirectoryService.match` : normalisation E.164, e-mails en
 * minuscules, comptes actifs non supprimés, blocage dans les DEUX sens) — elle
 * n'en est pas une jumelle. Elle n'écrit rien : une vCard reçue n'est pas le
 * carnet du lecteur.
 *
 * Ce qui SORT est une liste fermée (`PublicContactAccount`) : jamais
 * l'e-mail ni le téléphone du compte, jamais lequel des identifiants a
 * matché, jamais la présence, le rôle ni une date. Un compte qui s'est masqué
 * de la recherche (`hideProfileFromSearch`) n'est remonté qu'à un ami.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  CONTACT_RESOLVE_MAX_ACCOUNTS,
  type ContactRelation,
  type PublicContactAccount,
} from '@meeshy/shared/types/contact-card';
import { normalizeContacts, resolveDefaultCountry, type NormalizedContact } from '../utils/contact-identifiers.js';
import { normalizeEmail } from '../utils/normalize.js';
import { ContactDirectoryService } from './ContactDirectoryService.js';
import { loadStoredPrivacyPreferences } from './preferences/privacy-storage.js';

const PUBLIC_CONTACT_SELECT = {
  id: true,
  username: true,
  displayName: true,
  firstName: true,
  lastName: true,
  avatar: true,
  banner: true,
  bio: true,
} as const;

const VIEWER_SELECT = {
  id: true,
  phoneNumber: true,
  email: true,
  phoneCountryCode: true,
  deviceCountry: true,
} as const;

type ViewerIdentity = {
  readonly phoneNumber: string | null;
  readonly email: string | null;
};

type FriendLink = { readonly senderId: string; readonly receiverId: string; readonly status: string };

type PublicProfileRow = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly bio: string | null;
};

export type ResolveContactCardInput = {
  readonly viewerId: string;
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly defaultCountry?: string;
};

const RELATION_RANK: Readonly<Record<ContactRelation, number>> = {
  self: 4,
  friend: 3,
  'request-received': 2,
  'request-sent': 1,
  none: 0,
};

/** La relation que porte UNE ligne `FriendRequest`, vue du lecteur. */
function relationOf(link: FriendLink, viewerId: string): ContactRelation {
  if (link.status === 'accepted') return 'friend';
  if (link.status !== 'pending') return 'none';
  return link.senderId === viewerId ? 'request-sent' : 'request-received';
}

function isViewerIdentifier(contact: NormalizedContact, viewer: ViewerIdentity): boolean {
  const viewerEmail = viewer.email ? normalizeEmail(viewer.email) : null;
  return (
    (viewer.phoneNumber !== null && contact.phoneNumbers.includes(viewer.phoneNumber)) ||
    (viewerEmail !== null && contact.emails.includes(viewerEmail))
  );
}

function displayNameOf(row: PublicProfileRow): string {
  const composed = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return row.displayName?.trim() || composed || row.username;
}

export class ContactCardResolver {
  constructor(private readonly prisma: PrismaClient) {}

  async resolve(input: ResolveContactCardInput): Promise<PublicContactAccount[]> {
    const { viewerId } = input;
    const viewer = await this.prisma.user.findUnique({ where: { id: viewerId }, select: VIEWER_SELECT });
    const country =
      resolveDefaultCountry(input.defaultCountry) ??
      resolveDefaultCountry(viewer?.phoneCountryCode) ??
      resolveDefaultCountry(viewer?.deviceCountry);

    // Un identifiant par « contact » : l'appariement du Répertoire rend UN
    // compte par contact, et la vCard en porte autant qu'elle a de numéros.
    const identifiers = normalizeContacts(
      [
        ...input.phones.map((phone) => ({ phoneNumbers: [phone] })),
        ...input.emails.map((email) => ({ emails: [email] })),
      ],
      country,
    );
    if (identifiers.length === 0) return [];

    const matches = await new ContactDirectoryService(this.prisma).match({
      contacts: identifiers,
      excludeUserId: viewerId,
    });
    const viewerIdentity: ViewerIdentity = { phoneNumber: viewer?.phoneNumber ?? null, email: viewer?.email ?? null };
    const orderedIds = [
      ...new Set(
        identifiers.flatMap((contact) => {
          if (isViewerIdentifier(contact, viewerIdentity)) return [viewerId];
          const match = matches.get(contact.contactKey);
          return match ? [match.user.id] : [];
        }),
      ),
    ];
    if (orderedIds.length === 0) return [];

    const others = orderedIds.filter((id) => id !== viewerId);
    const [profiles, links, privacy] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: orderedIds } }, select: PUBLIC_CONTACT_SELECT }),
      others.length === 0
        ? Promise.resolve([] as FriendLink[])
        : this.prisma.friendRequest.findMany({
            where: {
              OR: [
                { senderId: viewerId, receiverId: { in: others } },
                { receiverId: viewerId, senderId: { in: others } },
              ],
            },
            select: { senderId: true, receiverId: true, status: true },
          }),
      loadStoredPrivacyPreferences(this.prisma, others),
    ]);

    const relations = new Map<string, ContactRelation>(orderedIds.map((id) => [id, id === viewerId ? 'self' : 'none']));
    for (const link of links as FriendLink[]) {
      const otherId = link.senderId === viewerId ? link.receiverId : link.senderId;
      const current = relations.get(otherId) ?? 'none';
      const candidate = relationOf(link, viewerId);
      if (RELATION_RANK[candidate] > RELATION_RANK[current]) relations.set(otherId, candidate);
    }

    const profileById = new Map((profiles as PublicProfileRow[]).map((row) => [row.id, row]));
    return orderedIds
      .flatMap((id): PublicContactAccount[] => {
        const row = profileById.get(id);
        const relation = relations.get(id) ?? 'none';
        if (!row) return [];
        const hidden = privacy.get(id)?.hideProfileFromSearch === true;
        if (hidden && relation !== 'friend' && relation !== 'self') return [];
        return [
          {
            userId: row.id,
            displayName: displayNameOf(row),
            username: row.username,
            avatarUrl: row.avatar || null,
            bannerUrl: row.banner || null,
            bio: row.bio?.trim() ? row.bio : null,
            relation,
          },
        ];
      })
      .slice(0, CONTACT_RESOLVE_MAX_ACCOUNTS);
  }
}
