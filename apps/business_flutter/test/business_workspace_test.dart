import 'package:flutter_test/flutter_test.dart';
import 'package:creatarsh_business/models/business_workspace.dart';

void main() {
  group('BusinessWorkspace', () {
    test('parses the membership shape returned by /api/v1/businesses/mine', () {
      final b = BusinessWorkspace.fromJson({'_id':'abc123','name':'Example Studio','slug':'example-studio','category':'Services','city':'Gwalior','status':'PUBLISHED','role':'OWNER','ownershipStatus':'CLAIMED'});
      expect(b.id, 'abc123');
      expect(b.name, 'Example Studio');
      expect(b.role, 'OWNER');
      expect(b.status, 'PUBLISHED');
    });
    test('tolerates optional fields and defaults safely', () {
      final b = BusinessWorkspace.fromJson({'id':'x'});
      expect(b.id, 'x');
      expect(b.name, 'Business');
      expect(b.role, 'EDITOR');
      expect(b.city, isEmpty);
    });
    test('empty id can be detected and filtered by caller', () {
      final b = BusinessWorkspace.fromJson({'name':'No id'});
      expect(b.id, isEmpty);
    });
  });
}
