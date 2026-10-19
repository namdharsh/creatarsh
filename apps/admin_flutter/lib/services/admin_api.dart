import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class AdminApiException implements Exception {
  const AdminApiException(this.message, {this.sessionExpired = false, this.statusCode});
  final String message;
  final bool sessionExpired;
  final int? statusCode;
  @override String toString() => message;
}

class AdminApi {
  AdminApi({required this.baseUrl, http.Client? client, FlutterSecureStorage? storage})
      : _client = client ?? http.Client(), _storage = storage ?? const FlutterSecureStorage();
  final String baseUrl;
  final http.Client _client;
  final FlutterSecureStorage _storage;
  static const tokenKey = 'creatarsh_admin_access_token';
  Uri _uri(String path) => Uri.parse('${baseUrl.replaceFirst(RegExp(r'/+$'), '')}$path');
  Future<String?> get token => _storage.read(key: tokenKey);
  Future<void> signOut() => _storage.delete(key: tokenKey);

  Future<Map<String, dynamic>> request(String method, String path,
      {Map<String, dynamic>? body, bool authenticated = true}) async {
    if (baseUrl.trim().isEmpty) throw const AdminApiException('API URL is not configured.');
    final headers = <String, String>{'Accept':'application/json','Content-Type':'application/json'};
    if (authenticated) {
      final value = await token;
      if (value == null || value.isEmpty) throw const AdminApiException('Please sign in again.', sessionExpired:true);
      headers['Authorization'] = 'Bearer $value';
    }
    try {
      final uri = _uri(path);
      final payload = body == null ? null : jsonEncode(body);
      late http.Response response;
      switch (method) {
        case 'POST': response = await _client.post(uri, headers:headers, body:payload).timeout(const Duration(seconds:20)); break;
        case 'PATCH': response = await _client.patch(uri, headers:headers, body:payload).timeout(const Duration(seconds:20)); break;
        default: response = await _client.get(uri, headers:headers).timeout(const Duration(seconds:20));
      }
      dynamic decoded;
      try { decoded = jsonDecode(response.body); } catch (_) { decoded = <String,dynamic>{}; }
      if (response.statusCode == 401 && authenticated) {
        await signOut();
        throw const AdminApiException('Administrator session expired. Sign in again.', sessionExpired:true, statusCode:401);
      }
      if (response.statusCode == 403) throw const AdminApiException('Administrator permission required. This account cannot access admin operations.', statusCode:403);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw AdminApiException(decoded is Map && decoded['message'] is String ? decoded['message'] as String : 'Request failed (${response.statusCode}).', statusCode:response.statusCode);
      }
      if (decoded is Map<String,dynamic>) return decoded;
      throw const AdminApiException('Unexpected response from server.');
    } on AdminApiException { rethrow; }
    catch (_) { throw const AdminApiException('Could not connect. Check the API URL and internet connection.'); }
  }

  Future<Map<String,dynamic>> login(String username, String password) async {
    final data = await request('POST','/api/manager/login',authenticated:false,body:{'username':username.trim(),'password':password});
    final role = ((data['manager'] as Map?)?['role'] ?? '').toString().toLowerCase();
    final accessToken = (data['token'] ?? '').toString();
    if (accessToken.isEmpty) throw const AdminApiException('The server did not return a session token.');
    if (!{'admin','superadmin'}.contains(role)) throw const AdminApiException('This account is not an administrator. Ask an administrator to assign the correct role.');
    await _storage.write(key:tokenKey,value:accessToken);
    try {
      final me = await request('GET','/api/manager/me');
      final verifiedRole = (((me['manager'] as Map?)?['role']) ?? '').toString().toLowerCase();
      if (!{'admin','superadmin'}.contains(verifiedRole)) throw const AdminApiException('Administrator role could not be verified.');
      return data;
    } catch (_) { await signOut(); rethrow; }
  }

  Future<Map<String,dynamic>> overview() => request('GET','/api/v1/admin/overview');
  Future<List<Map<String,dynamic>>> businesses({String? status}) async {
    final suffix = status == null || status == 'ALL' ? '' : '?status=${Uri.encodeQueryComponent(status)}';
    final d = await request('GET','/api/v1/admin/businesses$suffix'); return _items(d['businesses']);
  }
  Future<void> moderateBusiness(String id, String status, {bool? verified}) async => request('PATCH','/api/v1/admin/businesses/${Uri.encodeComponent(id)}/moderation',body:{'status':status,if(verified != null) 'verified':verified});
  Future<List<Map<String,dynamic>>> deployments() async => _items((await request('GET','/api/v1/admin/deployments'))['deployments']);
  Future<void> publishDeployment(String id) async => request('POST','/api/v1/admin/publisher/deployments/${Uri.encodeComponent(id)}/publish',body:<String,dynamic>{});
  Future<void> rollbackDeployment(String id) async => request('POST','/api/v1/admin/publisher/deployments/${Uri.encodeComponent(id)}/rollback',body:<String,dynamic>{});
  Future<Map<String,dynamic>> health() => request('GET','/api/v1/admin/health');
  Future<List<Map<String,dynamic>>> businessRequests() async => _items((await request('GET','/api/v1/admin/business-requests'))['requests']);
  Future<void> reviewRequest(String id,String status,{String resolution=''}) async => request('PATCH','/api/v1/admin/business-requests/${Uri.encodeComponent(id)}',body:{'status':status,'resolution':resolution});
  Future<List<Map<String,dynamic>>> claims() async => _items((await request('GET','/api/v1/admin/business-claims'))['claims']);
  Future<void> reviewClaim(String businessId,String claimId,String decision) async => request('POST','/api/v1/admin/businesses/${Uri.encodeComponent(businessId)}/claims/${Uri.encodeComponent(claimId)}/review',body:{'decision':decision});
  Future<List<Map<String,dynamic>>> audit() async => _items((await request('GET','/api/v1/admin/audit?limit=100'))['events']);
  Future<List<Map<String,dynamic>>> _items(dynamic value) => Future.value((value as List? ?? const []).whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList());
  void close() => _client.close();
}
