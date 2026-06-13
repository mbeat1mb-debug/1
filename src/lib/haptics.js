export function haptic(style = 'light') {
  if (!navigator.vibrate) return
  const patterns = { light: 8, medium: 15, heavy: 25, success: [8, 40, 8], error: [20, 60, 20] }
  navigator.vibrate(patterns[style] ?? 8)
}
