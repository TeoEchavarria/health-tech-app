// Date utility functions for health data sync

/**
 * Get ISO string for start of today (midnight)
 */
export function isoStartOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Get ISO string for current time
 */
export function isoNow() {
  return new Date().toISOString();
}

/**
 * Get ISO string for N days ago at midnight
 */
export function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Get ISO string for start of week
 */
export function isoStartOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust if Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Format date for display
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

/**
 * Format time for display
 */
export function formatTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format date and time for display
 */
export function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString();
}

