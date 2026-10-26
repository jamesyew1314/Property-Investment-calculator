#!/usr/bin/env node
// 重置演示数据：先停服务（JSON 单进程存储），再运行：
//   cd match-platform && DATA_DIR=./data node scripts/reset-demo.js
import {Store} from '../lib/store.js';
import {DEMO_EMAIL, DEMO_PASSWORD, resetDemo, seedDemo} from '../lib/seed.js';

const store = new Store({dataDir: process.env.DATA_DIR});
const user = store.find('users', (u) => u.email === DEMO_EMAIL);
if (!user) {
  const res = seedDemo(store);
  console.log(res.created ? `演示数据已创建：${res.listings} 房源 / ${res.requirements} 需求` : '已有账号，未创建演示数据');
} else {
  const res = resetDemo(store, user.id);
  console.log(`演示数据已重置：${res.listings} 房源 / ${res.requirements} 需求`);
}
console.log(`演示账号：${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
