#include "MeeshyTestSupportLoader.h"

// #10854 — runs when dyld loads the test bundle, before XCTest instantiates a
// single test case: no test class has to remember to seal the network.
__attribute__((constructor, used))
static void meeshy_test_support_on_bundle_load(void) {
    meeshy_test_support_install();
}
