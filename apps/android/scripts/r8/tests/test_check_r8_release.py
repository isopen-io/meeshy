import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from check_r8_release import (  # noqa: E402
    erased_retrofit_signatures, kept_serializer_count, removed_serializers, retrofit_annotation_descriptors,
)

SCRIPT = os.path.join(os.path.dirname(HERE), "check_r8_release.py")

HEALTHY_DUMP = """Class #0 annotations:
Annotations on class
  VISIBILITY_SYSTEM Ldalvik/annotation/MemberClasses; value={ Lq3/a; }
Annotations on method #12 'a'
  VISIBILITY_RUNTIME Lretrofit2/http/GET; value="auth/me"
  VISIBILITY_SYSTEM Ldalvik/annotation/Signature; value={ "(" "Lkotlin/coroutines/Continuation<" "-" "Lq3/b<" "Lq3/c;" ">;>;)" "Ljava/lang/Object;" }
Annotations on method #13 'b'
  VISIBILITY_RUNTIME Lretrofit2/http/POST; value="users/me/password"
  VISIBILITY_SYSTEM Ldalvik/annotation/Signature; value={ "(" "Lq3/d;" "Lkotlin/coroutines/Continuation<" "-" "Lkotlin/Unit;" ">;)" "Ljava/lang/Object;" }
Annotations on method #13 'b' parameters
  VISIBILITY_RUNTIME Lretrofit2/http/Body;
"""

ERASED_DUMP = """Class #0 annotations:
Annotations on method #12 'a'
  VISIBILITY_RUNTIME Lretrofit2/http/GET; value="auth/me"
  VISIBILITY_SYSTEM Ldalvik/annotation/Signature; value={ "(" "Lkotlin/coroutines/Continuation<" "-" "Lq3/b<" "Ljava/lang/Object;" ">;>;)" "Ljava/lang/Object;" }
Class #1 annotations:
Annotations on method #3 'z'
  VISIBILITY_SYSTEM Ldalvik/annotation/Signature; value={ "(" "Ljava/util/List<" "Ljava/lang/Object;" ">;)V" }
"""

USAGE_REMOVED = """me.meeshy.core.model.ChangePasswordResponse
me.meeshy.core.model.ChangePasswordResponse$$serializer
me.meeshy.core.model.Kept:
    public final java.lang.String unused()
me.meeshy.core.model.Kept$$serializer:
    public final void unused()
"""

USAGE_CLEAN = """me.meeshy.core.model.Kept:
    public final java.lang.String unused()
me.meeshy.feature.Unused
"""

OBFUSCATED_DUMP = """Class #0 annotations:
Annotations on method #12 'a'
  VISIBILITY_RUNTIME Lw00/f; value="auth/me"
  VISIBILITY_SYSTEM Ldalvik/annotation/Signature; value={ "(" "Lkotlin/coroutines/Continuation<" "-" "Lq3/b<" "Ljava/lang/Object;" ">;>;)" "Ljava/lang/Object;" }
Annotations on method #13 'b'
  VISIBILITY_RUNTIME Lw00/b; value="me"
  VISIBILITY_SYSTEM Ldalvik/annotation/Signature; value={ "(" "Lkotlin/coroutines/Continuation<" "-" "Lq3/b<" "Lq3/c;" ">;>;)" "Ljava/lang/Object;" }
Annotations on method #14 'c'
  VISIBILITY_RUNTIME Lq3/z; value="x"
  VISIBILITY_SYSTEM Ldalvik/annotation/Signature; value={ "(" "Ljava/util/List<" "Ljava/lang/Object;" ">;)V" }
"""

MAPPING = """# compiler: R8
retrofit2.http.DELETE -> w00.b:
retrofit2.http.GET -> w00.f:
    java.lang.String value() -> value
me.meeshy.core.model.Kept -> q3.c:
me.meeshy.core.model.Kept$$serializer -> q3.c$a:
    1:1:void <init>():0:0 -> <init>
me.meeshy.core.model.Other$$serializer -> q3.e$a:
"""


RETROFIT = frozenset({"Lw00/b;", "Lw00/f;"})


