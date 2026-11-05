import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// Exercise the actual embedded scripts without installing YAML dependencies or building products.
const workflow = await readFile(new URL('../.github/workflows/build-cli.yml', import.meta.url), 'utf8')
const scripts = [...workflow.matchAll(/          node --input-type=module - <<'JS'\n([\s\S]*?)          JS/g)]
  .map(match => match[1].replace(/^          /gm, ''))
assert.equal(scripts.length, 3)
const repositories = { resume: 'Nichengjin/vani-resume', tasks: 'Nichengjin/vani-tasks', rws: 'Nichengjin/remote-workspace-backend', vault: 'Nichengjin/vault', 'vani-daemon': 'Nichengjin/vani' }
const commit = 'a'.repeat(40), version = '0.1.0-preview.test'

async function fixture(t, component) {
  const root = await mkdtemp(join(tmpdir(), 'vani-workflow-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const env = { ...process.env, COMPONENT: component, SOURCE_REPOSITORY: repositories[component],
    SOURCE_COMMIT: commit, TOOLS_COMMIT: 'b'.repeat(40), RELEASE_VERSION: version,
    GITHUB_OUTPUT: join(root, 'output'), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' }
  const run = (index, overrides = {}) => spawnSync(process.execPath, ['--input-type=module', '-'],
    { cwd: root, env: { ...env, ...overrides }, input: scripts[index], encoding: 'utf8' })
  return { root, env, run }
}

test('workflow embedded JavaScript parses', () => {
  for (const script of scripts) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: script, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
})

test('resolves both native platforms for four components and one universal Vault job', async t => {
  for (const component of Object.keys(repositories)) await t.test(component, async t => {
    const f = await fixture(t, component)
    const result = f.run(0, { RELEASE_VERSION: '' })
    assert.equal(result.status, 0, result.stderr)
    const output = await readFile(f.env.GITHUB_OUTPUT, 'utf8')
    assert.match(output, /version=0\.1\.0-preview\.gaaaaaaa\.123\.2/)
    const matrix = JSON.parse(output.split('matrix=')[1]).include
    assert.deepEqual(matrix.map(job => job.platform), component === 'vault' ? ['node'] : ['linux-x64', 'darwin-arm64'])
    assert.equal(matrix[0].runner, 'ubuntu-24.04')
    assert.match(matrix[0].image, /-bookworm$/)
    if (['resume', 'rws'].includes(component)) assert.equal(matrix[0].image, 'golang:1.26.10-bookworm')
    if (component !== 'vault') assert.deepEqual(matrix[1], { runner: 'macos-15', platform: 'darwin-arm64', image: '' })
    for (const overrides of [{ SOURCE_REPOSITORY: 'wrong/repository' }, { SOURCE_COMMIT: 'main' },
      { TOOLS_COMMIT: 'b'.repeat(39) }, { RELEASE_VERSION: 'bad version' }, { COMPONENT: 'desktop' }]) {
      assert.notEqual(f.run(0, overrides).status, 0)
    }
  })
})

test('collect validates complete matrix, binary kinds and real hashes for all five candidates', async t => {
  for (const component of Object.keys(repositories)) await t.test(component, async t => {
    const f = await fixture(t, component)
    await mkdir(join(f.root, 'tools/scripts'), { recursive: true })
    // The merger is owned by vani: stub its output, testing only this workflow's post-merge checks.
    await writeFile(join(f.root, 'tools/scripts/merge-cli-releases.mjs'), '')
    await mkdir(join(f.root, 'candidate/artifacts'), { recursive: true })
    const platforms = component === 'vault' ? ['node'] : ['darwin-arm64', 'linux-x64']
    const kind = ['resume', 'tasks', 'rws'].includes(component) ? 'binary' : 'tar.gz'
    const data = Buffer.from('synthetic candidate bytes')
    const input = { component, commit, version, artifacts: [] }
    for (const platform of platforms) {
      const path = `artifacts/${component}-${platform}${kind === 'binary' ? '' : '.tar.gz'}`
      await writeFile(join(f.root, 'candidate', path), data)
      input.artifacts.push({ platform, kind, path })
    }
    const check = async (value, pattern) => {
      await writeFile(join(f.root, 'candidate/release-input.json'), JSON.stringify(value))
      const result = f.run(2)
      if (pattern) { assert.notEqual(result.status, 0); assert.match(result.stderr, pattern) }
      else assert.equal(result.status, 0, result.stderr)
    }
    await check(input)
    const provenance = JSON.parse(await readFile(join(f.root, 'candidate/build-provenance.json'), 'utf8'))
    assert.equal(provenance.signed, false)
    assert.equal(provenance.sourceRepository, repositories[component])
    for (const asset of provenance.artifacts) {
      assert.equal(asset.bytes, data.length)
      assert.equal(asset.sha256, createHash('sha256').update(data).digest('hex'))
    }
    await check({ ...input, commit: 'c'.repeat(40) }, /source identity/)
    await check({ ...input, artifacts: input.artifacts.slice(1) }, /platform matrix/)
    await check({ ...input, artifacts: [...input.artifacts, input.artifacts[0]] }, /platform matrix/)
    await check({ ...input, artifacts: input.artifacts.map(asset => ({ ...asset, platform: 'darwin-x64' })) }, /platform matrix/)
    await check({ ...input, artifacts: input.artifacts.map(asset => ({ ...asset, kind: kind === 'binary' ? 'tar.gz' : 'binary' })) }, /Invalid candidate asset/)
  })
})
