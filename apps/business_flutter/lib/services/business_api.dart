import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../models/business_workspace.dart';

class BusinessApi {
  BusinessApi({required this.baseUrl, http.Client? client, FlutterSecureStorage? storage})
      : _client = client ?? http.Client(), _storage = storage ?? const FlutterSecureStorage();
  final String baseUrl; final http.Client _client; final FlutterSecureStorage _storage;
  static const tokenKey = 'creatarsh_business_access_token';
  Uri _uri(String path, [Map<String,String>? query]) => Uri.parse('${baseUrl.replaceFirst(RegExp(r'/+$'), '')}$path').replace(queryParameters: query?.isEmpty == true ? null : query);
  Future<String?> get token => _storage.read(key: tokenKey);
  Future<bool> get hasSession async => (await token)?.isNotEmpty == true;
  Future<void> signOut() => _storage.delete(key: tokenKey);
  Future<Map<String,dynamic>> _request(String method, String path, {Map<String,String>? query, Map<String,dynamic>? body, bool authenticated=true}) async {
    if (baseUrl.trim().isEmpty) throw const ApiFailure('API URL is not configured.');
    final headers = <String,String>{'Accept':'application/json','Content-Type':'application/json'};
    if (authenticated) { final t = await token; if (t == null || t.isEmpty) throw const ApiFailure('Please sign in again.', sessionExpired:true); headers['Authorization']='Bearer $t'; }
    try {
      final uri = _uri(path, query); final encoded = body == null ? null : jsonEncode(body);
      final http.Response response;
      switch (method) {
        case 'POST': response = await _client.post(uri, headers: headers, body: encoded).timeout(const Duration(seconds:15)); break;
        case 'PATCH': response = await _client.patch(uri, headers: headers, body: encoded).timeout(const Duration(seconds:15)); break;
        default: response = await _client.get(uri, headers: headers).timeout(const Duration(seconds:15));
      }
      dynamic decoded; try { decoded=jsonDecode(response.body); } catch (_) { decoded=<String,dynamic>{}; }
      if (response.statusCode == 401 && authenticated) { await signOut(); throw ApiFailure('Your session expired. Please sign in again.', statusCode:401, sessionExpired:true); }
      if (response.statusCode < 200 || response.statusCode >= 300) throw ApiFailure(decoded is Map && decoded['message'] is String ? decoded['message'] as String : 'Request failed (${response.statusCode}).', statusCode:response.statusCode);
      if (decoded is Map<String,dynamic>) return decoded;
      throw const ApiFailure('The server returned an unexpected response.');
    } on ApiFailure { rethrow; } catch (_) { throw const ApiFailure('Could not connect. Check your internet connection and API URL.'); }
  }
  Future<Map<String,dynamic>> login(String email, String password) async {
    final data=await _request('POST','/api/customer/login',authenticated:false,body:{'email':email.trim(),'password':password});
    final value=(data['accessToken'] ?? data['token'] ?? '').toString();
    if (value.isEmpty) throw const ApiFailure('The server did not return an access token.');
    await _storage.write(key:tokenKey,value:value); return data;
  }
  Future<Map<String,dynamic>> me() => _request('GET','/api/customer/me');
  Future<List<BusinessWorkspace>> myBusinesses() async { final d=await _request('GET','/api/v1/businesses/mine'); return (d['businesses'] as List? ?? const []).whereType<Map>().map((e)=>BusinessWorkspace.fromJson(Map<String,dynamic>.from(e))).where((b)=>b.id.isNotEmpty).toList(); }
  Future<Map<String,dynamic>> dashboard(String id) => _request('GET','/api/v1/businesses/${Uri.encodeComponent(id)}/dashboard');
  Future<Map<String,dynamic>> profile(String id) => _request('GET','/api/v1/businesses/${Uri.encodeComponent(id)}/profile');
  Future<Map<String,dynamic>> updateProfile(String id, Map<String,dynamic> changes) => _request('PATCH','/api/v1/businesses/${Uri.encodeComponent(id)}/profile',body:changes);
  Future<Map<String,dynamic>> analytics(String id) => _request('GET','/api/v1/businesses/${Uri.encodeComponent(id)}/analytics');
  Future<List<Map<String,dynamic>>> enquiries(String id) async { final d=await _request('GET','/api/v1/businesses/${Uri.encodeComponent(id)}/enquiries'); return (d['enquiries'] as List? ?? const []).whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList(); }
  Future<void> updateEnquiry(String id,String enquiryId,String status) async { await _request('PATCH','/api/v1/businesses/${Uri.encodeComponent(id)}/enquiries/${Uri.encodeComponent(enquiryId)}',body:{'status':status}); }
  Future<List<Map<String,dynamic>>> products(String id) async { final d=await _request('GET','/api/v1/businesses/${Uri.encodeComponent(id)}/store/products'); return (d['products'] as List? ?? const []).whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList(); }
  Future<Map<String,dynamic>> createProduct(String id,{required String name,required double price,String sku='',int stock=0}) => _request('POST','/api/v1/businesses/${Uri.encodeComponent(id)}/store/products',body:{'name':name,'price':price,'sku':sku,'stock':stock});
  Future<List<Map<String,dynamic>>> orders(String id) async { final d=await _request('GET','/api/v1/businesses/${Uri.encodeComponent(id)}/store/orders'); return (d['orders'] as List? ?? const []).whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList(); }
  void close() => _client.close();
}
