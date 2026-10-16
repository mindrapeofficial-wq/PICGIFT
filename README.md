# PICGIFT

Seasonal storybook portraits for adults creating family memories. Spanish and English follow the device language, with a saved manual override. Halloween is a seasonal collection.

## Web and private service

Serve this static repository over HTTP for the browser version. Android 1.8.9 includes the public interface, scenes, fonts and client library in its installation. A `WebViewAssetLoader` serves these installed files under the existing trusted HTTPS origin; opening the app does not load its interface from Render or a CDN. A missing local file returns a local 404, never a silent website fallback. Authentication, generation and Play purchases still need internet. The interface remains hybrid (HTML/CSS in Android WebView), with native Google entry, photo picker, notifications, billing and photo saving.

Gradle copies only public assets into the app and emits `bundle-manifest.json`. `node scripts/verify-android-bundle.cjs` verifies the generated interface and local references after a build. Native installs do not register the website's service worker. Web publishing and Play releases are independent: changing the website does not update an installed Android interface.

The studio offers local drag/keyboard framing, zoom and optional face/body references. Explicit permission is required before upload. Server-facing pose and outfit values remain canonical when display labels change language. Public assets are cached; private photos, authentication responses and signed links are excluded.

`i18n.js` contains reviewed English copy and preserves the Spanish source during switching. `locales/en.json` is the readable dictionary. Update both for new customer text. Customer addresses and filenames are never translated.

The source/background/result journey uses a fictional subject. It is illustrative, not a delivered customer order or evidence of different premium quality levels. Packs offer 1, 5 or 10 photos at the same configured rendering quality.

Supabase authentication, storage, generation, orders and credit ledger are private services. Server functions are deployed separately; service credentials and private provider configuration stay outside this public repository and Android assets. Never publish credentials, API keys or signing passwords. References must belong to the same authenticated owner and request. Request language is used for delivery email. Quality checks accept only an explicit PASS. Failed or review-required paid jobs use the credit-refund procedure.

Reports are private and restricted to the owner's portraits. Account deletion currently uses support requests; support must fulfil them, including originals, references, results and storage objects. Opening an email draft does not delete an account.

Sales remain gated by private configuration. Android purchases are verified and consumed on the server. Credit grants are idempotent, consumption is retryable, and pending purchases are recovered for the matching account. Google Play prices come from product details.

Verified accounts receive up to five Gratis portraits and one Premium portrait without a credit each UTC day. The server reserves each daily slot only after the source photo passes preflight; failed or rejected jobs release the slot. Extra Premium portraits use purchased credits and their existing paid limit. When a portrait reaches `completed` with a private result path, a database trigger queues one owner-only FCM notification with a link to Mis fotos. Delivery requires the user's notification opt-in and an active device registration; the private dispatcher checks the outbox each minute.

The closed-beta admin panel shows accounts with an app entry today in Europe/Madrid and accounts without a recorded entry. `picgift-presence` records an authenticated entry on app open or return to the foreground; a new installation is needed for this signal in the bundled Android app. Recent sign-ins also count. The AI director reviews aggregate inactivity every six hours, only during daytime in Madrid, and may queue a personal reminder for verified, absent users who enabled Android notifications and have previously reported an entry from the updated app. A daily per-user ID prevents duplicate reminders. Administrators can request an AI review or send to the absent cohort immediately; all decisions are logged. The former blanket daily reminder is disabled.

## Validation

Run `node --test tests/experience.test.cjs` and `node --check` on the application scripts. Tests cover language detection/override, canonical option values, full-source framing, export boundaries and public asset integrity. Browser checks must cover mobile layouts, sign-in and references. Commercial release additionally needs real completed portrait jobs and Google Play licence-tester transactions: pending, cancellation, retries and recovery after restart.

## Android

Package `com.picgift.myapp` matches Play Console. Compile/target SDK 36, minimum 26, version 1.8.9-beta/code 18. Gradle 8.11.1, JDK 17, AGP 8.10.1 and Billing 9.1.0. Google Play checks for a newer release on every foreground entry. When one is available, the immediate update covers the app and the bundled interface remains blocked until it is installed. If Play cannot verify the version, the app offers retry and a link to its store listing. This check applies to release builds; local debug builds remain usable without Play.

Build: `gradle -p android --no-daemon :app:lintRelease :app:assembleDebug :app:bundleRelease`.

Without signing variables, the release AAB is unsigned. Supply `PICGIFT_UPLOAD_STORE`, `PICGIFT_UPLOAD_STORE_PASSWORD`, `PICGIFT_UPLOAD_KEY_ALIAS` and `PICGIFT_UPLOAD_KEY_PASSWORD` through the private build environment. Keep the keystore and recovery details outside Git. CI publishes a debug APK, unsigned AAB and lint report for validation.

## Commercial release gates

A successful build does not validate a commercial launch. Before production:

- Deploy matching web assets and private scene configuration.
- Complete actual portrait, purchase, pending/recovery and refund tests.
- Configure actual Play products, package and restricted server service account.
- Finalise purchase/refund terms, privacy disclosures, provider agreements, retention and deletion operations.
- Prepare Spanish/English listing, real app screenshots, privacy/deletion URLs and accurate Data safety/content declarations.
- Complete the closed test required by this developer account and obtain production access.

Provider API autorecharge is configured separately in its billing account, with an approved threshold and spending limit. Store receipts do not make incoming funds instantly available for API purchases. No automated recharge or routing of money is enabled here.
