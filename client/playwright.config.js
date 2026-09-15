import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',fullyParallel:false,workers:1,use:{baseURL:process.env.TEST_APP_URL||'http://127.0.0.1:5175',channel:'chrome',headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure'},reporter:'list'});
