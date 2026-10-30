# ECI Project Hub

Create a responsive construction business management application for Electrical Contractor Inc. (ECI). Build both:

1. A desktop-first web application for office and management users.

2. An iPhone and Android mobile application for field technicians.

DESIGN STYLE

Use ECI branding with placeholders for the official ECI logo and exact brand colors.

The visual style should resemble modern construction management software, but it must be spacious, clean, simple, and easy to understand. Avoid overcrowded screens.

Use:

- Left-side navigation on desktop

- Summary cards above activity lists

- Clear status badges

- Large readable headings

- Plenty of white space

- Simple forms

- Responsive desktop and tablet layouts

- Large touch targets on mobile

USER ROLES

Create role-based layouts and permissions for:

- Accounts Payable

- Accounts Receivable

- Service Manager / Coordinator

- Field Technician

- Division Manager

Use preset permissions by role. The Division Manager can customize permissions, restrict users to assigned jobs, and create individual permission exceptions.

DESKTOP NAVIGATION

Create these primary navigation sections:

- Dashboard

- CRM & Opportunities

- Estimating & Bids

- Jobs & Work Orders

- Materials

- Invoices & Accounting

Include a top bar containing:

- Global search

- Add New button

- Notifications

- User profile

- Company selector placeholder for future commercial use

COMPANY DASHBOARD

Create a combined company overview dashboard.

At the top, show spacious summary cards for:

- New opportunities

- Active bids

- Active jobs

- Open work orders

- Revenue

- Outstanding invoices

- Open material requests

- Overdue tasks and alerts

Below the cards, show:

- Opportunity pipeline by stage

- Active jobs and work orders

- Revenue and invoice-status summary

- Recent material requests

- Alerts and overdue tasks

- Recent activity

Use summary cards above activity lists.

CRM AND OPPORTUNITIES

Allow users to switch between:

- Kanban pipeline

- Sortable table

- Follow-up/calendar view

Opportunity stages:

1. New Opportunity

2. Bid or No-Bid Decision

3. Approved to Estimate

The New Opportunity form must include:

- Customer

- Customer contact

- Opportunity name

- Project address

- Job type

- Division

- Expected bid date

- Description

- Notes

- Assigned employee

- Uploaded documents

Each opportunity record should use these main tabs:

- Overview

- Contacts

- Estimate & Quote

- Invoices

Also include an activity-history panel showing stage changes, notes, emails, documents, reminders, and responsible employees.

ESTIMATING AND BIDS

An approved opportunity becomes a bid.

Bid stages:

1. Estimating

2. Awaiting Approval

3. Ready to Send

4. Sent to Customer

5. Won

Create a spreadsheet-style estimate editor.

The estimate editor should support:

- Manually adding line items

- Importing Spectrum cost codes and estimate items

- Uploading an existing estimate

- Labor, materials, equipment, subcontractor, and other cost categories

- Quantity

- Unit

- Unit cost

- Markup

- Extended cost

- Selling price

- Internal notes

- Customer-facing description

- Estimate totals

- Quote preview

Include placeholder buttons for:

- Import from Spectrum

- Upload Estimate

- Add Line Item

- Save Draft

- Submit for Approval

- Preview Quote

QUOTE APPROVAL

Use a standard approval group, with the ability to modify approvers based on:

- Customer

- Job type

- Manually selected approvers

When submitted, move the bid to Awaiting Approval and notify the required approvers.

Approvers should be able to:

- Approve

- Reject

- Request changes

- Add comments

After final approval:

- Generate a branded ECI quote PDF

- Move the bid to Ready to Send

- Display the PDF for employee review

- Prepare a Spectrum record

- Do not automatically email the customer

The employee reviews the quote and sends it manually from the application through Microsoft 365.

CUSTOMER COMMUNICATIONS

Create an email composer inside the application with:

- Microsoft 365 integration placeholder

- Customer recipient selection

- Reusable email templates

- Editable subject and message

- Document and PDF attachments

- Quote attachment

- Email history

- Send button

JOB CREATION

When a bid is marked Won:

