# Creatarsh Admin Flutter App — Phase 9

Light, emerald-accented administrative app for the existing Creatarsh shared API. It does not include a new backend, credentials, API secrets, or authorization bypasses.

## Features
- Manager login via `POST /api/manager/login`; only `admin` and `superadmin` roles are accepted by the client, then checked again using `GET /api/manager/me`.
- Admin overview metrics and API/database health.
- Business search and server-side moderation/verification actions.
- Website deployment status, publish and rollback actions using existing admin-only endpoints.
- Business correction/removal request review.
- Recent audit trail and operational alert summary.
- Token saved with `flutter_secure_storage`; a 401 clears the session and returns the user to sign-in. A 403 is shown as an authorization error.

## API requirements
The app uses the existing API routes in `server/server.js`, including `/api/manager/login`, `/api/manager/me`, `/api/v1/admin/overview`, `/api/v1/admin/businesses`, `/api/v1/admin/deployments`, `/api/v1/admin/business-requests`, and `/api/v1/admin/audit`. Mutations rely on server-side `requireAdmin`; client-side role checks are only an additional UX guard. Ensure your manager account is already assigned `admin` or `superadmin` by an authorized process.

## Run locally
Install Flutter 3.19+ (Dart 3.3+) and Android Studio/Android SDK, then from this folder:

```bash
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_BASE_URL=https://YOUR-CREATARSH-API-HOST
```

Use the API origin only, without a trailing path such as `/api`. For local Android emulator backend testing, use `http://10.0.2.2:PORT` instead of `localhost`; use your computer's LAN IP for a physical device. Production should use HTTPS.

## Build Android APK

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://YOUR-CREATARSH-API-HOST
```

Output: `build/app/outputs/flutter-apk/app-release.apk`.

## Security / limitations
- Never embed API keys, database credentials, JWT signing secrets, or admin passwords in the app.
- The API must enforce administrator roles for every read and write. The app does not grant roles or create admin accounts.
- Session expiry is handled on 401; forbidden actions are shown on 403.
- The current API exposes business requests but does not provide a dedicated aggregate report export endpoint. Reports currently consist of overview metrics and recent audit events.
- This environment does not have Flutter/Dart installed, so Flutter analysis, widget tests, and APK compilation must be run on a Flutter-equipped machine before considering Phase 9 accepted.
