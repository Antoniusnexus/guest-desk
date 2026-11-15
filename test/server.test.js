import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterServer } from '../server.js';

async function fixture(t, options) {
  const server = createStarterServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
}

test('the starter serves its page, script, and fictional request inbox', async t => {
  const call = await fixture(t);
  assert.match(await (await call('/')).text(), /Small requests/);
  assert.match((await call('/app.js')).headers.get('content-type'), /javascript/);
  const response = await call('/api/requests');
  assert.equal(response.status, 200);
  const { requests } = await response.json();
  assert.equal(requests.length, 6);
  assert.equal(requests.filter(item => item.status === 'open').length, 5);
});

test('handling a request is reflected by the next read and is safe to repeat', async t => {
  const call = await fixture(t);
  for (let i = 0; i < 2; i++) {
    const response = await call('/api/requests/GD-103', { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
    assert.equal(response.status, 200);
  }
  assert.equal((await (await call('/api/requests')).json()).requests.find(item => item.id === 'GD-103').status, 'resolved');
  const other = await fixture(t);
  assert.equal((await (await other('/api/requests')).json()).requests.find(item => item.id === 'GD-103').status, 'open');
});

test('next request recommends only open requests by urgency, age, then ascending ID', async t => {
  const call = await fixture(t, { requests: [
    { id: 'GD-009', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:30:00Z' },
    { id: 'GD-010', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:30:00Z' },
    { id: 'GD-001', urgency: 'urgent', status: 'resolved', createdAt: '2026-11-03T07:00:00Z' },
    { id: 'GD-002', urgency: 'normal', status: 'open', createdAt: '2026-11-03T06:00:00Z' },
    { id: 'GD-003', urgency: 'low', status: 'open', createdAt: '2026-11-03T05:00:00Z' },
  ] });

  assert.equal((await (await call('/api/next-request')).json()).request.id, 'GD-009');

  for (const id of ['GD-009', 'GD-010', 'GD-002', 'GD-003']) {
    await call(`/api/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
  }
  assert.deepEqual(await (await call('/api/next-request')).json(), {
    request: null,
    reason: 'No open requests remain.',
  });
});

test('next request excludes only open requests with a valid future snooze timestamp', async t => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const expired = new Date(Date.now() - 60 * 1000).toISOString();
  const call = await fixture(t, { requests: [
    { id: 'GD-001', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T07:00:00Z', snoozedUntil: future },
    { id: 'GD-002', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:00:00Z', snoozedUntil: expired },
    { id: 'GD-003', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:10:00Z' },
    { id: 'GD-004', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:20:00Z', snoozedUntil: 'not-a-timestamp' },
    { id: 'GD-005', urgency: 'urgent', status: 'open', createdAt: '2026-11-03T08:30:00Z', snoozedUntil: '2099-02-30T00:00:00Z' },
    { id: 'GD-000', urgency: 'urgent', status: 'resolved', createdAt: '2026-11-03T06:00:00Z' },
    { id: 'GD-006', urgency: 'normal', status: 'open', createdAt: '2026-11-03T05:00:00Z' },
    { id: 'GD-007', urgency: 'low', status: 'open', createdAt: '2026-11-03T04:00:00Z' },
  ] });

  const nextId = async () => (await (await call('/api/next-request')).json()).request.id;
  const resolve = async id => {
    const response = await call(`/api/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert.equal(response.status, 200);
  };

  assert.equal(await nextId(), 'GD-002');
  await resolve('GD-002');
  assert.equal(await nextId(), 'GD-003');
  await resolve('GD-003');
  assert.equal(await nextId(), 'GD-004');
  await resolve('GD-004');
  assert.equal(await nextId(), 'GD-005');
  await resolve('GD-005');
  assert.equal(await nextId(), 'GD-006');
  await resolve('GD-006');
  assert.equal(await nextId(), 'GD-007');
});

test('invalid updates and unknown paths do not mutate the inbox or expose source', async t => {
  const call = await fixture(t);
  for (const body of ['null', '{}', 'not-json', '{"status":"missing"}']) assert.equal((await call('/api/requests/GD-103', { method: 'PATCH', body })).status, 400);
  assert.equal((await call('/api/requests/GD-999', { method: 'PATCH', body: '{"status":"resolved"}' })).status, 404);
  assert.equal((await call('/server.js')).status, 404);
  assert.equal((await call('/package.json')).status, 404);
  assert.equal((await call('/api/requests/GD-103', { method: 'PATCH', body: ' '.repeat(4097) })).status, 413);
});

test('an empty inbox remains a successful response', async t => {
  const call = await fixture(t, { requests: [] });
  assert.deepEqual(await (await call('/api/requests')).json(), { requests: [] });
});
