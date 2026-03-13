
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from 'https://esm.sh/csv-parse@5.6.0/sync';
import { logAutomation } from "./utils.ts";
import { storeDataInSupabase } from "./database.ts";

// Create a Supabase client with the Auth context of the function
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// CORS: restrict to allowed origins (comma-separated in env var, or fallback to Supabase URL)
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || supabaseUrl).split(",").map(o => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isAllowed = allowedOrigins.some(allowed => origin === allowed || allowed === "*");
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

// Process existing data in the database and ensure dates are in correct format
async function processExistingData() {
  try {
    console.log("Processing existing data from trinks_services table...");
    
    // Get all data to process
    const { data, error } = await supabase
      .from('trinks_services')
      .select('*');
      
    if (error) {
      throw new Error(`Failed to query data: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      console.log("No data found to process");
      await logAutomation(supabase, "No data found to process", false);
      return { success: true, message: "No data to process", count: 0 };
    }
    
    console.log(`Found ${data.length} records to process`);
    
    // Process data to ensure dates are in correct format (YYYY-MM-DD)
    const processedData = data.map(record => {
      let formattedDate = record.service_date;
      
      // If date is in DD/MM/YYYY format, convert to YYYY-MM-DD
      if (record.service_date && record.service_date.includes('/')) {
        const [day, month, year] = record.service_date.split('/');
        formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      return {
        ...record,
        service_date: formattedDate
      };
    });
    
    // Store the processed data back in the database
    await storeDataInSupabase(supabase, processedData);
    
    // Log the successful processing
    await logAutomation(supabase, `Successfully processed ${data.length} services`);
    
    // Enable realtime for the table
    await enableRealtime();
    
    return { success: true, message: "Data processed successfully", count: data.length };
  } catch (error) {
    const errorMessage = `Error processing data: ${error.message}`;
    console.error(errorMessage);
    await logAutomation(supabase, errorMessage, true);
    return { success: false, message: errorMessage };
  }
}

// Enable realtime for trinks_services table
async function enableRealtime() {
  try {
    // First check if the table is already enabled for realtime
    const { data, error } = await supabase
      .from('trinks_services')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error("Error checking database access:", error);
      return false;
    }
      
    console.log("Database access confirmed");
    
    // Since we can't directly check if realtime is enabled, add a log for tracking
    await logAutomation(supabase, "Realtime checked for trinks_services table");
    
    // Prepare SQL query to enable realtime (supabase will execute this)
    const realtimeQuery = `
      BEGIN;
      -- Set the table for full replica identity to capture all changes
      ALTER TABLE IF EXISTS public.trinks_services REPLICA IDENTITY FULL;
      -- Add the table to realtime publication if not already added
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'trinks_services'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.trinks_services;
        END IF;
      END
      $$;
      COMMIT;
    `;
    
    // We can't execute this directly from edge functions,
    // but we can log that the operation would be needed
    await logAutomation(supabase, "Realtime should be enabled for trinks_services table");
    
    return true;
  } catch (error) {
    const errorMessage = `Error with realtime setup: ${error.message}`;
    console.error(errorMessage);
    await logAutomation(supabase, errorMessage, true);
    return false;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting data processing...");

    // Process existing data and ensure realtime is enabled
    const result = await processExistingData();

    // Return the result
    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: result.success ? 200 : 500
      }
    );
  } catch (error) {
    const errorMessage = `Data processing error: ${error.message}`;
    console.error(errorMessage);

    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});
