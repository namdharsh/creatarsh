import 'package:flutter_test/flutter_test.dart';
import 'package:creatarsh_admin/main.dart';

void main() {
  testWidgets('shows restricted administrator sign-in screen', (tester) async {
    await tester.pumpWidget(const CreatarshAdminApp());
    await tester.pumpAndSettle();
    expect(find.text('Administrator sign in'), findsOneWidget);
    expect(find.textContaining('authorized admin and superadmin'), findsOneWidget);
    expect(find.text('Sign in securely'), findsOneWidget);
  });
}
