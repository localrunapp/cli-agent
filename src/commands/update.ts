import { Command, Flags } from '@oclif/core'
import fetch from 'node-fetch'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import chalk from 'chalk'
import { pipeline } from 'stream'

const execAsync = promisify(exec)
const streamPipeline = promisify(pipeline)

export default class Update extends Command {
    static description = 'Update the LocalRun CLI'

    static flags = {
        available: Flags.boolean({ char: 'a', description: 'Check for available updates without installing' }),
        version: Flags.string({ char: 'v', description: 'Install a specific version' }),
        force: Flags.boolean({ char: 'f', description: 'Force update even if already on latest version' }),
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(Update)
        const currentVersion = this.config.version
        const platform = process.platform
        const arch = process.arch

        this.log(`Checking for updates...`)
        this.log(`Current version: ${currentVersion} (${platform}-${arch})`)

        try {
            // 1. Get latest release from GitHub
            const releasesUrl = 'https://api.github.com/repos/localrunapp/cli-agent/releases/latest'
            const response = await fetch(releasesUrl)

            if (!response.ok) {
                throw new Error(`Failed to fetch latest release: ${response.statusText}`)
            }

            const release = await response.json() as any
            const latestVersion = release.tag_name.replace(/^v/, '')

            this.log(`Latest version: ${latestVersion}`)

            if (!flags.force && !this.isNewer(latestVersion, currentVersion)) {
                this.log(chalk.green('You are already on the latest version.'))
                return
            }

            if (flags.available) {
                this.log(chalk.blue(`Update available: ${latestVersion}`))
                this.log(`Run 'localrun update' to upgrade.`)
                return
            }

            this.log(chalk.blue(`Updating to version ${latestVersion}...`))

            // 2. Find compatible asset
            const targetAsset = this.findAsset(release.assets, latestVersion, platform, arch)
            if (!targetAsset) {
                throw new Error(`No compatible update found for ${platform}-${arch} in release ${latestVersion}`)
            }

            this.log(`Downloading ${targetAsset.name}...`)

            // 3. Download and Install
            await this.installUpdate(targetAsset.browser_download_url, targetAsset.name)

            this.log(chalk.green(`Successfully updated to ${latestVersion}!`))
            this.log('Please restart your terminal session.')

        } catch (error) {
            this.error(chalk.red(`Update failed: ${(error as Error).message}`))
        }
    }

    private isNewer(latest: string, current: string): boolean {
        const lParts = latest.split('.').map(Number)
        const cParts = current.split('.').map(Number)

        for (let i = 0; i < 3; i++) {
            const l = lParts[i] || 0
            const c = cParts[i] || 0
            if (l > c) return true
            if (l < c) return false
        }
        return false
    }

    private findAsset(assets: any[], version: string, platform: string, arch: string): any {
        // Determine target string based on platform/arch
        // Mapped to clean-build.js naming convention: v{version}-{platform}-{arch}.tar.gz

        // Map process.arch to build arch
        let buildArch = arch
        if (arch === 'x64') buildArch = 'x64'
        if (arch === 'arm64') buildArch = 'arm64'

        // Map process.platform to build platform
        let buildPlatform = platform
        if (platform === 'darwin') buildPlatform = 'darwin'
        if (platform === 'linux') buildPlatform = 'linux'
        if (platform === 'win32') buildPlatform = 'win32'

        const searchPattern = `v${version}-${buildPlatform}-${buildArch}.tar.gz`

        return assets.find((a: any) => a.name === searchPattern)
    }

    private async installUpdate(url: string, filename: string): Promise<void> {
        const tmpDir = os.tmpdir()
        const tarballPath = path.join(tmpDir, filename)
        const extractDir = path.join(tmpDir, `localrun-update-${Date.now()}`)

        try {
            // Download
            const res = await fetch(url)
            if (!res.ok) throw new Error(`Failed to download asset: ${res.statusText}`)
            if (!res.body) throw new Error('Response body is empty')

            const fileStream = fs.createWriteStream(tarballPath)
            await streamPipeline(res.body as any, fileStream)

            // Extract
            await fs.promises.mkdir(extractDir, { recursive: true })

            this.log('Extracting...')
            // Check platform for extraction method
            if (process.platform === 'win32') {
                // Windows support implies powershell or tar if available. 
                // Assuming tar is available in modern Windows 10/11 or Git Bash
                await execAsync(`tar -xzf "${tarballPath}" -C "${extractDir}"`)
            } else {
                await execAsync(`tar -xzf "${tarballPath}" -C "${extractDir}"`)
            }

            // Check extracted content
            // The tarball usually contains a root folder, or directly the contents.
            // Based on clean-build.js: oclif pack tarballs
            // Oclif pack tarballs creates a directory structure: client/bin/..., client/lib/... ?
            // No, usually it packs the `dist` or similar. 
            // Checking install-macos.sh: 
            // tar -xzf localrun.tar.gz
            // sudo cp -R localrun/* "$LOCALRUN_HOME/"
            // So it extracts into a folder named 'localrun'.

            const extractedRoot = path.join(extractDir, 'localrun') // Assumption based on installer
            if (!fs.existsSync(extractedRoot)) {
                // Fallback: maybe it extracts directly?
                // Let's list the extractDir
                const files = await fs.promises.readdir(extractDir)
                if (files.length === 1 && fs.statSync(path.join(extractDir, files[0])).isDirectory()) {
                    // It might be named something else
                    // But let's stick to the install script logic: it expects 'localrun' dir
                }
            }

            const installRoot = this.config.root
            this.log(`Installing to ${installRoot}...`)

            // We need to replace contents of installRoot with contents of extractedRoot
            // Note: installRoot might be /usr/local/lib/localrun

            // Copy files
            // If we are on unix, we can use cp or rsync
            if (process.platform !== 'win32') {
                // Use cp -R
                // We might need sudo if installRoot is owned by root.
                // But the node process runs as user. If installed with sudo, we might fail here.
                // Attempt direct copy, if fail, tell user to run with sudo?

                // To avoid permission issues if running as regular user but installed as root:
                try {
                    await execAsync(`cp -R "${extractedRoot}/"* "${installRoot}/"`)
                } catch (e: any) {
                    if (e.message.includes('Permission denied')) {
                        this.warn('Permission denied. Rerunning with sudo...')
                        // Check if sudo is available
                        await execAsync(`sudo cp -R "${extractedRoot}/"* "${installRoot}/"`)
                    } else {
                        throw e
                    }
                }
            } else {
                // Windows copy
                // xcopy or robocopy
                // Or Node fs copy
                // fs.cpSync is available in Node 16+
                // recursive copy
                await fs.promises.cp(extractedRoot, installRoot, { recursive: true, force: true })
            }

        } finally {
            // Cleanup
            if (fs.existsSync(tarballPath)) fs.unlinkSync(tarballPath)
            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true })
        }
    }
}
