# PICGIFT

Seasonal storybook portraits for adults creating family memories. Spanish and English follow the device language, with a saved manual override. Halloween is a seasonal collection.

## Web and private service

Serve this static repository over HTTP. Android loads https://picgift.onrender.com/; an AAB build does not deploy the web files.

The studio offers local drag/keyboard framing, zoom and optional face/body references. Explicit permission is required before upload. Server-facing pose and outfit values remain canonical when display labels change language. Public assets are cached; private photos, authentication responses and signed links are excluded.

`i18n.js` contains reviewed English copy and preserves the Spanish source during switching. `locales/en.json` is the readable dictionary. Update both for new customer text. Customer addresses and filenames are never translated.

The source/background/result journey uses a fictional subject. It is illustrative, not a delivered customer order or evidence of different premium quality levels. Packs offer 1, 5 or 10 photos at the same configured rendering quality.

Supabase authentication, storage, generation, orders and credit ledger are private services. Processing code and scene recipes are managed outside this public repository. Never publish credentials, API keys, signing passwords or recipe JSON. References must belong to the same authenticated owner and request. Request language is used for delivery email. Quality checks accept only an explicit PASS. Failed or review-required paid jobs use the credit-refund procedure.

Reports are private and restricted to the owner's portraits. Account deletion currently uses support requests; support must fulfil them, including originals, references, results and storage objects. Opening an email draft does not delete an account.

Sales remain gated by private configuration. Android purchases are verified and consumed on the server. Credit grants are idempotent, consumption is retryable, and pending purchases are recovered for the matching account. Google Play prices come from product details.

## Validation

Run `node --test tests/experience.test.cjs` and `node --check` on the application scripts. Tests cover language detection/override, canonical option values, full-source framing, export boundaries and public asset integrity. Browser checks must cover mobile layouts, sign-in and references. Commercial release additionally needs real completed portrait jobs and Google Play licence-tester transactions: pending, cancellation, retries and recovery after restart.

## Android

Package `com.picgift.myapp` matches the existing Play Console draft. Compile/target SDK 36, minimum 26, version 1.2.0/code 3. Gradle 8.11.1, JDK 17, AGP 8.10.1 and Billing 9.1.0.

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
