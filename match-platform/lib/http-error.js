export class HttpError extends Error {
  constructor(status, code, message, fields = null) {
    super(message || code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (code, message, fields = null) => new HttpError(400, code, message, fields);
export const unauthorized = (message = '请先登录') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = '没有权限') => new HttpError(403, 'forbidden', message);
export const notFound = (message = '找不到记录') => new HttpError(404, 'not_found', message);
export const conflict = (message, fields = null) => new HttpError(409, 'conflict', message, fields);
export const tooMany = (message = '尝试过于频繁，请稍后再试') => new HttpError(429, 'rate_limited', message);
