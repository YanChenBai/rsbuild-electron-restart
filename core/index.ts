import type { RsbuildPlugin } from '@rsbuild/core'
import { exec, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import lockfile from 'proper-lockfile'
import { readPackageSync } from 'read-pkg'

const LOCK_FILE_NAME = {
  npm: 'package-lock.json',
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
}

function detectPackageManager() {
  const path = process.env.npm_execpath
  if (path?.includes('yarn'))
    return 'yarn'
  if (path?.endsWith('\pnpm.cjs'))
    return 'pnpm'
  if (path?.endsWith('\npm-cli.js'))
    return 'npm'

  throw new Error('No package manager detected')
}

const packageManager = detectPackageManager()

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

function findRootPath() {
  let currentPath = process.cwd()
  const lockFile = LOCK_FILE_NAME[packageManager]

  while (currentPath !== '/') {
    if (existsSync(`${currentPath}/${lockFile}`))
      return currentPath

    const parentDir = path.resolve(currentPath, '../')

    if (parentDir === currentPath)
      throw new Error(`No find ${lockFile}`)

    currentPath = parentDir
  }

  throw new Error(`No find ${lockFile}`)
}

const ROOT_PATH = findRootPath()
const PID_PATH = path.resolve(ROOT_PATH, 'node_modules', '.pid')

function getPid() {
  if (!existsSync(PID_PATH))
    return
  const content = readFileSync(PID_PATH, 'utf-8')
  return Number(content)
}

async function savePid(pid: number) {
  await writeFile(PID_PATH, `${pid}`)
}

async function exit() {
  const pid = getPid()
  // 先结束之前的进程
  pid && await killProcessByPid(pid)
}

export default function (): RsbuildPlugin {
  // init .pid file
  try {
    if (!existsSync(PID_PATH))
      writeFileSync(PID_PATH, '')
  }
  catch (error) {
    console.error('Failed to create .pid file:', error)
  }

  return {
    name: 'electron-restart',
    setup: async (api) => {
      let release = async () => {}
      const rspack = api.getRsbuildConfig().tools?.rspack as { target: string }

      api.onAfterBuild(async ({ isFirstCompile, isWatch }) => {
        if (!isWatch)
          return

        const isLock = await lockfile.check(PID_PATH)
        if (isLock)
          return

        release = await lockfile.lock(PID_PATH)
        try {
          if (isFirstCompile && rspack.target !== 'electron-main')
            return

          await exit()

          const packageManager = detectPackageManager()

          if (!packageManager)
            throw new Error('No package manager detected')

          const rootPackageJson = readPackageSync({
            cwd: ROOT_PATH,
          })

          if (!rootPackageJson.main)
            throw new Error('No main field in package.json')

          // 启动新进程
          try {
            const script = `electron ${rootPackageJson.main}`
            const currentProcess = spawn(
              packageManager,
              [script],
              {
                cwd: ROOT_PATH,
                shell: true,
                stdio: 'inherit',
              },
            )

            currentProcess.pid && savePid(currentProcess.pid)
          }
          catch (error) {
            console.error('Failed to start electron:', error)
          }
        }
        finally {
          release()
        }
      })

      api.onCloseBuild(async () => {
        await release()
      })

      api.onExit(() => {
        exit()
        release()
      })
    },
  }
}
