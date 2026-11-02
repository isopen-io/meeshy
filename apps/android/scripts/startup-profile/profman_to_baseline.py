"""Turn an ART profile dump of a real cold start into the app's Baseline Profile (#13647).

    adb shell cmd package dump-profiles me.meeshy.app.debug
    adb pull /data/misc/profman/me.meeshy.app.debug-primary.prof.txt
    python3 profman_to_baseline.py me.meeshy.app.debug-primary.prof.txt > ../../app/src/main/baseline-prof.txt

The dump must come from a DEBUG build (names before R8: AGP rewrites them for the release), after
a few cold starts on the conversation list, and from an install whose ART profile started empty.
Only the methods ART flagged as run at startup are kept, with every class it loaded.
"""

import sys

PRIMITIVES = {
    "void": "V", "boolean": "Z", "byte": "B", "char": "C", "short": "S",
    "int": "I", "long": "J", "float": "F", "double": "D",
}

DEBUG_ONLY_PREFIXES = ("androidx/compose/ui/tooling/", "androidx/compose/runtime/tooling/")


def descriptor(java_type):
    depth = 0
    while java_type.endswith("[]"):
        java_type = java_type[:-2]
        depth += 1
    base = PRIMITIVES.get(java_type) or "L" + java_type.replace(".", "/") + ";"
    return "[" * depth + base


def method_rule(signature):
    head, params = signature.split("(", 1)
    returns, qualified = head.rsplit(" ", 1)
    owner, name = qualified.rsplit(".", 1)
    arguments = [part.strip() for part in params.rstrip(")").split(",") if part.strip()]
    return "HSP{}->{}({}){}".format(
        descriptor(owner), name, "".join(descriptor(argument) for argument in arguments), descriptor(returns),
    )


def class_rule(name):
    return descriptor(name)


def is_kept(rule):
    owner = rule[3:] if rule.startswith("HSP") else rule
    return not owner[1:].startswith(DEBUG_ONLY_PREFIXES)


def convert(dump):
    rules = set()
    section = None
    for raw in dump.splitlines():
        if raw.startswith("\t\t"):
            entry = raw.strip().rstrip(",").removesuffix("[]").strip()
            if section == "startup methods":
                rules.add(method_rule(entry))
            elif section == "classes":
                rules.add(class_rule(entry))
        elif raw.startswith("\t"):
            section = raw.strip().rstrip(":").strip()
        else:
            section = None
    return sorted(rule for rule in rules if is_kept(rule))


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as source:
        print("\n".join(convert(source.read())))
