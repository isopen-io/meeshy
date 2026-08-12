#if DEBUG
import Foundation
import Darwin

/// DEV-ONLY — filet de diagnostic pour les crashs que le système ne documente
/// plus : ReportCrash throttle les .ips d'un crash répété (après ~3, plus
/// aucun rapport) et MetricKit livre un `callStackTree` au thread fautif VIDE
/// pour les stack overflows. Ce handler SIGSEGV/SIGBUS, installé sur pile
/// alternative (`sigaltstack` — indispensable : la pile principale est morte
/// lors d'un débordement), écrit la backtrace brute du thread fautif dans
/// `Documents/segv_backtrace.txt`, récupérable par house_arrest
/// (`pymobiledevice3`) ou l'app Fichiers.
///
/// Async-signal-safety : le chemin est pré-copié dans un buffer C à
/// l'installation ; le handler ne fait que `open`/`backtrace_symbols_fd`/
/// `close` puis ré-émet le signal au handler par défaut (le .ips système,
/// s'il n'est pas throttlé, reste produit).
enum CrashStackDumper {
    private static var dumpPathBuffer = [CChar](repeating: 0, count: 1024)

    static func install() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let path = docs.appendingPathComponent("segv_backtrace.txt").path
        path.withCString { src in
            dumpPathBuffer.withUnsafeMutableBufferPointer { dst in
                _ = strlcpy(dst.baseAddress!, src, 1024)
            }
        }

        let size = 512 * 1024
        let altStack = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: 16)
        var stack = stack_t(ss_sp: altStack, ss_size: size, ss_flags: 0)
        sigaltstack(&stack, nil)

        var action = sigaction()
        action.__sigaction_u.__sa_sigaction = { sig, _, _ in
            CrashStackDumper.dumpPathBuffer.withUnsafeBufferPointer { pathPtr in
                let fd = open(pathPtr.baseAddress!, O_CREAT | O_WRONLY | O_TRUNC, 0o644)
                if fd >= 0 {
                    var addrs = [UnsafeMutableRawPointer?](repeating: nil, count: 192)
                    let n = backtrace(&addrs, 192)
                    backtrace_symbols_fd(&addrs, n, fd)
                    close(fd)
                }
            }
            signal(sig, SIG_DFL)
            raise(sig)
        }
        action.sa_flags = SA_SIGINFO | SA_ONSTACK
        sigaction(SIGSEGV, &action, nil)
        sigaction(SIGBUS, &action, nil)
        NSLog("[CrashStackDumper] installed (Documents/segv_backtrace.txt)")
    }
}
#endif
