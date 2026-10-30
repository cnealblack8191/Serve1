Data models (customers, sites, jobs, attachments, signatures, invoices) plus realistic seed data: fake HVAC/electrical customers, 3 techs, 20 jobs
Customers and sites screens connected to Amplify through src/data (reuse ECI Hub screens)
New Job screen with status flow New, Scheduled, In Progress, Complete, Invoiced
Jobs list with status colors and search
Dispatch board on web: unscheduled queue plus tech timeline, drag a job onto a tech and time to schedule it
Tech Today screen showing only the logged-in tech's jobs for today
Job detail with Start and Complete buttons, photo upload to S3, and notes
Customer signature capture on job completion
One-click invoice from a completed job, with PDF
Owner dashboard: jobs completed today and this week, revenue invoiced, open jobs by status, jobs per tech
Full demo-story Playwright test: create job, dispatch, tech completes with photo and signature, invoice, dashboard shows it
Polish pass: company logo and colors, empty states, consistent spacing
