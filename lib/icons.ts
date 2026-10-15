/**
 * App icon addresses. Installed apps (desktop shortcuts, phone home screens) keep
 * their own copy of the icon and only fetch a new one when the manifest points to
 * a different address, so the address carries a version.
 *
 * Changed the logo? Run `node scripts/genIcons.js`, then bump ICON_VERSION.
 */
export const ICON_VERSION = "2";

const v = (path: string) => `${path}?v=${ICON_VERSION}`;

export const ICONS = {
  favicon32: v("/icons/favicon-32.png"),
  icon192: v("/icons/icon-192.png"),
  icon512: v("/icons/icon-512.png"),
  maskable512: v("/icons/maskable-512.png"),
  appleTouch: v("/icons/apple-touch-icon.png")
} as const;
