# CampusGrid Android (APK)

Capacitor shell that opens the CampusGrid web app on a phone.

## Build on JDK 25

Requires:

- **JDK 25**
- **Android SDK** (platform 36 + build-tools 36)
- **Node.js 20+**

```bash
export JAVA_HOME=/path/to/jdk-25
export ANDROID_HOME=/path/to/Android/Sdk
./BUILD-APK.sh
```

Output:

`android/app/build/outputs/apk/debug/app-debug.apk`

Toolchain pinned in the `android/` project:

| Tool | Version |
|------|---------|
| Gradle | 9.1.0 |
| Android Gradle Plugin | 9.0.0 |
| compileSdk / targetSdk | 36 |
| Capacitor | 8.5 |

Cleartext HTTP to the master laptop is enabled in `AndroidManifest.xml` + `network_security_config.xml`.
