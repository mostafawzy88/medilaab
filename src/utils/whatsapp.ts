/**
 * WhatsApp Link Generator
 * Formats Egyptian and international phone numbers into proper WhatsApp URLs.
 */
export function formatWhatsAppNumber(phone?: string | null): string {
  if (!phone) return ''
  // Strip all non-digit characters
  let cleaned = phone.replace(/[^0-9]/g, '')
  
  if (!cleaned) return ''

  // Egyptian mobile format (e.g., 010, 011, 012, 015 - 11 digits starting with 01)
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    cleaned = '2' + cleaned // becomes 201xxxxxxxxx
  } else if (cleaned.startsWith('1') && cleaned.length === 10) {
    cleaned = '20' + cleaned
  }
  
  return cleaned
}

export function isValidWhatsAppNumber(phone?: string | null): boolean {
  const formatted = formatWhatsAppNumber(phone)
  return formatted.length >= 8
}

export function getWhatsAppLink(phone?: string | null, message?: string): string {
  const formatted = formatWhatsAppNumber(phone)
  // If no valid phone with at least 8 digits, return empty string so it never links to '#'
  if (!formatted || formatted.length < 8) return ''
  const encodedMsg = message ? encodeURIComponent(message) : ''
  return `https://wa.me/${formatted}${encodedMsg ? `?text=${encodedMsg}` : ''}`
}
