import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/eci/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, useEci } from "@/lib/eci/store";
import eciLogo from "@/assets/eci-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/field")({
  head: () => ({
    meta: [
      { title: "ECI Field App — Technician Work Orders" },
      {
        name: "description",
        content:
          "Mobile work order app for ECI field technicians: daily schedule, task checklists, photos, receipts, material requests and offline sync.",
      },
      { property: "og:title", content: "ECI Field App — Technician Work Orders" },
      {
        property: "og:description",
        content: "Everything a technician needs on the jobsite, online or offline.",
      },
    ],
  }),
  component: FieldApp,
});

function FieldApp() {
  const {
    role,
    currentUser,
    workOrders,
    jobs,
    materials,
    receipts,
    online,
    setOnline,
    pendingSync,
    queueOffline,
    resolveSyncItem,
    syncAll,
    setWorkOrderStatus,
    toggleTask,
    addWorkOrderNote,
    addWorkOrderPhoto,
    completeWorkOrder,
    createMaterialRequest,
  } = useEci();

  // Field users see their own assignments; office roles reviewing the field
  // app see every technician's board.
  const tech = currentUser;
  const own = workOrders.filter((w) => w.technician === tech);
  const mine = role === "Field" ? own : own.length > 0 ? own : workOrders;
  const [activeId, setActiveId] = useState<string | null>(mine[0]?.id ?? null);
  const active = mine.find((w) => w.id === activeId) ?? null;
  const activeJob = jobs.find((j) => j.id === active?.jobId);

  const [tab, setTab] = useState("schedule");
  const [note, setNote] = useState("");
  const [caption, setCaption] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [summary, setSummary] = useState("");
  const [hours, setHours] = useState("");
  const [used, setUsed] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [matItem, setMatItem] = useState("");
  const [matQty, setMatQty] = useState("");

  const offlineQueue = (label: string, kind: "Note" | "Photo" | "Receipt" | "Signature" | "Status") => {
    if (online) return false;
    queueOffline({ label, kind });
    toast("Saved on device — will sync when you're back online");
    return true;
  };

  return (
    <div className="min-h-screen bg-muted/40 py-6">
      <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[2rem] border-8 border-eci-navy bg-background shadow-2xl">
        {/* status bar */}
        <div className="flex items-center justify-between bg-eci-navy px-5 py-3 text-xs text-white">
          <span className="flex items-center gap-2 font-semibold tracking-wide">
            <img src={eciLogo.url} alt="ECI logo" width={20} height={20} className="size-5 rounded-full" />
            ECI FIELD
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${online ? "bg-emerald-400" : "bg-eci-amber"}`}
            />
            {online ? "Online" : "Offline"}
            <Switch checked={online} onCheckedChange={setOnline} />
          </span>
        </div>

        {!online ? (
          <div className="bg-eci-amber/15 px-5 py-2 text-xs text-eci-copper">
            Offline mode — work is saved on this device and queued for sync.
          </div>
        ) : null}

        <div className="px-5 py-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Today</p>
          <h1 className="text-xl font-semibold">{tech}</h1>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="pb-6">
          <TabsList className="mx-5 grid w-[calc(100%-2.5rem)] grid-cols-4">
            <TabsTrigger value="schedule">Jobs</TabsTrigger>
            <TabsTrigger value="detail">Work</TabsTrigger>
            <TabsTrigger value="materials">Parts</TabsTrigger>
            <TabsTrigger value="sync">
              Sync{pendingSync.length ? ` (${pendingSync.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="space-y-3 px-5 pt-5">
            {mine.map((w) => {
              const job = jobs.find((j) => j.id === w.jobId);
              return (
                <button
                  key={w.id}
                  onClick={() => {
                    setActiveId(w.id);
                    setTab("detail");
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    activeId === w.id ? "border-eci-amber bg-eci-amber/10" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{w.number}</span>
                    <StatusBadge status={w.priority} />
                  </div>
                  <p className="mt-1 font-medium">{w.title}</p>
                  <p className="text-sm text-muted-foreground">{job?.customer}</p>
                  <p className="text-xs text-muted-foreground">{job?.address}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{w.scheduled}</span>
                    <StatusBadge status={w.status} />
                  </div>
                  <p className="mt-2 text-xs font-medium text-eci-copper">
                    {w.tasks.filter((t) => t.done).length}/{w.tasks.length} tasks done · tap to
                    open
                  </p>
                </button>
              );
            })}
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled today.</p>
            ) : null}
          </TabsContent>

          <TabsContent value="detail" className="space-y-5 px-5 pt-5">
            {active ? (
              <>
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{active.number}</p>
                  <h2 className="text-lg font-semibold">{active.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {activeJob?.customer} · {activeJob?.address}
                  </p>
                </div>

                <div className="space-y-1 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                  <p>{active.description ?? "No scope notes on this work order."}</p>
                  <p className="text-muted-foreground">Scheduled: {active.scheduled}</p>
                  {active.siteContact ? (
                    <p className="text-muted-foreground">
                      Site contact: {active.siteContact}
                      {active.siteContactPhone ? ` · ${active.siteContactPhone}` : ""}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(["In Progress", "On Hold", "Complete"] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={active.status === s ? "default" : "outline"}
                      onClick={() => {
                        if (offlineQueue(`${active.number} set to ${s}`, "Status")) return;
                        setWorkOrderStatus(active.id, s);
                        toast.success(`Work order ${s.toLowerCase()}`);
                      }}
                    >
                      {s}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (offlineQueue(`Photo for ${active.number}`, "Photo")) return;
                      photoInputRef.current?.click();
                    }}
                  >
                    Add photo
                  </Button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result !== "string") return;
                        addWorkOrderPhoto(active.id, caption.trim(), reader.result);
                        setCaption("");
                        toast.success("Photo added to the job");
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Task checklist
                  </p>
                  {active.tasks.map((t) => (
                    <label key={t.id} className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={t.done}
                        onCheckedChange={() => toggleTask(active.id, t.id)}
                      />
                      <span className={t.done ? "text-muted-foreground line-through" : ""}>
                        {t.label}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Field notes
                  </p>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Panel schedule differs from drawings…"
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const v = note.trim();
                      if (!v) return;
                      if (!offlineQueue(`Note on ${active.number}`, "Note")) {
                        addWorkOrderNote(active.id, v);
                        toast.success("Note saved to the work order");
                      }
                      setNote("");
                    }}
                  >
                    Save note
                  </Button>
                  {active.notes.map((n) => (
                    <p key={n} className="rounded-lg bg-muted p-3 text-sm">
                      {n}
                    </p>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (offlineQueue(`Receipt for ${active.number}`, "Receipt")) return;
                      toast.success("Receipt submitted to accounts payable");
                    }}
                  >
                    Submit receipt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (offlineQueue(`Signature for ${active.number}`, "Signature")) return;
                      toast.success("Customer signature captured");
                    }}
                  >
                    Capture signature
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Job photos
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(active.photos ?? []).map((ph) => (
                      <figure key={ph.id} className="overflow-hidden rounded-lg border border-border">
                        <img
                          src={ph.src}
                          alt={ph.caption}
                          loading="lazy"
                          width={768}
                          height={576}
                          className="h-24 w-full object-cover"
                        />
                        <figcaption className="p-2 text-[11px] leading-snug text-muted-foreground">
                          {ph.caption}
                          <span className="block">{ph.at}</span>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  {(active.photos ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No photos yet.</p>
                  ) : null}
                  <Input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Photo caption — e.g. lugs after torque"
                  />
                </div>

                {active.status === "Complete" && active.completion ? (
                  <div className="space-y-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
                    <p className="text-xs uppercase tracking-widest text-emerald-700">
                      Completed {active.completion.completedAt}
                    </p>
                    <p>{active.completion.summary}</p>
                    <p className="text-muted-foreground">
                      {active.completion.hours} hrs · materials: {active.completion.materialsUsed}
                    </p>
                    <p className="text-muted-foreground">
                      Signed by {active.completion.signedBy}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-xl border border-border p-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Close out this job
                    </p>
                    <Textarea
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="Work performed summary…"
                    />
                    <Input
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      placeholder="Hours on site — e.g. 4.5"
                    />
                    <Input
                      value={used}
                      onChange={(e) => setUsed(e.target.value)}
                      placeholder="Materials used"
                    />
                    <Input
                      value={signedBy}
                      onChange={(e) => setSignedBy(e.target.value)}
                      placeholder="Customer signature name"
                    />
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (!summary.trim()) {
                          toast.error("Add a short summary of the work performed");
                          return;
                        }
                        if (
                          offlineQueue(`Completion for ${active.number}`, "Status")
                        ) {
                          setSummary("");
                          return;
                        }
                        completeWorkOrder(active.id, {
                          summary: summary.trim(),
                          hours: hours.trim() || "0",
                          materialsUsed: used.trim() || "None",
                          signedBy: signedBy.trim() || "Customer on site",
                        });
                        toast.success("Job marked complete and sent to the office");
                        setSummary("");
                        setHours("");
                        setUsed("");
                        setSignedBy("");
                      }}
                    >
                      Mark job complete
                    </Button>
                  </div>
                )}

                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    My receipts
                  </p>
                  {receipts
                    .filter((r) => r.submittedBy === tech)
                    .map((r) => (
                      <div key={r.id} className="mt-2 flex justify-between text-sm">
                        <span>{r.vendor}</span>
                        <span className="text-muted-foreground">{money(r.amount)}</span>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a work order first.</p>
            )}
          </TabsContent>

          <TabsContent value="materials" className="space-y-4 px-5 pt-5">
            <div className="space-y-2">
              <Input
                value={matItem}
                onChange={(e) => setMatItem(e.target.value)}
                placeholder="Item — e.g. 200A breaker"
              />
              <Input
                value={matQty}
                onChange={(e) => setMatQty(e.target.value)}
                placeholder="Quantity — e.g. 2 ea"
              />
              <Button
                className="w-full"
                onClick={() => {
                  if (!matItem.trim() || !active) return;
                  if (!offlineQueue(`Material request: ${matItem}`, "Note")) {
                    createMaterialRequest({
                      jobId: active.jobId,
                      jobName: activeJob?.name ?? "",
                      workOrder: active.number,
                      item: matItem,
                      qty: matQty || "1 ea",
                      requestedBy: tech,
                      requestedAt: "Today",
                      notes: "Submitted from the field app",
                    });
                    toast.success("Material request sent to the office");
                  }
                  setMatItem("");
                  setMatQty("");
                }}
              >
                Request material
              </Button>
            </div>

            <div className="space-y-2">
              {materials
                .filter((m) => m.requestedBy === tech)
                .map((m) => (
                  <div key={m.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{m.item}</p>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.qty} · {m.poNumber ?? "awaiting PO"}
                    </p>
                  </div>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="sync" className="space-y-3 px-5 pt-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {pendingSync.length} item{pendingSync.length === 1 ? "" : "s"} pending
              </p>
              <Button
                size="sm"
                disabled={!online || pendingSync.length === 0}
                onClick={() => {
                  syncAll();
                  toast.success("Synced with the office");
                }}
              >
                Sync now
              </Button>
            </div>

            {pendingSync.map((p) => (
              <div key={p.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.label}</p>
                  <StatusBadge status={p.conflict ? "On Hold" : "Pending"} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.kind} · {p.at}
                </p>
                {p.conflict ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-eci-copper">
                      This record changed in the office while you were offline.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          resolveSyncItem(p.id, "device");
                          toast.success("Kept your device version");
                        }}
                      >
                        Keep mine
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          resolveSyncItem(p.id, "server");
                          toast.success("Kept the office version");
                        }}
                      >
                        Keep office
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {pendingSync.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everything is up to date.</p>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
