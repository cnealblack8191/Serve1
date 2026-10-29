import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/eci/AppShell";
import { PageHeader } from "@/components/eci/primitives";
import { SharePointBrowser } from "@/components/eci/SharePointBrowser";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — ECI Serve One" },
      {
        name: "description",
        content:
          "Browse the company SharePoint document library for clients, bids, jobs, work orders and invoices without leaving Serve One.",
      },
      { property: "og:title", content: "Documents — ECI Serve One" },
      {
        property: "og:description",
        content:
          "Client, bid, job and invoice documents from the company SharePoint library, inside Serve One.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Documents"
        description="Company SharePoint library — clients, bids, jobs, work orders and invoices."
      />
      <SharePointBrowser title="Company document library" />
    </AppShell>
  );
}
