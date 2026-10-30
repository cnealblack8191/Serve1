# Roadmap

- [x] Add pie graphs to dashboard metrics.
- [x] Review the uploaded Sales and Service pipeline workbooks and map their columns cleanly.
- [x] Bulk-add non-duplicate workbook rows to CRM with import activity records.
- [x] Add CRM scope toggle: All, Sales, Service.
- [x] Verify imported records, filters, dashboard build, and responsive CRM display.
- [x] OneDrive folder browser preview (seed data) embedded on job and bid pages; real connection pending user approval of the connect card.
- [x] SharePoint document architecture: document_refs / document_links / document_locations tables, server-only Graph layer with preview provider, DocumentsPanel + SharePointBrowser, /documents navigation, panels on client, opportunity, bid and job records, generated quote PDFs referenced against the bid.
- [x] Centralized communications service: message_threads / messages / message_links / message_attachments / mailbox_sync_state, server-only shared-mailbox Graph layer with preview provider, comms.functions.ts as the single email API, automatic CRM address matching, legacy email history imported, /communications Inbox-Sent-Drafts-Archived with compose/reply/reply all/forward, CommunicationsPanel on client, opportunity, bid and job records, invoice send.
- [x] Bid opportunity intake: bid_intake table, modular classification/extraction layer, mailbox screening, review queue at /intake with corrections, customer matching that never silently duplicates, BID creates a CRM opportunity (documents + originating email filed against it), NO BID retained as history.
- [x] Direct Microsoft 365 connection (no third-party broker): ms365_settings table (RLS with no policies, service-role/server access only), server-side settings loader with env-var precedence, admin-only /integrations screen to enter ECI's own Azure app registration (tenant/client/secret, shared mailbox, site + drive IDs) with a live "Test connection" against Microsoft, and Remove connection. Mail and SharePoint providers switch from preview to live automatically once saved.
- [x] Communications wired across Estimating, Invoicing, Work Orders and Jobs through the one service: messages.purpose + templates, Send bid/proposal with document picker and preview, Send invoice + manual invoice reminders (architecture ready for automated reminders), work-order scheduling/confirmation/technician/completion/follow-up emails, unified activity timeline on client, opportunity, bid and job records.
- [ ] Customer-side Microsoft setup: create the Entra app registration, grant Mail.ReadWrite / Mail.Send (scoped to the one shared mailbox via ApplicationAccessPolicy) and Sites.Selected on the single ECI library, then enter the IDs on /integrations.
- [x] Material request flow: manager approval email, then materials manager
