#!/usr/bin/env node

const jwt = require('jsonwebtoken');

// 读取命令行参数
const userIdRaw = process.argv[2] || '1';
const agentId = process.argv[3] || 'main';
const endpointId = process.argv[4] || `agent_${agentId}`;
const expiresIn = process.argv[5] || '';
const DEFAULT_TEST_SECRET = 'xiaozhi_admin_secret_key';
const secret = process.env.JWT_SECRET || DEFAULT_TEST_SECRET;

const userId = Number(userIdRaw);
if (!Number.isFinite(userId) || userId < 0) {
  throw new Error(`Invalid userId: ${userIdRaw}. Must be a non-negative number.`);
}

// 生成 token
const payload = {
  user_id: userId,
  agent_id: agentId,
  endpoint_id: endpointId,
  purpose: 'openclaw-endpoint',
};

const signOptions = expiresIn ? { expiresIn } : undefined;
const token = jwt.sign(payload, secret, signOptions);

console.log('=== XiaoZhi JWT Token ===');
console.log();
console.log('Token:', token);
console.log();
console.log('Payload:', JSON.stringify(payload, null, 2));
console.log();
console.log('Expires in:', expiresIn || '(none)');
console.log('Secret:', secret);
if (!process.env.JWT_SECRET) {
  console.log(`Notice: JWT_SECRET not set, using default test secret: ${DEFAULT_TEST_SECRET}`);
}
