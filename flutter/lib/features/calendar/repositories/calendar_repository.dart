import '../../../core/network/api_client.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/exceptions/app_exceptions.dart';
import '../models/calendar_event_model.dart';
import '../models/calendar_connection_model.dart';

/// Calendar repository - handles all calendar API calls
class CalendarRepository {
  final ApiClient _apiClient = ApiClient.instance;

  /// Unwrap `{ "data": { ... }, "message": "OK" }` API envelopes.
  Map<String, dynamic> _extractDataMap(dynamic payload) {
    if (payload is! Map) return <String, dynamic>{};
    final root = Map<String, dynamic>.from(payload);
    final data = root['data'];
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    // Some callers pass the data map itself (no envelope)
    if (!root.containsKey('message')) {
      return root;
    }
    return <String, dynamic>{};
  }

  List<dynamic> _extractList(dynamic payload, String key) {
    final data = _extractDataMap(payload);
    final list = data[key];
    if (list is List) return list;
    // Fallback: top-level key (legacy)
    if (payload is Map && payload[key] is List) {
      return payload[key] as List;
    }
    return const [];
  }

  CalendarConnectionModel _parseConnection(Map<String, dynamic> raw) {
    // API returns { id, provider, email?, connected_at }; model expects richer shape.
    final providerRaw = (raw['provider'] ?? 'local').toString().toLowerCase();
    final provider = switch (providerRaw) {
      'google' => CalendarProvider.google,
      'outlook' => CalendarProvider.outlook,
      'apple' => CalendarProvider.apple,
      'local' => CalendarProvider.local,
      // Unknown providers default to local (in-app planning, not external OAuth)
      _ => CalendarProvider.local,
    };
    final isActive = raw['is_active'] as bool? ?? true;
    final isConnected = raw['is_connected'] as bool? ?? isActive;

    return CalendarConnectionModel(
      id: raw['id'] as String,
      provider: provider,
      email: (raw['email'] as String?) ?? '',
      displayName: raw['display_name'] as String?,
      isConnected: isConnected,
      isSyncEnabled: raw['is_sync_enabled'] as bool? ?? true,
      lastSyncAt: raw['last_sync_at'] != null
          ? DateTime.tryParse(raw['last_sync_at'].toString())
          : null,
      createdAt: raw['created_at'] != null
          ? DateTime.tryParse(raw['created_at'].toString())
          : (raw['connected_at'] != null
                ? DateTime.tryParse(raw['connected_at'].toString())
                : null),
    );
  }

  /// Get all calendar connections
  Future<List<CalendarConnectionModel>> getConnections() async {
    return runDioRequest(() async {
      final response = await _apiClient.get(
        '${ApiConstants.calendar}/connections',
      );

      final list = _extractList(response.data, 'connections');
      return list
          .whereType<Map>()
          .map((e) => _parseConnection(Map<String, dynamic>.from(e)))
          .toList();
    });
  }

  /// Connect calendar provider (OAuth / local)
  Future<CalendarConnectionModel> connectCalendar({
    required CalendarProvider provider,
    required String authCode,
  }) async {
    return runDioRequest(() async {
      final response = await _apiClient.post(
        '${ApiConstants.calendar}/connect',
        data: {'provider': provider.name, 'auth_code': authCode},
      );
      // API: { data: { id, provider, email, connected_at }, message }
      final data = _extractDataMap(response.data);
      return _parseConnection(data);
    });
  }

  /// Disconnect calendar
  Future<void> disconnectCalendar(String connectionId) async {
    await runDioRequest(() async {
      await _apiClient.delete(
        '${ApiConstants.calendar}/connections/$connectionId',
      );
    });
  }

