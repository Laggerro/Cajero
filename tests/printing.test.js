const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildWelcomeTicket,
  createPrintServer,
  migrateCounterFile,
  validateTicketData
} = require('../server');
const testConfig = {
  atmWidth: 1080,
  atmHeight: 720,
  videoWidth: 850,
  videoHeight: 360,
  sideColumnWidth: 38,
  buttonGap: 80,
  buttonTopMargin: 0,
  buttonFontSize: 16,
  buttonHeight: 48,
  contentTextFontSize: 16,
  amountFontSize: 36,
  inactivitySeconds: 60,
  processCarouselIntervalSeconds: 6,
  participantsCarouselIntervalSeconds: 3,
  carouselPauseSeconds: 10,
  carouselInactivitySeconds: 60,
  processCarouselWidth: 100,
  processCarouselHeight: 330,
  participantsCarouselWidth: 100,
  participantsCarouselHeight: 280
};

function requestJson(port, {
  origin = 'http://localhost',
  method = 'POST',
  path = '/api/tickets',
  body = {}
} = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: origin,
        'Content-Type': 'application/json'
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
        });
      });
    });
    request.on('error', reject);
    request.end(method === 'GET' ? undefined : JSON.stringify(body));
  });
}

async function startTestServer(options) {
  const server = createPrintServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

test('welcome ticket has the raffle number and no operation details', () => {
  const ticket = buildWelcomeTicket({
    ticketNumber: 12,
    dni: '48123456',
    name: 'González Lucas',
    date: new Date('2026-10-22T12:00:00.000Z')
  }).toString('latin1');

  assert.match(ticket, /EXPO TECNO CONTABLE/);
  assert.match(ticket, /ISD 2026/);
  assert.match(ticket, /NOMBRE: González Lucas/);
  assert.match(ticket, /DNI: 48123456/);
  assert.match(ticket, /NRO\. CORRELATIVO: 000012/);
  assert.match(ticket, /Gracias por usar nuestro/);
  assert.doesNotMatch(ticket, /SALDO|RETIRO|TRANSFERENCIA|TOTAL:/);
  assert.ok(ticket.includes('\x1dVA\x03'));
});

test('visitor ticket prints DNI but no invented student name', () => {
  const ticket = buildWelcomeTicket({ ticketNumber: 1, dni: '48123456', name: '' }).toString('latin1');
  assert.match(ticket, /DNI: 48123456/);
  assert.doesNotMatch(ticket, /NOMBRE:/);
});

test('ticket data accepts only a seven- or eight-digit DNI', () => {
  assert.throws(() => validateTicketData({ dni: '123' }), /DNI debe/);
  assert.throws(() => validateTicketData({ dni: '12345678', name: 'No se acepta' }), /solo debe incluir el DNI/);
  assert.deepEqual(validateTicketData({ dni: '48123456' }), { dni: '48123456' });
});

test('shared cajero configuration is persisted as JSON and validates values', async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ebank-config-test-'));
  const configPath = path.join(temporaryDirectory, 'cajero-config.json');
  const server = await startTestServer({
    configPath,
    allowedOrigins: ['http://localhost'],
    logError: () => {},
    print: async () => {}
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const missing = await requestJson(server.address().port, { method: 'GET', path: '/api/config' });
  assert.deepEqual(missing, { statusCode: 200, body: { config: null } });

  const updatedConfig = { ...testConfig, atmWidth: 1200 };
  const saved = await requestJson(server.address().port, {
    path: '/api/config',
    body: updatedConfig
  });
  const loaded = await requestJson(server.address().port, { method: 'GET', path: '/api/config' });
  const stored = JSON.parse(await fs.readFile(configPath, 'utf8'));

  assert.deepEqual(saved, { statusCode: 200, body: { ok: true, config: updatedConfig } });
  assert.deepEqual(loaded, { statusCode: 200, body: { config: updatedConfig } });
  assert.deepEqual(stored, updatedConfig);

  const invalid = await requestJson(server.address().port, {
    path: '/api/config',
    body: { ...testConfig, atmWidth: 10 }
  });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')), updatedConfig);
});

test('ticket history migrates from the previous location without losing data', async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ebank-counter-migration-test-'));
  const sourcePath = path.join(temporaryDirectory, 'old', 'contador-tickets.json');
  const destinationPath = path.join(temporaryDirectory, 'app', 'contador-tickets.json');
  const existingState = JSON.stringify({ lastNumber: 4, usedDnis: { '48123456': 4 } });
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, existingState);
  t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  assert.equal(await migrateCounterFile(sourcePath, destinationPath), true);
  assert.equal(await fs.readFile(destinationPath, 'utf8'), existingState);
  await assert.rejects(fs.access(sourcePath), { code: 'ENOENT' });
  assert.equal(await migrateCounterFile(sourcePath, destinationPath), false);
  assert.equal(await fs.readFile(destinationPath, 'utf8'), existingState);
});

