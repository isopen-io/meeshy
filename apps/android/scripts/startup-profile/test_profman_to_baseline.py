import unittest

from profman_to_baseline import convert, descriptor, method_rule

DUMP = """=== profile ===
ProfileInfo:
base.apk!classes2.dex [index=0]
\thot methods: 
\t\tvoid me.meeshy.app.MainActivity.onCreate(android.os.Bundle)[], 
\tstartup methods: 
\t\tvoid me.meeshy.app.MainActivity.onCreate(android.os.Bundle)
\t\tint[][] me.meeshy.app.Grid.cells(long, boolean[], java.lang.String)
\t\tvoid me.meeshy.app.navigation.MeeshyAppKt$MeeshyApp$1.<init>()
\tpost startup methods: 
\t\tvoid me.meeshy.app.MainActivity.onResume()
\tclasses: 
\t\tme.meeshy.app.MainActivity
\t\tme.meeshy.app.navigation.MeeshyAppKt$MeeshyApp$1
base.apk!classes.dex [index=1]
\tstartup methods: 
\t\tjava.lang.Object kotlin.SynchronizedLazyImpl.getValue()
\tclasses: 
\t\tkotlin.SynchronizedLazyImpl
"""


class ProfmanToBaselineTest(unittest.TestCase):
    def test_primitive_object_and_array_types_become_descriptors(self):
        self.assertEqual(descriptor("int[][]"), "[[I")
        self.assertEqual(descriptor("boolean[]"), "[Z")
        self.assertEqual(descriptor("java.lang.String"), "Ljava/lang/String;")
        self.assertEqual(descriptor("long"), "J")

    def test_a_method_becomes_a_hot_startup_rule(self):
        self.assertEqual(
            method_rule("int[][] me.meeshy.app.Grid.cells(long, boolean[], java.lang.String)"),
            "HSPLme/meeshy/app/Grid;->cells(J[ZLjava/lang/String;)[[I",
        )

    def test_a_constructor_keeps_its_name_and_inner_class_dollars(self):
        self.assertEqual(
            method_rule("void me.meeshy.app.navigation.MeeshyAppKt$MeeshyApp$1.<init>()"),
            "HSPLme/meeshy/app/navigation/MeeshyAppKt$MeeshyApp$1;-><init>()V",
        )

    def test_only_startup_methods_and_classes_of_every_dex_are_kept_sorted_and_unique(self):
        self.assertEqual(
            convert(DUMP),
            [
                "HSPLkotlin/SynchronizedLazyImpl;->getValue()Ljava/lang/Object;",
                "HSPLme/meeshy/app/Grid;->cells(J[ZLjava/lang/String;)[[I",
                "HSPLme/meeshy/app/MainActivity;->onCreate(Landroid/os/Bundle;)V",
                "HSPLme/meeshy/app/navigation/MeeshyAppKt$MeeshyApp$1;-><init>()V",
                "Lkotlin/SynchronizedLazyImpl;",
                "Lme/meeshy/app/MainActivity;",
                "Lme/meeshy/app/navigation/MeeshyAppKt$MeeshyApp$1;",
            ],
        )

    def test_debug_only_tooling_is_left_out(self):
        dump = DUMP.replace("kotlin.SynchronizedLazyImpl", "androidx.compose.ui.tooling.Inspectable")
        self.assertFalse(any("compose/ui/tooling" in rule for rule in convert(dump)))


if __name__ == "__main__":
    unittest.main()
