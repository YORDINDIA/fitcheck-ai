import '../../../core/network/api_client.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/exceptions/app_exceptions.dart';
import '../models/user_preferences_model.dart';

/// Settings repository - handles all settings and preferences API calls
class SettingsRepository {
  final ApiClient _apiClient = ApiClient.instance;

  /// Get user preferences
  Future<UserPreferencesModel> getPreferences() async {
    return runDioRequest(() async {
      final response = await _apiClient.get('${ApiConstants.users}/preferences');
      final data = _extractPreferenceData(response.data);
      return UserPreferencesModel.fromJson(data);
    });
  }

  /// Update user preferences
  Future<UserPreferencesModel> updatePreferences(UserPreferencesModel preferences) async {
    return _putPreferences(preferences.toJson());
  }

  /// Save only the style choices from the first-run setup. The full
  /// [updatePreferences] body would also send the app-only fields, so setup
  /// sends its two keys through the same PUT helper instead.
  Future<void> updateStyleChoices({
    required List<String> styles,
    required List<String> occasions,
  }) async {
    await _putPreferences(
      {'preferred_styles': styles, 'preferred_occasions': occasions},
    );
  }

  /// One PUT for the preferences endpoint: single URL, envelope and mapping.
  Future<UserPreferencesModel> _putPreferences(Map<String, dynamic> data) async {
    return runDioRequest(() async {
      final response = await _apiClient.put(
        '${ApiConstants.users}/preferences',
        data: data,
      );
      return UserPreferencesModel.fromJson(
        _extractPreferenceData(response.data),
      );
    });
  }

  /// Get user settings
  Future<Map<String, dynamic>> getSettings() async {
    return runDioRequest(() async {
      final response = await _apiClient.get('${ApiConstants.users}/settings');
      final data = _extractSettingsData(response.data);
      return data;
    });
  }

  /// Update user settings
  Future<Map<String, dynamic>> updateSettings(Map<String, dynamic> settings) async {
    return runDioRequest(() async {
      final response = await _apiClient.put(
        '${ApiConstants.users}/settings',
        data: settings,
      );
      final data = _extractSettingsData(response.data);
      return data;
    });
  }

  Map<String, dynamic> _extractPreferenceData(dynamic payload) {
    if (payload is Map) {
      final data = payload['data'];
      if (data is Map<String, dynamic>) {
        return data;
      }
      final preferences = payload['preferences'];
      if (preferences is Map<String, dynamic>) {
        return preferences;
      }
      if (payload is Map<String, dynamic>) {
        return payload;
      }
    }
    return <String, dynamic>{};
  }

  Map<String, dynamic> _extractSettingsData(dynamic payload) {
    if (payload is Map) {
      final data = payload['data'];
      if (data is Map<String, dynamic>) {
        return data;
      }
      final settings = payload['settings'];
      if (settings is Map<String, dynamic>) {
        return settings;
      }
      if (payload is Map<String, dynamic>) {
        return payload;
      }
    }
    return <String, dynamic>{};
  }

  /// Delete account
  Future<void> deleteAccount() async {
    await runDioRequest(() async {
      await _apiClient.delete('${ApiConstants.users}/me');
    });
  }

  /// Request data export
  Future<String> requestDataExport() async {
    return runDioRequest(() async {
      final response = await _apiClient.post('${ApiConstants.users}/export');
      // The endpoint returns exactly {"data": {"export_url": ...}} — the standard
      // envelope (backend/app/api/v1/users.py). A bare top-level `export_url` is
      // not a shape this API produces, so there is nothing to fall back to.
      final payload = response.data;
      final data = payload is Map<String, dynamic> ? payload['data'] : null;
      final exportUrl = data is Map<String, dynamic> ? data['export_url'] : null;
      if (exportUrl is! String || exportUrl.isEmpty) {
        throw StateError('Export URL missing from response');
      }
      return exportUrl;
    });
  }

}