test('ticket numbers stay unique across concurrent service instances', async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ebank-print-test-'));
  const counterPath = path.join(temporaryDirectory, 'counter.json');
  const studentsPath = path.join(temporaryDirectory, 'alumnos.json');
  await fs.writeFile(studentsPath, JSON.stringify([
    { dni: '48123456', nombre: 'Lucas', apellido: 'González' }
  ]));
  const printedTickets = [];
  const print = async (ticket) => printedTickets.push(ticket.toString('latin1'));
  const options = { counterPath, studentsPath, allowedOrigins: ['http://localhost'], print };
  options.logError = () => {};
  const servers = await Promise.all([startTestServer(options), startTestServer(options)]);
  t.after(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const [first, second] = await Promise.all(servers.map((server, index) => requestJson(server.address().port, {
    body: { dni: index === 0 ? '48123456' : '12345678' }
  })));
  const numbers = [first.body.ticketNumber, second.body.ticketNumber].sort((a, b) => a - b);

  assert.deepEqual(numbers, [1, 2]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(printedTickets.length, 2);
  assert.ok(printedTickets.some((ticket) => ticket.includes('NOMBRE: Lucas González')));
  assert.ok(printedTickets.some((ticket) => !ticket.includes('NOMBRE:')));

  const forbidden = await requestJson(servers[0].address().port, {
    origin: 'https://example.invalid',
    body: { dni: '48123456' }
  });
  assert.equal(forbidden.statusCode, 403);
});

test('each DNI can only reserve and print one ticket, even concurrently', async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ebank-print-duplicate-test-'));
  const counterPath = path.join(temporaryDirectory, 'counter.json');
  const studentsPath = path.join(temporaryDirectory, 'alumnos.json');
  await fs.writeFile(studentsPath, '[]');
  const printedTickets = [];
  const options = {
    counterPath,
    studentsPath,
    allowedOrigins: ['http://localhost'],
    logError: () => {},
    print: async (ticket) => printedTickets.push(ticket.toString('latin1'))
  };
  const servers = await Promise.all([startTestServer(options), startTestServer(options)]);
  t.after(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const attempts = await Promise.all(servers.map((server) => requestJson(server.address().port, {
    body: { dni: '48123456' }
  })));
  const successful = attempts.filter((attempt) => attempt.statusCode === 200);
  const duplicate = attempts.filter((attempt) => attempt.statusCode === 409);

  assert.equal(successful.length, 1);
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].body.alreadyUsed, true);
  assert.equal(duplicate[0].body.ticketNumber, successful[0].body.ticketNumber);
  assert.equal(printedTickets.length, 1);

  const laterAttempt = await requestJson(servers[0].address().port, {
    body: { dni: '48123456' }
  });
  assert.equal(laterAttempt.statusCode, 409);
  assert.equal(printedTickets.length, 1);
});

test('reprinting a used DNI keeps its assigned ticket number', async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ebank-print-reprint-test-'));
  const counterPath = path.join(temporaryDirectory, 'counter.json');
  const studentsPath = path.join(temporaryDirectory, 'alumnos.json');
  await fs.writeFile(studentsPath, JSON.stringify([
    { dni: '48123456', nombre: 'Lucas', apellido: 'González' }
  ]));
  const printedTickets = [];
  const server = await startTestServer({
    counterPath,
    studentsPath,
    allowedOrigins: ['http://localhost'],
    logError: () => {},
    print: async (ticket) => printedTickets.push(ticket.toString('latin1'))
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const original = await requestJson(server.address().port, { body: { dni: '48123456' } });
  const reprint = await requestJson(server.address().port, {
    path: '/api/tickets/reprint',
    body: { dni: '48123456' }
  });
  const nextTicket = await requestJson(server.address().port, { body: { dni: '12345678' } });
  const assignedTickets = await requestJson(server.address().port, {
    method: 'GET',
    path: '/api/tickets/used'
  });

  assert.equal(original.statusCode, 200);
  assert.deepEqual(reprint, {
    statusCode: 200,
    body: { ok: true, reprinted: true, ticketNumber: original.body.ticketNumber }
  });
  assert.equal(nextTicket.body.ticketNumber, original.body.ticketNumber + 1);
  assert.deepEqual(assignedTickets.body.usedDnis, [
    { dni: '48123456', ticketNumber: original.body.ticketNumber },
    { dni: '12345678', ticketNumber: nextTicket.body.ticketNumber }
  ]);
  assert.equal(printedTickets.length, 3);
  assert.equal(printedTickets[0].match(/NRO\. CORRELATIVO: 000001/) !== null, true);
  assert.equal(printedTickets[1].match(/NRO\. CORRELATIVO: 000001/) !== null, true);
  assert.match(printedTickets[1], /NOMBRE: Lucas González/);
});

test('a number reserved for a failed print is never reused', async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ebank-print-failure-test-'));
  const counterPath = path.join(temporaryDirectory, 'counter.json');
  const studentsPath = path.join(temporaryDirectory, 'alumnos.json');
  await fs.writeFile(studentsPath, '[]');
  let failNextPrint = true;
  const server = await startTestServer({
    counterPath,
    studentsPath,
    allowedOrigins: ['http://localhost'],
    logError: () => {},
    print: async () => {
      if (failNextPrint) {
        failNextPrint = false;
        throw new Error('Impresora desconectada');
      }
    }
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const failed = await requestJson(server.address().port, { body: { dni: '48123456' } });
  const duplicate = await requestJson(server.address().port, { body: { dni: '48123456' } });
  const succeeding = await requestJson(server.address().port, { body: { dni: '12345678' } });

  assert.equal(failed.statusCode, 500);
  assert.equal(duplicate.statusCode, 409);
  assert.deepEqual(succeeding, { statusCode: 200, body: { ok: true, ticketNumber: 2 } });
});
