import { spawnSync } from 'node:child_process'
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const publicKeyPath = fileURLToPath(new URL('../keys/release-public-key.pem', import.meta.url))
const matrix = {
  'vani-desktop': ['darwin-arm64:zip'],
  'vani-daemon': ['darwin-arm64:tar.gz', 'linux-x64:tar.gz'],
  resume: ['darwin-arm64:binary', 'linux-x64:binary'],
  vault: ['node:tar.gz'],
  tasks: ['darwin-arm64:binary', 'linux-x64:binary']
}
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/
const commitPattern = /^[a-f0-9]{40}$/
const manifestName = 'release-manifest.json'
const signatureName = 'release-manifest.sig'

function requireValue(condition, message) {
  if (!condition) throw Error(message)
}

function validateComponents(components) {
  const names = Object.keys(components ?? {})
  requireValue(Object.keys(matrix).every(name => name === 'vani-desktop' || names.includes(name))
    && names.every(name => Object.hasOwn(matrix, name)), 'All four CLI components are required; desktop is optional')
}

function validateRelease(manifest, checkDigests = true) {
  requireValue(manifest.format === 'vani-release-v1', 'Unsupported manifest format')
  requireValue(versionPattern.test(manifest.version), 'Invalid release version')
  requireValue(['preview', 'stable'].includes(manifest.channel), 'Invalid release channel')
  requireValue(manifest.channel !== 'stable' || !manifest.version.includes('-'), 'Stable requires a final version')
  const compatibility = manifest.compatibility
  requireValue(compatibility && Number.isInteger(compatibility.hostProtocol?.major)
    && compatibility.hostProtocol.major >= 0 && Number.isInteger(compatibility.hostProtocol.minor)
    && compatibility.hostProtocol.minor >= 0 && /^\d+\.\d+\.\d+$/.test(compatibility.nodeMinimum)
    && Number.isInteger(compatibility.tasksProjectSchema) && compatibility.tasksProjectSchema > 0,
  'Invalid compatibility contract')
  validateComponents(manifest.components)
  const names = new Set()
  for (const [component, input] of Object.entries(manifest.components)) {
    const required = matrix[component]
    requireValue(input && versionPattern.test(input.version) && commitPattern.test(input.commit), `${component}: invalid version or full source commit`)
    requireValue(Array.isArray(input.artifacts), `${component}: artifacts are required`)
    const platforms = new Set()
    for (const artifact of input.artifacts) {
      const platform = `${artifact.platform}:${artifact.kind}`
      const optionalDmg = component === 'vani-desktop' && platform === 'darwin-arm64:dmg'
      requireValue((required.includes(platform) || optionalDmg) && !platforms.has(platform), `${component}: unsupported or duplicate platform/kind`)
      platforms.add(platform)
      requireValue(typeof artifact.file === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(artifact.file)
        && artifact.file.startsWith(`${component}-`) && !names.has(artifact.file), `${component}: unsafe or duplicate asset filename`)
      names.add(artifact.file)
      if (checkDigests) requireValue(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && artifact.bytes < 2 ** 31
        && /^[a-f0-9]{64}$/.test(artifact.sha256), `${component}: invalid asset size or hash`)
    }
    requireValue(required.every(platform => platforms.has(platform)), `${component}: incomplete platform matrix`)
  }
  return names
}

async function digest(file) {
  const stat = await lstat(file)
  requireValue(stat.isFile(), 'Assets must be regular files, not symlinks')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return { bytes: stat.size, sha256: hash.digest('hex') }
}

