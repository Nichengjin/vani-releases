import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(new URL('../scripts/release.mjs', import.meta.url))
const example = JSON.parse(await readFile(new URL('../examples/release-plan.example.json', import.meta.url), 'utf8'))
const json = (path, data) => writeFile(path, JSON.stringify(data))

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vani-release-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const keys = generateKeyPairSync('ed25519')
  const publicKey = join(root, 'public.pem'), credentials = join(root, 'credentials.json')
  await writeFile(publicKey, keys.publicKey.export({ type: 'spki', format: 'pem' }))
  await json(credentials, { privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), uploadToken: 'must-not-be-published' })
  const plan = structuredClone(example)
  plan.compatibility.privateInputPath = '/private/should-not-be-published'
  const inputs = []
  let index = 0
  for (const [component, paths] of Object.entries(plan.components)) {
    index++
    const version = `0.${index}.0-preview.1`, commit = String(index).repeat(40)
    for (const [offset, path] of paths.entries()) {
      // Keep the example's actual relative layout, including separate native platform inputs.
      const inputPath = resolve(root, 'examples', path)
      await mkdir(resolve(inputPath, '..', 'artifacts'), { recursive: true })
      const platform = component === 'vault' ? 'node' : offset === 1 ? 'linux-x64' : 'darwin-arm64'
      const kind = component === 'vani-desktop' ? 'zip' : ['vault', 'vani-daemon'].includes(component) ? 'tar.gz' : 'binary'
      const file = `${component}-${version}-${platform}${kind === 'binary' ? '' : `.${kind}`}`
      const data = Buffer.from(`fixture ${component}\nplatform ${platform}\n`)
      await writeFile(resolve(inputPath, '..', 'artifacts', file), data)
      const input = { component, version, commit, privateInputPath: '/private/build', artifacts: [
        { path: `artifacts/${file}`, platform, kind, bytes: 999999, sha256: 'not-trusted' }
      ] }
      await json(inputPath, input)
      inputs.push({ inputPath, input, data })
    }
  }
  await mkdir(join(root, 'examples'))
  const planFile = join(root, 'examples', 'plan.json'), output = join(root, 'release')
  await json(planFile, plan)
  const run = (command, args = [], env = {}) => spawnSync(process.execPath,
    [script, command, '--public-key', publicKey, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
  const prepare = () => run('prepare', ['--plan', planFile, '--output', output, '--credentials', credentials])
  return { root, plan, planFile, output, inputs, keys, publicKey, run, prepare }
}

function succeeds(result) { assert.equal(result.status, 0, result.stderr) }
function fails(result, pattern) { assert.equal(result.status, 1, result.stdout); assert.match(result.stderr, pattern) }

test('composes the example matrix with independent versions and signs the actual copied bytes', async t => {
  const f = await fixture(t)
  succeeds(f.prepare())
  const bytes = await readFile(join(f.output, 'release-manifest.json'))
  const signature = await readFile(join(f.output, 'release-manifest.sig'))
  assert.equal(verify(null, bytes, f.keys.publicKey, signature), true)
  const manifest = JSON.parse(bytes)
  assert.deepEqual(Object.keys(manifest.components).sort(), ['resume', 'tasks', 'vani-daemon', 'vani-desktop', 'vault'])
  assert.equal(manifest.components.resume.version, '0.3.0-preview.1')
  assert.equal(manifest.components.tasks.version, '0.5.0-preview.1')
  assert.equal(manifest.components.vault.commit, '4'.repeat(40))
  assert.equal(manifest.version, example.version)
  assert.deepEqual(manifest.compatibility, example.compatibility)
  assert.doesNotMatch(bytes.toString(), /private|must-not-be-published|not-trusted|inputPath/)
  for (const { input, data } of f.inputs) {
    const asset = manifest.components[input.component].artifacts.find(a => a.platform === input.artifacts[0].platform)
    assert.equal(asset.bytes, data.length)
    assert.equal(asset.sha256, createHash('sha256').update(data).digest('hex'))
    assert.deepEqual(await readFile(join(f.output, asset.file)), data)
  }
  assert.equal((await readdir(f.output)).length, 10)
  succeeds(f.run('verify', ['--input', f.output]))
})

test('rejects a missing Linux platform before creating output', async t => {
  const f = await fixture(t)
  f.plan.components.resume.pop()
  await json(f.planFile, f.plan)
  fails(f.prepare(), /resume: incomplete platform matrix/)
  await assert.rejects(readdir(f.output), { code: 'ENOENT' })
})

test('requires matching native component versions and commits', async t => {
  const f = await fixture(t)
  const input = f.inputs.find(i => i.input.component === 'tasks' && i.input.artifacts[0].platform === 'linux-x64')
  input.input.commit = 'f'.repeat(40)
  await json(input.inputPath, input.input)
  fails(f.prepare(), /versions or commits disagree/)
})

test('rejects mislabeled components, abbreviated commits and duplicate asset names', async t => {
  const f = await fixture(t)
  const original = structuredClone(f.inputs[0].input)
  await json(f.inputs[0].inputPath, { ...original, component: 'vault' })
  fails(f.prepare(), /component mismatch/)
  await json(f.inputs[0].inputPath, { ...original, commit: 'abc1234' })
  fails(f.prepare(), /full source commit/)
  await json(f.inputs[0].inputPath, original)
  const linux = f.inputs.find(i => i.input.component === 'resume' && i.input.artifacts[0].platform === 'linux-x64')
  const mac = f.inputs.find(i => i.input.component === 'resume' && i.input.artifacts[0].platform === 'darwin-arm64')
  linux.input.artifacts[0].path = mac.input.artifacts[0].path
  await json(linux.inputPath, linux.input)
  fails(f.prepare(), /duplicate asset filename/)
})

test('existing output remains byte-for-byte unchanged on repeated preparation', async t => {
  const f = await fixture(t)
  succeeds(f.prepare())
  const before = await Promise.all((await readdir(f.output)).sort().map(name => readFile(join(f.output, name))))
  fails(f.prepare(), /EEXIST/)
  const after = await Promise.all((await readdir(f.output)).sort().map(name => readFile(join(f.output, name))))
  assert.deepEqual(after, before)
})

test('same-size artifact corruption and changed manifest both fail verification', async t => {
  const f = await fixture(t)
  succeeds(f.prepare())
  const name = (await readdir(f.output)).find(name => name.startsWith('tasks-'))
  const original = await readFile(join(f.output, name))
  await writeFile(join(f.output, name), Buffer.alloc(original.length, 120))
  fails(f.run('verify', ['--input', f.output]), /Asset integrity check failed/)
  await writeFile(join(f.output, name), original)
  const manifestPath = join(f.output, 'release-manifest.json')
  await writeFile(manifestPath, (await readFile(manifestPath, 'utf8')).replace('preview.20261025.1', 'preview.20261025.2'))
  fails(f.run('verify', ['--input', f.output]), /signature verification failed/)
})

test('wrong signing key fails before writing output', async t => {
  const f = await fixture(t)
  const other = generateKeyPairSync('ed25519')
  await writeFile(f.publicKey, other.publicKey.export({ type: 'spki', format: 'pem' }))
  fails(f.prepare(), /does not match/)
  await assert.rejects(readdir(f.output), { code: 'ENOENT' })
})

test('verification refuses extra files, symlinks, missing files and signed traversal paths', async t => {
  const f = await fixture(t)
  succeeds(f.prepare())
  const extra = join(f.output, 'credentials.json')
  await writeFile(extra, '{}')
  fails(f.run('verify', ['--input', f.output]), /extra files/)
  await rm(extra)
  const name = (await readdir(f.output)).find(name => name.startsWith('resume-'))
  const data = await readFile(join(f.output, name))
  const outside = join(f.root, name)
  await writeFile(outside, data)
  await rm(join(f.output, name))
  fails(f.run('verify', ['--input', f.output]), /missing or extra/)
  await symlink(outside, join(f.output, name))
  fails(f.run('verify', ['--input', f.output]), /not symlinks/)
  await rm(join(f.output, name))
  await writeFile(join(f.output, name), data)
  const manifestPath = join(f.output, 'release-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath))
  manifest.components.resume.artifacts[0].file = '../outside'
  const bytes = Buffer.from(JSON.stringify(manifest))
  await writeFile(manifestPath, bytes)
  await writeFile(join(f.output, 'release-manifest.sig'), sign(null, bytes, f.keys.privateKey))
  fails(f.run('verify', ['--input', f.output]), /unsafe or duplicate/)
})

test('failed copy cleans only its own new output and leaves build inputs intact', async t => {
  const f = await fixture(t)
  const last = f.inputs.at(-1)
  await rm(resolve(last.inputPath, '..', last.input.artifacts[0].path))
  fails(f.prepare(), /ENOENT/)
  await assert.rejects(readdir(f.output), { code: 'ENOENT' })
  assert.deepEqual(await readFile(f.inputs[0].inputPath, 'utf8').then(JSON.parse), f.inputs[0].input)
})

test('draft is offline by default, pins the distribution commit and never promotes latest', async t => {
  const f = await fixture(t)
  succeeds(f.prepare())
  const result = f.run('draft', ['--input', f.output, '--repo', 'example/vani-releases', '--target', 'a'.repeat(40)], { PATH: '' })
  succeeds(result)
  const preview = JSON.parse(result.stdout)
  assert.equal(preview.dryRun, true)
  assert.equal(preview.command, 'gh')
  assert.equal(preview.args[2], `v${example.version}`)
  assert.ok(preview.args.includes('--draft'))
  assert.ok(preview.args.includes('--prerelease'))
  assert.ok(preview.args.includes('--latest=false'))
  fails(f.run('draft', ['--input', f.output, '--repo', 'example/vani-releases', '--target', 'main']), /full distribution commit/)
})

test('stable requires a final bundle version and produces a non-prerelease draft', async t => {
  const f = await fixture(t)
  f.plan.channel = 'stable'
  await json(f.planFile, f.plan)
  fails(f.prepare(), /Stable requires a final version/)
  f.plan.version = '1.0.0'
  await json(f.planFile, f.plan)
  succeeds(f.prepare())
  const result = f.run('draft', ['--input', f.output, '--repo', 'example/vani-releases', '--target', 'b'.repeat(40)])
  succeeds(result)
  const preview = JSON.parse(result.stdout)
  assert.equal(preview.args[2], 'v1.0.0')
  assert.equal(preview.args.includes('--prerelease'), false)
  assert.ok(preview.args.includes('--draft'))
})
