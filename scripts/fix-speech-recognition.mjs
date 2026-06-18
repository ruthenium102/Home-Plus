// Idempotent postinstall fix for @capacitor-community/speech-recognition@7.0.x.
//
// The published tarball ships NO Package.swift (Capacitor 8 needs one for SPM)
// and still ships the legacy ObjC bridge (ios/Plugin/Plugin.h + Plugin.m).
// SwiftPM can't mix C and Swift in one target.
//
// We previously did this with patch-package, but a diff-based patch is fragile
// against Vercel's build cache: a half-applied node_modules from an earlier
// build makes the patch fail to apply (exit 1) and breaks the deploy. This
// script enforces the desired END STATE regardless of the starting state, so it
// is safe to run on a pristine, cached, or already-patched install.
//
// Two changes:
//   1. Write Package.swift that compiles ONLY Plugin.swift (sources whitelist),
//      so the legacy .h/.m are ignored — no mixed-language target.
//   2. Make Plugin.swift self-register via CAPBridgedPlugin, removing the
//      dependency on the ObjC CAP_PLUGIN macro in the (now uncompiled) Plugin.m.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgDir = join(root, 'node_modules', '@capacitor-community', 'speech-recognition');

if (!existsSync(pkgDir)) {
  // Plugin not installed (e.g. partial install) — nothing to do.
  process.exit(0);
}

const PACKAGE_SWIFT = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorCommunitySpeechRecognition",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "CapacitorCommunitySpeechRecognition",
            targets: ["CapacitorCommunitySpeechRecognitionPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "CapacitorCommunitySpeechRecognitionPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Plugin",
            // Compile ONLY Plugin.swift; the legacy ObjC Plugin.h/Plugin.m are
            // ignored so SwiftPM doesn't see a mixed C+Swift target.
            sources: ["Plugin.swift"]
        )
    ]
)
`;

const CONFORMANCE = `public class SpeechRecognition: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "SpeechRecognition"
    public let jsName = "SpeechRecognition"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedLanguages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]`;

// 1. Package.swift — always (re)write to the known-good manifest (idempotent).
const packageSwiftPath = join(pkgDir, 'Package.swift');
writeFileSync(packageSwiftPath, PACKAGE_SWIFT);

// 2. Plugin.swift — ensure CAPBridgedPlugin conformance exactly once.
const pluginSwiftPath = join(pkgDir, 'ios', 'Plugin', 'Plugin.swift');
if (existsSync(pluginSwiftPath)) {
  const original = readFileSync(pluginSwiftPath, 'utf8');
  if (!original.includes('CAPBridgedPlugin')) {
    const target = 'public class SpeechRecognition: CAPPlugin {';
    if (!original.includes(target)) {
      console.error(
        '[fix-speech-recognition] Plugin.swift no longer matches the expected ' +
          'class declaration — the plugin may have been upgraded. Skipping; ' +
          'verify the SPM/CAPBridgedPlugin fix is still needed.'
      );
      process.exit(0);
    }
    writeFileSync(pluginSwiftPath, original.replace(target, CONFORMANCE));
  }
}

console.log('[fix-speech-recognition] speech-recognition SPM fix applied.');
