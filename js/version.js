// Dynamic Application Version Hub (Auto Cache-Busting Engine)
export const APP_BUILD_TIME = Date.now();

export function getVersionedUrl(relativePath) {
  const clean = relativePath.split('?')[0];
  return `${clean}?t=${Date.now()}`;
}
