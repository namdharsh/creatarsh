# Creatarsh Business Flutter App

A light, emerald-and-white business workspace for the existing Creatarsh API. This app reuses the customer account authentication token and the shared MongoDB-backed API; it does not embed database credentials or use manager/admin endpoints.

## Included

- Secure token storage using Android/iOS secure storage.
- Sign in through `POST /api/customer/login`; checks the session with `GET /api/customer/me` on startup.
- Active business membership discovery through `GET /api/v1/businesses/mine`; users cannot choose arbitrary business IDs from the UI.
- Business dashboard and website status; profile editing through the existing business-scoped API.
- Aggregated analytics, enquiries and status updates.
- Store products shown only when `storeEnabled` is true; orders surface the current API's pending-integration status rather than displaying unrelated agency orders.
- Loading, empty, retry-by-pull-to-refresh and error states. HTTP 401 clears the saved token and requires sign-in again.
- Unit tests for membership payload parsing.

## Backend compatibility and limits

The API already enforces active `BusinessMember` authorization on profile, dashboard, analytics, enquiries and store routes. The app uses those routes and never treats a business ID as authorization. Editors are subject to server-side field restrictions.

The current API does **not** expose business-scoped plans/invoices endpoints. Existing `/api/customer/invoices` is scoped to the signed-in Creatarsh customer account, not a specific business membership, so this app intentionally does not present those invoices as business invoices. Store orders are also explicitly pending in the current API. Add dedicated business-scoped backend routes and models before exposing these screens as functional features.

## Requirements and run

Install Flutter stable (Dart 3.3+) and Android SDK. From this folder:

```bash
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=https://YOUR-CREATARSH-API-HOST
```

For local Android emulator API running on the development machine:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

Use HTTPS for production. Never add JWT secrets, MongoDB credentials, payment secrets, or manager credentials to Dart defines or app source.

## Android release

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://YOUR-CREATARSH-API-HOST
```

Output: `build/app/outputs/flutter-apk/app-release.apk`.

## Session and authorization behavior

- Tokens are stored in platform secure storage, not SharedPreferences or source files.
- On authenticated HTTP 401, the token is deleted and the UI returns to sign-in.
- Business membership list is loaded from the server after authentication.
- All private reads/writes use existing authenticated `/api/v1/businesses/:businessId/...` endpoints. Server membership checks remain the security boundary.
- Sign-out deletes the stored access token.

## Acceptance checklist

1. Sign in with an existing Creatarsh customer account that has an active business membership.
2. Verify only that account's active memberships appear.
3. View website status, edit profile, and confirm changes persist after reload.
4. Check analytics and enquiries; update an enquiry status.
5. Verify a business with `storeEnabled=false` cannot see store products.
6. Verify an expired/invalid token forces sign-in again.
7. Attempt cross-business API access with an account that is not a member; the API should return 403.
8. Run `flutter analyze`, `flutter test`, then build and test on a physical device.

Flutter SDK and live API credentials were not available in the implementation container, so analyzer, device tests, live API integration, and APK build must still be run on a Flutter-enabled machine.
