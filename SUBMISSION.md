# Guest desk handoff

## Decision
I reviewed the draft before changing it. The original `/api/next-request` sorted all records, so a resolved request could be recommended, and its ID tiebreak was descending. The implementation in [server.js](./server.js#L47) considers open requests only and uses ascending IDs for exact timestamp ties.

The recommendation order is:

1. Urgent
2. Normal
3. Low

Within each urgency level, recommend the oldest request first (`createdAt` ascending), then request ID ascending for an exact tie. Resolved requests are never eligible. If no open requests remain, the endpoint returns `request: null` with an empty-queue reason.

The focused backend test is in [test/server.test.js](./test/server.test.js#L34). The existing browser code in [public/app.js](./public/app.js#L73) obtains and displays the backend's recommendation and reason, marks it handled through the existing PATCH API, then reloads the inbox and next recommendation. No frontend code change was needed.

The focused selection diff is: filter records by `status === 'open'` before sorting, and change the final ID comparison from descending (`b.id.localeCompare(a.id)`) to ascending (`a.id.localeCompare(b.id)`). The committed implementation and test are linked above.

## Why
The operator needs the next highest-priority open request, a reason for the pick, an explained empty-queue result, and a way to mark work handled before moving on. Filtering to open requests prevents already-handled work from being recommended. Urgency establishes priority across groups, while age and ID make the choice predictable within a group.

## How I checked
Setup requirement: Node.js 22.13 or newer. Observed `node --version`: `v24.22.0`.

Ran `npm.cmd test`: all 5 tests passed. The recommendation test covers an open urgent request being selected ahead of open normal and low requests, exclusion of an earlier resolved urgent request, ascending ID for an exact timestamp tie, and `request: null` with a reason when every request is resolved. Existing tests also cover server-side PATCH validation and request status updates.

Browser checks against `http://127.0.0.1:43211/`:
- The recommendation initially showed the oldest open urgent request, “Locked out of the apartment,” with a reason.
- Marking it handled updated the inbox and recommended the other open urgent request, “Help needed at the entrance.” After that, recommendations proceeded through the oldest open normal requests (“Desk lamp is not working,” then “Check the Wi-Fi connection”), then the open low request (“Extra towels for the evening”), and finally displayed “All caught up” with “No open requests remain.”
- Open, Handled, and All filters displayed the expected records; after handling all open requests, Open showed zero cards and Handled showed six.
- I simulated a server 500 response to the first PATCH. The UI showed the error, retained “5 open,” and did not show a success message. I then removed the simulated failure and confirmed a successful handled update.

Git review: `git rev-parse --show-toplevel` succeeded; the root is this project. `git status --short --branch` reports `## main...origin/main` with no changes, and `git diff origin/main...HEAD -- server.js public/app.js test/server.test.js SUBMISSION.md` is empty. The current commit is `56fd2a6` (`guest desk task`), which includes the implementation and test, so there is no separate uncommitted or branch diff to provide. The direct links above point reviewers to the committed code.

## Working with AI
AI interaction: I asked for the next open request to be recommended by urgency, then age and ID. AI review identified that resolved requests were still eligible and the original ID tie-break was descending. The implementation and focused test address those findings. I checked the committed code, ran the tests, and exercised successful and failed update paths in the browser.

## Remaining work
No known blocking gaps remain for the requested behavior. The normal/low fallback sequence and visible failed-update behavior were verified in the browser; backend automated tests do not yet explicitly assert each fallback transition.
