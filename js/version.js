// Dynamic Application Version Hub (Auto Cache-Busting Engine)
export const APP_BUILD_TIME = '20260826_0017';

export function getVersionedUrl(relativePath) {
  const clean = relativePath.split('?')[0];
  return `${clean}?v=${APP_BUILD_TIME}`;
}
