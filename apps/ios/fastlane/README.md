fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios test

```sh
[bundle exec] fastlane ios test
```

Run unit tests

### ios sync_certificates

```sh
[bundle exec] fastlane ios sync_certificates
```

Sync certificates and provisioning profiles

### ios sync_dev_certificates

```sh
[bundle exec] fastlane ios sync_dev_certificates
```

Sync development certificates

### ios build_production

```sh
[bundle exec] fastlane ios build_production
```

Build production IPA

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build + upload to TestFlight

### ios release

```sh
[bundle exec] fastlane ios release
```

Build + submit to App Store

### ios bump_version

```sh
[bundle exec] fastlane ios bump_version
```

Bump version (patch/minor/major)

### ios force_sync

```sh
[bundle exec] fastlane ios force_sync
```

Force regenerate all provisioning profiles

### ios clean

```sh
[bundle exec] fastlane ios clean
```

Clean build artifacts

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
