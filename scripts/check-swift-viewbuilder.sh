#!/bin/bash
# ViewBuilder statement-chaining guard.
#
# Fails (exit 1) si un modificateur est chaîné sur un BLOC D'INSTRUCTION Swift :
#
#     if flag {
#         FooView()
#     } else {
#         BarView()
#     }
#     .padding(.top, 60)      ← illégal
#
# `if` / `switch` / `for` / `while` / `guard` / `do` sont des INSTRUCTIONS, pas
# des expressions : on ne peut rien leur chaîner. Swift lit alors `.padding`
# comme une nouvelle instruction — une référence de membre à trou — et sort
#
#     error: instance member 'padding' cannot be used on type 'View'
#
# ce qui ne désigne ni la bonne ligne ni la vraie cause. Le correctif est
# d'envelopper le bloc dans `Group { … }` (transparent au rendu).
#
# Pourquoi un garde et pas seulement le compilateur : ce motif a bloqué la
# compilation iOS de `main` pendant des heures. Le seul détecteur était un
# `xcodebuild` macOS de ~15 min, qui s'arrête à la première erreur. Ici :
# quelques secondes sur ubuntu, TOUTES les occurrences d'un coup, avant même
# que le runner macOS ne démarre.
#
# Détection (une seule passe, sur l'indentation) : une ligne qui commence par
# `.`, précédée d'une ligne réduite à `}` à la MÊME indentation, dont le bloc
# a été ouvert par une ligne commençant par un mot-clé d'instruction. Une
# fermeture de closure (`VStack {`, `.onReceive(…) { _ in`) n'ouvre pas sur un
# mot-clé : elle n'est jamais signalée.
#
# Limite connue : un `switch` dont l'ouverture est multi-lignes est repéré via
# ses `case`, pas via le `switch` lui-même. Suffisant pour le motif observé.
#
# --self-test : passe le détecteur sur un arbre jetable contenant un cas
# fautif ET les faux positifs qui l'ont piégé pendant l'écriture (closure
# `VStack`, `.onReceive(publisher(for:)) { }`). Un garde qui devient aveugle
# en silence ne vaut rien : ce mode échoue bruyamment.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCAN_ROOTS=("apps/ios" "packages/MeeshySDK")

