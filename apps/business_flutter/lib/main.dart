import 'package:flutter/material.dart';
import 'screens/business_app.dart';

void main() => runApp(const CreatarshBusinessApp());

class CreatarshBusinessApp extends StatelessWidget {
  const CreatarshBusinessApp({super.key});
  @override Widget build(BuildContext context) => MaterialApp(
    title:'Creatarsh Business', debugShowCheckedModeBanner:false,
    theme:ThemeData(useMaterial3:true, colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xff07965b), brightness:Brightness.light), scaffoldBackgroundColor:const Color(0xfff5faf7), cardTheme:CardThemeData(color:Colors.white.withValues(alpha:.88), elevation:0, shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22), side:const BorderSide(color:Color(0xffe0eee6)))), inputDecorationTheme:InputDecorationTheme(filled:true,fillColor:Colors.white,border:OutlineInputBorder(borderRadius:BorderRadius.circular(14),borderSide:const BorderSide(color:Color(0xffdce9e1))),enabledBorder:OutlineInputBorder(borderRadius:BorderRadius.circular(14),borderSide:const BorderSide(color:Color(0xffdce9e1))))),
    home:const BusinessApp());
}