  /// Get events for date range
  Future<List<CalendarEventModel>> getEvents({
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    return runDioRequest(() async {
      final queryParams = <String, dynamic>{};
      if (startDate != null) {
        // A10b-01: send the UTC instant. A naive local string was parsed by
        // the backend as UTC, which shifted every event by the device offset
        // and dropped month-boundary events from the grid.
        queryParams['start_date'] = startDate.toUtc().toIso8601String();
      }
      if (endDate != null) {
        queryParams['end_date'] = endDate.toUtc().toIso8601String();
      }

      final response = await _apiClient.get(
        '${ApiConstants.calendar}/events',
        queryParameters: queryParams,
      );

      final list = _extractList(response.data, 'events');
      return list
          .whereType<Map>()
          .map((e) => CalendarEventModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    });
  }

  /// Create event with optional outfit
  Future<CalendarEventModel> createEvent({
    required String title,
    required DateTime startTime,
    required DateTime endTime,
    String? description,
    String? location,
    bool isAllDay = false,
    String? outfitId,
  }) async {
    return runDioRequest(() async {
      final response = await _apiClient.post(
        '${ApiConstants.calendar}/events',
        data: {
          'title': title,
          // A10b-01: UTC on the wire — see getEvents.
          'start_time': startTime.toUtc().toIso8601String(),
          'end_time': endTime.toUtc().toIso8601String(),
          if (description != null) 'description': description,
          if (location != null) 'location': location,
          'is_all_day': isAllDay,
          if (outfitId != null) 'outfit_id': outfitId,
        },
      );
      // API: { data: <event row>, message: "Created" }
      final data = _extractDataMap(response.data);
      // Some versions nest under event
      final eventMap = data['event'] is Map
          ? Map<String, dynamic>.from(data['event'] as Map)
          : data;
      return CalendarEventModel.fromJson(eventMap);
    });
  }

  /// Update event
  Map<String, dynamic> buildUpdateEventPayload({
    String? title,
    DateTime? startTime,
    DateTime? endTime,
    String? description,
    String? location,
    bool? isAllDay,
    String? outfitId,
  }) {
    final data = <String, dynamic>{};
    if (title != null) data['title'] = title;
    // A10b-01: UTC on the wire — see getEvents.
    if (startTime != null) data['start_time'] = startTime.toUtc().toIso8601String();
    if (endTime != null) data['end_time'] = endTime.toUtc().toIso8601String();
    if (description != null) data['description'] = description;
    if (location != null) data['location'] = location;
    if (isAllDay != null) data['is_all_day'] = isAllDay;
    if (outfitId != null) data['outfit_id'] = outfitId;
    return data;
  }

  Future<CalendarEventModel> updateEvent(
    String eventId, {
    String? title,
    DateTime? startTime,
    DateTime? endTime,
    String? description,
    String? location,
    bool? isAllDay,
    String? outfitId,
  }) async {
    final data = buildUpdateEventPayload(
      title: title,
      startTime: startTime,
      endTime: endTime,
      description: description,
      location: location,
      isAllDay: isAllDay,
      outfitId: outfitId,
    );

    return runDioRequest(() async {
      final response = await _apiClient.put(
        '${ApiConstants.calendar}/events/$eventId',
        data: data,
      );
      final payload = _extractDataMap(response.data);
      final eventMap = payload['event'] is Map
          ? Map<String, dynamic>.from(payload['event'] as Map)
          : payload;
      return CalendarEventModel.fromJson(eventMap);
    });
  }

  /// Delete event
  Future<void> deleteEvent(String eventId) async {
    await runDioRequest(() async {
      await _apiClient.delete('${ApiConstants.calendar}/events/$eventId');
    });
  }

  /// Link outfit to event.
  /// API returns partial `{ id, outfit_id, updated_at }` — returns outfitId only.
  Future<String> linkOutfit(String eventId, String outfitId) async {
    return runDioRequest(() async {
      final response = await _apiClient.post(
        '${ApiConstants.calendar}/events/$eventId/outfit',
        data: {'outfit_id': outfitId},
      );
      final data = _extractDataMap(response.data);
      return (data['outfit_id'] as String?) ?? outfitId;
    });
  }

  /// Remove outfit from event. Returns success; outfit cleared.
  Future<void> removeOutfit(String eventId) async {
    await runDioRequest(() async {
      await _apiClient.delete(
        '${ApiConstants.calendar}/events/$eventId/outfit',
      );
    });
  }
}
