import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';
import { join } from 'path';

describe('Server Smoke Test', () => {
  let serverProcess: ReturnType<typeof spawn>;
  const port = 3333;

  beforeAll((done) => {
    serverProcess = spawn('bun', ['run', join(__dirname, 'index.ts')], {
      env: { ...process.env, PORT: port.toString(), GIT_GRAPH_WEB_DATA_DIR: join(__dirname, '..', '.test-data') }
    });
    
    serverProcess.stdout?.on('data', (data) => {
      if (data.toString().includes(`http://localhost:${port}`)) {
        done();
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error(data.toString());
    });
  });

  afterAll(() => {
    serverProcess.kill();
  });

  test('server serves index.html', async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Git Graph Web');
    expect(text).toContain('<div id="app"></div>');
  });
});
