
# Setup Instructions for "Profissional Destaque do Mês"

## Prerequisites
- Supabase project connected to esta aplicação
- Supabase CLI installed for deploying edge functions

## Database Setup
1. The migration script located in `supabase/migrations/20250521_initial_schema.sql` will create the necessary tables:
   - `trinks_services`: Stores data extracted from Trinks reports
   - `automation_logs`: Logs automation runs and any errors

2. Apply the migration using Supabase CLI or the SQL Editor in the Supabase Dashboard.

## Environment Variables Setup
In the Supabase Dashboard, go to Project Settings > API > Environment Variables and add the following secrets:

1. `TRINKS_USERNAME`: studioxbrasil.adm@gmail.com
2. `TRINKS_PASSWORD`: 7yQWUR7M!d

## Edge Function Deployment

1. Deploy the Edge Function:
```bash
supabase functions deploy daily-trinks-automation
```

2. Schedule the edge function to run daily at 2:00 AM Manaus time (GMT-4):

In the Supabase Dashboard, go to Edge Functions > daily-trinks-automation > Schedule, and set up:
- Expression: `0 6 * * *` (This is 6:00 AM UTC, which corresponds to 2:00 AM GMT-4)
- Timezone: UTC

## Frontend Configuration

The frontend is already configured to connect to Supabase and display the data. Make sure the following environment variables are set in your deployment:

- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

## Testing the Automation

You can manually trigger the edge function to test it:

1. In the Supabase Dashboard, go to Edge Functions and select "daily-trinks-automation"
2. Click on "Invoke" to run the function
3. Check the logs to ensure the function ran successfully
4. Verify that data appears in the "trinks_services" table

## Security Considerations

- The Trinks login credentials are stored as secure environment variables
- The edge function uses the service role key for database access
- Protect your application URL to limit access to authorized personnel only

## Troubleshooting

If the automation fails:
1. Check the `automation_logs` table for error messages
2. Verify that the Trinks login credentials are correct
3. Check if there have been changes to the Trinks interface that require updates to the automation script

## Nota sobre Atualização de Dados

A tabela `trinks_services` é atualizada por um sistema externo independente deste projeto.
