class Business {
  const Business({required this.id, required this.name, required this.slug, required this.category, this.description = '', this.city = '', this.address = '', this.pinCode = '', this.phone = '', this.email = '', this.whatsapp = '', this.websiteUrl = '', this.logo = '', this.coverImage = '', this.verified = false, this.contactOptions = const [], this.tags = const [], this.latitude, this.longitude});
  final String id, name, slug, category, description, city, address, pinCode, phone, email, whatsapp, websiteUrl, logo, coverImage;
  final bool verified;
  final List<String> contactOptions, tags;
  final double? latitude, longitude;
  factory Business.fromJson(Map<String, dynamic> json) => Business(
    id: (json['_id'] ?? json['id'] ?? '').toString(), name: (json['name'] ?? 'Business').toString(), slug: (json['slug'] ?? '').toString(),
    category: (json['category'] ?? 'Other').toString(), description: (json['description'] ?? '').toString(), city: (json['city'] ?? '').toString(), address: (json['address'] ?? '').toString(), pinCode: (json['pinCode'] ?? '').toString(), phone: (json['phone'] ?? '').toString(), email: (json['email'] ?? '').toString(), whatsapp: (json['whatsapp'] ?? '').toString(), websiteUrl: (json['websiteUrl'] ?? '').toString(), logo: (json['logo'] ?? '').toString(), coverImage: (json['coverImage'] ?? '').toString(), verified: json['verified'] == true,
    contactOptions: (json['contactOptions'] is List ? (json['contactOptions'] as List).map((e) => e.toString()).toList() : const <String>[]), tags: (json['tags'] is List ? (json['tags'] as List).map((e) => e.toString()).toList() : const <String>[]),
    latitude: _coordinate(json['location'], 1), longitude: _coordinate(json['location'], 0),
  );
  static double? _coordinate(dynamic location, int index) { if (location is Map && location['coordinates'] is List && (location['coordinates'] as List).length > index) { final v = location['coordinates'][index]; return v is num ? v.toDouble() : double.tryParse('$v'); } return null; }
  String get placeLabel => [city, pinCode].where((s) => s.isNotEmpty).join(' · ');
}
