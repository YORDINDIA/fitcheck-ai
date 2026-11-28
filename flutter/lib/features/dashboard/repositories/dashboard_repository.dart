import '../../../core/network/api_client.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/exceptions/app_exceptions.dart';
import '../models/dashboard_models.dart';

class DashboardRepository {
  final ApiClient _apiClient = ApiClient.instance;

  Future<DashboardData> fetchDashboard() async {
    return runDioRequest(() async {
      final response = await _apiClient.get('${ApiConstants.users}/dashboard');
      final data = _extractDataMap(response.data);
      return DashboardData.fromJson(data);
    });
  }

  Future<StreakData> fetchStreak() async {
    return runDioRequest(() async {
      final response = await _apiClient.get('${ApiConstants.gamification}/streak');
      final data = _extractDataMap(response.data);
      return StreakData.fromJson(data);
    });
  }

  Map<String, dynamic> _extractDataMap(dynamic payload) {
    if (payload is Map<String, dynamic>) {
      final data = payload['data'];
      if (data is Map<String, dynamic>) {
        return data;
      }
    }
    return const <String, dynamic>{};
  }

}
