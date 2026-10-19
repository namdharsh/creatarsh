const { AppError } = require('./errors');
// Schema contract: validator receives the request section and returns { value } or { errors }.
function validateRequest({ body, query, params } = {}) {
  return (req, res, next) => {
    try {
      const errors = [];
      for (const [section, schema] of Object.entries({ body, query, params })) {
        if (!schema) continue;
        const result = typeof schema === 'function' ? schema(req[section]) : schema.safeParse(req[section]);
        if (result?.success === false) errors.push({ section, issues: result.error?.issues || [] });
        else if (result?.errors?.length) errors.push({ section, issues: result.errors });
        else if (result && Object.prototype.hasOwnProperty.call(result, 'value')) req[section] = result.value;
      }
      if (errors.length) return next(new AppError(400, 'Request validation failed.', 'VALIDATION_ERROR', errors));
      return next();
    } catch (error) { return next(error); }
  };
}
function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: [{ message: 'Expected an object.' }] };
  return { value };
}
module.exports = { validateRequest, requireObject };
