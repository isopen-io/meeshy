## 2026-05: Mdia snapshot - Reflink (COPYFILE_FICLONE) ct gateway
**Statut**: Accept
**Contexte**: Le repost-en-post d'une story duplique les mdias vers de nouveaux paths CDN (snapshot indpendant pour survivre  l'expiration de la story originale). L'implmentation initiale utilisait `fs.copyFile(src, dst)` sans flag — full byte copy systmatique.
**Decision**: Utiliser `fs.copyFile(src, dst, fs.constants.COPYFILE_FICLONE | COPYFILE_EXCL)` dans `services/gateway/src/services/MediaService.ts`. `COPYFILE_FICLONE` = best-effort copy-on-write reflink (zero-copy sur APFS, btrfs, XFS, ext4 5.6+) avec fallback automatique vers full copy. `COPYFILE_EXCL` = guard contre overwrite race (UUID destination).
**Justification SOTA (audit 2026-05-06)** :
- Sur APFS/btrfs/XFS, le reflink est gratuit (~zro I/O, ~zro RAM, atomic)
- Sur les filesystems non-supports, fallback transparent vers full copy (zro impact)
- Gain estim : -90% I/O sur duplication snapshot, support reflinks natif macOS/Linux modern
**Alternatives rejet** :
- **Streams** (`createReadStream.pipe(createWriteStream)`) : universel mais 2 buffers RAM, complexit accrue
- **Server-side copy S3** (`CopyObject`) : non applicable car stockage actuel = volumes Docker locaux. Sera la SOTA quand on migrera vers MinIO/R2 (cf. Pilier 7 audit).
**Cons**: dpend du filesystem hte (mais fallback gracieux)
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 3
