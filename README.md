# BiteMe Sarajevo

BiteMe Sarajevo is a mobile-first Expo app that helps you choose between coffee or food in Sarajevo. It suggests nearby places based on your budget, distance, and preferences, then opens the result in Google Maps.

## Features

- Coffee or food mode
- Quick style choices and budget filters
- Walk, tram, and drive travel options
- Live location support
- Smart search with typo help and suggestions
- Open now filter
- Ranked results with reasons
- Google Maps shortcut for each place

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npm run start
```

3. Open it with Expo Go on your phone, or run it on an emulator.

## Free Mode

You do not need a backend to use the app.

- The app can use live OpenStreetMap data directly.
- If that is unavailable, it falls back to the built-in Sarajevo sample places.
- This is the simplest and free way to use the app and build an APK.

## APK Build

To make an Android APK for your phone:

1. Install EAS CLI:

```bash
npm install -g eas-cli
```

2. Login and configure:

```bash
eas login
eas build:configure
```

3. Build the Android preview APK:

```bash
eas build -p android --profile preview
```

4. Download the APK and install it on your phone.

