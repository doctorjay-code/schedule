/**
 * Supabase Lightweight REST Client (Zero-dependency, 0.05s response)
 */
export const SUPABASE_CONFIG = {
  url: 'https://jpdospunrcscvfpuqzhf.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwZG9zcHVucmNzY3ZmcHVxemhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDY3NjcsImV4cCI6MjEwMjcyMjc2N30.UsIKguZm2v5Y_tDilvH7CQuqBt5dG6QSVFMeixX6r5Q'
};

const defaultHeaders = {
  'apikey': SUPABASE_CONFIG.anonKey,
  'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
  'Content-Type': 'application/json'
};

/**
 * Supabase REST API Query Helper
 */
export async function supabaseRest(endpoint, options = {}) {
  const url = `${SUPABASE_CONFIG.url}/rest/v1/${endpoint}`;
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      ...defaultHeaders,
      ...(options.prefer ? { 'Prefer': options.prefer } : {}),
      ...(options.headers || {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  };

  const response = await (options.fetchImpl || fetch)(url, fetchOptions);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase Error (${response.status}): ${errorText}`);
  }

  if (response.status === 204) return null;
  return await response.json();
}
