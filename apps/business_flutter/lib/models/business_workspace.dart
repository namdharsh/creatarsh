class BusinessWorkspace {
  const BusinessWorkspace({required this.id, required this.name, required this.slug, this.category='', this.city='', this.status='DRAFT', this.role='EDITOR', this.ownershipStatus='' });
  final String id, name, slug, category, city, status, role, ownershipStatus;
  factory BusinessWorkspace.fromJson(Map<String, dynamic> j) => BusinessWorkspace(
    id: (j['_id'] ?? j['id'] ?? '').toString(), name: (j['name'] ?? 'Business').toString(), slug: (j['slug'] ?? '').toString(),
    category: (j['category'] ?? '').toString(), city: (j['city'] ?? '').toString(), status: (j['status'] ?? 'DRAFT').toString(),
    role: (j['role'] ?? 'EDITOR').toString(), ownershipStatus: (j['ownershipStatus'] ?? '').toString());
}

class ApiFailure implements Exception {
  const ApiFailure(this.message, {this.statusCode, this.sessionExpired=false});
  final String message; final int? statusCode; final bool sessionExpired;
  @override String toString() => message;
}
