import 'package:flutter_test/flutter_test.dart';
import 'package:creatarsh_customer/models/business.dart';
import 'package:creatarsh_customer/services/api_client.dart';

void main() {
  group('Business model', () {
    test('parses public API business payload safely', () {
      final b = Business.fromJson({'_id':'abc','name':'Studio','slug':'studio','category':'Beauty & Wellness','city':'Guna','verified':true,'contactOptions':['PHONE'],'location':{'type':'Point','coordinates':[77.2,24.6]},'tags':['bridal']});
      expect(b.id, 'abc'); expect(b.name, 'Studio'); expect(b.verified, isTrue); expect(b.placeLabel, 'Guna'); expect(b.longitude, 77.2); expect(b.latitude, 24.6); expect(b.tags, ['bridal']);
    });
    test('handles optional fields and malformed location', () {
      final b = Business.fromJson({'name':'Shop','slug':'shop','category':'Retail','location':{'coordinates':[]}});
      expect(b.phone, isEmpty); expect(b.latitude, isNull); expect(b.longitude, isNull); expect(b.contactOptions, isEmpty);
    });
  });
  test('API client reports missing configuration without network request', () async {
    final api = ApiClient(baseUrl: '');
    expect(api.categories(), throwsA(isA<ApiException>()));
    api.close();
  });
}
