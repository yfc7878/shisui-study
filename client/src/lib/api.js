export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return await response.text();
}

async function request(path, { method = 'GET', body, headers, signal, timeout = 120_000 } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: { ...(headers || {}) },
  };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('shisui:unauthorized'));
    }
    if (!response.ok) {
      const payload = await parseBody(response);
      const message = (payload && payload.error) || `请求失败（${response.status}）`;
      throw new ApiError(message, response.status, payload?.code, payload?.details);
    }
    if (response.status === 204) return null;
    return await parseBody(response);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试', 0, 'TIMEOUT');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(`网络连接失败：${error.message}`, 0, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get(path, opts) { return request(path, opts); },
  post(path, body, opts = {}) { return request(path, { ...opts, method: 'POST', body }); },
  put(path, body, opts = {}) { return request(path, { ...opts, method: 'PUT', body }); },
  patch(path, body, opts = {}) { return request(path, { ...opts, method: 'PATCH', body }); },
  delete(path, opts = {}) { return request(path, { ...opts, method: 'DELETE' }); },
};

export async function uploadImages(files, onProgress) {
  const list = Array.from(files || []);
  if (!list.length) return [];
  const form = new FormData();
  for (const file of list) form.append('files', file, file.name || 'image.jpg');
  if (onProgress) onProgress(10);
  const result = await request('/api/uploads', { method: 'POST', body: form, timeout: 180_000 });
  if (onProgress) onProgress(100);
  return result.files || [];
}

export async function uploadBlob(blob, name = 'crop.jpg') {
  const form = new FormData();
  form.append('files', blob, name);
  const result = await request('/api/uploads', { method: 'POST', body: form, timeout: 120_000 });
  return result.files?.[0] || null;
}

export async function downloadFile(path, body, fallbackName = 'download.docx') {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) {
    let payload = null;
    try { payload = await response.json(); } catch { /* ignore */ }
    if (response.status === 401) window.dispatchEvent(new CustomEvent('shisui:unauthorized'));
    throw new ApiError(payload?.error || '导出失败，请重试', response.status, payload?.code);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  let filename = fallbackName;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (utfMatch) {
    try { filename = decodeURIComponent(utfMatch[1]); } catch { /* ignore */ }
  } else if (plainMatch) {
    filename = plainMatch[1];
  }
  return { blob, filename };
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function errorMessage(error) {
  if (!error) return '操作失败';
  if (error instanceof ApiError) return error.message;
  return error.message || '操作失败';
}

export function buildQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, value);
  }
  const string = query.toString();
  return string ? `?${string}` : '';
}
