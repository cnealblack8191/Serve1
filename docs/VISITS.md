# Multi-visit jobs

Owner, 2026-11-09 (relayed by the planning session): "merge #20, go with recommendations". The
recommendations, as approved:

1. **End of each visit.** The tech picks **Visit done, return needed** or **Job complete**.
   Job complete is offered only on the job's last open visit, and the job then goes to office
   review as before.
2. **Shared jobs.** A tech sees the other techs' notes and photos on jobs they are on, read-only.
3. **Signature.** One customer signature per job, at Job complete.

## What changes (additive only)

- **Visit table.** One row per trip, holding:
  - `jobId` and `number` (1, 2, 3…),
  - `scheduledStart` and `scheduledEnd`,
  - `assignedTechId`,
  - `status`: Scheduled, EnRoute, InProgress, OnHold, Done or Cancelled,
  - `startedAt`, `completedAt`, `holdReason`,
  - `note`, the tech's words when the visit ends.
- **Job.** `visitTechIds` lists every tech with a visit on the job.
- **Attachment, Signature and TechNote.** `jobTechIds`, a copy of that list, so those techs can
  read the row.
- **Older records.** A job with no Visit rows is one visit built from its own date, time, tech and
  status (`visitsOf` in `src/data/visits.ts`). Old records need no migration and load as before
  (`tests/old-records.spec.ts`).

## How a job and its visits stay in step

- **Current visit.** This is the first visit that is still open. The job's status follows it, so
  the existing status flow, office review and billing still work on the job.
- **Status changes.** Every tech status change mirrors onto the current visit
  (`updateJobWithVisit`, used by every move and by Complete).
- **Office edits.** When the office adds, moves or removes a visit, the job's tech and time become
  those of the current visit. The office's job views always show the current visit's tech and time
  (`withCurrentVisit`).
- **Visit done, return needed** (`finishVisit`):
  - The current visit becomes Done, with the tech's note.
  - If a later visit is planned, the job goes back to **Scheduled** for it.
  - If none is planned, the job goes **On hold**, "Needs a return visit", with the note in
    `holdNote`. This is the same hold the ECI1 phone's `return_visit` uses. When the office then
    adds a visit, the job is Scheduled again.
  - The visit is saved before the job. If the job save fails, a retry names the same visit and
    only finishes the job; it never ends the next visit. A job that is under way while its current
    visit has not started is treated as that half-saved state: Visit done and the office handover
    put the job back to Scheduled, and Job complete is refused.
- **Job complete** is refused while another visit of the job is open, checked when saving and
  not only on the screen (the office may add a visit meanwhile). If the last visit is saved Done
  but the job's save fails, the tech's screen keeps that visit (`actingVisit`), so the signature
  step stays open and its retry completes the job.
- **ECI1 bridge retries.** The bridge saves each status, Visit done and Complete together with its
  repeat marker in one DynamoDB transaction, so a retry is recognised even when the change moved
  the job to another tech's visit. Before saving Complete it reads the visits again (after the
  signature upload), and the save is conditional on the job being unchanged since it was read.
  Every office change to a job's visits writes the job, so a visit added meanwhile cancels the
  completion. The re-read bypasses the request's cached scan. After that job write, adding a
  visit reads the job once more; if a completion landed in between, the new visit is cancelled
  and the office is told, so a finished job never keeps a planned visit.
- **Double booking.** Adding a visit, from the Assign dialog or the job page's Visits panel, warns
  when it overlaps any of the tech's appointments, this job's own visits included.
- **First extra visit.** When the office adds a visit to a job that has none, visit 1 is first
  written from the job's own schedule.

## Who may do what

| Who                      | Visits                                                            | Job, photos, notes                                                                    |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Admin, Office            | Add, move, reassign, remove (not started), cancel                 | As before                                                                             |
| Owner                    | Read                                                              | Read                                                                                  |
| The current visit's tech | Move its status and note only, never its plan (field-level rules) | Work on the job once it is assigned to them (the office hands it over; see below)     |
| Another tech on the job  | Read all its visits                                               | Read only: the job, its photos, notes and signature; the server refuses their changes |
| A tech not on the job    | Nothing                                                           | Nothing                                                                               |

The rules are in `amplify/data/resource.ts`: `ownersDefinedIn("visitTechIds")` and
`ownersDefinedIn("jobTechIds")`, with field-level rules on the visit plan. The local demo backend
mirrors them (`src/data/local/index.ts`) and is tested in `tests/unit/visits.test.ts`.

## Screens

- **Dispatch board.**
  - Each visit is its own card, labelled "J-… · Visit 2 of 3", on its tech's row and day.
  - Dragging a card moves that visit only.
  - Assign offers **Add as another visit**, and **Remove this visit** for a visit that has not
    started.
- **Office job page.** A Visits panel lists the visits, with **Add visit** and **Remove visit N**.
- **Tech Today.** Lists the tech's own visits.
- **Tech job page.**
  - Shows "Visit 2 of 3" and the list of visits.
  - The tech acts only while the current visit is theirs. Otherwise the page says whose visit it
    is and when the tech's own visit is.
  - On the last open visit the tech gets **Job complete**, which leads to the signature, and
    **Visit done, return needed**. On any other visit, only Visit done.

## ECI1 bridge (additive; contract change for ECI-1X)

See `docs/ECI1-BRIDGE.md`, "Multi-visit jobs". The ECI-1X contract document
(`docs/SERV1-TECH-API.md`, in the ECI-1X repository) needs the same additions. Its own session
makes that change; this repository changes only Serv1's side.

## Handing a job to the next visit's tech

Only the office reassigns a job, and a tech never can, because that would let a tech hand a job
to anyone. When a tech ends a visit and the next visit is another tech's:

- The job stays assigned to the first tech.
- The dispatch board shows "ready for its next visit's tech" with **Hand over**.
- Any office change to the job's visits also hands it over.
- Until then, the next tech sees "Your visit is next" and cannot change the job.

The ECI1 bridge does not need this step. It checks the current visit itself, on the server.

Owner's choice, 2026-11-09: "A". The pilot keeps this manual office **Hand over**, with no new
function; a server-side handover was offered and not taken.

## Known limits (pilot)

- **The handover is a manual office step for now** (above). A small server-side handover, a custom
  mutation that checks the current visit and reassigns the job, would remove it. That needs a new
  function, so it is proposed to the owner and not built here.

- **Other techs' photos taken in Serv1's own tech screens.** These are stored under the taking
  tech's private prefix (`tech-files/<storageId>/…`). Another tech's Serv1 screen therefore lists
  the photo but can't open the image. The office can, and the ECI1 phone gets signed links for
  every photo on the job.
- **The job's own schedule fields can lag.** After a tech's Visit done, these fields catch up at the
  next office change. Screens use the visits, so nothing shows the old time.
