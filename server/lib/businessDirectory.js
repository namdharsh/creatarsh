'use strict';
function cleanText(value, max = 100) { return String(value ?? '').trim().slice(0, max); }
function parseDirectoryPagination(query = {}) {
  const pageValue = Number.parseInt(query.page, 10), limitValue = Number.parseInt(query.limit, 10);
  const page = Number.isFinite(pageValue) ? Math.max(1, Math.min(pageValue, 100000)) : 1;
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(limitValue, 24)) : 12;
  return { page, limit, skip: (page - 1) * limit };
}
function buildBusinessFilters(query = {}) {
  const filters = { status: 'PUBLISHED' };
  const q = cleanText(query.q, 100), category = cleanText(query.category, 80), city = cleanText(query.city, 80), pin = cleanText(query.pin, 6);
  if (category) filters.category = category;
  if (city) { const escapedCity = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filters.city = new RegExp(`^${escapedCity}$`, 'i'); }
  if (/^\d{6}$/.test(pin)) filters.pinCode = pin;
  if (q) filters.$text = { $search: q };
  const lat = Number(query.lat), lng = Number(query.lng), radiusKm = Number(query.radiusKm);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    const radius = Number.isFinite(radiusKm) && radiusKm > 0 ? Math.min(radiusKm, 100) : 25;
    filters.location = { $geoWithin: { $centerSphere: [[lng, lat], radius / 6378.1] } };
  }
  return filters;
}
module.exports = { buildBusinessFilters, parseDirectoryPagination };
