import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/business.dart';

class ApiException implements Exception { ApiException(this.message, {this.statusCode}); final String message; final int? statusCode; @override String toString() => message; }
class DirectoryPage { const DirectoryPage({required this.businesses, required this.total, required this.page, required this.pages}); final List<Business> businesses; final int total, page, pages; }
class ApiClient {
  ApiClient({required String baseUrl, http.Client? client}) : baseUrl = baseUrl.replaceFirst(RegExp(r'/+$'), ''), _client = client ?? http.Client();
  final String baseUrl; final http.Client _client;
  Uri _uri(String path, [Map<String, String>? query]) => Uri.parse('$baseUrl$path').replace(queryParameters: query?.isEmpty == true ? null : query);
  Future<Map<String, dynamic>> _get(String path, [Map<String, String>? query]) async {
    if (baseUrl.isEmpty) throw ApiException('API URL is not configured. Run with --dart-define=API_BASE_URL=...');
    try {
      final response = await _client.get(_uri(path, query), headers: const {'Accept': 'application/json'}).timeout(const Duration(seconds: 15));
      dynamic body; try { body = jsonDecode(response.body); } catch (_) { body = <String, dynamic>{}; }
      if (response.statusCode < 200 || response.statusCode >= 300) throw ApiException(body is Map && body['message'] is String ? body['message'] as String : 'Request failed (${response.statusCode}).', statusCode: response.statusCode);
      if (body is! Map<String, dynamic>) throw ApiException('The server returned an unexpected response.');
      return body;
    } on ApiException { rethrow; } catch (_) { throw ApiException('Could not connect to Creatarsh. Check your connection and API URL.'); }
  }
  Future<List<String>> categories() async { final data = await _get('/api/public/business-categories'); return (data['categories'] as List? ?? const []).map((e) => e.toString()).toList(); }
  Future<DirectoryPage> search({String query = '', String category = '', String city = '', String pin = '', double? latitude, double? longitude, int page = 1}) async {
    final params = <String, String>{'page': '$page', 'limit': '20'};
    if (query.trim().isNotEmpty) params['q'] = query.trim(); if (category.isNotEmpty) params['category'] = category; if (city.trim().isNotEmpty) params['city'] = city.trim(); if (RegExp(r'^\d{6}$').hasMatch(pin)) params['pin'] = pin;
    if (latitude != null && longitude != null) { params['lat'] = latitude.toStringAsFixed(5); params['lng'] = longitude.toStringAsFixed(5); }
    final data = await _get('/api/public/businesses', params); final p = data['pagination'] is Map ? data['pagination'] as Map : const {};
    return DirectoryPage(businesses: (data['businesses'] as List? ?? const []).whereType<Map>().map((e) => Business.fromJson(Map<String, dynamic>.from(e))).toList(), total: _int(p['total']), page: _int(p['page'], page), pages: _int(p['pages']));
  }
  Future<Business> business(String slug) async { final data = await _get('/api/public/businesses/${Uri.encodeComponent(slug)}'); if (data['business'] is! Map) throw ApiException('Business details were not found.'); return Business.fromJson(Map<String, dynamic>.from(data['business'] as Map)); }
  static int _int(dynamic value, [int fallback = 0]) => value is num ? value.toInt() : int.tryParse('$value') ?? fallback;
  void close() => _client.close();
}
