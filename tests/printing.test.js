const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildWelcomeTicket, createPrintServer, validateTicketData } = require('../server');

function requestJson(port, { origin = 'http://localhost', body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/tickets',
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
    request.end(JSON.stringify(body));
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