class ErasedSignatures(unittest.TestCase):
    def test_healthy_signatures_are_not_reported(self):
        erased, retrofit_methods = erased_retrofit_signatures(HEALTHY_DUMP, RETROFIT)
        self.assertEqual(erased, [])
        self.assertEqual(retrofit_methods, 2)

    def test_retrofit_annotations_renamed_by_r8_are_recognised_through_the_mapping(self):
        erased, retrofit_methods = erased_retrofit_signatures(OBFUSCATED_DUMP, RETROFIT)
        self.assertEqual(retrofit_methods, 2)
        self.assertEqual(len(erased), 1)
        self.assertIn("'a'", erased[0])

    def test_type_argument_erased_to_object_is_reported_for_a_retrofit_method_only(self):
        erased, retrofit_methods = erased_retrofit_signatures(ERASED_DUMP, RETROFIT)
        self.assertEqual(retrofit_methods, 1)
        self.assertEqual(len(erased), 1)
        self.assertIn("'a'", erased[0])

    def test_suspend_erased_return_type_is_not_a_type_argument(self):
        erased, _ = erased_retrofit_signatures(HEALTHY_DUMP, RETROFIT)
        self.assertEqual(erased, [])


class Serializers(unittest.TestCase):
    def test_a_wholly_removed_serializer_is_reported(self):
        self.assertEqual(removed_serializers(USAGE_REMOVED.splitlines()), ["me.meeshy.core.model.ChangePasswordResponse$$serializer"])

    def test_members_removed_from_a_kept_serializer_are_not_reported(self):
        self.assertEqual(removed_serializers(USAGE_CLEAN.splitlines()), [])

    def test_kept_serializers_are_counted_from_the_mapping(self):
        self.assertEqual(kept_serializer_count(MAPPING.splitlines()), 2)

    def test_renamed_retrofit_annotations_are_read_from_the_mapping(self):
        self.assertEqual(retrofit_annotation_descriptors(MAPPING.splitlines()), {"Lw00/b;", "Lw00/f;"})


class Command(unittest.TestCase):
    def run_check(self, dump, usage, mapping):
        with tempfile.TemporaryDirectory() as tmp:
            paths = {}
            for name, text in (("dump.txt", dump), ("usage.txt", usage), ("mapping.txt", mapping)):
                paths[name] = os.path.join(tmp, name)
                with open(paths[name], "w", encoding="utf-8") as handle:
                    handle.write(text)
            return subprocess.run(
                [sys.executable, SCRIPT, "--dexdump-output", paths["dump.txt"],
                 "--usage", paths["usage.txt"], "--mapping", paths["mapping.txt"]],
                capture_output=True, text=True,
            )

    def test_a_healthy_release_passes(self):
        result = self.run_check(HEALTHY_DUMP, USAGE_CLEAN, MAPPING)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_an_erased_signature_fails(self):
        self.assertEqual(self.run_check(ERASED_DUMP, USAGE_CLEAN, MAPPING).returncode, 1)

    def test_an_erased_signature_behind_renamed_annotations_fails(self):
        self.assertEqual(self.run_check(OBFUSCATED_DUMP, USAGE_CLEAN, MAPPING).returncode, 1)

    def test_a_removed_model_fails(self):
        self.assertEqual(self.run_check(HEALTHY_DUMP, USAGE_REMOVED, MAPPING).returncode, 1)

    def test_a_dump_with_bytes_that_are_not_utf8_is_still_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            dump = os.path.join(tmp, "dump.txt")
            with open(dump, "wb") as handle:
                handle.write(b"  VISIBILITY_RUNTIME Lx; value=\"\xc0\x80\"\n" + HEALTHY_DUMP.encode("utf-8"))
            usage, mapping = os.path.join(tmp, "usage.txt"), os.path.join(tmp, "mapping.txt")
            for path, text in ((usage, USAGE_CLEAN), (mapping, MAPPING)):
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(text)
            result = subprocess.run([sys.executable, SCRIPT, "--dexdump-output", dump, "--usage", usage, "--mapping", mapping],
                                    capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_a_dump_without_any_retrofit_method_fails_closed(self):
        self.assertEqual(self.run_check("Class #0 annotations:\n", USAGE_CLEAN, MAPPING).returncode, 1)

    def test_a_mapping_without_any_serializer_fails_closed(self):
        self.assertEqual(self.run_check(HEALTHY_DUMP, USAGE_CLEAN, "# compiler: R8\n").returncode, 1)


if __name__ == "__main__":
    unittest.main()
