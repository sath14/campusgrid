#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -x "$HOME/jdk-25/bin/java" ]]; then
    export JAVA_HOME="$HOME/jdk-25"
  elif command -v java >/dev/null 2>&1; then
    export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
  fi
fi

JAVA_VER="$("$JAVA_HOME/bin/java" -version 2>&1 | head -1 || true)"
echo "Using JAVA_HOME=$JAVA_HOME ($JAVA_VER)"
if ! echo "$JAVA_VER" | grep -qE '"25[\.\"]'; then
  echo "WARNING: This project is configured for JDK 25 (Gradle 9.1 + AGP 9). Found: $JAVA_VER"
fi

if [[ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]]; then
  if [[ -d "$HOME/android-sdk" ]]; then
    export ANDROID_HOME="$HOME/android-sdk"
  else
    echo "Set ANDROID_HOME to your Android SDK path." >&2
    exit 1
  fi
fi
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$JAVA_HOME/bin:$PATH"

if [[ ! -d node_modules ]]; then
  npm install
fi

if [[ ! -d android ]]; then
  npx cap add android
  npx cap sync android
  mkdir -p android/app/src/main/res/xml
  cp network_security_config.xml android/app/src/main/res/xml/
fi

echo "sdk.dir=${ANDROID_HOME}" > android/local.properties
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon
echo
echo "APK: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
