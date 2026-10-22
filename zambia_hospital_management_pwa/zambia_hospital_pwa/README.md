# Zambia Hospital Management System — Installable PWA

A responsive starter app for a Zambian hospital/clinic workflow. It includes patient, doctor, nurse, and admin roles; appointment booking; a responsive dashboard; installable PWA assets; weather, date/time, and OpenStreetMap-powered map views; and a clearly labelled demo payment flow.

## Requirements
- Node.js 20+
- npm

## Run locally
1. Extract the ZIP and open the project folder in a terminal.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and change `SESSION_SECRET`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

The app creates its local SQLite database in `data/hospital.db` and seeds demonstration accounts on first run:
- Admin: `admin@demo.zm` / `Admin123!`
- Doctor: `doctor@demo.zm` / `Doctor123!`
- Nurse: `nurse@demo.zm` / `Nurse123!`
- Patient: `patient@demo.zm` / `Patient123!`

**Change or remove demo credentials before deploying.** This starter is not certified for real patient data or production clinical use.

## Install on Android
1. Deploy to a domain served over HTTPS (or test on localhost).
2. Open the site in Chrome on Android.
3. Open the browser menu and choose **Install app** or **Add to Home screen** when available.

PWA installation requires HTTPS in production. The app is responsive and uses a service worker for the app shell; clinical data/API actions still require a network connection.

## Included open services / integration notes
- Date and time: browser `Intl` APIs, timezone `Africa/Lusaka` (no API key needed).
- Weather: Open-Meteo public forecast API (no key for ordinary non-commercial use; check current terms before commercial deployment).
- Map: Leaflet + OpenStreetMap tiles. Follow tile usage policy; use a suitable tile provider for production traffic.
- Payments: demo adapter only. Zambian mobile money/bank payment processing is not an open public API that can be safely assumed available without a merchant account. Connect an approved provider such as MTN MoMo, Airtel Money, or a licensed payment gateway using their official API, credentials, callback verification, and reconciliation. Do not collect or store mobile-money PINs.

## Security / production checklist
- Replace local SQLite with managed PostgreSQL (e.g. Supabase/Neon) and run migrations/backups.
- Set a long random `SESSION_SECRET`, HTTPS, secure cookies, CSRF protection, audit retention, rate limits, monitoring, and access reviews.
- Add consent, privacy notice, retention policy, encrypted backups, and a reviewed encryption/key-management design for medical information.
- Add appointment conflict/availability rules and comprehensive tests.
- Integrate a real payment provider server-side; verify signatures/callbacks and never trust client-side payment status.
- Have the system security and clinical workflows reviewed before use with real patient information.

## Main routes
- `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET /api/summary`
- `GET /api/patients`, `POST /api/patients`
- `GET /api/appointments`, `POST /api/appointments`, `PATCH /api/appointments/:id/status`
- `POST /api/payments/checkout` (demo only)
- `GET /api/health`
