#!/usr/bin/env node
/**
 * Claude-to-IM Monitor
 * Monitors the daemon and auto-restarts if needed
 */

const fs = require('fs');
const { exec } = require('child_process');

const STATUS_FILE = 'C:/Users/DXJJ/.claude-to-im/runtime/status.json';
const PROJECT_DIR = 'C:/Users/DXJJ/.claude-to-skills/Claude-to-IM';
const DAEMON_EXE = 'node dist/daemon.mjs';

const CHECK_INTERVAL = 30000; // 30 seconds
const MAX_FAILURES = 3;
let failures = 0;

function getStatus() {
  try {
    if (!fs.existsSync(STATUS_FILE)) {
      return { running: false };
    }
    const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    return status;
  } catch (e) {
    return { running: false, error: e.message };
  }
}

function isProcessRunning(pid) {
  return new Promise((resolve) => {
    exec(`tasklist /FI "PID eq ${pid}"`, (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(stdout.includes(`${pid}`));
    });
  });
}

async function checkDaemon() {
  const status = getStatus();

  if (!status.running) {
    console.log('[Monitor] 守护进程未运行，正在启动...');
    return startDaemon();
  }

  const isRunning = await isProcessRunning(status.pid);
  if (!isRunning) {
    console.log(`[Monitor] 守护进程 (PID ${status.pid}) 未运行，正在重启...`);
    failures++;
    return startDaemon();
  }

  failures = 0;
  console.log(`[Monitor] ✓ 守护进程运行正常 (PID: ${status.pid}, 通道: ${status.channels.join(', ')})`);
}

function startDaemon() {
  return new Promise((resolve, reject) => {
    console.log('[Monitor] 启动守护进程...');

    const env = {
      CTI_CLAUDE_CODE_EXECUTABLE: 'C:\\Users\\DXJJ\\.vscode\\extensions\\anthropic.claude-code-2.1.94-win32-x64\\resources\\native-binary\\claude.exe',
      CLAUDE_CODE_GIT_BASH_PATH: 'C:\\Git\\bin\\bash.exe'
    };

    const proc = exec('node dist/daemon.mjs', {
      cwd: PROJECT_DIR,
      env: { ...process.env, ...env },
      detached: true,
      windowsHide: true
    }, (err) => {
      if (err) {
        console.error('[Monitor] 启动失败:', err.message);
        failures++;
        if (failures >= MAX_FAILURES) {
          console.error('[Monitor] 达到最大失败次数，停止监控');
          reject(new Error('Max failures reached'));
        } else {
          resolve();
        }
      } else {
        console.log('[Monitor] ✓ 守护进程启动成功');
        failures = 0;
        resolve();
      }
    });

    proc.unref();
  });
}

async function run() {
  console.log('[Monitor] Claude-to-IM 监控启动');
  console.log('[Monitor] 检查间隔:', CHECK_INTERVAL / 1000, '秒');
  console.log('[Monitor] 按 Ctrl+C 停止\n');

  while (true) {
    try {
      await checkDaemon();
    } catch (e) {
      console.error('[Monitor] 错误:', e.message);
      break;
    }

    // Wait for next check
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }

  console.log('[Monitor] 监控已停止');
}

run().catch(err => {
  console.error('[Monitor] 致命错误:', err);
  process.exit(1);
});
