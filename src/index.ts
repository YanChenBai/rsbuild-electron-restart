import type { RsbuildPlugin } from '@rsbuild/core'
import { exec, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function detectPackageManager() {
  const path = process.env.npm_execpath
  if (path?.includes('yarn'))
    return 'yarn'
  if (path?.endsWith('\pnpm.cjs'))
    return 'pnpm -w'
  if (path?.endsWith('\npm-cli.js'))
    return 'npm'
  return 'npm'
}

function isPidValid(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`tasklist /FI "PID eq ${pid}"`, (error, stdout, _stderr) => {
      if (error) {
        console.error(`Error checking PID ${pid}:`, error)
        resolve(false)
        return
      }
      // 如果 stdout 包含 PID，则表示进程存在
      resolve(stdout.includes(pid.toString()))
    })
  })
}

async function killProcessByPid(pid: number) {
  const isValid = await isPidValid(pid)
  if (!isValid)
    return

  return new Promise<void>((resolve, reject) => {
    // /F 强制终止进程
    // /T 终止指定的进程和任何由此启动的子进程
    exec(`taskkill /F /T /PID ${pid}`, (error, _stdout, _stderr) => {
      if (error) {
        console.error(`Failed to kill process ${pid}:`, error)
        reject(error)
        return
      }
      resolve()
    })
  })
}

export default function (options: { script: string }): RsbuildPlugin {
  const PID_PATH = resolve(__dirname, '.pid')
  const { script } = options
  function savePid(pid: number) {
    const pidStr = `${pid}`

    // 写入文件
    writeFileSync(PID_PATH, pidStr)
  }

  function getPid() {
    if (!existsSync(PID_PATH))
      return
    const content = readFileSync(PID_PATH, 'utf-8')
    return Number(content)
  }

  return {
    name: 'electron-restart',
    setup: (api) => {
      const rspack = api.getRsbuildConfig().tools?.rspack as { target: string }

      const exit = async () => {
        const pid = getPid()

        // 先结束之前的进程
        pid && (await killProcessByPid(pid))
      }

      api.modifyRsbuildConfig(() => exit())

      api.onBeforeBuild(async ({ isFirstCompile, isWatch }) => {
        if (isFirstCompile && rspack.target !== 'electron-main')
          return

        await exit()

        const packageManager = detectPackageManager()

        if (!packageManager)
          throw new Error('No package manager detected')

        if (!isWatch)
          return

        // 启动新进程
        try {
          const currentProcess = spawn(
            packageManager,
            ['run', script],
            {
              cwd: process.cwd(),
              shell: true,
              stdio: 'inherit',
            },
          )

          const pid = currentProcess.pid
          if (pid)
            savePid(pid)
        }
        catch (error) {
          console.error('Failed to start electron:', error)
        }
      })

      api.onExit(() => exit())
    },
  }
}