async function prepare(options) {
  requireValue(options.plan && options.output && options.credentials, 'prepare requires --plan, --output and --credentials')
  const planFile = resolve(options.plan)
  const plan = JSON.parse(await readFile(planFile, 'utf8'))
  requireValue(plan.format === 'vani-release-plan-v1', 'Unsupported plan format')
  validateComponents(plan.components)
  const key = createPrivateKey(JSON.parse(await readFile(options.credentials, 'utf8')).privateKey)
  const publicKey = createPublicKey(await readFile(options['public-key'] ?? publicKeyPath))
  requireValue(key.asymmetricKeyType === 'ed25519' && publicKey.asymmetricKeyType === 'ed25519'
    && createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(publicKey.export({ type: 'spki', format: 'der' })), 'Signing key does not match the pinned Ed25519 public key')
  const manifest = { format: 'vani-release-v1', version: plan.version, channel: plan.channel,
    compatibility: {
      hostProtocol: { major: plan.compatibility?.hostProtocol?.major, minor: plan.compatibility?.hostProtocol?.minor },
      nodeMinimum: plan.compatibility?.nodeMinimum, tasksProjectSchema: plan.compatibility?.tasksProjectSchema
    }, components: {} }
  const copies = []
  for (const component of Object.keys(plan.components)) {
    const paths = plan.components[component]
    requireValue(Array.isArray(paths) && paths.length > 0, `${component}: release inputs are required`)
    const combined = { artifacts: [] }
    for (const path of paths) {
      const inputPath = resolve(dirname(planFile), path)
      const input = JSON.parse(await readFile(inputPath, 'utf8'))
      requireValue(input.component === component, `${component}: input component mismatch`)
      requireValue(versionPattern.test(input.version) && commitPattern.test(input.commit), `${component}: invalid version or full source commit`)
      requireValue(!input.staged, 'Download staged build artifacts before preparing a release')
      requireValue(!combined.version || (combined.version === input.version && combined.commit === input.commit), `${component}: input versions or commits disagree`)
      combined.version = input.version
      combined.commit = input.commit
      requireValue(Array.isArray(input.artifacts), `${component}: artifacts are required`)
      for (const artifact of input.artifacts) {
        const file = basename(artifact.path)
        copies.push({ source: resolve(dirname(inputPath), artifact.path), file })
        // Metadata is filled from the copied bytes, never trusted from the build input.
        combined.artifacts.push({ file, platform: artifact.platform, kind: artifact.kind })
      }
    }
    manifest.components[component] = combined
  }
  validateRelease(manifest, false)
  const output = resolve(options.output)
  // mkdir must succeed before entering cleanup: an existing output is never removed.
  await mkdir(output, { recursive: false })
  try {
    for (const { source, file } of copies) {
      requireValue((await lstat(source)).isFile(), 'Assets must be regular files, not symlinks')
      await copyFile(source, join(output, file))
    }
    for (const input of Object.values(manifest.components)) {
      for (const artifact of input.artifacts) Object.assign(artifact, await digest(join(output, artifact.file)))
    }
    validateRelease(manifest)
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
    await writeFile(join(output, manifestName), bytes)
    await writeFile(join(output, signatureName), sign(null, bytes, key))
    await verifyDirectory({ ...options, input: output })
  } catch (error) {
    await rm(output, { recursive: true, force: true })
    throw error
  }
  console.log(`Prepared ${manifest.version}: ${Object.keys(manifest.components).length} components, ${copies.length} assets`)
}

async function verifyDirectory(options) {
  requireValue(options.input, 'verify/draft requires --input')
  const directory = resolve(options.input)
  for (const name of [manifestName, signatureName]) requireValue((await lstat(join(directory, name))).isFile(), 'Manifest and signature must be regular files')
  const bytes = await readFile(join(directory, manifestName))
  const signature = await readFile(join(directory, signatureName))
  const key = createPublicKey(await readFile(options['public-key'] ?? publicKeyPath))
  requireValue(key.asymmetricKeyType === 'ed25519' && verify(null, bytes, key, signature), 'Manifest signature verification failed')
  const manifest = JSON.parse(bytes)
  const names = validateRelease(manifest)
  const expected = [manifestName, signatureName, ...names].sort()
  requireValue((await readdir(directory)).sort().join('\n') === expected.join('\n'), 'Release directory has missing or extra files')
  for (const input of Object.values(manifest.components)) {
    for (const artifact of input.artifacts) {
      const actual = await digest(join(directory, artifact.file))
      requireValue(actual.bytes === artifact.bytes && actual.sha256 === artifact.sha256, `Asset integrity check failed: ${artifact.file}`)
    }
  }
  return { manifest, files: expected.map(name => join(directory, name)) }
}

async function draft(options) {
  requireValue(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repo ?? '') && commitPattern.test(options.target ?? ''), 'draft requires --repo owner/name and --target full distribution commit')
  const { manifest, files } = await verifyDirectory(options)
  const notes = ['Vani Constellation ' + manifest.version, '', ...Object.entries(manifest.components)
    .map(([name, input]) => `${name}: ${input.version} (source ${input.commit})`), '',
  '完整兼容性与资产校验信息见 release-manifest.json；安装前验证 Ed25519 签名。'].join('\n')
  const args = ['release', 'create', `v${manifest.version}`, '--repo', options.repo, '--target', options.target,
    '--title', `Vani Constellation ${manifest.version}`, '--notes', notes, '--draft', '--latest=false']
  if (manifest.channel === 'preview') args.push('--prerelease')
  args.push(...files)
  if (!options.execute) {
    console.log(JSON.stringify({ dryRun: true, command: 'gh', args }, null, 2))
    return
  }
  const result = spawnSync('gh', args, { stdio: 'inherit' })
  if (result.error) throw result.error
  requireValue(result.status === 0, 'GitHub draft creation failed; inspect the remote draft before retrying')
}

const command = process.argv[2]
const { values } = parseArgs({ args: process.argv.slice(3), options: {
  plan: { type: 'string' }, output: { type: 'string' }, credentials: { type: 'string' },
  input: { type: 'string' }, 'public-key': { type: 'string' }, repo: { type: 'string' },
  target: { type: 'string' }, execute: { type: 'boolean', default: false }
} })
try {
  requireValue(command === 'draft' || !values.execute, '--execute is only supported by draft')
  if (command === 'prepare') await prepare(values)
  else if (command === 'verify') {
    const { manifest } = await verifyDirectory(values)
    console.log(`Verified ${manifest.version}: signature, matrix and all asset bytes`)
  } else if (command === 'draft') await draft(values)
  else throw Error('Usage: node scripts/release.mjs prepare|verify|draft [options]')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
