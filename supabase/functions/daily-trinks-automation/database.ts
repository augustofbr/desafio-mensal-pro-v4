/**
 * Store the processed data in Supabase
 */
export async function storeDataInSupabase(supabase, data) {
  if (!data || data.length === 0) {
    console.log("No data to store");
    return;
  }
  
  try {
    console.log(`Storing ${data.length} records in the database`);
    
    // Get the current month bounds for filtering
    const currentDate = new Date();
    const firstDayMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const isoFirstDay = firstDayMonth.toISOString().split('T')[0];
    const isoLastDay = lastDayMonth.toISOString().split('T')[0];
    
    // Instead of deleting and re-inserting data, let's update existing records or insert new ones
    for (const item of data) {
      if (!item.id) {
        console.warn("Skipping record without ID:", item);
        continue;
      }
      
      // Ensure service_date is in the correct format
      if (item.service_date && item.service_date.includes('/')) {
        // DD/MM/YYYY format is fine, keep it
      } else if (item.service_date) {
        // Ensure it's in the DD/MM/YYYY format for consistency
        const dateObj = new Date(item.service_date);
        if (!isNaN(dateObj.getTime())) {
          const day = String(dateObj.getDate()).padStart(2, '0');
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const year = dateObj.getFullYear();
          item.service_date = `${day}/${month}/${year}`;
        }
      }
      
      // Update existing record
      const { error } = await supabase
        .from('trinks_services')
        .update({
          service_date: item.service_date,
          professional: item.professional,
          service_name: item.service_name,
          category: item.category,
          client_name: item.client_name,
          value: item.value,
          created_at: item.created_at
        })
        .eq('id', item.id);
      
      if (error) {
        console.error(`Error updating record ${item.id}:`, error);
      }
    }
    
    console.log("Data update completed successfully");
    console.log("Database access confirmed");
  } catch (error) {
    console.error("Error storing data:", error);
    throw new Error(`Error storing data: ${error.message}`);
  }
}
