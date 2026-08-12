import Foundation
import os

/// File-system helpers that distinguish "nothing to do" from "it actually failed".
///
/// `try? FileManager.default.removeItem(…)` conflates the two: a file that was
/// already gone (the nominal case for every best-effort sweep) and a real
/// failure (permissions, I/O error, read-only volume) both produce silence.
/// Only the second one matters — it means the bytes are still occupying the
/// container and the disk-usage regression has no traceable origin.
public extension FileManager {

    /// Removes `url`, staying silent when it was already absent and logging
    /// every other failure.
    ///
    /// - Parameters:
    ///   - context: What the caller was reclaiming, used to make the log
    ///     actionable (e.g. `"outbox terminal sweep"`).
    ///   - logger: Category to log under.
    func removeItemLogging(at url: URL, context: String, logger: Logger = .cache) {
        removeItemLogging(atPath: url.path, context: context, logger: logger)
    }

    /// `removeItemLogging(at:context:logger:)` for a path string.
    func removeItemLogging(atPath path: String, context: String, logger: Logger = .cache) {
        do {
            try removeItem(atPath: path)
        } catch CocoaError.fileNoSuchFile {
            // Déjà réclamé — cas nominal d'un sweep best-effort.
        } catch {
            logger.error(
                "\(context, privacy: .public): file not reclaimed, disk space retained: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    /// Creates a directory (with intermediates), logging a real failure.
    ///
    /// An existing directory is the nominal case and stays silent. Any other
    /// failure means every subsequent write into that directory will fail, so
    /// the root cause has to be recorded here rather than surfacing later as a
    /// cascade of unrelated write errors.
    func createDirectoryLogging(at url: URL, context: String, logger: Logger = .cache) {
        do {
            try createDirectory(at: url, withIntermediateDirectories: true)
        } catch CocoaError.fileWriteFileExists {
            // Déjà présent.
        } catch {
            logger.error(
                "\(context, privacy: .public): directory unavailable, writes into it will fail: \(error.localizedDescription, privacy: .public)"
            )
        }
    }
}