detect() {
  # Sortie : `fichier:ligne: <ouvrant> … <chaînage>` par occurrence.
  awk '
    function stripped_head(s) {
      sub(/^\}[ \t]*/, "", s)   # `} else {` → `else {`
      return s
    }
    function is_statement(s,   h) {
      h = stripped_head(s)
      return (h ~ /^(if|else|switch|for|while|guard|do|repeat|catch|case|default)([ \t({:]|$)/)
    }
    FNR == 1 { delete opener; prev = ""; prev_ind = -1; pending = ""; pending_ln = 0 }
    {
      line = $0
      sub(/[ \t]*\/\/.*$/, "", line)          # commentaire de fin de ligne
      body = line
      sub(/^[ \t]+/, "", body)
      sub(/[ \t]+$/, "", body)
      if (body == "") next                     # ligne vide ou commentaire seul

      match(line, /^[ \t]*/)
      ind = RLENGTH

      if (substr(body, 1, 1) == "." && prev == "}" && prev_ind == ind && pending != "" && is_statement(pending)) {
        printf "%s:%d: bloc `%s` (L%d) fermé puis chaîné sur `%s`\n", FILENAME, FNR, pending, pending_ln, body
      }

      if (body == "}") {
        pending = (ind in opener) ? opener[ind] : ""
        pending_ln = (ind in opener_ln) ? opener_ln[ind] : 0
      }

      opener[ind] = body
      opener_ln[ind] = FNR
      prev = body
      prev_ind = ind
    }
  ' "$@"
}

# Énumération des fichiers à analyser. UN seul mécanisme, exercé à la fois par
# le scan réel et par `--self-test` : une énumération qui rétrécit en silence
# rend le garde vert sans rien avoir regardé.
#
# Les motifs sont passés à `git ls-files` SANS glob `**` : un `**` non protégé
# est d'abord expansé par bash, qui — sans `globstar` — ne traverse pas les
# `/`. La première écriture de ce script est tombée dedans et n'analysait que
# 1435 des 2528 fichiers, en manquant précisément
# `Features/Main/Views/ConversationListView.swift` (profondeur 5) — le fichier
# qui a motivé le garde.
list_swift_files() {
  git ls-files -- "${SCAN_ROOTS[@]}" 2>/dev/null | grep '\.swift$' || true
}

run_self_test() {
  local fixture
  fixture=$(mktemp -d)
  trap 'rm -rf "$fixture"' RETURN

  cat > "$fixture/Bad.swift" <<'SWIFT'
struct Bad: View {
    var body: some View {
        if flag {
            FooView()
        } else {
            BarView()
        }
        .padding(.top, 60)
    }
}
SWIFT

  cat > "$fixture/Good.swift" <<'SWIFT'
struct Good: View {
    var body: some View {
        Group {
            if flag {
                FooView()
            } else {
                BarView()
            }
        }
        .padding(.top, 60)
        VStack(spacing: 8) {
            FooView()
        }
        .padding(.horizontal, 16)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            handle()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            handle()
        }
    }
}
SWIFT

  local out
  out=$(detect "$fixture/Bad.swift" "$fixture/Good.swift" || true)

  if ! grep -q "Bad.swift:8:" <<<"$out"; then
    echo -e "${RED}✗ self-test : le chaînage sur if/else n'est PAS détecté — le garde est cassé${NC}"
    echo "$out"
    return 1
  fi
  if grep -q "Good.swift" <<<"$out"; then
    echo -e "${RED}✗ self-test : faux positif sur du Swift valide (Group / VStack / onReceive)${NC}"
    echo "$out"
    return 1
  fi
  # L'énumération est la seconde moitié du garde : un détecteur juste sur un
  # échantillon tronqué est un garde vert qui n'a rien lu.
  local listed deep
  listed=$(list_swift_files | wc -l | tr -d ' ')
  deep=$(list_swift_files | grep -c '^apps/ios/Meeshy/Features/.*/.*/.*\.swift$' || true)
  if [ "$listed" -lt 100 ] || [ "$deep" -eq 0 ]; then
    echo -e "${RED}✗ self-test : l'énumération ne remonte que ${listed} fichier(s) et ${deep} en arborescence profonde — elle a rétréci${NC}"
    return 1
  fi
  echo -e "${GREEN}✓ self-test : détection intacte (cas fautif pris, Swift valide épargné), énumération à ${listed} fichiers${NC}"
}

if [ "${1:-}" == "--self-test" ]; then
  run_self_test
  exit $?
fi

# Des chemins explicites priment sur les racines par défaut : c'est ce qui
# permet de rejouer le garde sur un seul fichier (ou sur un fichier extrait de
# `git show`) sans dépendre du répertoire courant.
if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  mapfile -t FILES < <(list_swift_files)
  if [ "${#FILES[@]}" -eq 0 ]; then
    mapfile -t FILES < <(find "${SCAN_ROOTS[@]}" -name '*.swift' -type f 2>/dev/null)
  fi
fi
if [ "${#FILES[@]}" -eq 0 ]; then
  echo "Aucun fichier Swift à analyser."
  exit 0
fi

HITS=$(detect "${FILES[@]}" || true)

if [ -n "$HITS" ]; then
  COUNT=$(printf '%s\n' "$HITS" | wc -l | tr -d ' ')
  echo -e "${RED}✗ ${COUNT} modificateur(s) chaîné(s) sur un bloc d'instruction — la compilation Swift échouera :${NC}"
  printf '%s\n' "$HITS"
  echo ""
  echo "Correctif : envelopper le bloc dans \`Group { … }\`, ou déplacer le"
  echo "modificateur à l'intérieur de CHAQUE branche."
  exit 1
fi

echo -e "${GREEN}✓ aucun modificateur chaîné sur un bloc d'instruction (${#FILES[@]} fichiers Swift)${NC}"
