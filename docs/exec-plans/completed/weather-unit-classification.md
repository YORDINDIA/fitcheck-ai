# Plan: Unit-aware weather classification

Status: completed
Started: 2026-11-23

## Goal

Classify metric current-weather responses using the same physical temperature
thresholds as imperial responses, preserving temperatures in the requested units.

## Scope

Pass request units through both current-weather lookup paths. Convert Celsius
to Fahrenheit only for temperature classification and the weather-state fallback.
Do not change forecast aggregation, API defaults, or recommendation thresholds.

## Acceptance criteria

- [x] Regression tests fail for metric city and coordinate lookups before the fix.
- [x] Equivalent metric and imperial weather produces the same category and layers.
- [x] Existing weather service and route tests pass.

## Verification

Run the focused regression before editing production code, then the weather
service and route suites, Ruff, architecture, and documentation checks.

## Results

Before the fix: 2 metric failures, 2 imperial passes. After the fix: all 109
weather service and route tests pass. Backend Ruff, architecture, and docs
structure checks pass. Returned temperature and feels-like values stay in the
requested units; only classification inputs are converted.

## Android CI compatibility

The APK check exposed an existing dependency-resolution failure:
posthog_flutter 5.11.1 declares `[3.25.0,4.0.0]`, including Android SDK 4.0.0.
That version brings PostHog core 7.0.0, which removes the feature-flag callback
and replay types used by the Flutter plugin. Pin Android SDK 3.77.1 across all
Android subprojects so both plugin compilation and the app runtime use the
compatible core 6.49.1. The Dart package and iOS dependency are unchanged.

The original failed build is GitHub Actions run 45145684632. Re-run the failed
job once, then verify the pin with the release APK build on the updated PR head.
