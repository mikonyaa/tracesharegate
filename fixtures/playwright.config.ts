import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'../tests/recorded-traces', testMatch:'fixture.spec.ts', workers:1, retries:0,
 timeout:15000, outputDir:'../.work/recorded',
 reporter:[['json',{outputFile:'.work/runner-results.json'}]],
 use:{headless:true,viewport:{width:960,height:600},trace:{mode:'on',screenshots:true,snapshots:true,sources:true,attachments:true}},
});
