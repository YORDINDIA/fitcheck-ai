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
