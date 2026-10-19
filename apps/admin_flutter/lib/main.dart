import 'package:flutter/material.dart';
import 'screens/admin_app.dart';

void main() => runApp(const CreatarshAdminApp());

class CreatarshAdminApp extends StatelessWidget {
  const CreatarshAdminApp({super.key});
  @override Widget build(BuildContext context) => MaterialApp(
    title: 'Creatarsh Admin', debugShowCheckedModeBanner: false,
    theme: ThemeData(useMaterial3:true, colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xff07864e),brightness:Brightness.light), scaffoldBackgroundColor:const Color(0xfff4faf6), cardTheme:CardThemeData(color:Colors.white,elevation:0,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(20),side:const BorderSide(color:Color(0xffe0eee6)))), inputDecorationTheme:InputDecorationTheme(filled:true,fillColor:Colors.white,border:OutlineInputBorder(borderRadius:BorderRadius.circular(14),borderSide:const BorderSide(color:Color(0xffdce9e1))),enabledBorder:OutlineInputBorder(borderRadius:BorderRadius.circular(14),borderSide:const BorderSide(color:Color(0xffdce9e1))))),
    home: const AdminApp(),
  );
}
