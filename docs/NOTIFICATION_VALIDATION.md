# Notification delivery validation — 2026-10-10

The owner confirmed receipt of the admin test notification after Firebase credentials were repaired. FCM recorded one accepted send to one enabled device. Receipt on other devices is not inferred from this result.

The deployed director version 6 had changes absent from main: a free creative reviewer, catalogue context, provider checks and a dependency between scene approval and communication approval. Those existing changes were imported before editing the sender so deployment preserves them.

## Delivery status

- Zero accepted messages for a nonempty audience: `failed`, recipient count retained, no acceptance timestamp and a sanitized error code.
- Partial acceptance: `sent`, actual accepted/recipient counts and error retained. The whole partial campaign is not automatically retried, avoiding duplicate notifications to accepted devices.
- Empty audience: `sent` means the campaign was processed, but `no_eligible_devices`, zero counts and a null acceptance timestamp explicitly show that nothing was sent.
- A generic HTTP 404 never retires a device. Only FCM `UNREGISTERED` disables it; the update also matches its token to avoid disabling a concurrently refreshed registration.
- Invalid service-account JSON produces a generic error without exposing credential fragments.
- Six behavioral regression tests exercise the actual dispatcher and configuration parser with mocked provider responses. They never send to production devices.
- The existing 500-device safety ceiling remains. A larger beta requires a durable paginated campaign mechanism before this ceiling is reached.

## Android branding

Version 1.8.3-beta, code 12, replaces the generic bell with a monochrome gift/camera mark, plus a cropped color PicGift icon in the notification card. The monochrome icon follows Android's small-icon rendering; the color launcher bitmap cannot be used directly as an opaque small icon. Installation of the new binary is required. Android launcher and notification rendering still need inspection on the owner's device.

References: [FCM error codes](https://firebase.google.com/docs/cloud-messaging/error-codes), [Android notification content](https://developer.android.com/develop/ui/compose/notifications/create-notification).
