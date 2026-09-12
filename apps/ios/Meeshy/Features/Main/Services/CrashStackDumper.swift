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

    /// Tampon d'en-tête, alloué À L'INSTALLATION (#6213 bis).
    ///
    /// Le handler ne peut RIEN allouer : il court après un SIGSEGV, souvent
    /// parce que la pile est morte. Tout ce qu'il écrit doit donc déjà exister.
    private static var headerBuffer = [CChar](repeating: 0, count: 512)

    /// Écrit `value` en hexadécimal dans `buf` à partir de `at`, et rend la
    /// position suivante. Async-signal-safe par construction : aucune
    /// allocation, aucun appel de bibliothèque — `snprintf` ne l'est pas.
    private static func writeHex(_ value: UInt, into buf: UnsafeMutablePointer<CChar>, at start: Int) -> Int {
        let digits: [CChar] = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102]
        buf[start] = 48      // '0'
        buf[start + 1] = 120 // 'x'
        var i = start + 2
        var seen = false
        var shift = 60
        while shift >= 0 {
            let nibble = Int((value >> UInt(shift)) & 0xF)
            if nibble != 0 || seen || shift == 0 {
                seen = true
                buf[i] = digits[nibble]
                i += 1
            }
            shift -= 4
        }
        return i
    }

    private static func writeASCII(_ text: StaticString, into buf: UnsafeMutablePointer<CChar>, at start: Int) -> Int {
        var i = start
        text.withUTF8Buffer { bytes in
            for b in bytes {
                buf[i] = CChar(bitPattern: b)
                i += 1
            }
        }
        return i
    }

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
        action.__sigaction_u.__sa_sigaction = { sig, info, ucontext in
            CrashStackDumper.dumpPathBuffer.withUnsafeBufferPointer { pathPtr in
                let fd = open(pathPtr.baseAddress!, O_CREAT | O_WRONLY | O_TRUNC, 0o644)
                if fd >= 0 {
                    /*
                     LE VERDICT AVANT LA PILE (#6213 bis) — « débordement » et
                     « pointeur invalide » rendent le MÊME signal 11 et la même
                     trace d'apparence normale. Les distinguer à l'œil, sur la
                     forme de la pile, est un pari : une récursion visible dit
                     « débordement », mais son ABSENCE ne dit rien — un cadre
                     unique et énorme déborde sans se répéter.
                     Ce que le noyau sait, lui, c'est l'ADRESSE fautive. Comparée
                     aux bornes de la pile du thread, elle tranche :
                       · juste SOUS la limite basse  ⇒ page de garde ⇒ débordement
                       · ailleurs                    ⇒ accès invalide, point.
                     Trois lignes écrites avant la trace, à zéro allocation.
                    */
                    CrashStackDumper.headerBuffer.withUnsafeMutableBufferPointer { hdr in
                        guard let base = hdr.baseAddress else { return }
                        let me = pthread_self()
                        let high = UInt(bitPattern: pthread_get_stackaddr_np(me))
                        let size = UInt(pthread_get_stacksize_np(me))
                        let fault = UInt(bitPattern: info?.pointee.si_addr)
                        var i = CrashStackDumper.writeASCII("=== signal ", into: base, at: 0)
                        i = CrashStackDumper.writeHex(UInt(UInt32(bitPattern: sig)), into: base, at: i)
                        i = CrashStackDumper.writeASCII(" si_addr=", into: base, at: i)
                        i = CrashStackDumper.writeHex(fault, into: base, at: i)
                        i = CrashStackDumper.writeASCII(" stack_high=", into: base, at: i)
                        i = CrashStackDumper.writeHex(high, into: base, at: i)
                        i = CrashStackDumper.writeASCII(" stack_size=", into: base, at: i)
                        i = CrashStackDumper.writeHex(size, into: base, at: i)
                        i = CrashStackDumper.writeASCII(" stack_low=", into: base, at: i)
                        i = CrashStackDumper.writeHex(high &- size, into: base, at: i)
                        i = CrashStackDumper.writeASCII(" ===\n", into: base, at: i)
                        _ = write(fd, base, i)
                    }
                    /*
                     LA TAILLE DE CHAQUE CADRE (#6213 bis) — « ça déborde » ne
                     dit pas QUOI corriger. 149 cadres pour 1008 Ko, c'est une
                     MOYENNE de 7 Ko ; une moyenne sur une distribution que l'on
                     sait très inégale ne désigne personne. Ce qu'il faut est le
                     PALMARÈS : quel `body` matérialise, à lui seul, des dizaines
                     de kilo-octets de type composite.
                     On marche la chaîne des pointeurs de cadre depuis le
                     CONTEXTE du crash (`ucontext`), pas depuis le handler — qui
                     court sur la pile alternative et ne verrait que lui-même.
                     Sur arm64 : [fp] = fp de l'appelant, [fp+8] = adresse de
                     retour ; la taille d'un cadre est la distance à son
                     appelant. Même ordre que `backtrace`, donc les deux listes
                     se lisent en regard.
                    */
                    if let uc = ucontext?.assumingMemoryBound(to: ucontext_t.self),
                       let mc = uc.pointee.uc_mcontext {
                        CrashStackDumper.headerBuffer.withUnsafeMutableBufferPointer { hdr in
                            guard let base = hdr.baseAddress else { return }
                            var i = CrashStackDumper.writeASCII("--- cadres (fp, octets) ---\n", into: base, at: 0)
                            _ = write(fd, base, i)
                            var fp = UInt(mc.pointee.__ss.__fp)
                            var level = 0
                            while fp != 0, level < 192 {
                                let next = UInt(UnsafeRawPointer(bitPattern: fp)?.load(as: UInt.self) ?? 0)
                                let span = next > fp ? next &- fp : 0
                                i = CrashStackDumper.writeHex(UInt(level), into: base, at: 0)
                                i = CrashStackDumper.writeASCII(" fp=", into: base, at: i)
                                i = CrashStackDumper.writeHex(fp, into: base, at: i)
                                i = CrashStackDumper.writeASCII(" size=", into: base, at: i)
                                i = CrashStackDumper.writeHex(span, into: base, at: i)
                                i = CrashStackDumper.writeASCII("\n", into: base, at: i)
                                _ = write(fd, base, i)
                                if next <= fp { break }
                                fp = next
                                level += 1
                            }
                            i = CrashStackDumper.writeASCII("--- trace ---\n", into: base, at: 0)
                            _ = write(fd, base, i)
                        }
                    }
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
