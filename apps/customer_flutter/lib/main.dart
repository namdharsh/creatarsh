import 'package:flutter/material.dart';
import 'services/api_client.dart';
import 'screens/home_screen.dart';

const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');
void main() => runApp(CreatarshApp(api: ApiClient(baseUrl: apiBaseUrl)));
class CreatarshApp extends StatelessWidget {
  const CreatarshApp({super.key, required this.api}); final ApiClient api;
  @override Widget build(BuildContext context) => MaterialApp(title: 'Creatarsh', debugShowCheckedModeBanner: false, theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff087f5b), brightness: Brightness.light), useMaterial3: true, scaffoldBackgroundColor: const Color(0xfff7faf8), appBarTheme: const AppBarTheme(backgroundColor: Color(0xfff7faf8), surfaceTintColor: Colors.transparent)), home: HomeScreen(api: api));
}
