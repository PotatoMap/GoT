/* Provider settings persist locally; API keys live only in this tab's session. */
(function (root) {
  'use strict';
  const storageKey = 'got.tutor.browser-config.v2';
  const legacyStorageKey = 'got.tutor.browser-config.v1';
  const sessionKeysKey = 'got.tutor.session-keys.v1';
  const providers = ['deepseek', 'opencode-go', 'custom'];
  const fallback = provider => provider === 'deepseek' ? 'deepseek-flash' : provider === 'opencode-go' ? 'deepseek-v4.1-flash' : '';
  const memoryKeys = Object.create(null);
  const validKey = value => typeof value === 'string' && /^[\x21-\x7e]{1,512}$/.test(value);
  function normalizeBaseUrl(value) {
    if (typeof value !== 'string' || value.length > 500) throw new Error('请输入有效的自定义 HTTPS API 地址。');
    let url;
    try { url = new URL(value.trim()); } catch (_) { throw new Error('请输入有效的自定义 HTTPS API 地址。'); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443') ||
        !host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host) ||
        /(^|\.)(localhost|local|internal|lan|home|home\.arpa|test|invalid|example)$/.test(host)) {
      throw new Error('自定义 API 必须是公开可访问的 HTTPS 域名，不支持本机地址、IP 地址、端口、查询参数或重定向配置。');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  }
  let revision = 0, service = 'unknown', verified = '', probing = null;
  function parseObject(raw) {
    try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch (_) { return {}; }
  }
  function readSessionKeys() {
    const keys = parseObject(root.sessionStorage?.getItem(sessionKeysKey));
    for (const provider of providers) if (!validKey(keys[provider])) delete keys[provider];
    return keys;
  }
  function writeSessionKeys(keys) {
    for (const provider of providers) {
      if (validKey(keys[provider])) memoryKeys[provider] = keys[provider];
      else delete memoryKeys[provider];
    }
    try { root.sessionStorage?.setItem(sessionKeysKey, JSON.stringify(keys)); return true; }
    catch (_) { return false; }
  }
  function cleanConfig(source) {
    const value = source && typeof source === 'object' && !Array.isArray(source) ? { ...source } : {};
    const keys = {};
    for (const provider of providers) {
      const item = value[provider];
      if (!item || typeof item !== 'object' || Array.isArray(item)) { delete value[provider]; continue; }
      if (validKey(item.key)) keys[provider] = item.key;
      const config = {};
      if (typeof item.model === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,119}$/.test(item.model)) config.model = item.model;
      if (provider === 'custom') {
        try { config.baseUrl = normalizeBaseUrl(item.baseUrl); }
        catch (_) { delete value[provider]; continue; }
      }
      value[provider] = config;
    }
    if (!providers.includes(value.provider)) value.provider = 'opencode-go';
    return { value, keys };
  }
  function readPersistent() {
    let raw = null, legacyRaw = null;
    try { raw = root.localStorage.getItem(storageKey); legacyRaw = root.localStorage.getItem(legacyStorageKey); }
    catch (_) { return {}; }
    const legacy = cleanConfig(parseObject(legacyRaw));
    const source = raw ? parseObject(raw) : parseObject(legacyRaw);
    const cleaned = cleanConfig(source);
    if (raw) for (const provider of providers) if (!cleaned.value[provider] && legacy.value[provider]) cleaned.value[provider] = legacy.value[provider];
    const session = readSessionKeys();
    const keys = { ...legacy.keys, ...cleaned.keys, ...session };
    for (const provider of providers) if (validKey(memoryKeys[provider])) keys[provider] = memoryKeys[provider];
    if (Object.keys(legacy.keys).length || Object.keys(cleaned.keys).length) writeSessionKeys({ ...legacy.keys, ...cleaned.keys, ...session });
    if ((!raw && Object.keys(source).length) || (raw && legacyRaw)) {
      // Persist sanitized settings and move any legacy key into the tab session first.
      try {
        root.localStorage.setItem(storageKey, JSON.stringify(cleaned.value));
        root.localStorage.removeItem(legacyStorageKey);
      } catch (_) { /* Keep the legacy record if storage migration cannot complete. */ }
    } else if (raw && Object.keys(cleaned.keys).length) {
      try { root.localStorage.setItem(storageKey, JSON.stringify(cleaned.value)); } catch (_) {}
    }
    return Object.assign(cleaned.value, Object.fromEntries(providers.filter(p => validKey(keys[p])).map(p => [p, { ...(cleaned.value[p] || {}), key: keys[p] }])));
  }
  const read = () => readPersistent();
  function info(providerOverride) {
    const data = read(), provider = providers.includes(providerOverride) ? providerOverride : providers.includes(data.provider) ? data.provider : 'opencode-go';
    const config = data[provider] || {};
    return { provider, model: config.model || fallback(provider), baseUrl: provider === 'custom' ? (config.baseUrl || '') : '', keyConfigured: !!config.key,
      service, ready: !!config.key && (provider !== 'custom' || (!!config.baseUrl && !!config.model)) && service === 'available', verified: verified === provider + ':' + revision };
  }
  function save(provider, key, model, baseUrl = '') {
    if (!providers.includes(provider)) throw new Error('请选择供应商。');
    const data = read(), previous = data[provider] || {};
    const value = key.trim() || previous.key;
    if (!value) throw new Error('请输入所选供应商的 API Key。');
    if (!/^[\x21-\x7e]{1,512}$/.test(value)) throw new Error('密钥格式不正确，请重新粘贴。');
    const selectedModel = String(model || fallback(provider) || '').trim();
    if ((provider !== 'custom' || selectedModel) && !/^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,119}$/.test(selectedModel)) throw new Error('请选择有效模型。');
    const config = { model: selectedModel };
    if (provider === 'custom') config.baseUrl = normalizeBaseUrl(baseUrl);
    const verifiedBeforeSave = verified === provider + ':' + revision && previous.key === value &&
      (provider !== 'custom' || previous.baseUrl === config.baseUrl);
    data.provider = provider; data[provider] = config;
    const keys = { ...memoryKeys, ...readSessionKeys() }; keys[provider] = value;
    writeSessionKeys(keys);
    for (const name of providers) if (data[name]) delete data[name].key;
    root.localStorage.setItem(storageKey, JSON.stringify(data));
    try { root.localStorage.removeItem(legacyStorageKey); } catch (_) {}
    revision++;
    verified = verifiedBeforeSave ? provider + ':' + revision : '';
  }
  function forget(provider) {
    if (!providers.includes(provider)) throw new Error('请选择供应商。');
    const data = readPersistent(); delete data[provider];
    const keys = { ...memoryKeys, ...readSessionKeys() }; delete keys[provider]; writeSessionKeys(keys);
    delete memoryKeys[provider];
    root.localStorage.setItem(storageKey, JSON.stringify(data));
    try { root.localStorage.removeItem(legacyStorageKey); } catch (_) {}
    revision++; verified = '';
  }
  async function probe() {
    if (probing) return probing;
    probing = (async () => {
      service = 'checking';
      try {
        const response = await fetch('/tutor/config', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        const result = await response.json().catch(() => null);
        service = response.ok && result?.service === 'got-tutor-byok' ? 'available' : 'unavailable';
      } catch (_) { service = navigator.onLine === false ? 'offline' : 'unavailable'; }
      return info();
    })();
    try { return await probing; } finally { probing = null; }
  }
  async function call(path, payload = {}, options = {}) {
    const data = read();
    const provider = options.provider || info().provider;
    const selected = info(provider);
    const apiKey = options.apiKey?.trim() || data[provider]?.key;
    if (!apiKey) throw Object.assign(new Error('尚未保存此供应商的密钥，请先配置。'), { code: 'missing_key' });
    const isLoopback = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    if (location.protocol !== 'https:' && !(location.protocol === 'http:' && isLoopback)) throw new Error('请通过 HTTPS 网站或本机 GoT 服务使用老师，避免不安全地传输密钥。');
    if (!['models','turn'].includes(path)) throw new Error('Unsupported request');
    const baseUrl = provider === 'custom' ? normalizeBaseUrl(options.baseUrl || selected.baseUrl || data.custom?.baseUrl || '') : '';
    const response = await fetch('/tutor/' + path, { method: 'POST', signal: options.signal, cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, provider, apiKey, model: options.model || selected.model, ...(provider === 'custom' ? { baseUrl } : {}) }) });
    const result = await response.json().catch(() => null);
    if (!result || !response.ok) {
      const error = new Error(result?.error || '老师接口不可用，请检查网站是否已部署 API 转发服务。');
      error.code = result?.code || 'service_unavailable'; throw error;
    }
    return result;
  }
  async function models(provider, key, baseUrl = '') {
    const captured = revision;
    const endpoint = provider === 'custom' ? normalizeBaseUrl(baseUrl || info(provider).baseUrl || '') : '';
    const result = await call('models', {}, { provider, apiKey: key, baseUrl: endpoint, signal: AbortSignal.timeout(20000) });
    const config = read()[provider] || {};
    if (captured === revision && (!key || key.trim() === config.key) && (provider !== 'custom' || endpoint === config.baseUrl)) verified = provider + ':' + revision;
    return result.models;
  }
  root.GoTTutorConnection = { info, save, forget, probe, call, models, fallback, normalizeBaseUrl };
  addEventListener('storage', event => {
    if (![storageKey, legacyStorageKey].includes(event.key) && event.key !== null) return;
    revision++; verified = '';
    document.dispatchEvent(new CustomEvent('got:tutor-credentials-changed'));
  });
})(window);
