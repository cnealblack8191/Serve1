import { useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Home,
  Loader2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBrowseFolder } from "@/lib/sharepoint/useDocuments";
import { DOCUMENT_ROOT, type BrowseItem } from "@/lib/sharepoint/types";

function iconFor(item: BrowseItem) {
  if (item.kind === "folder") return Folder;
  if (["JPG", "JPEG", "PNG", "HEIC"].includes(item.extension)) return FileImage;
  if (["XLSX", "XLS", "CSV"].includes(item.extension)) return FileSpreadsheet;
  if (["PDF", "DOCX", "DOC"].includes(item.extension)) return FileText;
  return File;
}

/**
 * Browses the designated SharePoint document library through the backend
 * service. Folder contents come from Microsoft Graph once the tenant is
 * connected; until then the same call returns the sample structure.
 */
export function SharePointBrowser({
  initialPath = DOCUMENT_ROOT,
  title = "SharePoint documents",
  description,
  onAttach,
  className,
}: {
  initialPath?: string;
  title?: string;
  description?: string;
  /** When provided, each file gets an "Attach" action. */
  onAttach?: (item: BrowseItem) => void;
  className?: string;
}) {
  const [path, setPath] = useState(initialPath);
  const { data, isLoading } = useBrowseFolder(path);

  const crumbs = data?.breadcrumbs ?? [];

  return (
    <div className={cn("eci-card overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {description ??
              (data && !data.connected
                ? "Sample structure — real files appear here once Microsoft 365 is connected."
                : "Files stored in the company SharePoint document library.")}
          </p>
        </div>
        {data?.webUrl ? (
          <Button asChild variant="outline" size="sm">
            <a href={data.webUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" /> Open folder
            </a>
          </Button>
        ) : null}
      </div>

      <nav
        aria-label="Folder path"
        className="flex flex-wrap items-center gap-1 border-b border-border bg-surface-sunken px-5 py-2.5 text-sm"
      >
        <button
          type="button"
          onClick={() => setPath(DOCUMENT_ROOT)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-black/5 hover:text-foreground"
          aria-label="Document library root"
        >
          <Home className="size-3.5" />
        </button>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={c.path} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground/60" />
              <button
                type="button"
                disabled={last}
                onClick={() => setPath(c.path)}
                className={cn(
                  "rounded px-1.5 py-0.5",
                  last
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:bg-black/5 hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            </span>
          );
        })}
      </nav>

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading folder…
        </div>
      ) : (
        <ul className="divide-y divide-black/5">
          {(data?.items ?? []).map((item) => {
            const Icon = iconFor(item);
            const isFolder = item.kind === "folder";
            return (
              <li key={item.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-5 py-3",
                    isFolder && "cursor-pointer hover:bg-black/[0.03]",
                  )}
                  role={isFolder ? "button" : undefined}
                  tabIndex={isFolder ? 0 : undefined}
                  onClick={isFolder ? () => setPath(item.path) : undefined}
                  onKeyDown={
                    isFolder
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setPath(item.path);
                          }
                        }
                      : undefined
                  }
                >
                  <Icon
                    className={cn(
                      "size-5 shrink-0",
                      isFolder ? "text-eci-amber" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {item.kind === "file" ? (
                      <p className="text-xs text-muted-foreground">
                        {[item.extension, item.size, item.modifiedBy, item.modifiedAt]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {isFolder ? (
                    <ChevronRight className="size-4 text-muted-foreground/60" />
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      {onAttach ? (
                        <Button variant="ghost" size="sm" onClick={() => onAttach(item)}>
                          <Plus className="mr-1.5 size-3.5" /> Attach
                        </Button>
                      ) : null}
                      {item.webUrl ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={item.webUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-1.5 size-3.5" /> Open
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {(data?.items ?? []).length === 0 ? (
            <li className="px-5 py-8 text-center text-sm text-muted-foreground">
              This folder is empty.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
