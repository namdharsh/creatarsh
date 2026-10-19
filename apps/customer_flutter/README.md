# Creatarsh Customer Flutter App

Flutter Android app for the existing Creatarsh shared public API. It consumes the same API used by the web directory and does not bundle database credentials, API secrets, or private admin endpoints.

## Features

- Search published businesses by query, category, city or six-digit PIN code.
- Loads category choices from `GET /api/public/business-categories`.
- Uses `GET /api/public/businesses` for paginated directory results and `GET /api/public/businesses/:slug` for profile details.
- Location permission is requested only after the user taps **Use my location**. If permission is denied, location services are disabled, or lookup fails, the user can choose a city/PIN manually.
- Business profiles show only fields returned by the shared public API. Call, WhatsApp, email, website and Google Maps directions open through external apps.
- Favorites are stored locally on the device with SharedPreferences; they are not synced across devices because the current shared API does not expose a customer favorites endpoint.
- Explicit loading, error, retry, and empty states.

## Requirements

- Flutter stable SDK (Dart 3.3+), Android SDK and an Android emulator or device.
- Creatarsh API running and reachable from the target device.

## Configure API URL (no secrets)

The API base URL is passed as a compile-time define. It is not a secret and must not contain credentials.

Emulator using API on the same development computer:

```bash
flutter pub get
flutter test
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

Physical Android device: use the computer's LAN IP and make sure the phone and computer share a network, e.g. `--dart-define=API_BASE_URL=http://192.168.1.20:3000`.

For a deployed API use HTTPS:

```bash
flutter run --dart-define=API_BASE_URL=https://your-api-host.example
```

Replace the example hostname with your real API origin. Do not put JWT secrets, MongoDB credentials, storage keys, or admin credentials in Dart defines or the app.

## Android build

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://YOUR-API-HOST
```

APK output: `build/app/outputs/flutter-apk/app-release.apk`.

Install on a connected device:

```bash
flutter install --release
```

## Android permissions and transport

The manifest declares INTERNET, ACCESS_COARSE_LOCATION and ACCESS_FINE_LOCATION. Location is optional and requested at runtime. Manual location selection remains available when permission is not granted.

The supplied Android manifest enables cleartext HTTP for local development with the Android emulator. **Before a release build for distribution, change `android:usesCleartextTraffic` to `false` and use an HTTPS API origin.** Do not ship a release that depends on plain HTTP.

## API compatibility

This app only calls the approved public endpoints:

- `GET /api/public/business-categories`
- `GET /api/public/businesses?page=&limit=&q=&category=&city=&pin=&lat=&lng=`
- `GET /api/public/businesses/:slug`

Only published business listings are returned by the server. No customer/admin token is stored in the app. The current shared API has no remote favorites endpoint, so favorites are device-local. Search uses the server's directory filter implementation and can be expanded later without changing the data model.

## Tests and limitations

`test/business_test.dart` covers API payload parsing, optional/malformed fields, and missing API configuration. Run `flutter test` on a machine with Flutter installed. This workspace did not have the Flutter SDK installed, so Flutter analyzer, emulator, and APK build could not be executed here. Live API and device permission behavior also require local runtime testing.