- Prompt the employee to create a job

- Copy customer contacts

- Copy documents

- Copy activity history

- Copy quote and estimate information

- Send or prepare job data for Spectrum

- Show integration success or error status

Use Spectrum placeholders for:

- Jobs and phases

- Work orders

- Cost codes and estimate items

- Purchase orders

- Accounts Receivable invoices

JOBS AND WORK ORDERS

Create a job list and job detail page.

The job detail page should prominently show:

- Job name

- Customer

- Project address

- Job status

- Division

- Assigned manager

- Spectrum job number

- Open work orders

Use these primary record tabs:

- Overview

- Contacts

- Estimate & Quote

- Invoices

Include related work orders, documents, photos, receipts, history, and communications within the appropriate tab or expandable panels.

MATERIALS

Create a material-request tracking page with these statuses:

- Requested

- Ordered

- Delivered

Notify the technician when the material-request status changes.

Show:

- Job

- Work order

- Requested item

- Quantity

- Requested by

- Date requested

- Current status

- Purchase-order number

- Notes

ACCOUNTS RECEIVABLE

Create an invoice workspace where AR users can:

- Create an invoice in Spectrum

- View invoice status

- View payment status

- Email an invoice to the customer

- Record notes and follow-ups

- Attach supporting documents

Use status badges such as:

- Draft

- Submitted to Spectrum

- Sent

- Partially Paid

- Paid

- Overdue

ACCOUNTS PAYABLE

Create an AP workspace focused on:

- Matching technician receipts to purchase orders

- Identifying unmatched receipts

- Resolving missing documentation

- Viewing the associated job and work order

- Adding internal notes

- Marking documentation complete

DOCUMENT STORAGE

Include a company-level setting that allows each company to choose:

- Microsoft OneDrive or SharePoint

- AWS S3

All uploaded files and generated PDFs should display inside the appropriate opportunity, bid, job, work order, purchase order, or invoice record.

FIELD TECHNICIAN MOBILE APP

Use bottom navigation with:

- Assigned Jobs

- Work Orders

- Camera / Upload

- Profile / Sync

The technician home screen should primarily show assigned jobs and work orders.

Each assigned-job card should show:

- Job name

- Customer

- Address

- Work-order number

- Priority

- Status

- Scheduled date

When a technician opens a job, show the following first:

- Job summary

- Customer

- Project address

- Directions button

Below the summary, provide access to:

- Work orders and tasks

- Photos and receipts

- Notes

- Status updates

OFFLINE MOBILE SUPPORT

The technician must be able to do these things without internet:

- View assigned jobs

- View assigned work orders

- Add notes

- Take and save photos

- Upload or photograph receipts

- Capture customer signatures

Show an offline indicator and pending-sync count.

When internet service returns:

- Sync automatically

- Show sync progress

- Only interrupt the technician if conflicting record changes are detected

- Provide a conflict-resolution screen

NOTIFICATIONS

Send notifications for:

- Opportunity or bid stage changes

- Quote awaiting approval

- Work-order updates

Use Microsoft 365 email as the main delivery method. Include user settings allowing each user to choose which notifications they receive.

Also include an in-app notification list for visibility.

PROTOTYPE REQUIREMENTS

The clickable prototype must demonstrate this complete journey:

1. Create a new opportunity

2. Make the bid or no-bid decision

3. Approve the opportunity for estimating

4. Build an estimate

5. Submit the quote for approval

6. Approve the quote

7. Generate and preview the branded PDF

8. Review and send the quote

9. Mark the bid Won

10. Prompt the user to create the job

11. Demonstrate sending the job to Spectrum

12. Show the resulting active job

Use realistic sample electrical-construction data throughout the prototype.

For Spectrum, Microsoft 365, OneDrive, SharePoint, and AWS actions, create polished simulated integration states, including:

- Connecting

- Successful

- Failed

- Retry

- Last synchronized

- View integration details

Do not attempt to build the real integrations in this initial clickable prototype.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/76b818ad-d080-473d-8a32-bc049339e1fa).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
