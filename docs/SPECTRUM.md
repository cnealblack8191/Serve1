# Spectrum in Serv1 (Phase 4)

Serv1's side of the Spectrum connector (contract: ECI-ECOSYSTEM `services/spectrum-connector/API.md`).
Built and tested against a local fake connector with synthetic records. **Nothing is deployed.**

## What people see

- **Settings › Integrations › Spectrum** (Admin only; account menu › Settings). Save credentials
  (write-only: the form empties after saving and the values are never shown again), see who saved
  them and when, press **Test connection** and see the last result.
- **Import from Spectrum** (Admin and Office; Jobs page). Look up Spectrum jobs or work orders
  (optionally by status, or work orders by job number), then import the ones Serv1 does not have.
  Matching is company code + job number, or company code + work order number. If Spectrum has
  more than it can send at once, the screen says so and asks you to narrow the list.
- **Remove test imports** (Admin only; on the Spectrum settings screen). Enter a company code, see
  the count first, then confirm by typing the code. Deletes the jobs, sites and customers Serv1
  imported from that code. Records that work in Serv1 still uses (an invoice, photos, a signature,
  an opportunity) are kept and listed.

Imported jobs start as **New** with a Serv1 job number; Spectrum's status, project manager or
technician and dates go into the job notes. Spectrum records carry no amounts.

## Before it can go live (owner steps, not done)

1. Deploy the Spectrum connector (ECI-ECOSYSTEM). Note its outputs `ApiEndpoint` and
   `Serv1InvokeResource`.
2. Deploy Serv1 with these set in the deploying shell (values come from step 1, never from code):
   `SPECTRUM_CONNECTOR_URL` = ApiEndpoint, `SPECTRUM_INVOKE_RESOURCE` = Serv1InvokeResource.
3. The Serv1 deployment outputs `spectrumCallerRoleName`. Give that role name to the connector
   deployment as `Serv1BackendRoleName`, so the connector accepts Serv1's calls.
4. Sign in as an Admin, save the Spectrum credentials, press Test connection.
5. Try an import with a test company code, then use Remove test imports for that code.

## How it works

The browser never talks to Spectrum or the connector. Screens call `src/data/spectrum.ts`, which
calls the `spectrum` query; AppSync runs `amplify/functions/spectrum/handler.ts`, which checks the
caller's role, checks the values against the contract, and signs the request (AWS SigV4,
execute-api, us-east-2) with its own role's temporary credentials. It logs only the operation and
the result code, never values or records. In demo mode `src/data/local/spectrum-fake.ts` plays the
connector.
