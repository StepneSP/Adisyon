export const theme = {
  color: {
    surface: "#FAF9F6",
    surfaceSecondary: "#FFFFFF",
    surfaceTertiary: "#F0EFEB",
    surfaceInverse: "#1C1C1E",
    onSurface: "#1C1C1E",
    onSurfaceMuted: "#3A3A3C",
    onInverse: "#FAF9F6",
    brand: "#C85A40",
    brandSoft: "#E8A38B",
    brandTint: "#F7E5DE",
    onBrand: "#FFFFFF",
    success: "#4A7C59",
    warning: "#D99B48",
    error: "#B33939",
    info: "#5C6B73",
    border: "#E5E5EA",
    borderStrong: "#C7C7CC",
  },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  font: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, huge: 40, mega: 72 },
} as const;

export const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "New", color: "#B33939", bg: "#FCE9E9" },
  preparing: { label: "Preparing", color: "#D99B48", bg: "#FBEED8" },
  ready: { label: "Ready", color: "#4A7C59", bg: "#E3EFE5" },
  served: { label: "Served", color: "#3A3A3C", bg: "#EAEAEA" },
  cancelled: { label: "Cancelled", color: "#8A8A8E", bg: "#F0EFEB" },
};
