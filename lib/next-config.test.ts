import assert from 'node:assert/strict'
import test from 'node:test'
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants'
import config from '../next.config'

test('development chunks are isolated from production builds and the production server', () => {
  assert.equal(config(PHASE_DEVELOPMENT_SERVER).distDir, '.next-dev')
  assert.equal(config(PHASE_PRODUCTION_BUILD).distDir, '.next')
  assert.equal(config(PHASE_PRODUCTION_SERVER).distDir, '.next')
})
