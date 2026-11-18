/**
 * Balayage des ÉCRIVAINS de `CommunityMember` (#19406).
 *
 * Une communauté grandissait en silence : `applyCommunityAdmission` écrivait
 * les entrées implicites (créer un salon, y ajouter quelqu'un, débannir,
 * entrer par un lien de salon, rattacher un salon) sans rien annoncer, pendant
 * que les routes de `routes/communities/` diffusaient chacune leur geste. Le
 * site n'était pas caché : il n'appartenait pas à la phrase du lot qui a fermé
 * les autres (#18766, « les six routes »).
 *
 * Ce cliquet fige les fichiers qui ÉCRIVENT une ligne d'appartenance, chacun
 * avec la façon dont il le fait savoir. Un écrivain nouveau le fait tomber, et
 * sa question au lot suivant est : **et celui-là, il diffuse ?** Il relève les
 * sites d'écriture, pas les diffusions : la marque cherchée prouve qu'un
 * émetteur est branché dans le fichier, pas qu'il couvre chaque branche — les
 * témoins de chaque site le font.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_ROOT = join(__dirname, '..');

const WRITE = /\.communityMember\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

type Announcement =
  | { readonly kind: 'member-broadcast' }
  | { readonly kind: 'community-deleted' }
  | { readonly kind: 'silent'; readonly issue: string };

const WRITERS: Readonly<Record<string, Announcement>> = {
  'routes/communities/admission.ts': { kind: 'member-broadcast' },
  'routes/communities/members.ts': { kind: 'member-broadcast' },
  'routes/communities/membership.ts': { kind: 'member-broadcast' },
  'services/conversations/communityMembershipSync.ts': { kind: 'member-broadcast' },
  'routes/communities/settings.ts': { kind: 'community-deleted' },
  'services/deactivateDeletedAccountCommunityMemberships.ts': { kind: 'silent', issue: '#18769' },
};

const MARKS: Readonly<Record<Exclude<Announcement['kind'], 'silent'>, RegExp>> = {
  'member-broadcast': /scheduleCommunityMemberBroadcast|CommunityMemberAnnounce|announce\(/,
  'community-deleted': /scheduleCommunityDeletedBroadcastFrom/,
};

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : productionFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

const writers = productionFiles(SRC_ROOT)
  .filter((path) => WRITE.test(readFileSync(path, 'utf8')))
  .map((path) => relative(SRC_ROOT, path).split('\\').join('/'))
  .sort();

describe("les écrivains de CommunityMember disent comment l'effectif l'apprend", () => {
  it('le balayage voit bien les écrivains connus (un balayage vide resterait vert)', () => {
    expect(writers).toContain('routes/communities/members.ts');
    expect(writers).toContain('services/conversations/communityMembershipSync.ts');
  });

  it("l'inventaire est exact : un écrivain nouveau doit répondre « et celui-là, il diffuse ? »", () => {
    expect(writers).toEqual(Object.keys(WRITERS).sort());
  });

  it('chaque écrivain déclaré diffusant porte bien son émetteur', () => {
    const unwired = Object.entries(WRITERS).flatMap(([path, announcement]) =>
      announcement.kind === 'silent' || MARKS[announcement.kind].test(readFileSync(join(SRC_ROOT, path), 'utf8'))
        ? []
        : [path],
    );
    expect(unwired).toEqual([]);
  });

  it('un écrivain muet est une dette nommée par son issue, jamais un oubli', () => {
    const silent = Object.values(WRITERS).filter((a): a is Extract<Announcement, { kind: 'silent' }> => a.kind === 'silent');
    expect(silent.every((a) => /^#\d+$/.test(a.issue))).toBe(true);
  });
});
