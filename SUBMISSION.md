# Guest desk handoff

## Decision
I reviewed the draft before changing it. The original `/api/next-request` sorted all records, so a resolved request could be recommended, and its ID tiebreak was descending. I changed the backend to consider open requests only and use ascending IDs for exact timestamp ties.

The recommendation order is:

1. Urgent
2. Normal
3. Low

Within each urgency level, recommend the oldest request first (`createdAt` ascending), then request ID ascending for an exact tie. Resolved requests are never eligible. If no open requests remain, the endpoint returns `request: null` with an empty-queue reason.

The change is in `server.js`, in `GET /api/next-request`; the focused backend test is in `test/server.test.js`. The existing browser code in `public/app.js` already obtains and displays the backend's recommendation and reason, marks the recommendation handled through the existing PATCH API, then reloads the inbox and next recommendation. No frontend code change was needed.

## Why
The operator needs the next highest-priority open request, a reason for the pick, an explained empty-queue result, and a way to mark work handled before moving on. Filtering to open requests prevents already-handled work from being recommended. Urgency establishes priority across groups, while age and ID make the choice predictable within a group.

## How I checked
Setup requirement: Node.js 22.13 or newer. Observed `node --version`: `v24.22.0`.

Ran `npm.cmd test`: all 5 tests passed. The new recommendation test covers an open urgent request being selected ahead of open normal and low requests, exclusion of an earlier resolved urgent request, ascending ID for an exact timestamp tie, and `request: null` with a reason when every request is resolved. Existing tests also cover server-side PATCH validation and request status updates.

I did not run browser checks. Normal/low fallback after higher-priority requests are handled, UI filters, the displayed recommendation reason, and a failed update's visible UI state still need browser-level verification.

I could not produce a Git diff: this workspace is not currently inside a Git repository (`git status --short --branch` reported `fatal: not a git repository`). The focused change summary above identifies the modified files; once this workspace is in the intended repository, review with `git diff -- server.js test/server.test.js SUBMISSION.md`. I have not initialized or altered Git setup.

## Working with AI
AI assistance helped identify the resolved-request filter and the ID tie-break, and turn the ordering requirement into a focused test. I compared the result with the requirements and ran the test suite; the UI behavior remains unverified in a browser.

## Remaining work
Verify the browser flows listed above. Consider adding backend coverage that resolves all urgent requests and checks the oldest open normal request, then resolves the normal requests and checks the oldest open low request. Capture the Git diff after this workspace is connected to its intended repository.
