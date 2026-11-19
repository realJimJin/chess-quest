# Chess Quest for iOS: build and submission notes

The iOS app is the web app wrapped with Capacitor. Project: `ios/App/App.xcodeproj`.

## Rebuild after any code change

    npm run build:ios      # static build + sync into the Xcode project
    npm run ios:open       # open Xcode

## Tested in the iOS Simulator (iPhone 17 Pro, iOS 26.1)

Launch, importing `exercises.json` through the Files picker, the library surviving a relaunch, the World map
with its bottom bar, starting a level, touch moves with the automatic reply, and the Stockfish verdict on an
off-book move. Not tested: Deep Calculation on the phone, a real device, archiving, TestFlight.

## Before you archive (in Xcode, with your Apple account)

1. Target App > Signing & Capabilities: choose your team and set your own bundle identifier.
   The placeholder is `com.guixuanjin.chesstrainer`; the display name is "Chess Quest".
2. Set version and build number (General tab).
3. Product > Archive, then Distribute App > App Store Connect.
4. In App Store Connect: create the app record, screenshots (6.9" and 6.5" iPhone), description,
   privacy answers (the app collects no data and has no accounts or network calls), age rating, review notes.

## What is ready

- Signed App Store build: `ios/build/export/App.ipa` (Apple Distribution: Guixuan Jin, team U89KC7ZM79,
  bundle ID `com.guixuanjin.chesstrainer`). Rebuild it with:

      npm run build:ios
      cd ios/App
      xcodebuild -project App.xcodeproj -scheme App -configuration Release -destination "generic/platform=iOS" \
        -archivePath ../build/App.xcarchive CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO archive
      xcodebuild -exportArchive -archivePath ../build/App.xcarchive -exportPath ../build/export \
        -exportOptionsPlist ../exportOptions.plist -allowProvisioningUpdates

  The archive is unsigned on purpose: the team has no registered devices, so a development profile cannot be
  made. The export step signs it for the App Store, which needs no device.
- Screenshots: `appstore/screenshots/*.png`, five at 1320x2868 (the 6.9-inch size). They were captured on an
  iPhone 17 Pro simulator (1206x2622) and scaled up about 9%; the proportions match. Retake on a Pro Max
  simulator for native sharpness.
- Listing text and review notes: `appstore/LISTING.md`.
- Privacy and support pages: `/privacy` and `/support` on the website.
- Export compliance is declared in Info.plist (`ITSAppUsesNonExemptEncryption = false`).

## What the public iOS build contains

- Eight original sample puzzles ("Sample Pack"), loaded from the first screen. Not from any book.
- No book content, no personal reading list, blank profile defaults. The website keeps the owner's personal
  defaults; the iOS build does not (`src/lib/target.ts`).

## Things App Review is likely to raise

- **Thin content.** The app ships with eight sample puzzles; everything else depends on the user importing a
  file made with a desktop tool. A reviewer may find that too little. More original puzzles would help.
- **Licences.** chessground (board) and Stockfish (engine) are GPLv3. App Store distribution of GPL code is
  legally contested and at minimum requires publishing this app's source under the GPL. Decide this before
  submitting, or replace those two components.
- **Name.** Avoid a name built on a book's title.
- **Minimum functionality.** A wrapped web app passes more easily with native touches; the file import through
  Files and offline operation help here.
- **Icon.** `AppIcon-512@2x.png` is an original placeholder (stone tower with a pennant). Replace it if you want.
