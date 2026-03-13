
// Utility functions for Trinks automation

/**
 * Format a date object to DD/MM/YYYY format for Trinks inputs
 */
export function formatDateForInput(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Log automation events to Supabase
 */
export async function logAutomation(supabase, message: string, isError: boolean = false) {
  const { error } = await supabase
    .from('automation_logs')
    .insert({
      message,
      is_error: isError,
      created_at: new Date().toISOString()
    });
  
  if (error) {
    console.error("Error logging to Supabase:", error);
  }
}
